import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as fileStore from "./file-store.mjs";
import * as pgStore from "./pg-store.mjs";
import { persistSpotlightPool } from "./spotlight-pool.mjs";
import { migrateSocialJsonToPostgres } from "./social-store.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_PATH = path.join(DATA_DIR, "hoopcomps.db");

/** @type {'none' | 'postgres' | 'sqlite' | 'file'} */
let backend = "none";
let db = null;
let dbReady = false;

export function isDbReady() {
  return dbReady;
}

export function storageMode() {
  return backend;
}

export async function initDb() {
  if (dbReady) return true;

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) {
    try {
      await pgStore.pgInit(databaseUrl);
      backend = "postgres";
      dbReady = true;
      console.log("  Multi-user: Neon Postgres (DATABASE_URL)");
      const usersMigrated = await pgStore.pgImportUsersFromJsonFile(
        path.join(DATA_DIR, "users.json")
      );
      if (usersMigrated) console.log("  Migrated users.json → Postgres");
      const socialMigrated = await migrateSocialJsonToPostgres();
      if (socialMigrated) console.log("  Migrated social.json → Postgres");
      console.log("");
      return true;
    } catch (e) {
      console.error("  Postgres init failed:", e.message);
    }
  }

  try {
    if (process.env.USE_FILE_STORE === "1") {
      throw new Error("USE_FILE_STORE set");
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
    backend = "sqlite";
    dbReady = true;
    console.log("  Multi-user: local SQLite\n");
    return true;
  } catch {
    /* fall through */
  }

  if (fileStore.fileStoreReady()) {
    backend = "file";
    dbReady = true;
    console.log("  Multi-user: JSON file store (set DATABASE_URL for Postgres)\n");
    return true;
  }

  console.warn("  Multi-user unavailable\n");
  return false;
}

function sqlite() {
  if (backend !== "sqlite" || !db) throw new Error("SQLite not active");
  return db;
}

export async function findUserByEmail(email) {
  if (backend === "postgres") return pgStore.pgFindUserByEmail(email);
  if (backend === "file") return fileStore.fileFindUserByEmail(email);
  return sqlite()
    .prepare("SELECT id, email, password_hash, display_name FROM users WHERE email = ?")
    .get(email.toLowerCase().trim());
}

export async function findUserById(id) {
  if (backend === "postgres") return pgStore.pgFindUserById(id);
  if (backend === "file") return fileStore.fileFindUserById(id);
  return sqlite().prepare("SELECT id, email, display_name FROM users WHERE id = ?").get(id);
}

export async function findUserByHandle(handle) {
  const h = handle?.trim()?.toLowerCase();
  if (!h) return null;
  if (backend === "postgres") return pgStore.pgFindUserByHandle(handle);
  if (backend === "file") return fileStore.fileFindUserByHandle(handle);
  return sqlite()
    .prepare(
      `SELECT id, email, display_name FROM users
       WHERE lower(display_name) = ?
          OR lower(replace(display_name, ' ', '')) = ?
          OR lower(substr(email, 1, instr(email, '@') - 1)) = ?
       LIMIT 1`
    )
    .get(h, h, h);
}

export async function updatePasswordHash(userId, passwordHash) {
  if (backend === "postgres") return pgStore.pgUpdatePasswordHash(userId, passwordHash);
  if (backend === "file") return fileStore.fileUpdatePasswordHash(userId, passwordHash);
  sqlite().prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

export async function createUser({ id, email, passwordHash, displayName }) {
  if (backend === "postgres") {
    return pgStore.pgCreateUser({ id, email, passwordHash, displayName });
  }
  if (backend === "file") {
    fileStore.fileCreateUser({ id, email, passwordHash, displayName });
    return;
  }
  sqlite()
    .prepare("INSERT INTO users (id, email, password_hash, display_name) VALUES (?, ?, ?, ?)")
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
    .prepare("INSERT INTO user_state (user_id, state_json, public_leaderboard) VALUES (?, ?, 0)")
    .run(id, defaultState);
}

export async function getUserState(userId) {
  if (backend === "postgres") return pgStore.pgGetUserState(userId);
  if (backend === "file") return fileStore.fileGetUserState(userId);

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
      .prepare("UPDATE user_state SET state_json = ?, updated_at = datetime('now') WHERE user_id = ?")
      .run(JSON.stringify(state), userId);
  }
  return {
    state,
    publicLeaderboard: Boolean(row.public_leaderboard),
    updatedAt: row.updated_at,
  };
}

export async function saveUserState(userId, state, { publicLeaderboard } = {}) {
  const lb = publicLeaderboard ?? Boolean(state?.profile?.publicLeaderboard);
  const name = state.profile?.displayName?.trim();

  if (backend === "postgres") {
    await pgStore.pgSaveUserState(userId, state, { publicLeaderboard: lb });
    await notifySpotlightPool(userId, state);
    return;
  }

  if (backend === "file") {
    if (name) fileStore.fileSaveUserState(userId, state, { publicLeaderboard: lb });
    else fileStore.fileSaveUserState(userId, state, { publicLeaderboard: lb });
    await notifySpotlightPool(userId, state);
    return;
  }

  if (name) {
    sqlite().prepare("UPDATE users SET display_name = ? WHERE id = ?").run(name, userId);
  }
  const json = JSON.stringify(state);
  sqlite()
    .prepare(
      `INSERT INTO user_state (user_id, state_json, public_leaderboard, updated_at)
       VALUES (?, ?, ?, datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         state_json = excluded.state_json,
         public_leaderboard = excluded.public_leaderboard,
         updated_at = datetime('now')`
    )
    .run(userId, json, lb ? 1 : 0);
  await notifySpotlightPool(userId, state);
}

async function notifySpotlightPool(userId, state) {
  if (backend === "postgres") return;
  const user = await findUserById(userId);
  await persistSpotlightPool(userId, user?.email, state, findUserByEmail);
}

export async function getLeaderboard(limit = 15) {
  if (backend === "postgres") return pgStore.pgGetLeaderboard(limit);
  if (backend === "file") return fileStore.fileGetLeaderboard(limit);

  const rows = sqlite()
    .prepare(
      `SELECT u.display_name, u.email, s.state_json
       FROM user_state s
       JOIN users u ON u.id = s.user_id
       WHERE s.public_leaderboard = 1`
    )
    .all();

  return rows
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
}

export async function countUsers() {
  if (backend === "postgres") return pgStore.pgCountUsers();
  if (backend === "file") return fileStore.fileCountUsers();
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

export async function getAllCommunityCards() {
  if (!dbReady) return [];
  if (backend === "postgres") return pgStore.pgGetAllCommunityCards();
  if (backend === "file") return fileStore.fileGetAllCommunityCards();

  const rows = sqlite()
    .prepare(
      `SELECT u.id, u.display_name, s.state_json
       FROM user_state s
       JOIN users u ON u.id = s.user_id`
    )
    .all();
  return flattenCommunityFromRows(rows);
}

export async function getCommunityCardStats() {
  const cards = await getAllCommunityCards();
  const collectors = new Set(cards.map((c) => c.userId));
  return { cardCount: cards.length, collectorCount: collectors.size };
}
