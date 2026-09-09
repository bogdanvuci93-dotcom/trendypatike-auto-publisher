import type { PageServerLoad } from './$types';

const DAY = 86400000;

type Row = {
  accountId: string;
  accountName: string;
  currency: string;
  campaignId: string;
  campaignName: string;
  adsetId: string;
  adsetName: string;
  adId: string;
  name: string;
  spend: number;
  impressions: number;
  clicks: number;
  purchases: number;
  revenue: number;
  ctr: number;
  cpc: number;
  roas: number;
  cpa: number;
};

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  const empty = { lastSyncAt: null as number | null, range: { since:'', until:'' }, rows: [] as Row[], totals: { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 }, currency: '', mixedCurrency: false };
  if (!db) return empty;

  const until = new Date().toISOString().slice(0,10);
  const since = new Date(Date.now() - 6 * DAY).toISOString().slice(0,10);
  const [result, sync] = await Promise.all([
    db.prepare(`
      SELECT
        account_id,
        MAX(account_name) AS account_name,
        MAX(currency) AS currency,
        MAX(campaign_id) AS campaign_id,
        MAX(campaign_name) AS campaign_name,
        MAX(adset_id) AS adset_id,
        MAX(adset_name) AS adset_name,
        ad_id,
        MAX(ad_name) AS ad_name,
        SUM(spend) AS spend,
        SUM(impressions) AS impressions,
        SUM(clicks) AS clicks,
        SUM(purchases) AS purchases,
        SUM(purchase_value) AS purchase_value
      FROM meta_daily
      WHERE day BETWEEN ?1 AND ?2
      GROUP BY account_id,ad_id
      ORDER BY spend DESC
      LIMIT 100
    `).bind(since,until).all(),
    db.prepare(`SELECT last_success_at FROM sync_state WHERE provider='meta'`).first<{last_success_at:number|null}>()
  ]);

  const rows: Row[] = (result.results as any[]).map((r) => {
    const spend = Number(r.spend || 0);
    const impressions = Number(r.impressions || 0);
    const clicks = Number(r.clicks || 0);
    const purchases = Number(r.purchases || 0);
    const revenue = Number(r.purchase_value || 0);
    return {
      accountId: String(r.account_id || ''),
      accountName: String(r.account_name || r.account_id || ''),
      currency: String(r.currency || ''),
      campaignId: String(r.campaign_id || ''),
      campaignName: String(r.campaign_name || ''),
      adsetId: String(r.adset_id || ''),
      adsetName: String(r.adset_name || ''),
      adId: String(r.ad_id || ''),
      name: String(r.ad_name || 'Unnamed ad'),
      spend,
      impressions,
      clicks,
      purchases,
      revenue,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
      cpc: clicks > 0 ? spend / clicks : 0,
      roas: spend > 0 ? revenue / spend : 0,
      cpa: purchases > 0 ? spend / purchases : 0
    };
  });

  const currencies = [...new Set(rows.map((r) => r.currency).filter(Boolean))];
  const mixedCurrency = currencies.length > 1;
  const currency = currencies.length === 1 ? currencies[0] : '';

  const totals = rows.reduce((a, r) => ({
    spend: a.spend + r.spend,
    impressions: a.impressions + r.impressions,
    clicks: a.clicks + r.clicks,
    purchases: a.purchases + r.purchases,
    revenue: a.revenue + r.revenue
  }), { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 });

  return { lastSyncAt: Number(sync?.last_success_at || 0) || null, range: { since, until }, rows, totals, currency, mixedCurrency };
};
