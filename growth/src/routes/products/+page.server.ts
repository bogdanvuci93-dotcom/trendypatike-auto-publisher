import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { rows: [], totals: { revenue: 0, units: 0, orders: 0, products: 0 } };

  const result = await db.prepare(`
    SELECT
      COALESCE(i.product_id, i.title) AS product_key,
      i.title,
      COUNT(DISTINCT i.order_id) AS orders,
      SUM(i.quantity) AS units,
      SUM(i.line_total) AS revenue
    FROM shopify_order_items i
    JOIN shopify_orders o ON o.id=i.order_id
    WHERE o.cancelled=0
    GROUP BY product_key, i.title
    ORDER BY revenue DESC
    LIMIT 100
  `).all();

  const rows = (result.results as any[]).map((r) => ({
    key: String(r.product_key || ''),
    title: String(r.title || 'Untitled product'),
    orders: Number(r.orders || 0),
    units: Number(r.units || 0),
    revenue: Number(r.revenue || 0)
  }));

  const totals = rows.reduce((a, r) => ({ revenue: a.revenue + r.revenue, units: a.units + r.units, orders: a.orders + r.orders, products: a.products + 1 }), { revenue: 0, units: 0, orders: 0, products: 0 });
  return { rows, totals };
};
