-- Normalize the remote D1 schema regardless of which legacy 0007 migration partially ran.

-- Shopify orders: preserve baseline fields and guarantee return_status exists.
CREATE TABLE IF NOT EXISTS shopify_orders (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'RSD',
  financial_status TEXT,
  cancelled INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL
);

DROP TABLE IF EXISTS shopify_orders_repair;
CREATE TABLE shopify_orders_repair (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'RSD',
  financial_status TEXT,
  cancelled INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL,
  return_status TEXT
);
INSERT OR REPLACE INTO shopify_orders_repair(id,created_at,total,currency,financial_status,cancelled,synced_at,return_status)
SELECT id,created_at,total,currency,financial_status,cancelled,synced_at,NULL FROM shopify_orders;
DROP TABLE shopify_orders;
ALTER TABLE shopify_orders_repair RENAME TO shopify_orders;
CREATE INDEX IF NOT EXISTS idx_shopify_orders_created_at ON shopify_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_validity ON shopify_orders(cancelled,financial_status,return_status,created_at);

-- Shopify line items: guarantee product_handle exists while preserving historical sales rows.
CREATE TABLE IF NOT EXISTS shopify_order_items (
  order_id TEXT NOT NULL,
  product_id TEXT,
  variant_id TEXT,
  title TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(order_id, variant_id, title)
);

DROP TABLE IF EXISTS shopify_order_items_repair;
CREATE TABLE shopify_order_items_repair (
  order_id TEXT NOT NULL,
  product_id TEXT,
  variant_id TEXT,
  title TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  product_handle TEXT,
  PRIMARY KEY(order_id, variant_id, title)
);
INSERT OR REPLACE INTO shopify_order_items_repair(order_id,product_id,variant_id,title,quantity,line_total,product_handle)
SELECT order_id,product_id,variant_id,title,quantity,line_total,NULL FROM shopify_order_items;
DROP TABLE shopify_order_items;
ALTER TABLE shopify_order_items_repair RENAME TO shopify_order_items;
CREATE INDEX IF NOT EXISTS idx_shopify_items_product ON shopify_order_items(product_id);
CREATE INDEX IF NOT EXISTS idx_shopify_order_items_handle ON shopify_order_items(product_handle);

-- Meta daily: rebuild from the stable baseline and add all richer analytics columns.
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

DROP TABLE IF EXISTS meta_daily_repair;
CREATE TABLE meta_daily_repair (
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
  reach INTEGER NOT NULL DEFAULT 0,
  frequency REAL NOT NULL DEFAULT 0,
  link_clicks INTEGER NOT NULL DEFAULT 0,
  landing_page_views REAL NOT NULL DEFAULT 0,
  add_to_cart REAL NOT NULL DEFAULT 0,
  checkouts REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(day, account_id, ad_id)
);
INSERT OR REPLACE INTO meta_daily_repair(
  day,account_id,account_name,currency,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,
  spend,impressions,clicks,purchases,purchase_value,synced_at
)
SELECT day,account_id,account_name,currency,campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,
       spend,impressions,clicks,purchases,purchase_value,synced_at
FROM meta_daily;
DROP TABLE meta_daily;
ALTER TABLE meta_daily_repair RENAME TO meta_daily;
CREATE INDEX IF NOT EXISTS idx_meta_daily_day ON meta_daily(day);
CREATE INDEX IF NOT EXISTS idx_meta_daily_ad_day ON meta_daily(ad_id,day);
CREATE INDEX IF NOT EXISTS idx_meta_daily_campaign_day ON meta_daily(campaign_id,day);
CREATE INDEX IF NOT EXISTS idx_meta_daily_adset_day ON meta_daily(adset_id,day);
CREATE INDEX IF NOT EXISTS idx_meta_daily_account_day ON meta_daily(account_id,day);

-- Supporting state/replay tables are idempotent.
CREATE TABLE IF NOT EXISTS sync_state (
  provider TEXT PRIMARY KEY,
  last_success_at INTEGER,
  last_attempt_at INTEGER,
  last_error TEXT,
  result_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS replay_chunks (
  session_id TEXT NOT NULL,
  seq INTEGER NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  bytes INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  PRIMARY KEY(session_id, seq)
);
CREATE INDEX IF NOT EXISTS idx_replay_chunks_session_time ON replay_chunks(session_id,started_at);
CREATE INDEX IF NOT EXISTS idx_replay_chunks_created_at ON replay_chunks(created_at);
CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_last_seen_at ON sessions(last_seen_at);
