import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { rows: [] };

  const result = await db.prepare(`
    SELECT
      s.id,
      s.started_at,
      s.last_seen_at,
      s.landing_path,
      s.referrer,
      s.utm_source,
      s.utm_campaign,
      s.fbclid,
      COUNT(e.id) AS events,
      SUM(CASE WHEN e.type='page_view' THEN 1 ELSE 0 END) AS page_views,
      SUM(CASE WHEN e.type='product_view' THEN 1 ELSE 0 END) AS product_views,
      SUM(CASE WHEN e.type='add_to_cart' THEN 1 ELSE 0 END) AS add_to_cart,
      SUM(CASE WHEN e.type='checkout_started' THEN 1 ELSE 0 END) AS checkout_started,
      SUM(CASE WHEN e.type='rage_click' THEN 1 ELSE 0 END) AS rage_clicks
    FROM sessions s
    LEFT JOIN events e ON e.session_id=s.id
    GROUP BY s.id
    ORDER BY s.last_seen_at DESC
    LIMIT 200
  `).all();

  return {
    rows: (result.results as any[]).map((r) => ({
      id: String(r.id),
      startedAt: Number(r.started_at || 0),
      lastSeenAt: Number(r.last_seen_at || 0),
      landingPath: String(r.landing_path || '/'),
      referrer: String(r.referrer || ''),
      utmSource: String(r.utm_source || ''),
      utmCampaign: String(r.utm_campaign || ''),
      fbclid: String(r.fbclid || ''),
      events: Number(r.events || 0),
      pageViews: Number(r.page_views || 0),
      productViews: Number(r.product_views || 0),
      addToCart: Number(r.add_to_cart || 0),
      checkout: Number(r.checkout_started || 0),
      rageClicks: Number(r.rage_clicks || 0)
    }))
  };
};
