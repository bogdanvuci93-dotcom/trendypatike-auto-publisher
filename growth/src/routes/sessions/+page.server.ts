import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { rows: [] };

  const result = await db.prepare(`
    SELECT
      s.id,s.started_at,s.last_seen_at,s.landing_path,s.referrer,s.utm_source,s.utm_campaign,s.fbclid,
      COUNT(e.id) AS events,
      SUM(CASE WHEN e.type='page_view' THEN 1 ELSE 0 END) AS page_views,
      SUM(CASE WHEN e.type='product_view' THEN 1 ELSE 0 END) AS product_views,
      SUM(CASE WHEN e.type='add_to_cart' THEN 1 ELSE 0 END) AS add_to_cart,
      SUM(CASE WHEN e.type='cart_view' THEN 1 ELSE 0 END) AS cart_views,
      SUM(CASE WHEN e.type='checkout_started' THEN 1 ELSE 0 END) AS checkout_started,
      SUM(CASE WHEN e.type='rage_click' THEN 1 ELSE 0 END) AS rage_clicks,
      SUM(CASE WHEN e.type='dead_click' THEN 1 ELSE 0 END) AS dead_clicks,
      MAX(CASE WHEN e.type IN ('heartbeat','page_exit') THEN CAST(json_extract(e.meta_json,'$.activeMs') AS INTEGER) ELSE 0 END) AS active_ms,
      MAX(CASE WHEN e.type='scroll_depth' THEN CAST(json_extract(e.meta_json,'$.depth') AS INTEGER) ELSE 0 END) AS max_scroll,
      (SELECT e2.path FROM events e2 WHERE e2.session_id=s.id ORDER BY e2.event_ts DESC,e2.id DESC LIMIT 1) AS last_path
    FROM sessions s
    LEFT JOIN events e ON e.session_id=s.id
    GROUP BY s.id
    ORDER BY s.last_seen_at DESC
    LIMIT 200
  `).all();

  return {
    rows: (result.results as any[]).map((r) => {
      const productViews=Number(r.product_views||0), addToCart=Number(r.add_to_cart||0), checkout=Number(r.checkout_started||0);
      return {
        id:String(r.id),startedAt:Number(r.started_at||0),lastSeenAt:Number(r.last_seen_at||0),landingPath:String(r.landing_path||'/'),lastPath:String(r.last_path||r.landing_path||'/'),referrer:String(r.referrer||''),utmSource:String(r.utm_source||''),utmCampaign:String(r.utm_campaign||''),fbclid:String(r.fbclid||''),
        events:Number(r.events||0),pageViews:Number(r.page_views||0),productViews,addToCart,cartViews:Number(r.cart_views||0),checkout,rageClicks:Number(r.rage_clicks||0),deadClicks:Number(r.dead_clicks||0),activeMs:Number(r.active_ms||0),maxScroll:Number(r.max_scroll||0),
        exitStage: checkout>0?'checkout':addToCart>0?'cart':productViews>0?'product':'browse'
      };
    })
  };
};
