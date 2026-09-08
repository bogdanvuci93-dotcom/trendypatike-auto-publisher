import type { PageServerLoad } from './$types';

type Row = {
  accountId: string;
  accountName: string;
  currency: string;
  campaignId: string;
  adsetId: string;
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
  if (!db) return { snapshotTs: null, rows: [] as Row[], totals: { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 }, currency: '', mixedCurrency: false };

  const latest = await db.prepare(`SELECT MAX(snapshot_ts) AS ts FROM ad_snapshots`).first<{ ts: number | null }>();
  if (!latest?.ts) return { snapshotTs: null, rows: [] as Row[], totals: { spend: 0, impressions: 0, clicks: 0, purchases: 0, revenue: 0 }, currency: '', mixedCurrency: false };

  const result = await db.prepare(`
    SELECT account_id, account_name, currency, campaign_id, adset_id, ad_id, ad_name, spend, impressions, clicks, purchases, purchase_value
    FROM ad_snapshots
    WHERE snapshot_ts=?1
    ORDER BY spend DESC
    LIMIT 100
  `).bind(latest.ts).all();

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
      adsetId: String(r.adset_id || ''),
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

  return { snapshotTs: latest.ts, rows, totals, currency, mixedCurrency };
};
