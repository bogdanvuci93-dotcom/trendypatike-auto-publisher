-- Hard guard for the real AI advisor so it cannot spam Workers AI usage.
CREATE TABLE IF NOT EXISTS advisor_usage (
  day TEXT PRIMARY KEY,
  requests INTEGER NOT NULL DEFAULT 0,
  tokens INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL DEFAULT 0
);
