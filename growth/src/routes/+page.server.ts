import type { PageServerLoad } from './$types';

const TZ = 'Europe/Belgrade';
const VALID_ORDER_SQL = `cancelled=0 AND UPPER(COALESCE(financial_status,'')) NOT IN ('REFUNDED','PARTIALLY_REFUNDED','VOIDED')`;

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
    const recentFrom = now - 8 * 86400000;
    const trackerFrom = now - 36 * 3600000;

    const [ordersResult, sessionsResult, eventsResult, latest] = await Promise.all([
      db.prepare(`SELECT created_at,total,currency FROM shopify_orders WHERE created_at >= ?1 AND ${VALID_ORDER_SQL} ORDER BY created_at ASC`).bind(recentFrom).all(),
      db.prepare(`SELECT id,started_at FROM sessions WHERE started_at >= ?1`).bind(trackerFrom).all(),
      db.prepare(`SELECT session_id,type,event_ts FROM events WHERE event_ts >= ?1 AND type IN ('add_to_cart','checkout_started')`).bind(trackerFrom).all(),
      db.prepare(`SELECT MAX(snapshot_ts) AS ts FROM ad_snapshots`).first<{ ts: number | null }>()
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

    let spend = 0;
    let metaPurchases = 0;
    let metaRevenue = 0;
    let metaCurrency = '';
    let adRows: any[] = [];

    if (latest?.ts) {
      const adsResult = await db.prepare(`
        SELECT ad_name, spend, impressions, clicks, purchases, purchase_value, currency
        FROM ad_snapshots
        WHERE snapshot_ts=?1
        ORDER BY spend DESC
        LIMIT 12
      `).bind(latest.ts).all();
      adRows = adsResult.results as any[];
      const currencies = [...new Set(adRows.map((r) => String(r.currency || '')).filter(Boolean))];
      metaCurrency = currencies.length === 1 ? currencies[0] : '';
      if (currencies.length <= 1) {
        spend = adRows.reduce((sum, r) => sum + Number(r.spend || 0), 0);
        metaPurchases = adRows.reduce((sum, r) => sum + Number(r.purchases || 0), 0);
        metaRevenue = adRows.reduce((sum, r) => sum + Number(r.purchase_value || 0), 0);
      }
    }

    const roas = spend > 0 ? metaRevenue / spend : 0;
    const cpa = metaPurchases > 0 ? spend / metaPurchases : 0;
    const conversionRate = sessions > 0 ? (orders / sessions) * 100 : 0;

    const keys: string[] = [];
    const trend: { label: string; revenue: number; spend: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const key = dayKey(d.getTime());
      keys.push(key);
      trend.push({
        label: `${new Intl.DateTimeFormat('sr-RS', { timeZone: TZ, day: '2-digit', month: '2-digit' }).format(d)}`,
        revenue: 0,
        spend: key === today ? spend : 0
      });
    }
    for (const row of orderRows) {
      const key = dayKey(Number(row.created_at));
      const idx = keys.indexOf(key);
      if (idx >= 0) trend[idx].revenue += Number(row.total || 0);
    }

    const ads = adRows.map((row) => {
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
