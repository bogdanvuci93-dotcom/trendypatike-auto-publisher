import type { PageServerLoad } from './$types';
import { validOrderSql } from '$lib/server/orders';
import { analyticsPeriod } from '$lib/server/period';

export const load: PageServerLoad = async ({ platform, url }) => {
  const period = analyticsPeriod(url);
  const db = platform?.env?.DB;
  if (!db) return { rows: [], totals: { revenue: 0, units: 0, orders: 0, products: 0 }, period };

  const valid = validOrderSql('o');
  const [result, totalsRow] = await Promise.all([
    db.prepare(`
      SELECT COALESCE(i.product_id, i.title) AS product_key, MAX(i.title) AS title,
        COUNT(DISTINCT i.order_id) AS orders, SUM(i.quantity) AS units, SUM(i.line_total) AS revenue
      FROM shopify_order_items i
      JOIN shopify_orders o ON o.id=i.order_id
      WHERE ${valid} AND o.created_at>=?1 AND o.created_at<?2
      GROUP BY product_key ORDER BY revenue DESC LIMIT 100
    `).bind(period.start, period.end).all(),
    db.prepare(`
      SELECT COALESCE(SUM(i.line_total),0) AS revenue, COALESCE(SUM(i.quantity),0) AS units,
        COUNT(DISTINCT i.order_id) AS orders, COUNT(DISTINCT COALESCE(i.product_id,i.title)) AS products
      FROM shopify_order_items i JOIN shopify_orders o ON o.id=i.order_id
      WHERE ${valid} AND o.created_at>=?1 AND o.created_at<?2
    `).bind(period.start, period.end).first<{ revenue:number; units:number; orders:number; products:number }>()
  ]);

  return {
    rows:(result.results as any[]).map(r=>({key:String(r.product_key||''),title:String(r.title||'Untitled product'),orders:Number(r.orders||0),units:Number(r.units||0),revenue:Number(r.revenue||0)})),
    totals:{revenue:Number(totalsRow?.revenue||0),units:Number(totalsRow?.units||0),orders:Number(totalsRow?.orders||0),products:Number(totalsRow?.products||0)},
    period
  };
};
