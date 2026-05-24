import crypto from "crypto";
import { getDayKey } from "./day-key.mjs";
import { loadSocial, saveSocial } from "./social-store.mjs";
import { findUserByEmail, findUserById, getUserState } from "./db.mjs";
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

function userSummary(userId) {
  const user = findUserById(userId);
  if (!user) return null;
  const stateData = getUserState(userId);
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

function getActiveCommentBan(userId, data = loadSocial()) {
  const now = Date.now();
  const ban = (data.commentBans || []).find(
    (row) => row.userId === userId && new Date(row.until).getTime() > now
  );
  return ban || null;
}

function applyCommentBan(userId, { reason, categories = [], source = "moderation" }) {
  const until = new Date(Date.now() + COMMENT_BAN_DAYS * 24 * 60 * 60 * 1000).toISOString();
  saveSocial((data) => {
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

function assertCanPost(userId) {
  const ban = getActiveCommentBan(userId);
  if (ban) {
    throw new Error(
      `You cannot comment until ${formatBanUntil(ban.until)} due to a community guidelines violation.`
    );
  }
}

async function enforceContentPolicy(userId, text, context) {
  assertCanPost(userId);

  const moderation = await moderateUserContent(text, { context });
  if (!moderation.violation) return moderation;

  const until = applyCommentBan(userId, {
    reason: moderation.reason,
    categories: moderation.categories,
    source: moderation.source,
  });

  throw new Error(
    `Bullying, harassment, or hate speech was detected. You are banned from commenting until ${formatBanUntil(until)}.`
  );
}

export function getCommentBanStatus(userId) {
  if (!userId) return null;
  const ban = getActiveCommentBan(userId);
  if (!ban) return null;
  return {
    until: ban.until,
    reason: ban.reason,
    categories: ban.categories || [],
  };
}

export function areFriends(userId, otherId) {
  if (!userId || !otherId || userId === otherId) return userId === otherId;
  const data = loadSocial();
  const key = pairKey(userId, otherId);
  return data.friendships.some((f) => pairKey(f.userA, f.userB) === key);
}

function canViewProfile(viewerId, profileUserId) {
  if (!profileUserId) return false;
  if (!viewerId) return false;
  return viewerId === profileUserId || areFriends(viewerId, profileUserId);
}

export function listFriends(userId) {
  const data = loadSocial();
  const friendIds = new Set();
  for (const f of data.friendships) {
    if (f.userA === userId) friendIds.add(f.userB);
    if (f.userB === userId) friendIds.add(f.userA);
  }
  return [...friendIds]
    .map((id) => userSummary(id))
    .filter(Boolean)
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function listFriendRequests(userId) {
  const data = loadSocial();
  const incoming = data.friendRequests
    .filter((r) => r.toUserId === userId && r.status === "pending")
    .map((r) => ({
      id: r.id,
      from: userSummary(r.fromUserId),
      createdAt: r.createdAt,
    }))
    .filter((r) => r.from);

  const outgoing = data.friendRequests
    .filter((r) => r.fromUserId === userId && r.status === "pending")
    .map((r) => ({
      id: r.id,
      to: userSummary(r.toUserId),
      createdAt: r.createdAt,
    }))
    .filter((r) => r.to);

  return { incoming, outgoing };
}

export function sendFriendRequest(fromUserId, email) {
  const normalized = email?.toLowerCase()?.trim();
  if (!normalized?.includes("@")) throw new Error("Valid friend email required");

  const target = findUserByEmail(normalized);
  if (!target) throw new Error("No account found with that email");
  if (target.id === fromUserId) throw new Error("You cannot friend yourself");
  if (areFriends(fromUserId, target.id)) throw new Error("Already friends");

  const data = loadSocial();
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

  saveSocial((store) => {
    store.friendRequests.push(created);
  });

  return { ok: true, requestId: created.id, to: userSummary(target.id) };
}

export function respondFriendRequest(userId, requestId, action) {
  if (!["accept", "decline"].includes(action)) throw new Error("Invalid action");

  const data = loadSocial();
  const req = data.friendRequests.find((r) => r.id === requestId);
  if (!req || req.status !== "pending") throw new Error("Request not found");
  if (req.toUserId !== userId) throw new Error("Not your request to answer");

  saveSocial((store) => {
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

export function removeFriend(userId, friendUserId) {
  saveSocial((data) => {
    const key = pairKey(userId, friendUserId);
    data.friendships = data.friendships.filter((f) => pairKey(f.userA, f.userB) !== key);
  });
  return { ok: true };
}

export function getFriendAccount(viewerId, targetUserId) {
  if (!canViewProfile(viewerId, targetUserId)) {
    throw new Error("Add this collector as a friend to view their account");
  }

  const summary = userSummary(targetUserId);
  if (!summary) throw new Error("User not found");

  const stateData = getUserState(targetUserId);
  const state = stateData?.state || {};
  const collection = (state.collection || []).map((entry) => ({
    id: entry.id,
    card: entry.card,
    estimatedValue: entry.estimatedValue ?? null,
    addedAt: entry.addedAt || null,
    tier: entry.tier || null,
    imageUrl: entry.imageUrl || null,
  }));

  return {
    user: summary,
    isSelf: viewerId === targetUserId,
    isFriend: areFriends(viewerId, targetUserId),
    stats: {
      xp: state.xp || 0,
      level: state.level || 1,
      streak: state.streak || 0,
      scoutCount: state.scoutCount || 0,
    },
    collection,
    posts: listProfilePosts(viewerId, targetUserId).posts,
  };
}

export function listProfilePosts(viewerId, profileUserId) {
  if (!canViewProfile(viewerId, profileUserId)) {
    throw new Error("Add this collector as a friend to view their posts");
  }

  const data = loadSocial();
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

  return { posts, profileUser: userSummary(profileUserId) };
}

export async function createProfilePost(userId, { text, cardTitle, estimatedValue, collectionEntryId }) {
  const trimmed = text?.trim();
  if (!trimmed || trimmed.length < 2) throw new Error("Write a short update about your pull or card");

  await enforceContentPolicy(userId, trimmed, "profile post");

  const summary = userSummary(userId);
  if (!summary) throw new Error("User not found");

  let cardMeta = { cardTitle: cardTitle?.trim() || null, estimatedValue: estimatedValue ?? null };

  if (collectionEntryId) {
    const state = getUserState(userId)?.state;
    const entry = state?.collection?.find((c) => c.id === collectionEntryId);
    if (entry) {
      cardMeta = {
        cardTitle: entry.card?.title || cardMeta.cardTitle,
        estimatedValue: entry.estimatedValue ?? cardMeta.estimatedValue,
      };
    }
  }

  let post = null;
  saveSocial((data) => {
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

function hasCodCommentAgreement(userId, data = loadSocial()) {
  const dayKey = getDayKey();
  return (data.codCommentAgreements || []).some(
    (row) => row.userId === userId && row.dayKey === dayKey
  );
}

export function acceptCodCommentAgreement(userId) {
  const summary = userSummary(userId);
  if (!summary) throw new Error("User not found");

  const dayKey = getDayKey();
  saveSocial((data) => {
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

export function listCodComments(viewerUserId = null) {
  const dayKey = getDayKey();
  const data = loadSocial();
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
      testUnbanAvailable: Boolean(ban && viewerUserId && canUseTestUnban(viewerUserId, data)),
    },
  };
}

export async function addCodComment(userId, text) {
  const trimmed = text?.trim();
  if (!trimmed || trimmed.length < 1) throw new Error("Comment cannot be empty");

  if (!hasCodCommentAgreement(userId)) {
    throw new Error("Accept today's community agreement before commenting");
  }

  await enforceContentPolicy(userId, trimmed, "Card of the Day comment");

  const summary = userSummary(userId);
  if (!summary) throw new Error("User not found");

  const dayKey = getDayKey();
  let comment = null;
  saveSocial((data) => {
    comment = {
      id: uuid(),
      dayKey,
      userId,
      authorName: summary.displayName,
      text: trimmed.slice(0, 1000),
      createdAt: new Date().toISOString(),
    };
    data.codComments.push(comment);
  });

  return { comment, dayKey };
}

export function clearCommentBan(userId) {
  saveSocial((data) => {
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

function canUseTestUnban(userId, data = loadSocial()) {
  const user = findUserById(userId);
  if (!user) return false;
  if (!getTestUnbanAllowList().includes(user.email?.toLowerCase())) return false;
  const used = data.testUnbanUsed || [];
  return !used.includes(userId);
}

export function oneTimeTestUnban(userId) {
  const user = findUserById(userId);
  if (!user) throw new Error("User not found");

  if (!getTestUnbanAllowList().includes(user.email?.toLowerCase())) {
    throw new Error("Test unban is not enabled for this account");
  }

  let alreadyUsed = false;
  saveSocial((data) => {
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

export function getSocialOverview(userId) {
  return {
    friends: listFriends(userId),
    requests: listFriendRequests(userId),
  };
}
