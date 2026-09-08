import type { PageServerLoad } from './$types';

function startOfTodayUtc() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { sessions:0, productViews:0, addToCart:0, checkout:0, purchases:0, revenue:0, trackerReady:false };
  const start = startOfTodayUtc();

  const sessions = await db.prepare(`SELECT COUNT(*) AS c FROM sessions WHERE started_at>=?1`).bind(start).first<{c:number}>();
  const events = await db.prepare(`
    SELECT
      SUM(CASE WHEN type='product_view' THEN 1 ELSE 0 END) AS product_views,
      SUM(CASE WHEN type='add_to_cart' THEN 1 ELSE 0 END) AS add_to_cart,
      SUM(CASE WHEN type='checkout_started' THEN 1 ELSE 0 END) AS checkout_started
    FROM events WHERE event_ts>=?1
  `).bind(start).first<{product_views:number|null;add_to_cart:number|null;checkout_started:number|null}>();
  const orders = await db.prepare(`SELECT COUNT(*) AS c, COALESCE(SUM(total),0) AS revenue FROM shopify_orders WHERE created_at>=?1 AND cancelled=0`).bind(start).first<{c:number;revenue:number}>();

  return {
    sessions:Number(sessions?.c||0),
    productViews:Number(events?.product_views||0),
    addToCart:Number(events?.add_to_cart||0),
    checkout:Number(events?.checkout_started||0),
    purchases:Number(orders?.c||0),
    revenue:Number(orders?.revenue||0),
    trackerReady:Number(sessions?.c||0)>0 || Number(events?.product_views||0)>0
  };
};
