import type { PageServerLoad } from './$types';
import { validOrderSql } from '$lib/server/orders';

const TZ = 'Europe/Belgrade';
const DAY = 86400000;

function dayKey(ms: number) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date(ms));
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function emptyData(error: string | null = null) {
  return {
    live: false,
    error,
    shopCurrency: 'RSD',
    metaCurrency: '',
    overview: { revenue: 0, spend: 0, roas: 0, orders: 0, conversionRate: 0, cpa: 0, sessions: 0, addToCart: 0, checkout: 0 },
    trend: [] as { label: string; revenue: number; spend: number }[],
    ads: [] as { name: string; spend: number; revenue: number; purchases: number; ctr: number; cpc: number; atcRate: number; currency: string }[]
  };
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return emptyData('D1 database nije povezana.');

  try {
    const now = Date.now();
    const today = dayKey(now);
    const metaFrom = dayKey(now - 6 * DAY);
    const recentFrom = now - 8 * DAY;
    const trackerFrom = now - 36 * 3600000;

    const [ordersResult, sessionsResult, eventsResult, metaResult, adResult] = await Promise.all([
      db.prepare(`SELECT created_at,total,currency FROM shopify_orders WHERE created_at >= ?1 AND ${validOrderSql()} ORDER BY created_at ASC`).bind(recentFrom).all(),
      db.prepare(`SELECT id,started_at FROM sessions WHERE started_at >= ?1`).bind(trackerFrom).all(),
      db.prepare(`SELECT session_id,type,event_ts FROM events WHERE event_ts >= ?1 AND type IN ('add_to_cart','checkout_started')`).bind(trackerFrom).all(),
      db.prepare(`SELECT day,currency,spend,purchases,purchase_value FROM meta_daily WHERE day >= ?1 ORDER BY day ASC`).bind(metaFrom).all(),
      db.prepare(`
        SELECT
          account_id,
          MAX(account_name) AS account_name,
          ad_id,
          MAX(ad_name) AS ad_name,
          MAX(currency) AS currency,
          SUM(spend) AS spend,
          SUM(impressions) AS impressions,
          SUM(clicks) AS clicks,
          SUM(purchases) AS purchases,
          SUM(purchase_value) AS purchase_value
        FROM meta_daily
        WHERE day >= ?1
        GROUP BY account_id,ad_id
        ORDER BY spend DESC
        LIMIT 12
      `).bind(metaFrom).all()
    ]);

    const orderRows = ordersResult.results as any[];
    const todayOrders = orderRows.filter((r) => dayKey(Number(r.created_at)) === today);
    const orders = todayOrders.length;
    const revenue = todayOrders.reduce((sum, r) => sum + Number(r.total || 0), 0);
    const shopCurrencies = [...new Set((todayOrders.length ? todayOrders : orderRows).map((r) => String(r.currency || '')).filter(Boolean))];
    const shopCurrency = shopCurrencies.length === 1 ? shopCurrencies[0] : 'RSD';

    const sessions = (sessionsResult.results as any[]).filter((r) => dayKey(Number(r.started_at)) === today).length;
    const atcSessions = new Set<string>();
    const checkoutSessions = new Set<string>();
    for (const row of eventsResult.results as any[]) {
      if (dayKey(Number(row.event_ts || 0)) !== today) continue;
      const sessionId = String(row.session_id || '');
      if (!sessionId) continue;
      if (row.type === 'add_to_cart') atcSessions.add(sessionId);
      if (row.type === 'checkout_started') checkoutSessions.add(sessionId);
    }
    const addToCart = atcSessions.size;
    const checkout = checkoutSessions.size;

    const metaRows = metaResult.results as any[];
    const metaCurrencies = [...new Set(metaRows.map((r) => String(r.currency || '')).filter(Boolean))];
    const metaCurrency = metaCurrencies.length === 1 ? metaCurrencies[0] : '';
    const comparableMetaRows = metaCurrencies.length <= 1 ? metaRows : [];
    const spend = comparableMetaRows.reduce((sum, r) => sum + Number(r.spend || 0), 0);
    const metaPurchases = comparableMetaRows.reduce((sum, r) => sum + Number(r.purchases || 0), 0);
    const metaRevenue = comparableMetaRows.reduce((sum, r) => sum + Number(r.purchase_value || 0), 0);
    const roas = spend > 0 ? metaRevenue / spend : 0;
    const cpa = metaPurchases > 0 ? spend / metaPurchases : 0;
    const conversionRate = sessions > 0 ? (orders / sessions) * 100 : 0;

    const keys: string[] = [];
    const trend: { label: string; revenue: number; spend: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * DAY);
      const key = dayKey(d.getTime());
      keys.push(key);
      trend.push({
        label: new Intl.DateTimeFormat('sr-RS', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(d),
        revenue: 0,
        spend: 0
      });
    }
    for (const row of orderRows) {
      const idx = keys.indexOf(dayKey(Number(row.created_at)));
      if (idx >= 0) trend[idx].revenue += Number(row.total || 0);
    }
    for (const row of comparableMetaRows) {
      const idx = keys.indexOf(String(row.day || ''));
      if (idx >= 0) trend[idx].spend += Number(row.spend || 0);
    }

    const ads = (adResult.results as any[]).map((row) => {
      const impressions = Number(row.impressions || 0);
      const clicks = Number(row.clicks || 0);
      const adSpend = Number(row.spend || 0);
      return {
        name: String(row.ad_name || 'Unnamed ad'),
        spend: adSpend,
        revenue: Number(row.purchase_value || 0),
        purchases: Number(row.purchases || 0),
        ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
        cpc: clicks > 0 ? adSpend / clicks : 0,
        atcRate: 0,
        currency: String(row.currency || metaCurrency || '')
      };
    });

    return {
      live: true,
      error: null,
      shopCurrency,
      metaCurrency,
      overview: { revenue, spend, roas, orders, conversionRate, cpa, sessions, addToCart, checkout },
      trend,
      ads
    };
  } catch (e) {
    console.error('Growth overview load failed', e);
    return emptyData(e instanceof Error ? e.message : 'Overview data load failed');
  }
};
