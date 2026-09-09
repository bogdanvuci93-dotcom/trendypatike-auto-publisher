ALTER TABLE meta_daily ADD COLUMN reach INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meta_daily ADD COLUMN frequency REAL NOT NULL DEFAULT 0;
ALTER TABLE meta_daily ADD COLUMN link_clicks INTEGER NOT NULL DEFAULT 0;
ALTER TABLE meta_daily ADD COLUMN landing_page_views REAL NOT NULL DEFAULT 0;
ALTER TABLE meta_daily ADD COLUMN add_to_cart REAL NOT NULL DEFAULT 0;
ALTER TABLE meta_daily ADD COLUMN checkouts REAL NOT NULL DEFAULT 0;

ALTER TABLE shopify_order_items ADD COLUMN product_handle TEXT;

CREATE INDEX IF NOT EXISTS idx_shopify_order_items_handle ON shopify_order_items(product_handle);
CREATE INDEX IF NOT EXISTS idx_meta_daily_account_day ON meta_daily(account_id, day);
