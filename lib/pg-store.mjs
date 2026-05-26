import fs from "fs";
import pg from "pg";
import * as pgSocial from "./pg-social.mjs";

const { Pool } = pg;

let pool = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT DEFAULT 'Scout',
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
    "SELECT id, email, display_name FROM users WHERE id = $1",
    [id]
  );
  return rows[0] || null;
}

export async function pgFindUserByHandle(handle) {
  const h = handle?.trim()?.toLowerCase();
  if (!h) return null;
  const { rows } = await pool.query(
    `SELECT id, email, display_name FROM users
     WHERE lower(display_name) = $1
        OR lower(replace(display_name, ' ', '')) = $1
        OR lower(split_part(email, '@', 1)) = $1
     LIMIT 1`,
    [h]
  );
  return rows[0] || null;
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
  const name = account?.display_name?.trim();
  if (name && state.profile?.displayName !== name) {
    state.profile = { ...state.profile, displayName: name };
    await pool.query(
      "UPDATE user_state SET state_json = $1, updated_at = NOW() WHERE user_id = $2",
      [JSON.stringify(state), userId]
    );
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
  if (name) {
    await pool.query("UPDATE users SET display_name = $1 WHERE id = $2", [name, userId]);
  }
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
    const collection = state.collection || [];
    if (!collection.length) continue;
    const total = collection.reduce((sum, item) => {
      const v = item.estimatedValue;
      if (v == null) return sum;
      return sum + v * (item.quantity || 1);
    }, 0);
    entries.push({
      name: row.display_name || state.profile?.displayName || "Scout",
      total,
      cardCount: collection.length,
      level: state.level || 1,
    });
  }
  return entries.sort((a, b) => b.total - a.total).slice(0, limit);
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
      });
    }
  }
  return cards;
}
