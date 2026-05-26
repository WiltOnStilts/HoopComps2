import crypto from "crypto";
import { getDayKey } from "./day-key.mjs";
import { loadSocial, saveSocial } from "./social-store.mjs";
import { findUserByEmail, findUserById, findUserByHandle, getUserState } from "./db.mjs";
import {
  moderateUserContent,
  COMMENT_BAN_DAYS,
  formatBanUntil,
} from "./content-moderation.mjs";

function uuid() {
  return crypto.randomUUID();
}

function pairKey(a, b) {
  return [a, b].sort().join(":");
}

async function userSummary(userId) {
  const user = await findUserById(userId);
  if (!user) return null;
  const stateData = await getUserState(userId);
  const state = stateData?.state || {};
  const collection = state.collection || [];
  const total = collection.reduce((sum, item) => {
    const v = item.estimatedValue;
    if (v == null) return sum;
    return sum + v * (item.quantity || 1);
  }, 0);
  return {
    id: user.id,
    displayName: user.display_name || state.profile?.displayName || "Scout",
    email: user.email,
    level: state.level || 1,
    cardCount: collection.length,
    collectionValue: total,
    favoritePlayer: state.profile?.favoritePlayer || "",
    favoriteTeam: state.profile?.favoriteTeam || "",
  };
}

function getActiveCommentBan(userId, data) {
  const now = Date.now();
  const ban = (data.commentBans || []).find(
    (row) => row.userId === userId && new Date(row.until).getTime() > now
  );
  return ban || null;
}

