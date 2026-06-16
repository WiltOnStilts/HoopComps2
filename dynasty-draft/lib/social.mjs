import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { searchUsersByUsername, findUserById } from "./db.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOCIAL_PATH = path.join(__dirname, "..", "data", "social.json");

function emptySocial() {
  return { friendRequests: [], friendships: [] };
}

function readSocial() {
  fs.mkdirSync(path.dirname(SOCIAL_PATH), { recursive: true });
  if (!fs.existsSync(SOCIAL_PATH)) return emptySocial();
  try {
    return { ...emptySocial(), ...JSON.parse(fs.readFileSync(SOCIAL_PATH, "utf8")) };
  } catch {
    return emptySocial();
  }
}

function writeSocial(data) {
  fs.mkdirSync(path.dirname(SOCIAL_PATH), { recursive: true });
  fs.writeFileSync(SOCIAL_PATH, JSON.stringify(data, null, 2));
}

function areFriends(data, a, b) {
  return data.friendships.some(
    (f) => (f.userA === a && f.userB === b) || (f.userA === b && f.userB === a)
  );
}

function hasPendingRequest(data, fromId, toId) {
  return data.friendRequests.some(
    (r) => r.fromUserId === fromId && r.toUserId === toId && r.status === "pending"
  );
}

export function searchFriendCandidates(userId, query) {
  const q = String(query || "").trim();
  if (q.length < 2) return { count: 0, results: [], query: q };
  const data = readSocial();
  const users = searchUsersByUsername(q, { excludeUserId: userId, limit: 12 });
  const results = users.map((u) => ({
    id: u.id,
    displayName: u.display_name,
    username: u.username,
    pending: hasPendingRequest(data, userId, u.id),
    isFriend: areFriends(data, userId, u.id),
  }));
  return { count: results.length, results, query: q };
}

export function sendFriendRequest(fromUserId, targetUserId) {
  if (fromUserId === targetUserId) throw new Error("Cannot friend yourself");
  if (!findUserById(targetUserId)) throw new Error("User not found");
  const data = readSocial();
  if (areFriends(data, fromUserId, targetUserId)) throw new Error("Already friends");
  if (hasPendingRequest(data, fromUserId, targetUserId)) throw new Error("Request already sent");
  data.friendRequests.push({
    id: crypto.randomUUID(),
    fromUserId,
    toUserId: targetUserId,
    status: "pending",
    createdAt: new Date().toISOString(),
  });
  writeSocial(data);
  return { ok: true };
}

export function listFriends(userId) {
  const data = readSocial();
  const ids = new Set();
  for (const f of data.friendships) {
    if (f.userA === userId) ids.add(f.userB);
    if (f.userB === userId) ids.add(f.userA);
  }
  return [...ids].map((id) => findUserById(id)).filter(Boolean);
}
