-- Persist the storefront analytics session carried through Shopify cart attributes.
ALTER TABLE shopify_orders ADD COLUMN session_id TEXT;
CREATE INDEX IF NOT EXISTS idx_shopify_orders_session_id ON shopify_orders(session_id);
