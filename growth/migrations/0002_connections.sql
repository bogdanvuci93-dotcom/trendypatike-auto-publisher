CREATE TABLE IF NOT EXISTS connections (
  provider TEXT PRIMARY KEY,
  account_id TEXT,
  account_name TEXT,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT,
  token_expires_at INTEGER,
  scopes TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_connections_updated_at ON connections(updated_at);
