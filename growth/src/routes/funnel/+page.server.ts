import type { PageServerLoad } from './$types';
import { validOrderSql } from '$lib/server/orders';
import { analyticsPeriod } from '$lib/server/period';

export const load: PageServerLoad = async ({ platform, url }) => {
  const period = analyticsPeriod(url);
  const db = platform?.env?.DB;
  if (!db) return { sessions:0, productViews:0, addToCart:0, checkout:0, purchases:0, revenue:0, trackerReady:false, period };

  const [sessionResult, eventResult, orderResult] = await Promise.all([
    db.prepare(`SELECT id FROM sessions WHERE started_at>=?1 AND started_at<?2`).bind(period.start,period.end).all(),
    db.prepare(`SELECT session_id,type FROM events WHERE event_ts>=?1 AND event_ts<?2 AND type IN ('product_view','add_to_cart','checkout_started')`).bind(period.start,period.end).all(),
    db.prepare(`SELECT id,total FROM shopify_orders WHERE created_at>=?1 AND created_at<?2 AND ${validOrderSql()}`).bind(period.start,period.end).all()
  ]);

  const sessionIds = new Set((sessionResult.results as any[]).map(r=>String(r.id||'')));
  const productSessions=new Set<string>(),atcSessions=new Set<string>(),checkoutSessions=new Set<string>();
  for(const row of eventResult.results as any[]){const id=String(row.session_id||'');if(!id||!sessionIds.has(id))continue;if(row.type==='product_view')productSessions.add(id);if(row.type==='add_to_cart')atcSessions.add(id);if(row.type==='checkout_started')checkoutSessions.add(id);}
  const orders=orderResult.results as any[];
  return { sessions:sessionIds.size, productViews:productSessions.size, addToCart:atcSessions.size, checkout:checkoutSessions.size, purchases:orders.length, revenue:orders.reduce((s,r)=>s+Number(r.total||0),0), trackerReady:sessionIds.size>0||productSessions.size>0, period };
};
