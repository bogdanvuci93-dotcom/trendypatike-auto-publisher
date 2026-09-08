import type { PageServerLoad } from './$types';

function emptyData() {
  return {
    live: false,
    overview: { revenue: 0, spend: 0, roas: 0, orders: 0, conversionRate: 0, cpa: 0, sessions: 0, addToCart: 0, checkout: 0 },
    trend: [] as { label: string; revenue: number; spend: number }[],
    ads: [] as { name: string; spend: number; revenue: number; purchases: number; ctr: number; cpc: number; atcRate: number }[]
  };
}

function startOfTodayUtcApprox() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return emptyData();

  const start = startOfTodayUtcApprox();
  const orderRow = await db.prepare(`
    SELECT COUNT(*) AS orders, COALESCE(SUM(total),0) AS revenue
    FROM shopify_orders
    WHERE created_at >= ?1 AND cancelled = 0
  `).bind(start).first<{ orders: number; revenue: number }>();

  const sessionRow = await db.prepare(`
    SELECT COUNT(*) AS sessions
    FROM sessions
    WHERE started_at >= ?1
  `).bind(start).first<{ sessions: number }>();

  const funnelRow = await db.prepare(`
    SELECT
      SUM(CASE WHEN type='add_to_cart' THEN 1 ELSE 0 END) AS add_to_cart,
      SUM(CASE WHEN type='checkout_started' THEN 1 ELSE 0 END) AS checkout_started
    FROM events
    WHERE event_ts >= ?1
  `).bind(start).first<{ add_to_cart: number | null; checkout_started: number | null }>();

  const latest = await db.prepare(`SELECT MAX(snapshot_ts) AS ts FROM ad_snapshots`).first<{ ts: number | null }>();
  let spend = 0;
  let metaPurchases = 0;
  let adRows: any[] = [];

  if (latest?.ts) {
    const summary = await db.prepare(`
      SELECT COALESCE(SUM(spend),0) AS spend, COALESCE(SUM(purchases),0) AS purchases
      FROM ad_snapshots WHERE snapshot_ts=?1
    `).bind(latest.ts).first<{ spend: number; purchases: number }>();
    spend = Number(summary?.spend || 0);
    metaPurchases = Number(summary?.purchases || 0);

    const ads = await db.prepare(`
      SELECT ad_name, spend, impressions, clicks, purchases, purchase_value
      FROM ad_snapshots
      WHERE snapshot_ts=?1
      ORDER BY spend DESC
      LIMIT 12
    `).bind(latest.ts).all();
    adRows = ads.results ?? [];
  }

  const revenue = Number(orderRow?.revenue || 0);
  const orders = Number(orderRow?.orders || 0);
  const sessions = Number(sessionRow?.sessions || 0);
  const addToCart = Number(funnelRow?.add_to_cart || 0);
  const checkout = Number(funnelRow?.checkout_started || 0);
  const roas = spend > 0 ? revenue / spend : 0;
  const cpa = metaPurchases > 0 ? spend / metaPurchases : 0;
  const conversionRate = sessions > 0 ? (orders / sessions) * 100 : 0;

  const revenue7 = await db.prepare(`
    SELECT date(created_at/1000,'unixepoch') AS day, COALESCE(SUM(total),0) AS revenue
    FROM shopify_orders
    WHERE created_at >= ?1 AND cancelled=0
    GROUP BY day ORDER BY day ASC
  `).bind(Date.now() - 7 * 86400000).all();

  const revenueMap = new Map<string, number>();
  for (const row of revenue7.results as any[]) revenueMap.set(String(row.day), Number(row.revenue || 0));
  const trend: { label: string; revenue: number; spend: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    trend.push({ label: `${d.getUTCDate()}.${d.getUTCMonth() + 1}.`, revenue: revenueMap.get(key) || 0, spend: i === 0 ? spend : 0 });
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
      atcRate: 0
    };
  });

  return {
    live: true,
    overview: { revenue, spend, roas, orders, conversionRate, cpa, sessions, addToCart, checkout },
    trend,
    ads
  };
};
