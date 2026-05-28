import pg from "pg";

const { Pool } = pg;

let pool = null;

export const SOCIAL_SCHEMA = `
CREATE TABLE IF NOT EXISTS friend_requests (
  id TEXT PRIMARY KEY,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL,
  responded_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS friendships (
  user_a TEXT NOT NULL,
  user_b TEXT NOT NULL,
  since TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_a, user_b)
);

CREATE TABLE IF NOT EXISTS profile_posts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  card_title TEXT,
  estimated_value NUMERIC,
  collection_entry_id TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_profile_posts_user ON profile_posts(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cod_comments (
  id TEXT PRIMARY KEY,
  day_key TEXT NOT NULL,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cod_comments_day ON cod_comments(day_key, created_at);

CREATE TABLE IF NOT EXISTS cod_votes (
  user_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  vote TEXT NOT NULL CHECK (vote IN ('hold', 'sell')),
  created_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, day_key)
);

CREATE INDEX IF NOT EXISTS idx_cod_votes_day ON cod_votes(day_key);

CREATE TABLE IF NOT EXISTS cod_comment_agreements (
  user_id TEXT NOT NULL,
  day_key TEXT NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, day_key)
);

CREATE TABLE IF NOT EXISTS comment_bans (
  user_id TEXT PRIMARY KEY,
  until TIMESTAMPTZ NOT NULL,
  reason TEXT,
  categories JSONB DEFAULT '[]'::jsonb,
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS test_unban_used (
  user_id TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS hub_messages (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  author_name TEXT NOT NULL,
  text TEXT NOT NULL,
  audience TEXT NOT NULL,
  target_user_id TEXT,
  created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_hub_messages_audience ON hub_messages(audience, created_at);
CREATE INDEX IF NOT EXISTS idx_hub_messages_direct ON hub_messages(audience, target_user_id, created_at);
`;

export function pgSocialUsePool(sharedPool) {
  pool = sharedPool;
}

function emptySocial() {
  return {
    friendRequests: [],
    friendships: [],
    profilePosts: [],
    codComments: [],
    codCommentAgreements: [],
    codVotes: [],
    commentBans: [],
    testUnbanUsed: [],
    hubMessages: [],
  };
}

export async function pgLoadSocial() {
  const data = emptySocial();

  const [requests, friendships, posts, comments, agreements, votes, bans, unbanUsed, hubMessages] =
    await Promise.all([
      pool.query(
        "SELECT id, from_user_id, to_user_id, status, created_at, responded_at FROM friend_requests"
      ),
      pool.query("SELECT user_a, user_b, since FROM friendships"),
      pool.query(
        "SELECT id, user_id, author_name, text, card_title, estimated_value, collection_entry_id, created_at FROM profile_posts ORDER BY created_at DESC LIMIT 500"
      ),
      pool.query(
        "SELECT id, day_key, user_id, author_name, text, created_at FROM cod_comments"
      ),
      pool.query("SELECT user_id, day_key, accepted_at FROM cod_comment_agreements"),
      pool.query("SELECT user_id, day_key, vote, created_at FROM cod_votes"),
      pool.query(
        "SELECT user_id, until, reason, categories, source, created_at FROM comment_bans"
      ),
      pool.query("SELECT user_id FROM test_unban_used"),
      pool.query(
        "SELECT id, user_id, author_name, text, audience, target_user_id, created_at FROM hub_messages ORDER BY created_at ASC LIMIT 1000"
      ),
    ]);

  data.friendRequests = requests.rows.map((r) => ({
    id: r.id,
    fromUserId: r.from_user_id,
    toUserId: r.to_user_id,
    status: r.status,
    createdAt: r.created_at?.toISOString?.() || r.created_at,
    ...(r.responded_at
      ? { respondedAt: r.responded_at?.toISOString?.() || r.responded_at }
      : {}),
  }));

  data.friendships = friendships.rows.map((r) => ({
    userA: r.user_a,
    userB: r.user_b,
    since: r.since?.toISOString?.() || r.since,
  }));

  data.profilePosts = posts.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    authorName: r.author_name,
    text: r.text,
    cardTitle: r.card_title || null,
    estimatedValue: r.estimated_value != null ? Number(r.estimated_value) : null,
    collectionEntryId: r.collection_entry_id || null,
    createdAt: r.created_at?.toISOString?.() || r.created_at,
  }));

  data.codComments = comments.rows.map((r) => ({
    id: r.id,
    dayKey: r.day_key,
    userId: r.user_id,
    authorName: r.author_name,
    text: r.text,
    createdAt: r.created_at?.toISOString?.() || r.created_at,
  }));

  data.codCommentAgreements = agreements.rows.map((r) => ({
    userId: r.user_id,
    dayKey: r.day_key,
    acceptedAt: r.accepted_at?.toISOString?.() || r.accepted_at,
  }));

  data.codVotes = votes.rows.map((r) => ({
    userId: r.user_id,
    dayKey: r.day_key,
    vote: r.vote,
    createdAt: r.created_at?.toISOString?.() || r.created_at,
  }));

  data.commentBans = bans.rows.map((r) => ({
    userId: r.user_id,
    until: r.until?.toISOString?.() || r.until,
    reason: r.reason || "",
    categories: Array.isArray(r.categories) ? r.categories : [],
    source: r.source || "",
    createdAt: r.created_at?.toISOString?.() || r.created_at,
  }));

  data.testUnbanUsed = unbanUsed.rows.map((r) => r.user_id);

  data.hubMessages = hubMessages.rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    authorName: r.author_name,
    text: r.text,
    audience: r.audience,
    targetUserId: r.target_user_id || null,
    createdAt: r.created_at?.toISOString?.() || r.created_at,
  }));

  return data;
}

