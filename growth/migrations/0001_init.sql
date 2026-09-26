CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  started_at INTEGER NOT NULL,
  last_seen_at INTEGER NOT NULL,
  landing_path TEXT,
  referrer TEXT,
  utm_source TEXT,
  utm_campaign TEXT,
  fbclid TEXT,
  purchased INTEGER NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,
  path TEXT NOT NULL,
  event_ts INTEGER NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_events_session_ts ON events(session_id, event_ts);
CREATE INDEX IF NOT EXISTS idx_events_type_ts ON events(type, event_ts);

CREATE TABLE IF NOT EXISTS ad_snapshots (
  snapshot_ts INTEGER NOT NULL,
  account_id TEXT NOT NULL,
  campaign_id TEXT,
  adset_id TEXT,
  ad_id TEXT NOT NULL,
  ad_name TEXT,
  spend REAL NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  purchase_value REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(snapshot_ts, ad_id)
);

CREATE TABLE IF NOT EXISTS daily_rollups (
  day TEXT PRIMARY KEY,
  sessions INTEGER NOT NULL DEFAULT 0,
  product_views INTEGER NOT NULL DEFAULT 0,
  add_to_cart INTEGER NOT NULL DEFAULT 0,
  checkout_started INTEGER NOT NULL DEFAULT 0,
  purchases INTEGER NOT NULL DEFAULT 0,
  revenue REAL NOT NULL DEFAULT 0,
  ad_spend REAL NOT NULL DEFAULT 0
);
