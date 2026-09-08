import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConnection } from '$lib/server/connections';

function actionValue(rows: { action_type?: string; value?: string }[] | undefined, names: string[]) {
  const row = rows?.find((r) => r.action_type && names.includes(r.action_type));
  return Number(row?.value || 0);
}

export const POST: RequestHandler = async ({ platform, fetch }) => {
  const env = platform?.env;
  const db = env?.DB;
  const key = env?.APP_ENCRYPTION_KEY;
  const version = env?.META_GRAPH_VERSION || 'v24.0';
  if (!db || !key) throw error(503, 'Database/encryption not configured');
  const connection = await getConnection(db, key, 'meta');
  if (!connection) throw error(409, 'Meta Ads is not connected');

  const accountsUrl = new URL(`https://graph.facebook.com/${version}/me/adaccounts`);
  accountsUrl.searchParams.set('fields', 'id,name,account_status,currency');
  accountsUrl.searchParams.set('limit', '100');
  accountsUrl.searchParams.set('access_token', connection.accessToken);
  const accountsRes = await fetch(accountsUrl);
  if (!accountsRes.ok) throw error(502, `Meta ad accounts error ${accountsRes.status}`);
  const accountsPayload = await accountsRes.json() as { data?: { id: string; name?: string; account_status?: number; currency?: string }[] };
  const accounts = accountsPayload.data ?? [];

  let ads = 0;
  const snapshotTs = Date.now();
  for (const account of accounts) {
    const insightsUrl = new URL(`https://graph.facebook.com/${version}/${account.id}/insights`);
    insightsUrl.searchParams.set('level', 'ad');
    insightsUrl.searchParams.set('date_preset', 'today');
    insightsUrl.searchParams.set('limit', '500');
    insightsUrl.searchParams.set('fields', 'campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions,action_values');
    insightsUrl.searchParams.set('access_token', connection.accessToken);
    const insightsRes = await fetch(insightsUrl);
    if (!insightsRes.ok) continue;
    const insights = await insightsRes.json() as { data?: any[] };

    for (const row of insights.data ?? []) {
      if (!row.ad_id) continue;
      ads++;
      const purchases = actionValue(row.actions, ['purchase','offsite_conversion.fb_pixel_purchase','omni_purchase']);
      const purchaseValue = actionValue(row.action_values, ['purchase','offsite_conversion.fb_pixel_purchase','omni_purchase']);
      await db.prepare(`INSERT INTO ad_snapshots(snapshot_ts,account_id,campaign_id,adset_id,ad_id,ad_name,spend,impressions,clicks,purchases,purchase_value)
        VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11)`)
        .bind(snapshotTs, account.id, row.campaign_id ?? null, row.adset_id ?? null, row.ad_id, row.ad_name ?? null, Number(row.spend || 0), Number(row.impressions || 0), Number(row.clicks || 0), purchases, purchaseValue)
        .run();
    }
  }

  return json({ ok: true, provider: 'meta', accounts: accounts.length, ads, snapshotTs });
};
