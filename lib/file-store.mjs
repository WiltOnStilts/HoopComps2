import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

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
  return { id, email: u.email, password_hash: u.passwordHash, display_name: u.displayName };
}

export function fileFindUserById(id) {
  const store = readStore();
  const u = store.users[id];
  if (!u) return null;
  return { id, email: u.email, display_name: u.displayName };
}

export function fileCreateUser({ id, email, passwordHash, displayName }) {
  const store = readStore();
  const key = email.toLowerCase().trim();
  store.users[id] = { email: key, passwordHash, displayName: displayName || "Scout" };
  store.emailIndex[key] = id;
  store.states[id] = {
    state_json: JSON.stringify({
      xp: 0,
      level: 1,
      streak: 0,
      scoutCount: 0,
      profile: {
        displayName: displayName || "Scout",
        favoritePlayer: "",
        favoriteTeam: "",
        collectorStyle: "investor",
        publicLeaderboard: false,
      },
      collection: [],
      lastScout: null,
    }),
    public_leaderboard: false,
    updated_at: new Date().toISOString(),
  };
  writeStore(store);
}

function accountDisplayName(store, userId) {
  return store.users[userId]?.displayName?.trim() || "";
}

export function fileGetUserState(userId) {
  const store = readStore();
  const row = store.states[userId];
  if (!row) return null;
  const state = JSON.parse(row.state_json);
  const name = accountDisplayName(store, userId);
  if (name && state.profile?.displayName !== name) {
    state.profile = { ...state.profile, displayName: name };
    row.state_json = JSON.stringify(state);
    row.updated_at = new Date().toISOString();
    writeStore(store);
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
  const name = state.profile?.displayName?.trim();
  if (name && store.users[userId]) {
    store.users[userId].displayName = name;
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
    const collection = state.collection || [];
    const total = collection.reduce((sum, item) => {
      const v = item.estimatedValue;
      if (v == null) return sum;
      return sum + v * (item.quantity || 1);
    }, 0);
    if (!collection.length) continue;
    entries.push({
      name: user.displayName || state.profile?.displayName || "Scout",
      total,
      cardCount: collection.length,
      level: state.level || 1,
    });
  }
  if (repaired) writeStore(store);
  return entries.sort((a, b) => b.total - a.total).slice(0, limit);
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
      });
    }
  }
  if (repaired) writeStore(store);
  return cards;
}
