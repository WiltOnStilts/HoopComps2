import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as fileStore from "./file-store.mjs";
import * as pgStore from "./pg-store.mjs";
import { persistSpotlightPool } from "./spotlight-pool.mjs";
import { migrateSocialJsonToPostgres } from "./social-store.mjs";
import { normalizePhone, normalizeUsername, looksLikePhone } from "./user-lookup.mjs";
import { buildLeaderboardEntry, sortLeaderboardEntries } from "./leaderboard.mjs";
import { migrateScanTracking, mergeCollectionByFingerprint, migrateCollectionQuantities } from "./card-fingerprint.mjs";
import { migrateEconomy, normalizeEconomy, getCodBoostPercentForDay } from "./economy.mjs";
import { getDayKey } from "./day-key.mjs";

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
      const scanMigrated = await migrateAllUserScanTracking();
      if (scanMigrated > 0) console.log(`  Rebuilt scan tracking for ${scanMigrated} user(s)`);
      const collectionQtyMigrated = await migrateAllUserCollectionQuantities();
      if (collectionQtyMigrated > 0) console.log(`  Repaired collection quantities for ${collectionQtyMigrated} user(s)`);
      const economyMigrated = await migrateAllUserEconomy();
      if (economyMigrated > 0) console.log(`  Reset coins economy for ${economyMigrated} user(s)`);
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
        username TEXT,
        phone TEXT,
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
    try {
      db.exec("ALTER TABLE users ADD COLUMN username TEXT");
    } catch {
      /* column exists */
    }
    try {
      db.exec("ALTER TABLE users ADD COLUMN phone TEXT");
    } catch {
      /* column exists */
    }
    const scanMigrated = await migrateAllUserScanTracking();
    if (scanMigrated > 0) console.log(`  Rebuilt scan tracking for ${scanMigrated} user(s)`);
    const collectionQtyMigrated = await migrateAllUserCollectionQuantities();
    if (collectionQtyMigrated > 0) console.log(`  Repaired collection quantities for ${collectionQtyMigrated} user(s)`);
    const economyMigrated = await migrateAllUserEconomy();
    if (economyMigrated > 0) console.log(`  Reset coins economy for ${economyMigrated} user(s)`);
    return true;
  } catch {
    /* fall through */
  }

  if (fileStore.fileStoreReady()) {
    backend = "file";
    dbReady = true;
    console.log("  Multi-user: JSON file store (set DATABASE_URL for Postgres)\n");
    const scanMigrated = await migrateAllUserScanTracking();
    if (scanMigrated > 0) console.log(`  Rebuilt scan tracking for ${scanMigrated} user(s)`);
    const collectionQtyMigrated = await migrateAllUserCollectionQuantities();
    if (collectionQtyMigrated > 0) console.log(`  Repaired collection quantities for ${collectionQtyMigrated} user(s)`);
    const economyMigrated = await migrateAllUserEconomy();
    if (economyMigrated > 0) console.log(`  Reset coins economy for ${economyMigrated} user(s)`);
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
  if (backend === "postgres") return pgStore.pgFindUserByHandle(handle);
  if (backend === "file") return fileStore.fileFindUserByHandle(handle);
  const h = handle?.trim()?.toLowerCase();
  if (!h) return null;
  const byUsername = await findUserByUsername(h);
  if (byUsername) return byUsername;
  return sqlite()
    .prepare(
      `SELECT id, email, display_name, username, phone FROM users
       WHERE lower(display_name) = ?
          OR lower(replace(display_name, ' ', '')) = ?
          OR lower(substr(email, 1, instr(email, '@') - 1)) = ?
       LIMIT 1`
    )
    .get(h, h, h);
}

export async function findUserByUsername(username) {
  const handle = normalizeUsername(username).toLowerCase();
  if (!handle) return null;
  if (backend === "postgres") return pgStore.pgFindUserByUsername(username);
  if (backend === "file") return fileStore.fileFindUserByUsername(username);
  return sqlite()
    .prepare(
      `SELECT id, email, display_name, username, phone FROM users
       WHERE lower(username) = ?
       LIMIT 1`
    )
    .get(handle);
}

