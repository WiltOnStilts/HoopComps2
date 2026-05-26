import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { normalizePhone, normalizeUsername } from "./user-lookup.mjs";
import { buildLeaderboardEntry, sortLeaderboardEntries } from "./leaderboard.mjs";
import { migrateScanTracking, mergeCollectionByFingerprint, migrateCollectionQuantities } from "./card-fingerprint.mjs";
import { migrateEconomy, normalizeEconomy } from "./economy.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const STORE_PATH = path.join(DATA_DIR, "users.json");

function readStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    return { users: {}, states: {}, emailIndex: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return { users: {}, states: {}, emailIndex: {} };
  }
}

function writeStore(data) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data, null, 2));
}

export function fileStoreReady() {
  return true;
}

export function fileFindUserByEmail(email) {
  const store = readStore();
  const id = store.emailIndex[email.toLowerCase().trim()];
  if (!id) return null;
  const u = store.users[id];
  if (!u) return null;
  return { id, email: u.email, password_hash: u.passwordHash, display_name: u.displayName, username: u.username || null, phone: u.phone || null };
}

function mapUser(id, u) {
  return {
    id,
    email: u.email,
    display_name: u.displayName,
    username: u.username || null,
    phone: u.phone || null,
  };
}

export function fileFindUserById(id) {
  const store = readStore();
  const u = store.users[id];
  if (!u) return null;
  return mapUser(id, u);
}

export function fileFindUserByUsername(username) {
  const handle = normalizeUsername(username).toLowerCase();
  if (!handle) return null;
  const store = readStore();
  for (const [id, u] of Object.entries(store.users || {})) {
    if ((u.username || "").toLowerCase() === handle) return mapUser(id, u);
  }
  return null;
}

export function fileFindUserByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 7) return null;
  const store = readStore();
  for (const [id, u] of Object.entries(store.users || {})) {
    if (u.phone === normalized) return mapUser(id, u);
  }
  return null;
}

export function fileFindUserByHandle(handle) {
  const h = handle?.trim()?.toLowerCase();
  if (!h) return null;
  const byUsername = fileFindUserByUsername(h);
  if (byUsername) return byUsername;
  const store = readStore();
  for (const [id, u] of Object.entries(store.users || {})) {
    const name = (u.displayName || "").toLowerCase();
    const compact = name.replace(/\s+/g, "");
    const emailLocal = (u.email || "").split("@")[0]?.toLowerCase();
    if (name === h || compact === h || emailLocal === h) {
      return mapUser(id, u);
    }
  }
  return null;
}

export function fileUpdatePasswordHash(userId, passwordHash) {
  const store = readStore();
  if (!store.users[userId]) throw new Error("User not found");
  store.users[userId].passwordHash = passwordHash;
  writeStore(store);
}

export function fileCreateUser({ id, email, passwordHash, displayName }) {
  const store = readStore();
  const key = email.toLowerCase().trim();
  store.users[id] = {
    email: key,
    passwordHash,
    displayName: displayName || "Scout",
    username: null,
    phone: null,
  };
  store.emailIndex[key] = id;
  store.states[id] = {
    state_json: JSON.stringify({
      coins: 0,
      economyVersion: 1,
      streak: 0,
      streakFreezes: 0,
      scoutCount: 0,
      ownedAvatarParts: { face: ["classic"], hair: ["buzz"], clothes: ["jersey"] },
      profile: {
        displayName: displayName || "Scout",
        favoritePlayer: "",
        favoriteTeam: "",
        collectorStyle: "investor",
        publicLeaderboard: false,
        avatar: { face: "classic", hair: "buzz", clothes: "jersey" },
      },
      collection: [],
      lastScout: null,
    }),
    public_leaderboard: false,
    updated_at: new Date().toISOString(),
  };
  writeStore(store);
}


export function fileGetUserState(userId) {
  const store = readStore();
  const row = store.states[userId];
  if (!row) return null;
  const state = JSON.parse(row.state_json);
  const user = store.users[userId];
  if (user) {
    state.profile = {
      ...state.profile,
      displayName: user.displayName?.trim() || state.profile?.displayName || "Scout",
      username: user.username || state.profile?.username || "",
      phone: user.phone || state.profile?.phone || "",
    };
  }
  return {
    state,
    publicLeaderboard: Boolean(row.public_leaderboard),
    updatedAt: row.updated_at,
  };
}

export function fileSaveUserState(userId, state, { publicLeaderboard } = {}) {
  const store = readStore();
  if (!store.states[userId]) store.states[userId] = {};
  const user = store.users[userId];
  if (user) {
    const name = state.profile?.displayName?.trim();
    const username = state.profile?.username?.trim()
      ? normalizeUsername(state.profile.username)
      : null;
    const phone = state.profile?.phone?.trim() ? normalizePhone(state.profile.phone) : null;

    if (username) {
      const clash = Object.entries(store.users).find(
        ([id, row]) => id !== userId && (row.username || "").toLowerCase() === username.toLowerCase()
      );
      if (clash) throw new Error("Username already taken");
    }
    if (phone) {
      const clash = Object.entries(store.users).find(
        ([id, row]) => id !== userId && row.phone === phone
      );
      if (clash) throw new Error("Phone number already linked to another account");
    }

    if (name) user.displayName = name;
    user.username = username;
    user.phone = phone;
  }
  store.states[userId].state_json = JSON.stringify(state);
  store.states[userId].updated_at = new Date().toISOString();
  if (publicLeaderboard != null) {
    store.states[userId].public_leaderboard = publicLeaderboard ? 1 : 0;
  }
  writeStore(store);
}

