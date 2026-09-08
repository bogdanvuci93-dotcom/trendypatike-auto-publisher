import type { PageServerLoad } from './$types';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { rows: [], totals: { revenue: 0, units: 0, orders: 0, products: 0 } };

  const from = Date.now() - THIRTY_DAYS_MS;

  const [result, totalsRow] = await Promise.all([
    db.prepare(`
      SELECT
        COALESCE(i.product_id, i.title) AS product_key,
        MAX(i.title) AS title,
        COUNT(DISTINCT i.order_id) AS orders,
        SUM(i.quantity) AS units,
        SUM(i.line_total) AS revenue
      FROM shopify_order_items i
      JOIN shopify_orders o ON o.id=i.order_id
      WHERE o.cancelled=0 AND o.created_at >= ?1
      GROUP BY product_key
      ORDER BY revenue DESC
      LIMIT 100
    `).bind(from).all(),
    db.prepare(`
      SELECT
        COALESCE(SUM(i.line_total),0) AS revenue,
        COALESCE(SUM(i.quantity),0) AS units,
        COUNT(DISTINCT i.order_id) AS orders,
        COUNT(DISTINCT COALESCE(i.product_id, i.title)) AS products
      FROM shopify_order_items i
      JOIN shopify_orders o ON o.id=i.order_id
      WHERE o.cancelled=0 AND o.created_at >= ?1
    `).bind(from).first<{ revenue: number; units: number; orders: number; products: number }>()
  ]);

  const rows = (result.results as any[]).map((r) => ({
    key: String(r.product_key || ''),
    title: String(r.title || 'Untitled product'),
    orders: Number(r.orders || 0),
    units: Number(r.units || 0),
    revenue: Number(r.revenue || 0)
  }));

  return {
    rows,
    totals: {
      revenue: Number(totalsRow?.revenue || 0),
      units: Number(totalsRow?.units || 0),
      orders: Number(totalsRow?.orders || 0),
      products: Number(totalsRow?.products || 0)
    }
  };
};