export async function findUserByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 7) return null;
  if (backend === "postgres") return pgStore.pgFindUserByPhone(phone);
  if (backend === "file") return fileStore.fileFindUserByPhone(phone);
  return sqlite()
    .prepare(
      `SELECT id, email, display_name, username, phone FROM users WHERE phone = ? LIMIT 1`
    )
    .get(normalized);
}

export async function findUserByFriendLookup(identifier) {
  const raw = identifier?.trim();
  if (!raw) return null;
  if (looksLikePhone(raw)) {
    return findUserByPhone(raw);
  }
  const byUsername = await findUserByUsername(raw);
  if (byUsername) return byUsername;
  return findUserByHandle(raw);
}

function assertUniqueContactFieldsSqlite(userId, { username, phone }) {
  const normalizedUsername = username ? normalizeUsername(username).toLowerCase() : null;
  const normalizedPhone = phone ? normalizePhone(phone) : null;
  if (normalizedUsername) {
    const clash = sqlite()
      .prepare(`SELECT id FROM users WHERE lower(username) = ? AND id <> ? LIMIT 1`)
      .get(normalizedUsername, userId);
    if (clash) throw new Error("Username already taken");
  }
  if (normalizedPhone) {
    const clash = sqlite()
      .prepare(`SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1`)
      .get(normalizedPhone, userId);
    if (clash) throw new Error("Phone number already linked to another account");
  }
}

function updateUserContactFieldsSqlite(userId, { displayName, username, phone }) {
  assertUniqueContactFieldsSqlite(userId, { username, phone });
  const normalizedUsername = username?.trim() ? normalizeUsername(username) : null;
  const normalizedPhone = phone?.trim() ? normalizePhone(phone) : null;
  sqlite()
    .prepare(
      `UPDATE users
       SET display_name = COALESCE(?, display_name),
           username = ?,
           phone = ?
       WHERE id = ?`
    )
    .run(
      displayName?.trim() || null,
      normalizedUsername || null,
      normalizedPhone || null,
      userId
    );
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
  });

  sqlite()
    .prepare("INSERT INTO user_state (user_id, state_json, public_leaderboard) VALUES (?, ?, 0)")
    .run(id, defaultState);
}

function applyUserState(state) {
  if (!state) return state;
  if (Array.isArray(state.collection)) {
    state.collection = mergeCollectionByFingerprint(state.collection);
  }
  migrateScanTracking(state);
  migrateCollectionQuantities(state);
  migrateEconomy(state);
  normalizeEconomy(state);
  return state;
}

async function migrateAllUserEconomy() {
  if (!dbReady) return 0;
  if (backend === "postgres") return pgStore.pgMigrateAllUserEconomy();
  if (backend === "file") return fileStore.fileMigrateAllUserEconomy();

  const rows = sqlite()
    .prepare("SELECT user_id, state_json FROM user_state")
    .all();
  let updated = 0;
  for (const row of rows) {
    let state;
    try {
      state = JSON.parse(row.state_json);
    } catch {
      continue;
    }
    const version = state.economyVersion || 0;
    applyUserState(state);
    if (version < 1) {
      sqlite()
        .prepare(`UPDATE user_state SET state_json = ?, updated_at = datetime('now') WHERE user_id = ?`)
        .run(JSON.stringify(state), row.user_id);
      updated += 1;
    }
  }
  return updated;
}

async function migrateAllUserCollectionQuantities() {
  if (!dbReady) return 0;
  if (backend === "postgres") return pgStore.pgMigrateAllUserCollectionQuantities();
  if (backend === "file") return fileStore.fileMigrateAllUserCollectionQuantities();

  const rows = sqlite()
    .prepare("SELECT user_id, state_json FROM user_state")
    .all();
  let updated = 0;
  for (const row of rows) {
    let state;
    try {
      state = JSON.parse(row.state_json);
    } catch {
      continue;
    }
    const version = state.collectionQtyVersion || 0;
    applyUserState(state);
    if (version < 1) {
      sqlite()
        .prepare(`UPDATE user_state SET state_json = ?, updated_at = datetime('now') WHERE user_id = ?`)
        .run(JSON.stringify(state), row.user_id);
      updated += 1;
    }
  }
  return updated;
}

