import type { PageServerLoad } from './$types';

const DAY = 86400000;

type Row = {
  accountId:string; accountName:string; currency:string; campaignId:string; campaignName:string; adsetId:string; adsetName:string; adId:string; name:string;
  spend:number; impressions:number; reach:number; frequency:number; clicks:number; linkClicks:number; landingPageViews:number; addToCart:number; checkouts:number; purchases:number; revenue:number;
  ctr:number; cpc:number; cpm:number; linkCtr:number; landingRate:number; atcRate:number; checkoutRate:number; purchaseRate:number; roas:number; cpa:number;
};

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  const emptyTotals = { spend:0, impressions:0, reach:0, clicks:0, linkClicks:0, landingPageViews:0, addToCart:0, checkouts:0, purchases:0, revenue:0, ctr:0, cpc:0, cpm:0, frequency:0, roas:0, cpa:0 };
  const empty = { lastSyncAt:null as number|null, range:{since:'',until:''}, rows:[] as Row[], totals:emptyTotals, currency:'', mixedCurrency:false };
  if (!db) return empty;

  const until = new Date().toISOString().slice(0,10);
  const since = new Date(Date.now() - 6 * DAY).toISOString().slice(0,10);
  const [result, sync] = await Promise.all([
    db.prepare(`
      SELECT
        account_id, MAX(account_name) AS account_name, MAX(currency) AS currency,
        MAX(campaign_id) AS campaign_id, MAX(campaign_name) AS campaign_name,
        MAX(adset_id) AS adset_id, MAX(adset_name) AS adset_name,
        ad_id, MAX(ad_name) AS ad_name,
        SUM(spend) AS spend, SUM(impressions) AS impressions, SUM(reach) AS reach,
        CASE WHEN SUM(impressions)>0 THEN SUM(frequency*impressions)/SUM(impressions) ELSE 0 END AS frequency,
        SUM(clicks) AS clicks, SUM(link_clicks) AS link_clicks,
        SUM(landing_page_views) AS landing_page_views, SUM(add_to_cart) AS add_to_cart,
        SUM(checkouts) AS checkouts, SUM(purchases) AS purchases, SUM(purchase_value) AS purchase_value
      FROM meta_daily
      WHERE day BETWEEN ?1 AND ?2
      GROUP BY account_id,ad_id
      ORDER BY spend DESC
      LIMIT 150
    `).bind(since,until).all(),
    db.prepare(`SELECT last_success_at FROM sync_state WHERE provider='meta'`).first<{last_success_at:number|null}>()
  ]);

  const rows: Row[] = (result.results as any[]).map((r) => {
    const spend=Number(r.spend||0), impressions=Number(r.impressions||0), reach=Number(r.reach||0), clicks=Number(r.clicks||0), linkClicks=Number(r.link_clicks||0), landingPageViews=Number(r.landing_page_views||0), addToCart=Number(r.add_to_cart||0), checkouts=Number(r.checkouts||0), purchases=Number(r.purchases||0), revenue=Number(r.purchase_value||0);
    return {
      accountId:String(r.account_id||''), accountName:String(r.account_name||r.account_id||''), currency:String(r.currency||''), campaignId:String(r.campaign_id||''), campaignName:String(r.campaign_name||''), adsetId:String(r.adset_id||''), adsetName:String(r.adset_name||''), adId:String(r.ad_id||''), name:String(r.ad_name||'Unnamed ad'),
      spend, impressions, reach, frequency:Number(r.frequency||0), clicks, linkClicks, landingPageViews, addToCart, checkouts, purchases, revenue,
      ctr:impressions>0?(clicks/impressions)*100:0,
      cpc:clicks>0?spend/clicks:0,
      cpm:impressions>0?(spend/impressions)*1000:0,
      linkCtr:impressions>0?(linkClicks/impressions)*100:0,
      landingRate:linkClicks>0?(landingPageViews/linkClicks)*100:0,
      atcRate:landingPageViews>0?(addToCart/landingPageViews)*100:0,
      checkoutRate:addToCart>0?(checkouts/addToCart)*100:0,
      purchaseRate:clicks>0?(purchases/clicks)*100:0,
      roas:spend>0?revenue/spend:0,
      cpa:purchases>0?spend/purchases:0
    };
  });

  const currencies=[...new Set(rows.map((r)=>r.currency).filter(Boolean))];
  const mixedCurrency=currencies.length>1;
  const currency=currencies.length===1?currencies[0]:'';
  const raw=rows.reduce((a,r)=>({spend:a.spend+r.spend,impressions:a.impressions+r.impressions,reach:a.reach+r.reach,clicks:a.clicks+r.clicks,linkClicks:a.linkClicks+r.linkClicks,landingPageViews:a.landingPageViews+r.landingPageViews,addToCart:a.addToCart+r.addToCart,checkouts:a.checkouts+r.checkouts,purchases:a.purchases+r.purchases,revenue:a.revenue+r.revenue,weightedFrequency:a.weightedFrequency+r.frequency*r.impressions}),{spend:0,impressions:0,reach:0,clicks:0,linkClicks:0,landingPageViews:0,addToCart:0,checkouts:0,purchases:0,revenue:0,weightedFrequency:0});
  const totals={
    ...raw,
    ctr:raw.impressions?raw.clicks/raw.impressions*100:0,
    cpc:raw.clicks?raw.spend/raw.clicks:0,
    cpm:raw.impressions?raw.spend/raw.impressions*1000:0,
    frequency:raw.impressions?raw.weightedFrequency/raw.impressions:0,
    roas:raw.spend?raw.revenue/raw.spend:0,
    cpa:raw.purchases?raw.spend/raw.purchases:0
  };

  return { lastSyncAt:Number(sync?.last_success_at||0)||null, range:{since,until}, rows, totals, currency, mixedCurrency };
};