export async function pgSaveSocial(data) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query("DELETE FROM friend_requests");
    for (const r of data.friendRequests || []) {
      await client.query(
        `INSERT INTO friend_requests (id, from_user_id, to_user_id, status, created_at, responded_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [r.id, r.fromUserId, r.toUserId, r.status, r.createdAt, r.respondedAt || null]
      );
    }

    await client.query("DELETE FROM friendships");
    for (const f of data.friendships || []) {
      await client.query(
        "INSERT INTO friendships (user_a, user_b, since) VALUES ($1, $2, $3)",
        [f.userA, f.userB, f.since]
      );
    }

    await client.query("DELETE FROM profile_posts");
    for (const p of (data.profilePosts || []).slice(0, 500)) {
      await client.query(
        `INSERT INTO profile_posts (id, user_id, author_name, text, card_title, estimated_value, collection_entry_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          p.id,
          p.userId,
          p.authorName,
          p.text,
          p.cardTitle || null,
          p.estimatedValue ?? null,
          p.collectionEntryId || null,
          p.createdAt,
        ]
      );
    }

    await client.query("DELETE FROM cod_comments");
    for (const c of data.codComments || []) {
      await client.query(
        `INSERT INTO cod_comments (id, day_key, user_id, author_name, text, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [c.id, c.dayKey, c.userId, c.authorName, c.text, c.createdAt]
      );
    }

    await client.query("DELETE FROM cod_comment_agreements");
    for (const a of data.codCommentAgreements || []) {
      await client.query(
        `INSERT INTO cod_comment_agreements (user_id, day_key, accepted_at) VALUES ($1, $2, $3)`,
        [a.userId, a.dayKey, a.acceptedAt]
      );
    }

    await client.query("DELETE FROM cod_votes");
    for (const v of data.codVotes || []) {
      await client.query(
        `INSERT INTO cod_votes (user_id, day_key, vote, created_at) VALUES ($1, $2, $3, $4)`,
        [v.userId, v.dayKey, v.vote, v.createdAt]
      );
    }

    await client.query("DELETE FROM comment_bans");
    for (const b of data.commentBans || []) {
      await client.query(
        `INSERT INTO comment_bans (user_id, until, reason, categories, source, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6)`,
        [
          b.userId,
          b.until,
          b.reason || null,
          JSON.stringify(b.categories || []),
          b.source || null,
          b.createdAt || b.until,
        ]
      );
    }

    await client.query("DELETE FROM test_unban_used");
    for (const userId of data.testUnbanUsed || []) {
      await client.query("INSERT INTO test_unban_used (user_id) VALUES ($1)", [userId]);
    }

    await client.query("DELETE FROM hub_messages");
    for (const m of (data.hubMessages || []).slice(-1000)) {
      await client.query(
        `INSERT INTO hub_messages (id, user_id, author_name, text, audience, target_user_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          m.id,
          m.userId,
          m.authorName,
          m.text,
          m.audience,
          m.targetUserId || null,
          m.createdAt,
        ]
      );
    }

    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function pgImportSocialFromJson(jsonData) {
  const { rows } = await pool.query("SELECT COUNT(*)::int AS c FROM friend_requests");
  const hasData = rows[0]?.c > 0;
  if (hasData) return false;

  const merged = { ...emptySocial(), ...jsonData };
  await pgSaveSocial(merged);
  return true;
}
