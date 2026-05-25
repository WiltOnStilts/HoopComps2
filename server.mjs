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
import { initDb, isDbReady, getLeaderboard, countUsers, storageMode, getAllCommunityCards, findUserByEmail, getCommunityCardStats } from "./lib/db.mjs";
import {
  registerUser,
  loginUser,
  resetPassword,
  requireUser,
  getUserState,
  saveUserState,
  mergeGuestIntoCloud,
  alignStateWithAccountDisplayName,
} from "./lib/auth.mjs";
import {
  getSocialOverview,
  sendFriendRequest,
  respondFriendRequest,
  removeFriend,
  getFriendAccount,
  listProfilePosts,
  createProfilePost,
  listCodComments,
  addCodComment,
  acceptCodCommentAgreement,
  oneTimeTestUnban,
  clearCommentBan,
} from "./lib/social.mjs";

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

function send(res, status, body, type = "application/json") {
  const data = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  });
  res.end(data);
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

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") {
    send(res, 204, "");
    return;
  }

  const url = req.url?.split("?")[0];

  if (req.method === "GET" && url === "/api/health") {
    const hasId = Boolean(process.env.EBAY_APP_ID);
    const hasSecret = Boolean(process.env.EBAY_CLIENT_SECRET);
    send(res, 200, {
      ok: true,
      siteName: SITE_NAME,
      tagline: "Scout basketball card values",
      multiUserEnabled: isDbReady(),
      storageMode: storageMode(),
      userCount: isDbReady() ? countUsers() : 0,
      ...(isDbReady()
        ? {
            communityCards: getCommunityCardStats().cardCount,
            leaderboardEntries: getLeaderboard().length,
          }
        : {}),
      ebayConfigured: hasId && hasSecret,
      ebayAppIdSet: hasId,
      ebayClientSecretSet: hasSecret,
      ebayApi: "browse",
      priceChartingConfigured: Boolean(process.env.PRICECHARTING_TOKEN),
      openAiConfigured: Boolean(process.env.OPENAI_API_KEY),
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
      const result = registerUser({
        email: body.email,
        password: body.password,
        displayName: body.displayName,
      });
      if (body.guestState) {
        const merged = alignStateWithAccountDisplayName(
          result.user.id,
          mergeGuestIntoCloud(body.guestState, result.state)
        );
        saveUserState(result.user.id, merged, {
          publicLeaderboard: merged.profile?.publicLeaderboard,
        });
        result.state = merged;
        result.publicLeaderboard = Boolean(merged.profile?.publicLeaderboard);
        result.user.displayName = merged.profile?.displayName || result.user.displayName;
      }
      send(res, 200, result);
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
      const result = loginUser({ email: body.email, password: body.password });
      if (body.guestState) {
        const merged = alignStateWithAccountDisplayName(
          result.user.id,
          mergeGuestIntoCloud(body.guestState, result.state)
        );
        saveUserState(result.user.id, merged, {
          publicLeaderboard: merged.profile?.publicLeaderboard,
        });
        result.state = merged;
        result.publicLeaderboard = Boolean(merged.profile?.publicLeaderboard);
        result.user.displayName = merged.profile?.displayName || result.user.displayName;
      }
      send(res, 200, result);
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
      const result = resetPassword({ email, newPassword: body.newPassword });
      if (body.guestState) {
        const merged = alignStateWithAccountDisplayName(
          result.user.id,
          mergeGuestIntoCloud(body.guestState, result.state)
        );
        saveUserState(result.user.id, merged, {
          publicLeaderboard: merged.profile?.publicLeaderboard,
        });
        result.state = merged;
        result.publicLeaderboard = Boolean(merged.profile?.publicLeaderboard);
        result.user.displayName = merged.profile?.displayName || result.user.displayName;
      }
      send(res, 200, result);
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (url === "/api/user/state") {
    const user = requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    if (req.method === "GET") {
      const data = getUserState(user.id);
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
        saveUserState(user.id, body.state, {
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
    send(res, 200, { entries: getLeaderboard() });
    return;
  }

  if (
    req.method === "GET" &&
    (url === "/api/card-of-day" || url === "/api/card-of-week")
  ) {
    try {
      const communityCards = isDbReady() ? getAllCommunityCards() : [];
      const { cards, spotlightUserIds } = buildSpotlightCommunityCards(
        communityCards,
        findUserByEmail
      );
      const result = await getCardOfDayWithScout(
        scoutCard,
        ebayConfig(),
        cards,
        spotlightUserIds
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
    const user = requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      send(res, 200, getSocialOverview(user.id));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/social/friends/request") {
    const user = requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      const body = await readBody(req);
      send(res, 200, sendFriendRequest(user.id, body.email));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/social/friends/respond") {
    const user = requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      const body = await readBody(req);
      send(res, 200, respondFriendRequest(user.id, body.requestId, body.action));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "DELETE" && url?.startsWith("/api/social/friends/")) {
    const user = requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    const friendId = url.slice("/api/social/friends/".length);
    try {
      send(res, 200, removeFriend(user.id, friendId));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "GET" && url?.startsWith("/api/social/users/")) {
    const user = requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    const targetId = url.slice("/api/social/users/".length);
    try {
      send(res, 200, getFriendAccount(user.id, targetId));
    } catch (e) {
      send(res, 403, { error: e.message });
    }
    return;
  }

  if (req.method === "GET" && url === "/api/social/profile-posts") {
    const user = requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      const u = new URL(req.url, "http://localhost");
      const profileUserId = u.searchParams.get("userId") || user.id;
      send(res, 200, listProfilePosts(user.id, profileUserId));
    } catch (e) {
      send(res, 403, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/social/profile-posts") {
    const user = requireUser(req);
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

  if (req.method === "GET" && url === "/api/card-of-day/comments") {
    try {
      const viewer = requireUser(req);
      send(res, 200, listCodComments(viewer?.id || null));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/social/test-unban-comments") {
    const user = requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    try {
      send(res, 200, oneTimeTestUnban(user.id));
    } catch (e) {
      send(res, 403, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/card-of-day/comments/agree") {
    const user = requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in to join the conversation" });
      return;
    }
    try {
      send(res, 200, acceptCodCommentAgreement(user.id));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/card-of-day/comments") {
    const user = requireUser(req);
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
    console.log(`  Multi-user: enabled (${countUsers()} accounts, ${storageMode()})`);
    console.log("  Collections sync to the cloud when users sign in\n");
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