async function applyCommentBan(userId, { reason, categories = [], source = "moderation" }) {
  const until = new Date(Date.now() + COMMENT_BAN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await saveSocial((data) => {
    if (!data.commentBans) data.commentBans = [];
    data.commentBans = data.commentBans.filter((row) => row.userId !== userId);
    data.commentBans.push({
      userId,
      until,
      reason: reason || "Community guidelines violation",
      categories,
      source,
      createdAt: new Date().toISOString(),
    });
  });
  return until;
}

async function assertCanPost(userId) {
  const data = await loadSocial();
  const ban = getActiveCommentBan(userId, data);
  if (ban) {
    throw new Error(
      `You cannot comment until ${formatBanUntil(ban.until)} due to a community guidelines violation.`
    );
  }
}

async function enforceContentPolicy(userId, text, context) {
  await assertCanPost(userId);

  const moderation = await moderateUserContent(text, { context });
  if (!moderation.violation) return moderation;

  const until = await applyCommentBan(userId, {
    reason: moderation.reason,
    categories: moderation.categories,
    source: moderation.source,
  });

  throw new Error(
    `Bullying, harassment, or hate speech was detected. You are banned from commenting until ${formatBanUntil(until)}.`
  );
}

export async function getCommentBanStatus(userId) {
  if (!userId) return null;
  const data = await loadSocial();
  const ban = getActiveCommentBan(userId, data);
  if (!ban) return null;
  return {
    until: ban.until,
    reason: ban.reason,
    categories: ban.categories || [],
  };
}

export async function areFriends(userId, otherId) {
  if (!userId || !otherId || userId === otherId) return userId === otherId;
  const data = await loadSocial();
  const key = pairKey(userId, otherId);
  return data.friendships.some((f) => pairKey(f.userA, f.userB) === key);
}

async function canViewProfile(viewerId, profileUserId) {
  if (!profileUserId) return false;
  if (!viewerId) return false;
  return viewerId === profileUserId || (await areFriends(viewerId, profileUserId));
}

export async function listFriends(userId) {
  const data = await loadSocial();
  const friendIds = new Set();
  for (const f of data.friendships) {
    if (f.userA === userId) friendIds.add(f.userB);
    if (f.userB === userId) friendIds.add(f.userA);
  }
  const summaries = await Promise.all([...friendIds].map((id) => userSummary(id)));
  return summaries
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function listFriendRequests(userId) {
  const data = await loadSocial();
  const incomingRaw = data.friendRequests.filter(
    (r) => r.toUserId === userId && r.status === "pending"
  );
  const outgoingRaw = data.friendRequests.filter(
    (r) => r.fromUserId === userId && r.status === "pending"
  );

  const incoming = (
    await Promise.all(
      incomingRaw.map(async (r) => ({
        id: r.id,
        from: await userSummary(r.fromUserId),
        createdAt: r.createdAt,
      }))
    )
  ).filter((r) => r.from);

  const outgoing = (
    await Promise.all(
      outgoingRaw.map(async (r) => ({
        id: r.id,
        to: await userSummary(r.toUserId),
        createdAt: r.createdAt,
      }))
    )
  ).filter((r) => r.to);

  return { incoming, outgoing };
}

export async function sendFriendRequest(fromUserId, email) {
  const normalized = email?.toLowerCase()?.trim();
  if (!normalized?.includes("@")) throw new Error("Valid friend email required");

  const target = await findUserByEmail(normalized);
  if (!target) throw new Error("No account found with that email");
  if (target.id === fromUserId) throw new Error("You cannot friend yourself");
  if (await areFriends(fromUserId, target.id)) throw new Error("Already friends");

  const data = await loadSocial();
  const pending = data.friendRequests.find(
    (r) =>
      r.status === "pending" &&
      ((r.fromUserId === fromUserId && r.toUserId === target.id) ||
        (r.fromUserId === target.id && r.toUserId === fromUserId))
  );
  if (pending) throw new Error("Friend request already pending");

  const created = {
    id: uuid(),
    fromUserId,
    toUserId: target.id,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  await saveSocial((store) => {
    store.friendRequests.push(created);
  });

  return { ok: true, requestId: created.id, to: await userSummary(target.id) };
}

export async function respondFriendRequest(userId, requestId, action) {
  if (!["accept", "decline"].includes(action)) throw new Error("Invalid action");

  const data = await loadSocial();
  const req = data.friendRequests.find((r) => r.id === requestId);
  if (!req || req.status !== "pending") throw new Error("Request not found");
  if (req.toUserId !== userId) throw new Error("Not your request to answer");

  await saveSocial((store) => {
    const row = store.friendRequests.find((r) => r.id === requestId);
    if (!row) return;
    if (action === "decline") {
      row.status = "declined";
      row.respondedAt = new Date().toISOString();
      return;
    }
    row.status = "accepted";
    row.respondedAt = new Date().toISOString();
    const key = pairKey(row.fromUserId, row.toUserId);
    if (!store.friendships.some((f) => pairKey(f.userA, f.userB) === key)) {
      const [userA, userB] = [row.fromUserId, row.toUserId].sort();
      store.friendships.push({ userA, userB, since: new Date().toISOString() });
    }
  });

  return { ok: true, action };
}

export async function removeFriend(userId, friendUserId) {
  await saveSocial((data) => {
    const key = pairKey(userId, friendUserId);
    data.friendships = data.friendships.filter((f) => pairKey(f.userA, f.userB) !== key);
  });
  return { ok: true };
}

export async function getFriendAccount(viewerId, targetUserId) {
  if (!(await canViewProfile(viewerId, targetUserId))) {
    throw new Error("Add this collector as a friend to view their account");
  }

  const summary = await userSummary(targetUserId);
  if (!summary) throw new Error("User not found");

  const stateData = await getUserState(targetUserId);
  const state = stateData?.state || {};
  const collection = (state.collection || []).map((entry) => ({
    id: entry.id,
    card: entry.card,
    estimatedValue: entry.estimatedValue ?? null,
    addedAt: entry.addedAt || null,
    tier: entry.tier || null,
    imageUrl: entry.imageUrl || null,
  }));

  const posts = (await listProfilePosts(viewerId, targetUserId)).posts;

  return {
    user: summary,
    isSelf: viewerId === targetUserId,
    isFriend: await areFriends(viewerId, targetUserId),
    stats: {
      xp: state.xp || 0,
      level: state.level || 1,
      streak: state.streak || 0,
      scoutCount: state.scoutCount || 0,
    },
    collection,
    posts,
  };
}

export async function listProfilePosts(viewerId, profileUserId) {
  if (!(await canViewProfile(viewerId, profileUserId))) {
    throw new Error("Add this collector as a friend to view their posts");
  }

  const data = await loadSocial();
  const posts = data.profilePosts
    .filter((p) => p.userId === profileUserId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 50)
    .map((p) => ({
      id: p.id,
      userId: p.userId,
      authorName: p.authorName,
      text: p.text,
      cardTitle: p.cardTitle || null,
      estimatedValue: p.estimatedValue ?? null,
      createdAt: p.createdAt,
    }));

  return { posts, profileUser: await userSummary(profileUserId) };
}

export async function createProfilePost(userId, { text, cardTitle, estimatedValue, collectionEntryId }) {
  const trimmed = text?.trim();
  if (!trimmed || trimmed.length < 2) throw new Error("Write a short update about your pull or card");

  await enforceContentPolicy(userId, trimmed, "profile post");

  const summary = await userSummary(userId);
  if (!summary) throw new Error("User not found");

  let cardMeta = { cardTitle: cardTitle?.trim() || null, estimatedValue: estimatedValue ?? null };

  if (collectionEntryId) {
    const state = (await getUserState(userId))?.state;
    const entry = state?.collection?.find((c) => c.id === collectionEntryId);
    if (entry) {
      cardMeta = {
        cardTitle: entry.card?.title || cardMeta.cardTitle,
        estimatedValue: entry.estimatedValue ?? cardMeta.estimatedValue,
      };
    }
  }

  let post = null;
  await saveSocial((data) => {
    post = {
      id: uuid(),
      userId,
      authorName: summary.displayName,
      text: trimmed.slice(0, 2000),
      cardTitle: cardMeta.cardTitle,
      estimatedValue: cardMeta.estimatedValue,
      collectionEntryId: collectionEntryId || null,
      createdAt: new Date().toISOString(),
    };
    data.profilePosts.unshift(post);
    data.profilePosts = data.profilePosts.slice(0, 500);
  });

  return { post };
}

export const COD_COMMUNITY_AGREEMENT =
  "I agree to participate respectfully in today's Card of the Day conversation. I will not post bullying, harassment, hate speech, threats, slurs, or personal attacks toward other collectors. I understand this agreement applies for today only and resets when the daily thread resets.";

function hasCodCommentAgreement(userId, data) {
  const dayKey = getDayKey();
  return (data.codCommentAgreements || []).some(
    (row) => row.userId === userId && row.dayKey === dayKey
  );
}

export async function acceptCodCommentAgreement(userId) {
  const summary = await userSummary(userId);
  if (!summary) throw new Error("User not found");

  const dayKey = getDayKey();
  await saveSocial((data) => {
    if (!data.codCommentAgreements) data.codCommentAgreements = [];
    const exists = data.codCommentAgreements.some(
      (row) => row.userId === userId && row.dayKey === dayKey
    );
    if (!exists) {
      data.codCommentAgreements.push({
        userId,
        dayKey,
        acceptedAt: new Date().toISOString(),
      });
    }
  });

  return { ok: true, dayKey, accepted: true };
}

export async function listCodComments(viewerUserId = null) {
  const dayKey = getDayKey();
  const data = await loadSocial();
  const comments = data.codComments
    .filter((c) => c.dayKey === dayKey)
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .map((c) => ({
      id: c.id,
      userId: c.userId,
      authorName: c.authorName,
      text: c.text,
      createdAt: c.createdAt,
    }));

  const signedIn = Boolean(viewerUserId);
  const ban = viewerUserId ? getActiveCommentBan(viewerUserId, data) : null;
  const accepted = signedIn && hasCodCommentAgreement(viewerUserId, data);
  const testUnbanAvailable =
    Boolean(ban && viewerUserId && (await canUseTestUnban(viewerUserId, data)));

  return {
    dayKey,
    comments,
    resetsDaily: true,
    communityAgreement: {
      text: COD_COMMUNITY_AGREEMENT,
      signedIn,
      accepted,
      canComment: signedIn && accepted && !ban,
      commentBan: ban
        ? {
            until: ban.until,
            reason: ban.reason,
            categories: ban.categories || [],
          }
        : null,
      testUnbanAvailable,
    },
  };
}

export async function addCodComment(userId, text) {
  const trimmed = text?.trim();
  if (!trimmed || trimmed.length < 1) throw new Error("Comment cannot be empty");

  const data = await loadSocial();
  if (!hasCodCommentAgreement(userId, data)) {
    throw new Error("Accept today's community agreement before commenting");
  }

  await enforceContentPolicy(userId, trimmed, "Card of the Day comment");

  const summary = await userSummary(userId);
  if (!summary) throw new Error("User not found");

  const dayKey = getDayKey();
  let comment = null;
  await saveSocial((store) => {
    comment = {
      id: uuid(),
      dayKey,
      userId,
      authorName: summary.displayName,
      text: trimmed.slice(0, 1000),
      createdAt: new Date().toISOString(),
    };
    store.codComments.push(comment);
  });

  return { comment, dayKey };
}

export async function clearCommentBan(userId) {
  await saveSocial((data) => {
    if (!data.commentBans) data.commentBans = [];
    data.commentBans = data.commentBans.filter((row) => row.userId !== userId);
  });
  return { ok: true, userId };
}

const DEFAULT_TEST_UNBAN_EMAILS = ["builtwilt@icloud.com"];

function getTestUnbanAllowList() {
  const allowed = (process.env.TEST_UNBAN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return allowed.length ? allowed : DEFAULT_TEST_UNBAN_EMAILS;
}

async function canUseTestUnban(userId, data) {
  const user = await findUserById(userId);
  if (!user) return false;
  if (!getTestUnbanAllowList().includes(user.email?.toLowerCase())) return false;
  const used = data.testUnbanUsed || [];
  return !used.includes(userId);
}

export async function oneTimeTestUnban(userId) {
  const user = await findUserById(userId);
  if (!user) throw new Error("User not found");

  if (!getTestUnbanAllowList().includes(user.email?.toLowerCase())) {
    throw new Error("Test unban is not enabled for this account");
  }

  let alreadyUsed = false;
  await saveSocial((data) => {
    if (!data.testUnbanUsed) data.testUnbanUsed = [];
    if (data.testUnbanUsed.includes(userId)) {
      alreadyUsed = true;
      return;
    }
    data.testUnbanUsed.push(userId);
    if (!data.commentBans) data.commentBans = [];
    data.commentBans = data.commentBans.filter((row) => row.userId !== userId);
  });

  if (alreadyUsed) {
    throw new Error("Your one-time test unban has already been used");
  }

  return { ok: true, message: "Comment ban cleared. This one-time test unban has been used." };
}

function mapHubMessage(row) {
  return {
    id: row.id,
    userId: row.userId,
    authorName: row.authorName,
    text: row.text,
    audience: row.audience,
    targetUserId: row.targetUserId || null,
    createdAt: row.createdAt,
  };
}

async function friendIdSet(userId) {
  const friends = await listFriends(userId);
  return new Set(friends.map((f) => f.id));
}

function hubComposeState(viewerUserId, data) {
  const signedIn = Boolean(viewerUserId);
  const ban = viewerUserId ? getActiveCommentBan(viewerUserId, data) : null;
  const accepted = signedIn && hasCodCommentAgreement(viewerUserId, data);
  return {
    signedIn,
    canPost: signedIn && accepted && !ban,
    accepted,
    commentBan: ban
      ? { until: ban.until, reason: ban.reason, categories: ban.categories || [] }
      : null,
    agreementText: COD_COMMUNITY_AGREEMENT,
  };
}

export async function listHubMessages(viewerUserId, { audience, targetUsername } = {}) {
  if (!["everyone", "friends", "direct"].includes(audience)) {
    throw new Error("Invalid chat audience");
  }

  const data = await loadSocial();
  const all = data.hubMessages || [];
  let filtered = [];
  let targetUser = null;

  if (audience === "everyone") {
    filtered = all.filter((m) => m.audience === "everyone");
  } else if (audience === "friends") {
    if (!viewerUserId) {
      return { audience, messages: [], ...hubComposeState(null, data) };
    }
    const friendIds = await friendIdSet(viewerUserId);
    filtered = all.filter(
      (m) =>
        m.audience === "friends" &&
        (m.userId === viewerUserId || friendIds.has(m.userId))
    );
  } else if (audience === "direct") {
    if (!viewerUserId) throw new Error("Sign in to view direct messages");
    const handle = targetUsername?.trim();
    if (!handle) {
      return {
        audience,
        messages: [],
        targetUser: null,
        needsTarget: true,
        ...hubComposeState(viewerUserId, data),
      };
    }
    const target = await findUserByHandle(handle);
    if (!target) throw new Error("No collector found with that username");
    targetUser = await userSummary(target.id);
    filtered = all.filter(
      (m) =>
        m.audience === "direct" &&
        ((m.userId === viewerUserId && m.targetUserId === target.id) ||
          (m.userId === target.id && m.targetUserId === viewerUserId))
    );
  }

  const messages = filtered
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(-200)
    .map(mapHubMessage);

  return {
    audience,
    messages,
    targetUser,
    needsTarget: audience === "direct" && !targetUsername?.trim(),
    ...hubComposeState(viewerUserId, data),
  };
}

export async function addHubMessage(userId, { text, audience, targetUsername }) {
  if (!["everyone", "friends", "direct"].includes(audience)) {
    throw new Error("Invalid chat audience");
  }

  const trimmed = text?.trim();
  if (!trimmed) throw new Error("Message cannot be empty");

  const data = await loadSocial();
  if (!hasCodCommentAgreement(userId, data)) {
    throw new Error("Accept today's community agreement before chatting");
  }

  await enforceContentPolicy(userId, trimmed, "community chat");

  const summary = await userSummary(userId);
  if (!summary) throw new Error("User not found");

  let targetUserId = null;
  if (audience === "direct") {
    const target = await findUserByHandle(targetUsername);
    if (!target) throw new Error("No collector found with that username");
    if (target.id === userId) throw new Error("Pick a different collector to message");
    targetUserId = target.id;
  }

  let message = null;
  await saveSocial((store) => {
    if (!store.hubMessages) store.hubMessages = [];
    message = {
      id: uuid(),
      userId,
      authorName: summary.displayName,
      text: trimmed.slice(0, 1000),
      audience,
      targetUserId,
      createdAt: new Date().toISOString(),
    };
    store.hubMessages.push(message);
    store.hubMessages = store.hubMessages.slice(-2000);
  });

  return { message: mapHubMessage(message) };
}

export async function getSocialOverview(userId) {
  return {
    friends: await listFriends(userId),
    requests: await listFriendRequests(userId),
  };
}