async function migrateAllUserScanTracking() {
  if (!dbReady) return 0;
  if (backend === "postgres") return pgStore.pgMigrateAllUserScanTracking();
  if (backend === "file") return fileStore.fileMigrateAllUserScanTracking();

  const rows = sqlite()
    .prepare("SELECT user_id, state_json, public_leaderboard FROM user_state")
    .all();
  let updated = 0;
  for (const row of rows) {
    let state;
    try {
      state = JSON.parse(row.state_json);
    } catch {
      continue;
    }
    const before = JSON.stringify(state.scannedCards || {});
    const version = state.scanTrackingVersion || 0;
    applyUserState(state);
    const after = JSON.stringify(state.scannedCards || {});
    if (version < 3 || before !== after) {
      sqlite()
        .prepare(
          `UPDATE user_state SET state_json = ?, updated_at = datetime('now') WHERE user_id = ?`
        )
        .run(JSON.stringify(state), row.user_id);
      updated += 1;
    }
  }
  return updated;
}

export async function getUserState(userId) {
  let result;
  if (backend === "postgres") result = await pgStore.pgGetUserState(userId);
  else if (backend === "file") result = fileStore.fileGetUserState(userId);
  else {
    const row = sqlite()
      .prepare("SELECT state_json, public_leaderboard, updated_at FROM user_state WHERE user_id = ?")
      .get(userId);
    if (!row) return null;
    const state = JSON.parse(row.state_json);
    const account = sqlite()
      .prepare("SELECT display_name, username, phone FROM users WHERE id = ?")
      .get(userId);
    if (account) {
      state.profile = {
        ...state.profile,
        displayName: account.display_name?.trim() || state.profile?.displayName || "Scout",
        username: account.username || state.profile?.username || "",
        phone: account.phone || state.profile?.phone || "",
      };
    }
    result = {
      state,
      publicLeaderboard: Boolean(row.public_leaderboard),
      updatedAt: row.updated_at,
    };
  }

  if (result?.state) result.state = applyUserState(result.state);
  return result;
}

export async function saveUserState(userId, state, { publicLeaderboard } = {}) {
  applyUserState(state);
  const lb = publicLeaderboard ?? Boolean(state?.profile?.publicLeaderboard);
  const name = state.profile?.displayName?.trim();

  if (backend === "postgres") {
    await pgStore.pgSaveUserState(userId, state, { publicLeaderboard: lb });
    await notifySpotlightPool(userId, state);
    return;
  }

  if (backend === "file") {
    fileStore.fileSaveUserState(userId, state, { publicLeaderboard: lb });
    await notifySpotlightPool(userId, state);
    return;
  }

  updateUserContactFieldsSqlite(userId, {
    displayName: name,
    username: state.profile?.username,
    phone: state.profile?.phone,
  });
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

  return sortLeaderboardEntries(
    rows
      .map((row) => {
        let state;
        try {
          state = applyUserState(JSON.parse(row.state_json));
        } catch {
          return null;
        }
        const name = row.display_name || state.profile?.displayName || "Scout";
        return buildLeaderboardEntry(name, state);
      })
      .filter(Boolean),
    limit
  );
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
        userPhotoUrl: entry.userPhotoUrl || null,
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

export async function getAllUserCodBoosts(dayKey = getDayKey()) {
  if (!dbReady) return {};
  const boosts = {};

  const ingest = (userId, state) => {
    const pct = getCodBoostPercentForDay(state, dayKey);
    if (pct > 0) boosts[userId] = pct;
  };

  if (backend === "postgres") {
    const rows = await pgStore.pgListUserStates();
    for (const row of rows) {
      try {
        ingest(row.user_id, applyUserState(JSON.parse(row.state_json)));
      } catch {
        /* skip */
      }
    }
    return boosts;
  }

  if (backend === "file") {
    const rows = fileStore.fileListUserStates();
    for (const row of rows) {
      try {
        ingest(row.user_id, applyUserState(JSON.parse(row.state_json)));
      } catch {
        /* skip */
      }
    }
    return boosts;
  }

  const rows = sqlite().prepare("SELECT user_id, state_json FROM user_state").all();
  for (const row of rows) {
    try {
      ingest(row.user_id, applyUserState(JSON.parse(row.state_json)));
    } catch {
      /* skip */
    }
  }
  return boosts;
}

export async function getCommunityCardStats() {
  const cards = await getAllCommunityCards();
  const collectors = new Set(cards.map((c) => c.userId));
  return { cardCount: cards.length, collectorCount: collectors.size };
}
