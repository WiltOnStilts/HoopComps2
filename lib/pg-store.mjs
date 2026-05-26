import fs from "fs";
import pg from "pg";
import * as pgSocial from "./pg-social.mjs";
import { normalizePhone, normalizeUsername } from "./user-lookup.mjs";
import { buildLeaderboardEntry, sortLeaderboardEntries } from "./leaderboard.mjs";

const { Pool } = pg;

let pool = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT 'Scout',
  username TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_state (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL,
  public_leaderboard BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`;

export async function pgInit(connectionString) {
  pool = new Pool({
    connectionString,
    ssl: connectionString.includes("sslmode=require") || connectionString.includes("neon.tech")
      ? { rejectUnauthorized: false }
      : undefined,
    max: 10,
  });
  pgSocial.pgSocialUsePool(pool);
  await pool.query(SCHEMA);
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_unique
      ON users (lower(username)) WHERE username IS NOT NULL AND username <> '';
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
      ON users (phone) WHERE phone IS NOT NULL AND phone <> '';
  `);
  await pool.query(pgSocial.SOCIAL_SCHEMA);
}

export function pgReady() {
  return Boolean(pool);
}

function defaultStateJson(displayName = "Scout") {
  return JSON.stringify({
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
}

export async function pgFindUserByEmail(email) {
  const { rows } = await pool.query(
    "SELECT id, email, password_hash, display_name FROM users WHERE email = $1",
    [email.toLowerCase().trim()]
  );
  return rows[0] || null;
}

export async function pgFindUserById(id) {
  const { rows } = await pool.query(
    "SELECT id, email, display_name, username, phone FROM users WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}

export async function pgFindUserByPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized || normalized.length < 7) return null;
  const { rows } = await pool.query(
    "SELECT id, email, display_name, username, phone FROM users WHERE phone = $1 LIMIT 1",
    [normalized]
  );
  return rows[0] || null;
}

export async function pgFindUserByUsername(username) {
  const handle = normalizeUsername(username).toLowerCase();
  if (!handle) return null;
  const { rows } = await pool.query(
    `SELECT id, email, display_name, username, phone FROM users
     WHERE lower(username) = $1
     LIMIT 1`,
    [handle]
  );
  return rows[0] || null;
}

export async function pgFindUserByHandle(handle) {
  const h = handle?.trim()?.toLowerCase();
  if (!h) return null;
  const byUsername = await pgFindUserByUsername(h);
  if (byUsername) return byUsername;
  const { rows } = await pool.query(
    `SELECT id, email, display_name, username, phone FROM users
     WHERE lower(display_name) = $1
        OR lower(replace(display_name, ' ', '')) = $1
        OR lower(split_part(email, '@', 1)) = $1
     LIMIT 1`,
    [h]
  );
  return rows[0] || null;
}

async function assertUniqueContactFields(userId, { username, phone }) {
  const normalizedUsername = username ? normalizeUsername(username) : null;
  const normalizedPhone = phone ? normalizePhone(phone) : null;

  if (normalizedUsername) {
    const { rows } = await pool.query(
      `SELECT id FROM users WHERE lower(username) = lower($1) AND id <> $2 LIMIT 1`,
      [normalizedUsername, userId]
    );
    if (rows.length) throw new Error("Username already taken");
  }

  if (normalizedPhone) {
    const { rows } = await pool.query(
      `SELECT id FROM users WHERE phone = $1 AND id <> $2 LIMIT 1`,
      [normalizedPhone, userId]
    );
    if (rows.length) throw new Error("Phone number already linked to another account");
  }
}

export async function pgUpdateUserContactFields(userId, { displayName, username, phone }) {
  const normalizedUsername = username?.trim() ? normalizeUsername(username) : null;
  const normalizedPhone = phone?.trim() ? normalizePhone(phone) : null;
  await assertUniqueContactFields(userId, {
    username: normalizedUsername,
    phone: normalizedPhone,
  });
  await pool.query(
    `UPDATE users
     SET display_name = COALESCE($1, display_name),
         username = $2,
         phone = $3
     WHERE id = $4`,
    [
      displayName?.trim() || null,
      normalizedUsername || null,
      normalizedPhone || null,
      userId,
    ]
  );
}

export async function pgUpdatePasswordHash(userId, passwordHash) {
  await pool.query("UPDATE users SET password_hash = $1 WHERE id = $2", [passwordHash, userId]);
}

export async function pgCreateUser({ id, email, passwordHash, displayName }) {
  const key = email.toLowerCase().trim();
  const name = displayName || "Scout";
  await pool.query(
    "INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)",
    [id, key, passwordHash, name]
  );
  await pool.query(
    "INSERT INTO user_state (user_id, state_json, public_leaderboard) VALUES ($1, $2, FALSE)",
    [id, defaultStateJson(name)]
  );
}

export async function pgGetUserState(userId) {
  const { rows } = await pool.query(
    "SELECT state_json, public_leaderboard, updated_at FROM user_state WHERE user_id = $1",
    [userId]
  );
  const row = rows[0];
  if (!row) return null;

  const state = JSON.parse(row.state_json);
  const account = await pgFindUserById(userId);
  if (account) {
    state.profile = {
      ...state.profile,
      displayName: account.display_name?.trim() || state.profile?.displayName || "Scout",
      username: account.username || state.profile?.username || "",
      phone: account.phone || state.profile?.phone || "",
    };
  }

  return {
    state,
    publicLeaderboard: Boolean(row.public_leaderboard),
    updatedAt: row.updated_at,
  };
}

export async function pgSaveUserState(userId, state, { publicLeaderboard } = {}) {
  const lb = publicLeaderboard ?? Boolean(state?.profile?.publicLeaderboard);
  const name = state.profile?.displayName?.trim();
  await pgUpdateUserContactFields(userId, {
    displayName: name,
    username: state.profile?.username,
    phone: state.profile?.phone,
  });
  const json = JSON.stringify(state);
  await pool.query(
    `INSERT INTO user_state (user_id, state_json, public_leaderboard, updated_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       state_json = EXCLUDED.state_json,
       public_leaderboard = EXCLUDED.public_leaderboard,
       updated_at = NOW()`,
    [userId, json, lb]
  );
}

export async function pgGetLeaderboard(limit = 15) {
  const { rows } = await pool.query(
    `SELECT u.display_name, u.email, s.state_json, s.public_leaderboard
     FROM user_state s
     JOIN users u ON u.id = s.user_id`
  );

  const entries = [];
  for (const row of rows) {
    let state;
    try {
      state = JSON.parse(row.state_json);
    } catch {
      continue;
    }
    const optedIn = Boolean(row.public_leaderboard) || Boolean(state.profile?.publicLeaderboard);
    if (!optedIn) continue;
    entries.push(
      buildLeaderboardEntry(row.display_name || state.profile?.displayName || "Scout", state)
    );
  }
  return sortLeaderboardEntries(entries.filter(Boolean), limit);
}

export async function pgCountUsers() {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM users");
  return rows[0]?.c || 0;
}

/** One-time import of data/users.json when Postgres has no users */
export async function pgImportUsersFromJsonFile(filePath) {
  if (!pool || !fs.existsSync(filePath)) return false;

  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM users");
  if (rows[0]?.c > 0) return false;

  let store;
  try {
    store = JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return false;
  }

  const users = store.users || {};
  const states = store.states || {};
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const [userId, user] of Object.entries(users)) {
      const email = user.email?.toLowerCase()?.trim();
      if (!email || !user.passwordHash) continue;
      await client.query(
        "INSERT INTO users (id, email, password_hash, display_name) VALUES ($1, $2, $3, $4)",
        [userId, email, user.passwordHash, user.displayName || "Scout"]
      );
      const row = states[userId];
      const stateJson = row?.state_json || defaultStateJson(user.displayName);
      const lb = Boolean(row?.public_leaderboard);
      await client.query(
        "INSERT INTO user_state (user_id, state_json, public_leaderboard) VALUES ($1, $2, $3)",
        [userId, stateJson, lb]
      );
    }
    await client.query("COMMIT");
    return Object.keys(users).length > 0;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function pgGetAllCommunityCards() {
  const { rows } = await pool.query(
    `SELECT u.id, u.display_name, s.state_json
     FROM user_state s
     JOIN users u ON u.id = s.user_id`
  );
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
