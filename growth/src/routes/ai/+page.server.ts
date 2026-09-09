import type { PageServerLoad } from './$types';
import { validOrderSql } from '$lib/server/orders';

const DAY = 24 * 60 * 60 * 1000;

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) {
    return {
      shopify: { revenue: 0, orders: 0, aov: 0, topTitle: '', topRevenue: 0, topShare: 0 },
      storefront: { sessions: 0, productViews: 0, atcSessions: 0, checkoutSessions: 0, rageSessions: 0 },
      ads: []
    };
  }

  const now = Date.now();
  const from30 = now - 30 * DAY;
  const from7 = now - 7 * DAY;
  const metaSince = new Date(now - 6 * DAY).toISOString().slice(0,10);

  const [shop, topProduct, sessionTotals, adResult] = await Promise.all([
    db.prepare(`
      SELECT COALESCE(SUM(total), 0) AS revenue, COUNT(*) AS orders
      FROM shopify_orders
      WHERE ${validOrderSql()} AND created_at >= ?1
    `).bind(from30).first<{ revenue: number; orders: number }>(),

    db.prepare(`
      SELECT MAX(i.title) AS title, COALESCE(SUM(i.line_total), 0) AS revenue
      FROM shopify_order_items i
      JOIN shopify_orders o ON o.id=i.order_id
      WHERE ${validOrderSql('o')} AND o.created_at >= ?1
      GROUP BY COALESCE(i.product_id, i.title)
      ORDER BY revenue DESC
      LIMIT 1
    `).bind(from30).first<{ title: string; revenue: number }>(),

    db.prepare(`
      SELECT
        COUNT(DISTINCT s.id) AS sessions,
        COUNT(DISTINCT CASE WHEN e.type='product_view' THEN s.id END) AS product_views,
        COUNT(DISTINCT CASE WHEN e.type='add_to_cart' THEN s.id END) AS atc_sessions,
        COUNT(DISTINCT CASE WHEN e.type='checkout_started' THEN s.id END) AS checkout_sessions,
        COUNT(DISTINCT CASE WHEN e.type='rage_click' THEN s.id END) AS rage_sessions
      FROM sessions s
      LEFT JOIN events e ON e.session_id=s.id AND e.event_ts >= ?1
      WHERE s.started_at >= ?1
    `).bind(from7).first<{
      sessions: number;
      product_views: number;
      atc_sessions: number;
      checkout_sessions: number;
      rage_sessions: number;
    }>(),

    db.prepare(`
      SELECT
        account_id,
        MAX(account_name) AS account_name,
        MAX(currency) AS currency,
        ad_id,
        MAX(ad_name) AS ad_name,
        SUM(spend) AS spend,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks,
        SUM(purchases) AS purchases,
        SUM(purchase_value) AS purchase_value
      FROM meta_daily
      WHERE day >= ?1
      GROUP BY account_id,ad_id
      ORDER BY spend DESC
      LIMIT 50
    `).bind(metaSince).all()
  ]);

  const revenue = Number(shop?.revenue || 0);
  const orders = Number(shop?.orders || 0);
  const topRevenue = Number(topProduct?.revenue || 0);

  return {
    shopify: {
      revenue,
      orders,
      aov: orders ? revenue / orders : 0,
      topTitle: String(topProduct?.title || ''),
      topRevenue,
      topShare: revenue ? (topRevenue / revenue) * 100 : 0
    },
    storefront: {
      sessions: Number(sessionTotals?.sessions || 0),
      productViews: Number(sessionTotals?.product_views || 0),
      atcSessions: Number(sessionTotals?.atc_sessions || 0),
      checkoutSessions: Number(sessionTotals?.checkout_sessions || 0),
      rageSessions: Number(sessionTotals?.rage_sessions || 0)
    },
    ads: (adResult.results as any[]).map((row) => {
      const spend = Number(row.spend || 0);
      const impressions = Number(row.impressions || 0);
      const clicks = Number(row.clicks || 0);
      const purchases = Number(row.purchases || 0);
      const purchaseValue = Number(row.purchase_value || 0);
      return {
        accountName: String(row.account_name || row.ad_id || ''),
        currency: String(row.currency || ''),
        adId: String(row.ad_id || ''),
        adName: String(row.ad_name || 'Untitled ad'),
        spend,
        impressions,
        clicks,
        purchases,
        purchaseValue,
        ctr: impressions ? (clicks / impressions) * 100 : 0,
        cpc: clicks ? spend / clicks : 0,
        roas: spend ? purchaseValue / spend : 0
      };
    })
  };
};
