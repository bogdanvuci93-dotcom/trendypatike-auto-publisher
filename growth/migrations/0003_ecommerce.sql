CREATE TABLE IF NOT EXISTS shopify_orders (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  total REAL NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'RSD',
  financial_status TEXT,
  cancelled INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_shopify_orders_created_at ON shopify_orders(created_at);

CREATE TABLE IF NOT EXISTS shopify_order_items (
  order_id TEXT NOT NULL,
  product_id TEXT,
  variant_id TEXT,
  title TEXT,
  quantity INTEGER NOT NULL DEFAULT 0,
  line_total REAL NOT NULL DEFAULT 0,
  PRIMARY KEY(order_id, variant_id, title)
);

CREATE INDEX IF NOT EXISTS idx_shopify_items_product ON shopify_order_items(product_id);
