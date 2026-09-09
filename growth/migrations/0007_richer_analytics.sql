ALTER TABLE shopify_order_items ADD COLUMN product_handle TEXT;

CREATE INDEX IF NOT EXISTS idx_shopify_order_items_handle ON shopify_order_items(product_handle);
CREATE INDEX IF NOT EXISTS idx_meta_daily_account_day ON meta_daily(account_id, day);
