import crypto from "crypto";

let pool = null;

export const PUSH_SCHEMA = `
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  timezone_offset_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS push_notification_sent (
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, type, dedupe_key)
);

CREATE TABLE IF NOT EXISTS push_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export function pgPushUsePool(sharedPool) {
  pool = sharedPool;
}

export function pgPushReady() {
  return Boolean(pool);
}

export async function pgUpsertPushSubscription({
  userId,
  endpoint,
  p256dh,
  auth,
  timezoneOffsetMinutes = 0,
}) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, timezone_offset_minutes, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (endpoint) DO UPDATE SET
       user_id = EXCLUDED.user_id,
       p256dh = EXCLUDED.p256dh,
       auth = EXCLUDED.auth,
       timezone_offset_minutes = EXCLUDED.timezone_offset_minutes,
       updated_at = EXCLUDED.updated_at`,
    [id, userId, endpoint, p256dh, auth, timezoneOffsetMinutes, now, now]
  );
}

export async function pgRemovePushSubscription(endpoint) {
  await pool.query("DELETE FROM push_subscriptions WHERE endpoint = $1", [endpoint]);
}

export async function pgListPushSubscriptionsForUser(userId) {
  const { rows } = await pool.query(
    "SELECT endpoint, p256dh, auth, timezone_offset_minutes FROM push_subscriptions WHERE user_id = $1",
    [userId]
  );
  return rows.map((row) => ({
    endpoint: row.endpoint,
    keys: { p256dh: row.p256dh, auth: row.auth },
    timezoneOffsetMinutes: Number(row.timezone_offset_minutes) || 0,
  }));
}

export async function pgListAllPushUsers() {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (user_id) user_id, timezone_offset_minutes
     FROM push_subscriptions
     ORDER BY user_id, updated_at DESC`
  );
  return rows.map((row) => ({
    userId: row.user_id,
    timezoneOffsetMinutes: Number(row.timezone_offset_minutes) || 0,
  }));
}

export async function pgWasNotificationSent(userId, type, dedupeKey) {
  const { rows } = await pool.query(
    "SELECT 1 FROM push_notification_sent WHERE user_id = $1 AND type = $2 AND dedupe_key = $3 LIMIT 1",
    [userId, type, dedupeKey]
  );
  return rows.length > 0;
}

export async function pgRecordNotificationSent(userId, type, dedupeKey) {
  await pool.query(
    `INSERT INTO push_notification_sent (user_id, type, dedupe_key, sent_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, type, dedupe_key) DO NOTHING`,
    [userId, type, dedupeKey, new Date().toISOString()]
  );
}

export async function pgGetPushMeta(key) {
  const { rows } = await pool.query("SELECT value FROM push_meta WHERE key = $1", [key]);
  return rows[0]?.value ?? null;
}

export async function pgSetPushMeta(key, value) {
  await pool.query(
    `INSERT INTO push_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [key, value]
  );
}

export async function pgPurgeOldNotificationSent(olderThanIso) {
  await pool.query("DELETE FROM push_notification_sent WHERE sent_at < $1", [olderThanIso]);
}
