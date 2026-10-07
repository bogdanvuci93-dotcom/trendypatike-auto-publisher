-- Revenue is counted only for completed/fulfilled Shopify orders.
ALTER TABLE shopify_orders ADD COLUMN fulfillment_status TEXT;
ALTER TABLE shopify_orders ADD COLUMN delivery_status TEXT;
CREATE INDEX IF NOT EXISTS idx_shopify_orders_fulfillment ON shopify_orders(fulfillment_status,delivery_status,created_at);
