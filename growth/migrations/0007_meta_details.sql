ALTER TABLE meta_daily ADD COLUMN reach INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meta_daily ADD COLUMN frequency REAL NOT NULL DEFAULT 0;
ALTER TABLE meta_daily ADD COLUMN link_clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meta_daily ADD COLUMN landing_page_views REAL NOT NULL DEFAULT 0;
ALTER TABLE meta_daily ADD COLUMN add_to_cart REAL NOT NULL DEFAULT 0;
ALTER TABLE meta_daily ADD COLUMN checkouts REAL NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_meta_daily_campaign_day ON meta_daily(campaign_id, day);
CREATE INDEX IF NOT EXISTS idx_meta_daily_adset_day ON meta_daily(adset_id, day);
