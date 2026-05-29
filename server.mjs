#!/usr/bin/env node
/**
 * HoopComps — basketball card value scout
 * Multi-user API + static file server
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { buildQuery, scoutCard } from "./lib/scout.mjs";
import { estimateCollection } from "./lib/collection.mjs";
import { fetchListingDetail } from "./lib/ebay-browse.mjs";
import { getCardOfDayWithScout } from "./lib/card-of-day.mjs";
import {
  buildSpotlightCommunityCards,
  persistSpotlightPool,
} from "./lib/spotlight-pool.mjs";
import { generateCollectionInsights } from "./lib/ai-estimate.mjs";
import { initDb, isDbReady, getLeaderboard, countUsers, storageMode, getAllCommunityCards, findUserByEmail, getCommunityCardStats, getAllUserCodBoosts } from "./lib/db.mjs";
import { usesPostgresSocial } from "./lib/social-store.mjs";
import {
  registerUser,
  loginUser,
  resetPassword,
  requireUser,
  getUserState,
  saveUserState,
  mergeGuestIntoCloud,
  alignStateWithAccountDisplayName,
  sessionCookieHeader,
  sessionFromToken,
  getRequestToken,
  verifyToken,
} from "./lib/auth.mjs";
import {
  getSocialOverview,
  sendFriendRequest,
  respondFriendRequest,
  removeFriend,
  getFriendAccount,
  searchFriendCandidates,
  listProfilePosts,
  createProfilePost,
  listCodComments,
  addCodComment,
  castCodVote,
  acceptCodCommentAgreement,
  oneTimeTestUnban,
  clearCommentBan,
  listHubMessages,
  addHubMessage,
} from "./lib/social.mjs";
import { getVapidPublicKey, initPushVapidAsync, isPushConfigured, getPushInitError } from "./lib/push-vapid.mjs";
import { upsertPushSubscription, removePushSubscription } from "./lib/push-store.mjs";
import { startPushScheduler, triggerPushSchedulerTick, isPushSchedulerRunning, getPushSchedulerLastTickAt } from "./lib/push-scheduler.mjs";

const SITE_NAME = process.env.SITE_NAME || "HoopComps";
const EBAY_TIP =
  "Tip: Set EBAY_APP_ID and EBAY_CLIENT_SECRET for live eBay prices (free at developer.ebay.com)";

function ebayConfig() {
  return {
    ebayClientId: process.env.EBAY_APP_ID,
    ebayClientSecret: process.env.EBAY_CLIENT_SECRET,
    priceChartingToken: process.env.PRICECHARTING_TOKEN,
  };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnvFile() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

loadEnvFile();

const passwordResetCooldown = new Map();
const PASSWORD_RESET_COOLDOWN_MS = 60_000;

function canResetPassword(email) {
  const key = email?.toLowerCase()?.trim();
  if (!key) return false;
  const last = passwordResetCooldown.get(key) || 0;
  if (Date.now() - last < PASSWORD_RESET_COOLDOWN_MS) return false;
  passwordResetCooldown.set(key, Date.now());
  return true;
}

const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 3847;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body, type = "application/json", extraHeaders = {}) {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    ...extraHeaders,
  });
  res.end(data);
}

function sendAuthResult(res, status, result) {
  send(res, status, result, "application/json", {
    "Set-Cookie": sessionCookieHeader(result.token),
  });
}

function serveStatic(req, res) {
  let urlPath = req.url?.split("?")[0] || "/";
  if (urlPath === "/") urlPath = "/index.html";
  const filePath = path.normalize(path.join(PUBLIC, urlPath));
  if (!filePath.startsWith(PUBLIC)) {
    send(res, 403, "Forbidden");
    return;
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, "Not found", "text/plain");
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(data);
  });
}

await initDb();

try {
  await initPushVapidAsync();
} catch (err) {
  console.warn("  Push init failed:", err.message);
}

if (isDbReady() && isPushConfigured()) {
  startPushScheduler({
    getCommunityCards: getAllCommunityCards,
    buildSpotlightCards: (communityCards) =>
      buildSpotlightCommunityCards(communityCards, findUserByEmail),
    getUserBoosts: getAllUserCodBoosts,
    getUserState,
  });
}

let lastTrafficScheduler = 0;

function authorizePushCron(req) {
  const secret = process.env.PUSH_CRON_SECRET || process.env.JWT_SECRET;
  if (!secret) return false;
  const urlObj = new URL(req.url || "/", "http://localhost");
  const querySecret = urlObj.searchParams.get("secret");
  const authHeader = req.headers.authorization || "";
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  return querySecret === secret || bearer === secret;
}

function maybeRunPushSchedulerFromTraffic() {
  if (!isPushConfigured()) return;
  const now = Date.now();
  if (now - lastTrafficScheduler < 10 * 60 * 1000) return;
  lastTrafficScheduler = now;
  void triggerPushSchedulerTick();
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }

  maybeRunPushSchedulerFromTraffic();

  const url = req.url?.split("?")[0];

  if (req.method === "GET" && url === "/api/health") {
    const hasId = Boolean(process.env.EBAY_APP_ID);
    const hasSecret = Boolean(process.env.EBAY_CLIENT_SECRET);
    const stats = isDbReady()
      ? {
          communityCards: (await getCommunityCardStats()).cardCount,
          leaderboardEntries: (await getLeaderboard()).length,
        }
      : {};
    send(res, 200, {
      ok: true,
      siteName: SITE_NAME,
      tagline: "Scout basketball card values",
      multiUserEnabled: isDbReady(),
      storageMode: storageMode(),
      socialStorageMode: usesPostgresSocial() ? "postgres" : isDbReady() ? "file" : "none",
      userCount: isDbReady() ? await countUsers() : 0,
      ...stats,
      ebayConfigured: hasId && hasSecret,
      ebayAppIdSet: hasId,
      ebayClientSecretSet: hasSecret,
      ebayApi: "browse",
      priceChartingConfigured: Boolean(process.env.PRICECHARTING_TOKEN),
      pushEnabled: isDbReady() && isPushConfigured(),
      vapidPublicKey: isPushConfigured() ? getVapidPublicKey() : null,
      pushInitError: getPushInitError(),
      pushSchedulerRunning: isPushSchedulerRunning(),
      pushSchedulerLastTickAt: getPushSchedulerLastTickAt(),
      ebayTip: EBAY_TIP,
      ebaySetupCommand:
        "EBAY_APP_ID=your_app_id EBAY_CLIENT_SECRET=your_cert_id node server.mjs",
      ebaySignupUrl: "https://developer.ebay.com/my/keys",
    });
    return;
  }

  if (req.method === "POST" && url === "/api/auth/register") {
    if (!isDbReady()) {
      send(res, 503, { error: "Multi-user not available — run npm install on the server" });
      return;
    }
    try {
      const body = await readBody(req);
      const result = await registerUser({
        email: body.email,
        password: body.password,
        displayName: body.displayName,
      });
      if (body.guestState) {
        const merged = await alignStateWithAccountDisplayName(
          result.user.id,
          mergeGuestIntoCloud(body.guestState, result.state)
        );
        await saveUserState(result.user.id, merged, {
          publicLeaderboard: merged.profile?.publicLeaderboard,
        });
        result.state = merged;
        result.publicLeaderboard = Boolean(merged.profile?.publicLeaderboard);
        result.user.displayName = merged.profile?.displayName || result.user.displayName;
      }
      sendAuthResult(res, 200, result);
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/auth/login") {
    if (!isDbReady()) {
      send(res, 503, { error: "Multi-user not available — run npm install on the server" });
      return;
    }
    try {
      const body = await readBody(req);
      const result = await loginUser({ email: body.email, password: body.password });
      if (body.guestState) {
        const merged = await alignStateWithAccountDisplayName(
          result.user.id,
          mergeGuestIntoCloud(body.guestState, result.state)
        );
        await saveUserState(result.user.id, merged, {
          publicLeaderboard: merged.profile?.publicLeaderboard,
        });
        result.state = merged;
        result.publicLeaderboard = Boolean(merged.profile?.publicLeaderboard);
        result.user.displayName = merged.profile?.displayName || result.user.displayName;
      }
      sendAuthResult(res, 200, result);
    } catch (e) {
      send(res, 401, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/auth/reset-password") {
    if (!isDbReady()) {
      send(res, 503, { error: "Multi-user not available — run npm install on the server" });
      return;
    }
    try {
      const body = await readBody(req);
      const email = body.email?.toLowerCase()?.trim();
      if (!canResetPassword(email)) {
        send(res, 429, { error: "Please wait a minute before trying again" });
        return;
      }
      if (body.confirmPassword && body.newPassword !== body.confirmPassword) {
        send(res, 400, { error: "Passwords do not match" });
        return;
      }
      const result = await resetPassword({
        email,
        newPassword: body.newPassword,
        displayName: body.guestState?.profile?.displayName || body.displayName,
      });
      if (body.guestState) {
        const merged = await alignStateWithAccountDisplayName(
          result.user.id,
          mergeGuestIntoCloud(body.guestState, result.state)
        );
        await saveUserState(result.user.id, merged, {
          publicLeaderboard: merged.profile?.publicLeaderboard,
        });
        result.state = merged;
        result.publicLeaderboard = Boolean(merged.profile?.publicLeaderboard);
        result.user.displayName = merged.profile?.displayName || result.user.displayName;
      }
      sendAuthResult(res, 200, result);
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "GET" && url === "/api/auth/session") {
    if (!isDbReady()) {
      send(res, 503, { error: "Multi-user not available" });
      return;
    }
    const token = getRequestToken(req);
    const session = await sessionFromToken(token);
    if (!session) {
      send(res, 401, { error: "Not signed in" }, "application/json", {
        "Set-Cookie": sessionCookieHeader(null),
      });
      return;
    }
    send(res, 200, session, "application/json", {
      "Set-Cookie": sessionCookieHeader(session.token),
    });
    return;
  }

  if (req.method === "POST" && url === "/api/auth/logout") {
    send(res, 200, { ok: true }, "application/json", {
      "Set-Cookie": sessionCookieHeader(null),
    });
    return;
  }

  if (url === "/api/user/state") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    if (req.method === "GET") {
      const data = await getUserState(user.id);
      send(res, 200, {
        state: data?.state,
        publicLeaderboard: data?.publicLeaderboard,
        updatedAt: data?.updatedAt,
      });
      return;
    }
    if (req.method === "PUT") {
      try {
        const body = await readBody(req);
        if (!body.state) throw new Error("Missing state");
        await saveUserState(user.id, body.state, {
          publicLeaderboard: body.publicLeaderboard ?? body.state?.profile?.publicLeaderboard,
        });
        const collection = body.state?.collection || [];
        send(res, 200, {
          ok: true,
          cardCount: collection.length,
          publicLeaderboard: Boolean(
            body.publicLeaderboard ?? body.state?.profile?.publicLeaderboard
          ),
        });
      } catch (e) {
        send(res, 400, { error: e.message });
      }
      return;
    }
  }

  if (req.method === "GET" && url === "/api/leaderboard") {
    if (!isDbReady()) {
      send(res, 200, { entries: [] });
      return;
    }
    send(res, 200, { entries: await getLeaderboard() });
    return;
  }

  if (
    req.method === "GET" &&
    (url === "/api/card-of-day" || url === "/api/card-of-week")
  ) {
    try {
      const communityCards = isDbReady() ? await getAllCommunityCards() : [];
      const { cards, spotlightUserIds } = await buildSpotlightCommunityCards(
        communityCards,
        findUserByEmail
      );
      const userBoosts = isDbReady() ? await getAllUserCodBoosts() : {};
      const result = await getCardOfDayWithScout(
        scoutCard,
        ebayConfig(),
        cards,
        spotlightUserIds,
        userBoosts
      );
      send(res, 200, result);
    } catch (e) {
      send(res, 400, { error: e.message || "Card of the day failed" });
    }
    return;
  }

  if (url?.startsWith("/api/social") && !isDbReady()) {
    send(res, 503, { error: "Sign-in and social features require the server database" });
    return;
  }

  if (req.method === "GET" && url === "/api/social/friends") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      send(res, 200, await getSocialOverview(user.id));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "GET" && url?.startsWith("/api/social/friends/search")) {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      const q = new URL(req.url, "http://localhost").searchParams.get("q") || "";
      send(res, 200, await searchFriendCandidates(user.id, q));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/social/friends/request") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      const body = await readBody(req);
      send(res, 200, await sendFriendRequest(user.id, body.targetUserId ? { targetUserId: body.targetUserId } : body.lookup || body.identifier || body.email));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/social/friends/respond") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      const body = await readBody(req);
      send(res, 200, await respondFriendRequest(user.id, body.requestId, body.action));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "DELETE" && url?.startsWith("/api/social/friends/")) {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    const friendId = url.slice("/api/social/friends/".length);
    try {
      send(res, 200, await removeFriend(user.id, friendId));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "GET" && url?.startsWith("/api/social/users/")) {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    const targetId = url.slice("/api/social/users/".length);
    try {
      send(res, 200, await getFriendAccount(user.id, targetId));
    } catch (e) {
      send(res, 403, { error: e.message });
    }
    return;
  }

  if (req.method === "GET" && url === "/api/social/profile-posts") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      const u = new URL(req.url, "http://localhost");
      const profileUserId = u.searchParams.get("userId") || user.id;
      send(res, 200, await listProfilePosts(user.id, profileUserId));
    } catch (e) {
      send(res, 403, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/social/profile-posts") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      const body = await readBody(req);
      send(res, 200, await createProfilePost(user.id, body));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "GET" && url === "/api/social/hub/messages") {
    try {
      const u = new URL(req.url, "http://localhost");
      const audience = u.searchParams.get("audience") || "everyone";
      const targetUsername = u.searchParams.get("username") || "";
      const viewer = await requireUser(req);
      send(res, 200, await listHubMessages(viewer?.id || null, { audience, targetUsername }));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/social/hub/messages") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      const body = await readBody(req);
      send(res, 200, await addHubMessage(user.id, body));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (url?.startsWith("/api/push") && !isDbReady()) {
    send(res, 503, { error: "Push notifications require the server database" });
    return;
  }

  if (url === "/api/push/cron" && (req.method === "GET" || req.method === "POST")) {
    if (!authorizePushCron(req)) {
      send(res, 401, { error: "Unauthorized" });
      return;
    }
    const result = await triggerPushSchedulerTick();
    send(res, 200, result);
    return;
  }

  if (req.method === "GET" && url === "/api/push/vapid-public-key") {
    const key = getVapidPublicKey();
    if (!key) {
      send(res, 503, { error: getPushInitError() || "Push notifications are not configured" });
      return;
    }
    send(res, 200, { publicKey: key });
    return;
  }

  if (req.method === "POST" && url === "/api/push/subscribe") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      const body = await readBody(req);
      const sub = body.subscription || body;
      const endpoint = sub.endpoint;
      const p256dh = sub.keys?.p256dh;
      const auth = sub.keys?.auth;
      if (!endpoint || !p256dh || !auth) {
        send(res, 400, { error: "Invalid push subscription" });
        return;
      }
      await upsertPushSubscription({
        userId: user.id,
        endpoint,
        p256dh,
        auth,
        timezoneOffsetMinutes: Number(body.timezoneOffsetMinutes) || 0,
      });
      send(res, 200, { ok: true });
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "DELETE" && url === "/api/push/subscribe") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      const body = await readBody(req);
      if (body.endpoint) await removePushSubscription(body.endpoint);
      send(res, 200, { ok: true });
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "GET" && url === "/api/card-of-day/comments") {
    try {
      const viewer = await requireUser(req);
      send(res, 200, await listCodComments(viewer?.id || null));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/social/test-unban-comments") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      send(res, 200, await oneTimeTestUnban(user.id));
    } catch (e) {
      send(res, 403, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/card-of-day/comments/agree") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in to join the conversation" });
      return;
    }
    try {
      send(res, 200, await acceptCodCommentAgreement(user.id));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/card-of-day/poll") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in to vote" });
      return;
    }
    try {
      const body = await readBody(req);
      send(res, 200, await castCodVote(user.id, body.vote));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/card-of-day/comments") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in to join the conversation" });
      return;
    }
    try {
      const body = await readBody(req);
      send(res, 200, await addCodComment(user.id, body.text));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/collection/ai-insights") {
    try {
      const body = await readBody(req);
      const entries = body.entries || body.cards || [];
      const scoutResults = [];
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        try {
          const scout = await scoutCard(entry.card || entry, ebayConfig());
          scoutResults.push(scout);
        } catch {
          scoutResults.push(null);
        }
        if (i < entries.length - 1) await new Promise((r) => setTimeout(r, 300));
      }
      const insights = await generateCollectionInsights(entries, scoutResults, {
        openAiKey: process.env.OPENAI_API_KEY,
      });
      send(res, 200, insights);
    } catch (e) {
      send(res, 400, { error: e.message || "AI insights failed" });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/collection/estimate") {
    try {
      const body = await readBody(req);
      const entries = body.entries || body.cards || [];
      const result = await estimateCollection(entries, ebayConfig());
      send(res, 200, result);
    } catch (e) {
      send(res, 400, { error: e.message || "Estimate failed" });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/scout") {
    try {
      const body = await readBody(req);
      const result = await scoutCard(body, ebayConfig());
      send(res, 200, result);
    } catch (e) {
      send(res, 400, { error: e.message || "Scout failed" });
    }
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/api/listing/detail")) {
    try {
      const u = new URL(req.url, "http://localhost");
      const itemId = u.searchParams.get("id");
      if (!itemId) {
        send(res, 400, { error: "Missing item id" });
        return;
      }
      const detail = await fetchListingDetail(ebayConfig(), itemId);
      send(res, 200, detail);
    } catch (e) {
      send(res, 400, { error: e.message || "Detail lookup failed" });
    }
    return;
  }

  if (req.method === "GET" && req.url?.startsWith("/api/preview-query")) {
    const u = new URL(req.url, "http://localhost");
    const params = Object.fromEntries(u.searchParams);
    send(res, 200, { query: buildQuery(params) });
    return;
  }

  if (req.method === "GET" && !req.url?.startsWith("/api/")) {
    serveStatic(req, res);
    return;
  }

  send(res, 404, { error: "Not found" });
});

const serverInstance = server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🏀 ${SITE_NAME} running on port ${PORT}\n`);
  if (isDbReady()) {
    countUsers().then((n) => {
      console.log(`  Multi-user: enabled (${n} accounts, ${storageMode()})`);
      console.log("  Collections sync to the cloud when users sign in\n");
    });
  } else {
    console.log("  Multi-user: run npm install to enable accounts\n");
  }
  if (process.env.EBAY_APP_ID && process.env.EBAY_CLIENT_SECRET) {
    console.log("  eBay Browse API (active listings): ready\n");
  } else {
    console.log(`  ${EBAY_TIP}\n`);
  }
});

serverInstance.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.log(`\n  Port ${PORT} is in use — open http://localhost:${PORT}\n`);
    process.exit(0);
  }
  throw err;
});
