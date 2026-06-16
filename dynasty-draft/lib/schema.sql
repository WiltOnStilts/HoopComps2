-- DynastyDraft database schema
-- Users table references existing `users` table

CREATE TABLE IF NOT EXISTS dynasty_daily_challenges (
  day_key TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dynasty_submissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  day_key TEXT NOT NULL,
  lineup_json JSONB NOT NULL,
  simulation_json JSONB NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'F',
  share_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, day_key)
);

CREATE INDEX IF NOT EXISTS idx_dynasty_submissions_day ON dynasty_submissions(day_key, score DESC);
CREATE INDEX IF NOT EXISTS idx_dynasty_submissions_user ON dynasty_submissions(user_id);

CREATE TABLE IF NOT EXISTS dynasty_user_settings (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  show_stats BOOLEAN NOT NULL DEFAULT TRUE,
  sound_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dynasty_streaks (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0,
  last_played_day TEXT,
  best_streak INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dynasty_best_scores (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  best_score INTEGER NOT NULL DEFAULT 0,
  best_grade TEXT NOT NULL DEFAULT 'F',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Community daily stats (aggregated view helper)
CREATE TABLE IF NOT EXISTS dynasty_community_stats (
  day_key TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  grade TEXT NOT NULL DEFAULT 'F',
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  champion BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY (day_key, user_id)
);

CREATE INDEX IF NOT EXISTS idx_dynasty_community_day_score ON dynasty_community_stats(day_key, score DESC);