export function fileGetLeaderboard(limit = 15) {
  const store = readStore();
  const entries = [];
  let repaired = false;
  for (const [userId, row] of Object.entries(store.states)) {
    const user = store.users[userId];
    if (!user) continue;
    let state;
    try {
      state = JSON.parse(row.state_json);
    } catch {
      continue;
    }
    const optedIn =
      Boolean(row.public_leaderboard) || Boolean(state.profile?.publicLeaderboard);
    if (!optedIn) continue;
    if (!row.public_leaderboard && state.profile?.publicLeaderboard) {
      row.public_leaderboard = 1;
      repaired = true;
    }
    const entry = buildLeaderboardEntry(
      user.displayName || state.profile?.displayName || "Scout",
      state
    );
    if (entry) entries.push(entry);
  }
  if (repaired) writeStore(store);
  return sortLeaderboardEntries(entries, limit);
}

export function fileCountUsers() {
  const store = readStore();
  return Object.keys(store.users).length;
}

export function fileGetAllCommunityCards() {
  const store = readStore();
  const cards = [];
  let repaired = false;
  for (const [userId, row] of Object.entries(store.states)) {
    const user = store.users[userId];
    if (!user) continue;
    let state;
    try {
      state = JSON.parse(row.state_json);
    } catch {
      continue;
    }
    const accountName = user.displayName?.trim();
    if (accountName && state.profile?.displayName !== accountName) {
      state.profile = { ...state.profile, displayName: accountName };
      row.state_json = JSON.stringify(state);
      row.updated_at = new Date().toISOString();
      repaired = true;
    }
    const ownerName = accountName || state.profile?.displayName || "Scout";
    for (const entry of state.collection || []) {
      if (!entry?.card?.title?.trim()) continue;
      cards.push({
        entryId: entry.id,
        userId,
        ownerName,
        card: entry.card,
        estimatedValue: entry.estimatedValue ?? null,
        addedAt: entry.addedAt || null,
        imageUrl: entry.imageUrl || null,
        imageSource: entry.imageSource || null,
        imageListingTitle: entry.imageListingTitle || null,
        userPhotoUrl: entry.userPhotoUrl || null,
      });
    }
  }
  if (repaired) writeStore(store);
  return cards;
}

export function fileMigrateAllUserCollectionQuantities() {
  const store = readStore();
  let updated = 0;
  for (const [userId, row] of Object.entries(store.states)) {
    let state;
    try {
      state = JSON.parse(row.state_json);
    } catch {
      continue;
    }
    const version = state.collectionQtyVersion || 0;
    if (Array.isArray(state.collection)) {
      state.collection = mergeCollectionByFingerprint(state.collection);
    }
    migrateCollectionQuantities(state);
    if (version < 1) {
      row.state_json = JSON.stringify(state);
      row.updated_at = new Date().toISOString();
      updated += 1;
    }
  }
  if (updated > 0) writeStore(store);
  return updated;
}

export function fileMigrateAllUserScanTracking() {
  const store = readStore();
  let updated = 0;
  for (const [userId, row] of Object.entries(store.states)) {
    let state;
    try {
      state = JSON.parse(row.state_json);
    } catch {
      continue;
    }
    const before = JSON.stringify(state.scannedCards || {});
    const version = state.scanTrackingVersion || 0;
    if (Array.isArray(state.collection)) {
      state.collection = mergeCollectionByFingerprint(state.collection);
    }
    migrateScanTracking(state);
    const after = JSON.stringify(state.scannedCards || {});
    if (version < 2 || before !== after) {
      row.state_json = JSON.stringify(state);
      row.updated_at = new Date().toISOString();
      updated += 1;
    }
  }
  if (updated > 0) writeStore(store);
  return updated;
}

export function fileListUserStates() {
  const store = readStore();
  return Object.entries(store.states).map(([user_id, row]) => ({ user_id, state_json: row.state_json }));
}

export function fileMigrateAllUserEconomy() {
  const store = readStore();
  let updated = 0;
  for (const [userId, row] of Object.entries(store.states)) {
    let state;
    try {
      state = JSON.parse(row.state_json);
    } catch {
      continue;
    }
    const version = state.economyVersion || 0;
    if (Array.isArray(state.collection)) {
      state.collection = mergeCollectionByFingerprint(state.collection);
    }
    migrateScanTracking(state);
    migrateEconomy(state);
    normalizeEconomy(state);
    if (version < 1) {
      row.state_json = JSON.stringify(state);
      row.updated_at = new Date().toISOString();
      updated += 1;
    }
  }
  if (updated > 0) writeStore(store);
  return updated;
}
