import type { PageServerLoad } from './$types';
import { validOrderSql } from '$lib/server/orders';

const TZ='Europe/Belgrade';
const DAY=86400000;

function dayKey(ms:number){
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));
  const get=(type:string)=>parts.find((p)=>p.type===type)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function emptyData(error:string|null=null){
  return {
    live:false,error,shopCurrency:'RSD',metaCurrency:'',
    overview:{revenue:0,spend:0,roas:0,orders:0,conversionRate:0,cpa:0,sessions:0,addToCart:0,checkout:0,avgSessionActiveMs:0},
    behavior:{topTimePath:'',topTimeAvgMs:0,topTimeSessions:0,topExitPath:'',topExitCount:0,topExitShare:0},
    trend:[] as {label:string;revenue:number;spend:number}[],
    ads:[] as {name:string;spend:number;revenue:number;purchases:number;ctr:number;cpc:number;cpm:number;atcRate:number;currency:string}[]
  };
}

export const load:PageServerLoad=async({platform})=>{
  const db=platform?.env?.DB;
  if(!db)return emptyData('D1 database nije povezana.');

  try{
    const now=Date.now(),today=dayKey(now),metaFrom=dayKey(now-6*DAY),recentFrom=now-8*DAY,trackerFrom=now-36*3600000,from7=now-7*DAY;
    const [ordersResult,sessionsResult,eventsResult,sessionActiveResult,pageHealthResult,lastPathResult,metaResult,adResult]=await Promise.all([
      db.prepare(`SELECT created_at,total,currency FROM shopify_orders WHERE created_at>=?1 AND ${validOrderSql()} ORDER BY created_at ASC`).bind(recentFrom).all(),
      db.prepare(`SELECT id,started_at FROM sessions WHERE started_at>=?1`).bind(trackerFrom).all(),
      db.prepare(`SELECT session_id,type,event_ts FROM events WHERE event_ts>=?1 AND type IN ('add_to_cart','checkout_started')`).bind(trackerFrom).all(),
      db.prepare(`
        SELECT session_id,SUM(page_active) AS active_ms FROM (
          SELECT session_id,path,MAX(CASE WHEN type IN ('heartbeat','page_exit') THEN CAST(json_extract(meta_json,'$.activeMs') AS INTEGER) ELSE 0 END) AS page_active
          FROM events WHERE event_ts>=?1 GROUP BY session_id,path
        ) GROUP BY session_id
      `).bind(trackerFrom).all(),
      db.prepare(`
        SELECT path,COUNT(*) AS sessions,AVG(active_ms) AS avg_active,SUM(active_ms) AS total_active FROM (
          SELECT session_id,path,MAX(CASE WHEN type IN ('heartbeat','page_exit') THEN CAST(json_extract(meta_json,'$.activeMs') AS INTEGER) ELSE 0 END) AS active_ms
          FROM events WHERE event_ts>=?1 GROUP BY session_id,path
        ) WHERE active_ms>0 GROUP BY path ORDER BY total_active DESC LIMIT 20
      `).bind(from7).all(),
      db.prepare(`
        SELECT last_path,COUNT(*) AS exits FROM (
          SELECT s.id,(SELECT e.path FROM events e WHERE e.session_id=s.id ORDER BY e.event_ts DESC,e.id DESC LIMIT 1) AS last_path
          FROM sessions s WHERE s.started_at>=?1
        ) WHERE last_path IS NOT NULL GROUP BY last_path ORDER BY exits DESC LIMIT 20
      `).bind(from7).all(),
      db.prepare(`SELECT day,currency,spend,purchases,purchase_value FROM meta_daily WHERE day>=?1 ORDER BY day ASC`).bind(metaFrom).all(),
      db.prepare(`
        SELECT account_id,MAX(account_name) AS account_name,ad_id,MAX(ad_name) AS ad_name,MAX(currency) AS currency,
          SUM(spend) AS spend,SUM(impressions) AS impressions,SUM(clicks) AS clicks,SUM(add_to_cart) AS add_to_cart,SUM(landing_page_views) AS landing_page_views,SUM(purchases) AS purchases,SUM(purchase_value) AS purchase_value
        FROM meta_daily WHERE day>=?1 GROUP BY account_id,ad_id ORDER BY spend DESC LIMIT 12
      `).bind(metaFrom).all()
    ]);

    const orderRows=ordersResult.results as any[];
    const todayOrders=orderRows.filter((r)=>dayKey(Number(r.created_at))===today);
    const orders=todayOrders.length,revenue=todayOrders.reduce((s,r)=>s+Number(r.total||0),0);
    const shopCurrencies=[...new Set((todayOrders.length?todayOrders:orderRows).map((r)=>String(r.currency||'')).filter(Boolean))];
    const shopCurrency=shopCurrencies.length===1?shopCurrencies[0]:'RSD';

    const todaySessionRows=(sessionsResult.results as any[]).filter((r)=>dayKey(Number(r.started_at))===today);
    const todaySessionIds=new Set(todaySessionRows.map((r)=>String(r.id)));
    const sessions=todaySessionRows.length;
    const atcSessions=new Set<string>(),checkoutSessions=new Set<string>();
    for(const row of eventsResult.results as any[]){
      if(dayKey(Number(row.event_ts||0))!==today)continue;
      const sid=String(row.session_id||''); if(!sid)continue;
      if(row.type==='add_to_cart')atcSessions.add(sid);
      if(row.type==='checkout_started')checkoutSessions.add(sid);
    }
    const addToCart=atcSessions.size,checkout=checkoutSessions.size;
    const activeRows=(sessionActiveResult.results as any[]).filter((r)=>todaySessionIds.has(String(r.session_id)));
    const avgSessionActiveMs=activeRows.length?activeRows.reduce((s,r)=>s+Number(r.active_ms||0),0)/activeRows.length:0;

    const metaRows=metaResult.results as any[];
    const metaCurrencies=[...new Set(metaRows.map((r)=>String(r.currency||'')).filter(Boolean))];
    const metaCurrency=metaCurrencies.length===1?metaCurrencies[0]:'';
    const comparableMetaRows=metaCurrencies.length<=1?metaRows:[];
    const spend=comparableMetaRows.reduce((s,r)=>s+Number(r.spend||0),0),metaPurchases=comparableMetaRows.reduce((s,r)=>s+Number(r.purchases||0),0),metaRevenue=comparableMetaRows.reduce((s,r)=>s+Number(r.purchase_value||0),0);
    const roas=spend>0?metaRevenue/spend:0,cpa=metaPurchases>0?spend/metaPurchases:0,conversionRate=sessions>0?orders/sessions*100:0;

    const keys:string[]=[],trend:{label:string;revenue:number;spend:number}[]=[];
    for(let i=6;i>=0;i--){const d=new Date(now-i*DAY),key=dayKey(d.getTime());keys.push(key);trend.push({label:new Intl.DateTimeFormat('sr-RS',{timeZone:TZ,day:'2-digit',month:'2-digit'}).format(d),revenue:0,spend:0});}
    for(const row of orderRows){const idx=keys.indexOf(dayKey(Number(row.created_at)));if(idx>=0)trend[idx].revenue+=Number(row.total||0);}
    for(const row of comparableMetaRows){const idx=keys.indexOf(String(row.day||''));if(idx>=0)trend[idx].spend+=Number(row.spend||0);}

    const ads=(adResult.results as any[]).map((row)=>{const impressions=Number(row.impressions||0),clicks=Number(row.clicks||0),adSpend=Number(row.spend||0),lpv=Number(row.landing_page_views||0),atc=Number(row.add_to_cart||0);return{name:String(row.ad_name||'Unnamed ad'),spend:adSpend,revenue:Number(row.purchase_value||0),purchases:Number(row.purchases||0),ctr:impressions?clicks/impressions*100:0,cpc:clicks?adSpend/clicks:0,cpm:impressions?adSpend/impressions*1000:0,atcRate:lpv?atc/lpv*100:0,currency:String(row.currency||metaCurrency||'')}});

    const topTime=(pageHealthResult.results as any[])[0]||{};
    const exitRows=lastPathResult.results as any[];
    const topExit=exitRows[0]||{};
    const exitTotal=exitRows.reduce((s,r)=>s+Number(r.exits||0),0);

    return {
      live:true,error:null,shopCurrency,metaCurrency,
      overview:{revenue,spend,roas,orders,conversionRate,cpa,sessions,addToCart,checkout,avgSessionActiveMs},
      behavior:{topTimePath:String(topTime.path||''),topTimeAvgMs:Number(topTime.avg_active||0),topTimeSessions:Number(topTime.sessions||0),topExitPath:String(topExit.last_path||''),topExitCount:Number(topExit.exits||0),topExitShare:exitTotal?Number(topExit.exits||0)/exitTotal*100:0},
      trend,ads
    };
  }catch(e){console.error('Growth overview load failed',e);return emptyData(e instanceof Error?e.message:'Overview data load failed');}
};
