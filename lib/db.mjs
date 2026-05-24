import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as fileStore from "./file-store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "hoopcomps.db");

let db = null;
let dbReady = false;
let useFileStore = false;

export function isDbReady() {
  return dbReady;
}

export function storageMode() {
  if (!dbReady) return "none";
  return useFileStore ? "file" : "sqlite";
}

export async function initDb() {
  if (dbReady) return true;

  try {
    if (process.env.RENDER === "true" || process.env.USE_FILE_STORE === "1") {
      throw new Error("Using file store on cloud");
    }
    const mod = await import("better-sqlite3");
    const Database = mod.default;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    db = new Database(DB_PATH);
    db.pragma("journal_mode = WAL");
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT DEFAULT 'Scout',
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS user_state (
        user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        state_json TEXT NOT NULL,
        public_leaderboard INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    `);
    dbReady = true;
    useFileStore = false;
    return true;
  } catch {
    /* fall through to file store */
  }

  if (fileStore.fileStoreReady()) {
    dbReady = true;
    useFileStore = true;
    console.log("  Multi-user: JSON file store (run npm install for SQLite upgrade)\n");
    return true;
  }

  console.warn("  Multi-user unavailable\n");
  return false;
}

function sqlite() {
  if (useFileStore || !db) throw new Error("SQLite not active");
  return db;
}

export function findUserByEmail(email) {
  if (useFileStore) return fileStore.fileFindUserByEmail(email);
  return sqlite()
    .prepare("SELECT id, email, password_hash, display_name FROM users WHERE email = ?")
    .get(email.toLowerCase().trim());
}

export function findUserById(id) {
  if (useFileStore) return fileStore.fileFindUserById(id);
  return sqlite().prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(id);
}

export function createUser({ id, email, passwordHash, displayName }) {
  if (useFileStore) {
    fileStore.fileCreateUser({ id, email, passwordHash, displayName });
    return;
  }
  sqlite()
    .prepare(
      "INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)"
    )
    .run(id, email.toLowerCase().trim(), passwordHash, displayName || "Scout");

  const defaultState = JSON.stringify({
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
  });

  sqlite()
    .prepare(
      "INSERT INTO user_state (user_id, state_json, public_leaderboard) VALUES (?, ?, 0)"
    )
    .run(id, defaultState);
}

export function getUserState(userId) {
  if (useFileStore) return fileStore.fileGetUserState(userId);
  const row = sqlite()
    .prepare("SELECT state_json, public_leaderboard, updated_at FROM user_state WHERE user_id = ?")
    .get(userId);
  if (!row) return null;
  const state = JSON.parse(row.state_json);
  const account = sqlite()
    .prepare("SELECT display_name FROM users WHERE id = ?")
    .get(userId);
  const name = account?.display_name?.trim();
  if (name && state.profile?.displayName !== name) {
    state.profile = { ...state.profile, displayName: name };
    sqlite()
      .prepare(
        `UPDATE user_state SET state_json = ?, updated_at = datetime('now') WHERE user_id = ?`
      )
      .run(JSON.stringify(state), userId);
  }
  return {
    state,
    publicLeaderboard: Boolean(row.public_leaderboard),
    updatedAt: row.updated_at,
  };
}

export function saveUserState(userId, state, { publicLeaderboard } = {}) {
  const name = state.profile?.displayName?.trim();
  if (name) {
    if (useFileStore) {
      fileStore.fileSaveUserState(userId, state, { publicLeaderboard });
      return;
    }
    sqlite()
      .prepare("UPDATE users SET display_name = ? WHERE id = ?")
      .run(name, userId);
  } else if (useFileStore) {
    fileStore.fileSaveUserState(userId, state, { publicLeaderboard });
    return;
  }
  const json = JSON.stringify(state);
  if (publicLeaderboard != null) {
    sqlite()
      .prepare(
        `INSERT INTO user_state (user_id, state_json, public_leaderboard, updated_at)
         VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           state_json = excluded.state_json,
           public_leaderboard = excluded.public_leaderboard,
           updated_at = datetime('now')`
      )
      .run(userId, json, publicLeaderboard ? 1 : 0);
  } else {
    sqlite()
      .prepare(
        `INSERT INTO user_state (user_id, state_json, updated_at)
         VALUES (?, ?, datetime('now'))
         ON CONFLICT(user_id) DO UPDATE SET
           state_json = excluded.state_json,
           updated_at = datetime('now')`
      )
      .run(userId, json);
  }
}

export function getLeaderboard(limit = 15) {
  if (useFileStore) return fileStore.fileGetLeaderboard(limit);

  const rows = sqlite()
    .prepare(
      `SELECT u.display_name, u.email, s.state_json
       FROM user_state s
       JOIN users u ON u.id = s.user_id
       WHERE s.public_leaderboard = 1`
    )
    .all();

  const entries = rows
    .map((row) => {
      let state;
      try {
        state = JSON.parse(row.state_json);
      } catch {
        return null;
      }
      const collection = state.collection || [];
      const total = collection.reduce((sum, item) => {
        const v = item.estimatedValue;
        if (v == null) return sum;
        return sum + v * (item.quantity || 1);
      }, 0);
      const cardCount = collection.length;
      if (cardCount === 0) return null;
      const name = row.display_name || state.profile?.displayName || "Scout";
      return { name, total, cardCount, level: state.level || 1 };
    })
    .filter(Boolean)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit);

  return entries;
}

export function countUsers() {
  if (useFileStore) return fileStore.fileCountUsers();
  const row = sqlite().prepare("SELECT COUNT(*) as c FROM users").get();
  return row?.c || 0;
}

function flattenCommunityFromRows(rows) {
  const cards = [];
  for (const row of rows) {
    let state;
    try {
      state = JSON.parse(row.state_json);
    } catch {
      continue;
    }
    const ownerName = row.display_name || state.profile?.displayName || "Scout";
    for (const entry of state.collection || []) {
      if (!entry?.card?.title?.trim()) continue;
      cards.push({
        entryId: entry.id,
        userId: row.id,
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
  return cards;
}

/** Every card saved in any user's cloud collection */
export function getAllCommunityCards() {
  if (!dbReady) return [];
  if (useFileStore) return fileStore.fileGetAllCommunityCards();

  const rows = sqlite()
    .prepare(
      `SELECT u.id, u.display_name, s.state_json
       FROM user_state s
       JOIN users u ON u.id = s.user_id`
    )
    .all();
  return flattenCommunityFromRows(rows);
}

export function getCommunityCardStats() {
  const cards = getAllCommunityCards();
  const collectors = new Set(cards.map((c) => c.userId));
  return { cardCount: cards.length, collectorCount: collectors.size };
}
