#!/usr/bin/env node
/**
 * DynastyDraft — standalone daily basketball team-building game
 */

import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { initDb, countUsers, isDbReady } from "./lib/db.mjs";
import {
  registerUser,
  loginUser,
  requireUser,
  sessionCookieHeader,
  sessionFromToken,
  getRequestToken,
} from "./lib/auth.mjs";
import { handleDynastyRoute } from "./lib/routes.mjs";
import { searchFriendCandidates, sendFriendRequest, listFriends } from "./lib/social.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(__dirname, "public");
const PORT = Number(process.env.PORT) || 3850;

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
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] == null) process.env[key] = val;
  }
}

loadEnvFile();

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
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
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function send(res, status, body, extraHeaders = {}) {
  const json = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": typeof body === "string" ? "text/plain; charset=utf-8" : "application/json; charset=utf-8",
    ...extraHeaders,
  });
  res.end(json);
}

function serveStatic(req, res, { headOnly = false } = {}) {
  let reqPath = req.url?.split("?")[0] || "/";
  if (reqPath === "/") reqPath = "/index.html";
  const libFile = reqPath.startsWith("/lib/") ? path.join(__dirname, reqPath.slice(1)) : null;
  const filePath = libFile || path.join(PUBLIC, reqPath);
  const publicRoot = libFile ? __dirname : PUBLIC;
  if (!filePath.startsWith(publicRoot)) {
    send(res, 403, { error: "Forbidden" });
    return;
  }
  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      send(res, 404, { error: "Not found" });
      return;
    }
    const ext = path.extname(filePath);
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    if (headOnly) {
      res.writeHead(200, headers);
      res.end();
      return;
    }
    fs.readFile(filePath, (err, data) => {
      if (err) {
        send(res, 404, { error: "Not found" });
        return;
      }
      res.writeHead(200, headers);
      res.end(data);
    });
  });
}

const server = http.createServer(async (req, res) => {
  const url = req.url?.split("?")[0] || "/";

  if (req.method === "GET" && url === "/api/health") {
    send(res, 200, {
      ok: true,
      app: "DynastyDraft",
      multiUserEnabled: isDbReady(),
      users: countUsers(),
    });
    return;
  }

  if (req.method === "POST" && url === "/api/auth/register") {
    try {
      const body = await readBody(req);
      const result = await registerUser(body);
      send(res, 200, result, { "Set-Cookie": sessionCookieHeader(result.token) });
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/auth/login") {
    try {
      const body = await readBody(req);
      const result = await loginUser(body);
      send(res, 200, result, { "Set-Cookie": sessionCookieHeader(result.token) });
    } catch (e) {
      send(res, 401, { error: e.message });
    }
    return;
  }

  if (req.method === "POST" && url === "/api/auth/logout") {
    send(res, 200, { ok: true }, { "Set-Cookie": sessionCookieHeader(null) });
    return;
  }

  if (req.method === "GET" && url === "/api/auth/session") {
    const token = getRequestToken(req);
    const session = token ? await sessionFromToken(token) : null;
    send(res, 200, session ? { ...session, token } : { user: null });
    return;
  }

  if (req.method === "GET" && url.startsWith("/api/social/friends/search")) {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    const q = new URL(req.url, "http://localhost").searchParams.get("q") || "";
    send(res, 200, searchFriendCandidates(user.id, q));
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
      send(res, 200, sendFriendRequest(user.id, body.targetUserId));
    } catch (e) {
      send(res, 400, { error: e.message });
    }
    return;
  }

  if (req.method === "GET" && url === "/api/social/friends") {
    const user = await requireUser(req);
    if (!user) {
      send(res, 401, { error: "Sign in required" });
      return;
    }
    send(res, 200, { friends: listFriends(user.id) });
    return;
  }

  if (url.startsWith("/api/dynasty/")) {
    const handled = await handleDynastyRoute(req, req.url, {
      readBody,
      send: (status, body) => send(res, status, body),
      requireUser,
    });
    if (handled) return;
  }

  if (req.method === "GET" && !url.startsWith("/api/")) {
    serveStatic(req, res);
    return;
  }

  if (req.method === "HEAD" && !url.startsWith("/api/")) {
    serveStatic(req, res, { headOnly: true });
    return;
  }

  send(res, 404, { error: "Not found" });
});

await initDb();

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n  Port ${PORT} is already in use — another DynastyDraft server is probably still running.\n`);
    console.error(`  Fix: kill it, then start again:\n`);
    console.error(`    lsof -i :${PORT}`);
    console.error(`    kill <PID>    # replace <PID> with the number from lsof\n`);
    console.error(`  Or use a different port:\n`);
    console.error(`    PORT=3851 node server.mjs\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n🏀 DynastyDraft running on http://localhost:${PORT}\n`);
  console.log(`  Accounts: ${countUsers()} registered\n`);
});
