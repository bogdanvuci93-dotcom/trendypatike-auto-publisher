ALTER TABLE shopify_orders ADD COLUMN return_status TEXT;

CREATE INDEX IF NOT EXISTS idx_shopify_orders_validity
  ON shopify_orders(cancelled, financial_status, return_status, created_at);

CREATE TABLE IF NOT EXISTS meta_daily (
  day TEXT NOT NULL,
  account_id TEXT NOT NULL,
  account_name TEXT,
  currency TEXT,
  campaign_id TEXT,
  campaign_name TEXT,
  adset_id TEXT,
  adset_name TEXT,
  ad_id TEXT NOT NULL,
  ad_name TEXT,
  spend REAL NOT NULL DEFAULT 0,
  impressions INTEGER NOT NULL DEFAULT 0,
  clicks INTEGER NOT NULL DEFAULT 0,
  purchases REAL NOT NULL DEFAULT 0,
  purchase_value REAL NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL,
  PRIMARY KEY(day, account_id, ad_id)
);

CREATE INDEX IF NOT EXISTS idx_meta_daily_day ON meta_daily(day);
CREATE INDEX IF NOT EXISTS idx_meta_daily_ad_day ON meta_daily(ad_id, day);

CREATE TABLE IF NOT EXISTS sync_state (
  provider TEXT PRIMARY KEY,
  last_success_at INTEGER,
  last_attempt_at INTEGER,
  last_error TEXT,
  result_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at ON sessions(last_seen_at);
