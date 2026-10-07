import type { PageServerLoad } from './$types';
import { validOrderSql } from '$lib/server/orders';
import { analyticsPeriod, dayKey } from '$lib/server/period';

export const load:PageServerLoad=async({platform,url})=>{
  const period=analyticsPeriod(url),db=platform?.env?.DB;
  if(!db)return{shopify:{revenue:0,orders:0,aov:0,topTitle:'',topRevenue:0,topShare:0},storefront:{sessions:0,productViews:0,atcSessions:0,checkoutSessions:0,rageSessions:0},ads:[],period};
  const metaSince=dayKey(period.start),metaUntil=dayKey(Math.max(period.start,period.end-1));
  const[shop,topProduct,sessionTotals,adResult]=await Promise.all([
    db.prepare(`SELECT COALESCE(SUM(total),0) revenue,COUNT(*) orders FROM shopify_orders WHERE ${validOrderSql()} AND created_at>=?1 AND created_at<?2`).bind(period.start,period.end).first<{revenue:number;orders:number}>(),
    db.prepare(`SELECT MAX(i.title) title,COALESCE(SUM(i.line_total),0) revenue FROM shopify_order_items i JOIN shopify_orders o ON o.id=i.order_id WHERE ${validOrderSql('o')} AND o.created_at>=?1 AND o.created_at<?2 GROUP BY COALESCE(i.product_id,i.title) ORDER BY revenue DESC LIMIT 1`).bind(period.start,period.end).first<{title:string;revenue:number}>(),
    db.prepare(`SELECT COUNT(DISTINCT s.id) sessions,COUNT(DISTINCT CASE WHEN e.type='product_view' THEN s.id END) product_views,COUNT(DISTINCT CASE WHEN e.type='add_to_cart' THEN s.id END) atc_sessions,COUNT(DISTINCT CASE WHEN e.type='checkout_started' THEN s.id END) checkout_sessions,COUNT(DISTINCT CASE WHEN e.type='rage_click' THEN s.id END) rage_sessions FROM sessions s LEFT JOIN events e ON e.session_id=s.id AND e.event_ts>=?1 AND e.event_ts<?2 WHERE s.started_at>=?1 AND s.started_at<?2`).bind(period.start,period.end).first<{sessions:number;product_views:number;atc_sessions:number;checkout_sessions:number;rage_sessions:number}>(),
    db.prepare(`SELECT account_id,MAX(account_name) account_name,MAX(currency) currency,ad_id,MAX(ad_name) ad_name,SUM(spend) spend,SUM(impressions) impressions,SUM(clicks) clicks,SUM(purchases) purchases,SUM(purchase_value) purchase_value FROM meta_daily WHERE day>=?1 AND day<=?2 GROUP BY account_id,ad_id ORDER BY spend DESC LIMIT 50`).bind(metaSince,metaUntil).all()
  ]);
  const revenue=Number(shop?.revenue||0),orders=Number(shop?.orders||0),topRevenue=Number(topProduct?.revenue||0);
  return{period,shopify:{revenue,orders,aov:orders?revenue/orders:0,topTitle:String(topProduct?.title||''),topRevenue,topShare:revenue?topRevenue/revenue*100:0},storefront:{sessions:Number(sessionTotals?.sessions||0),productViews:Number(sessionTotals?.product_views||0),atcSessions:Number(sessionTotals?.atc_sessions||0),checkoutSessions:Number(sessionTotals?.checkout_sessions||0),rageSessions:Number(sessionTotals?.rage_sessions||0)},ads:(adResult.results as any[]).map(row=>{const spend=Number(row.spend||0),impressions=Number(row.impressions||0),clicks=Number(row.clicks||0),purchases=Number(row.purchases||0),purchaseValue=Number(row.purchase_value||0);return{accountName:String(row.account_name||row.ad_id||''),currency:String(row.currency||''),adId:String(row.ad_id||''),adName:String(row.ad_name||'Untitled ad'),spend,impressions,clicks,purchases,purchaseValue,ctr:impressions?clicks/impressions*100:0,cpc:clicks?spend/clicks:0,roas:spend?purchaseValue/spend:0};})};
};
