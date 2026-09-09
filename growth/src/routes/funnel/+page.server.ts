import type { PageServerLoad } from './$types';

const TZ = 'Europe/Belgrade';
const LOOKBACK = 36 * 60 * 60 * 1000;

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

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { sessions:0, productViews:0, addToCart:0, checkout:0, purchases:0, revenue:0, trackerReady:false };

  const now = Date.now();
  const today = dayKey(now);
  const from = now - LOOKBACK;

  const [sessionResult, eventResult, orderResult] = await Promise.all([
    db.prepare(`SELECT id,started_at FROM sessions WHERE started_at>=?1`).bind(from).all(),
    db.prepare(`
      SELECT session_id,type,event_ts
      FROM events
      WHERE event_ts>=?1 AND type IN ('product_view','add_to_cart','checkout_started')
    `).bind(from).all(),
    db.prepare(`SELECT created_at,total FROM shopify_orders WHERE created_at>=?1 AND cancelled=0`).bind(from).all()
  ]);

  const sessions = (sessionResult.results as any[])
    .filter((row) => dayKey(Number(row.started_at || 0)) === today)
    .length;

  const productSessions = new Set<string>();
  const atcSessions = new Set<string>();
  const checkoutSessions = new Set<string>();
  for (const row of eventResult.results as any[]) {
    if (dayKey(Number(row.event_ts || 0)) !== today) continue;
    const sessionId = String(row.session_id || '');
    if (!sessionId) continue;
    if (row.type === 'product_view') productSessions.add(sessionId);
    if (row.type === 'add_to_cart') atcSessions.add(sessionId);
    if (row.type === 'checkout_started') checkoutSessions.add(sessionId);
  }

  const todayOrders = (orderResult.results as any[])
    .filter((row) => dayKey(Number(row.created_at || 0)) === today);

  return {
    sessions,
    productViews: productSessions.size,
    addToCart: atcSessions.size,
    checkout: checkoutSessions.size,
    purchases: todayOrders.length,
    revenue: todayOrders.reduce((sum, row) => sum + Number(row.total || 0), 0),
    trackerReady: sessions > 0 || productSessions.size > 0
  };
};
