import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const USERS_PATH = path.join(DATA_DIR, "users.json");

function emptyStore() {
  return { users: {}, emailIndex: {} };
}

function readStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(USERS_PATH)) return emptyStore();
  try {
    return { ...emptyStore(), ...JSON.parse(fs.readFileSync(USERS_PATH, "utf8")) };
  } catch {
    return emptyStore();
  }
}

function writeStore(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2));
}

function normalizeUsername(username) {
  return String(username || "")
    .trim()
    .replace(/^@+/, "")
    .slice(0, 24);
}

export function findUserById(id) {
  const store = readStore();
  const u = store.users[id];
  if (!u) return null;
  return {
    id,
    email: u.email,
    display_name: u.displayName,
    username: u.username || null,
  };
}

export function findUserByEmail(email) {
  const store = readStore();
  const id = store.emailIndex[email.toLowerCase().trim()];
  if (!id) return null;
  return findUserById(id);
}

export function findUserByUsername(username) {
  const handle = normalizeUsername(username).toLowerCase();
  if (!handle) return null;
  const store = readStore();
  for (const [id, u] of Object.entries(store.users)) {
    if ((u.username || "").toLowerCase() === handle) return findUserById(id);
  }
  return null;
}

export function searchUsersByUsername(query, { excludeUserId, limit = 12 } = {}) {
  const q = normalizeUsername(query).toLowerCase();
  if (q.length < 2) return [];
  const store = readStore();
  const results = [];
  for (const [id, u] of Object.entries(store.users)) {
    if (excludeUserId && id === excludeUserId) continue;
    const username = (u.username || "").toLowerCase();
    const display = (u.displayName || "").toLowerCase();
    if (username.includes(q) || display.includes(q)) {
      results.push(findUserById(id));
    }
    if (results.length >= limit) break;
  }
  return results;
}

export function createUser({ email, passwordHash, displayName, username }) {
  const store = readStore();
  const normalizedEmail = email.toLowerCase().trim();
  if (store.emailIndex[normalizedEmail]) {
    throw new Error("Email already registered");
  }
  const handle = normalizeUsername(username).toLowerCase();
  if (handle) {
    for (const u of Object.values(store.users)) {
      if ((u.username || "").toLowerCase() === handle) throw new Error("Username taken");
    }
  }
  const id = crypto.randomUUID();
  store.users[id] = {
    email: normalizedEmail,
    passwordHash,
    displayName: displayName || normalizedEmail.split("@")[0],
    username: handle || null,
    createdAt: new Date().toISOString(),
  };
  store.emailIndex[normalizedEmail] = id;
  writeStore(store);
  return findUserById(id);
}

export function updatePasswordHash(userId, passwordHash) {
  const store = readStore();
  if (!store.users[userId]) throw new Error("User not found");
  store.users[userId].passwordHash = passwordHash;
  writeStore(store);
}

export function getUserPasswordHash(userId) {
  const store = readStore();
  return store.users[userId]?.passwordHash || null;
}

export function countUsers() {
  return Object.keys(readStore().users).length;
}

export async function initDb() {
  readStore();
  return true;
}

export function isDbReady() {
  return true;
}
