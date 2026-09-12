import type { PageServerLoad } from './$types';

const TZ='Europe/Belgrade';const DAY=86400000;
function dayKey(ms:number){const p=new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(ms));const g=(t:string)=>p.find(x=>x.type===t)?.value||'';return`${g('year')}-${g('month')}-${g('day')}`;}
function zonedStart(key:string){const[y,m,d]=key.split('-').map(Number);let guess=Date.UTC(y,m-1,d);const p=new Intl.DateTimeFormat('en-US',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(guess));const n=(t:string)=>Number(p.find(x=>x.type===t)?.value||0);const represented=Date.UTC(n('year'),n('month')-1,n('day'),n('hour'),n('minute'),n('second'));return guess-(represented-guess);}
function rangeWindow(range:string){const now=Date.now(),todayStart=zonedStart(dayKey(now));if(range==='today')return{range,start:todayStart,end:now,label:'Danas'};if(range==='yesterday'){const y=zonedStart(dayKey(todayStart-1));return{range,start:y,end:todayStart,label:'Juče'};}if(range==='30d')return{range,start:now-30*DAY,end:now,label:'30 dana'};return{range:'7d',start:now-7*DAY,end:now,label:'7 dana'};}

export const load:PageServerLoad=async({platform,url})=>{
  const period=rangeWindow(url.searchParams.get('range')||'7d');const db=platform?.env?.DB;
  if(!db)return{rows:[],period,summary:{avgActiveMs:0,avgScroll:0,withAtc:0,withCheckout:0,problemSessions:0,stages:{browse:0,product:0,cart:0,checkout:0}}};
  const result=await db.prepare(`
    WITH page_activity AS (
      SELECT session_id,path,MAX(CASE WHEN type IN ('heartbeat','page_exit') THEN CAST(json_extract(meta_json,'$.activeMs') AS INTEGER) ELSE 0 END) AS page_active
      FROM events WHERE event_ts>=?1 AND event_ts<?2 GROUP BY session_id,path
    ),session_activity AS (SELECT session_id,SUM(page_active) AS active_ms FROM page_activity GROUP BY session_id)
    SELECT s.id,s.started_at,s.last_seen_at,s.landing_path,s.referrer,s.utm_source,s.utm_campaign,s.fbclid,s.purchased,
      COUNT(e.id) AS events,SUM(CASE WHEN e.type='page_view' THEN 1 ELSE 0 END) AS page_views,SUM(CASE WHEN e.type='product_view' THEN 1 ELSE 0 END) AS product_views,
      SUM(CASE WHEN e.type='add_to_cart' THEN 1 ELSE 0 END) AS add_to_cart,SUM(CASE WHEN e.type='cart_view' THEN 1 ELSE 0 END) AS cart_views,SUM(CASE WHEN e.type='checkout_started' THEN 1 ELSE 0 END) AS checkout_started,
      SUM(CASE WHEN e.type='rage_click' THEN 1 ELSE 0 END) AS rage_clicks,SUM(CASE WHEN e.type='dead_click' THEN 1 ELSE 0 END) AS dead_clicks,COALESCE(sa.active_ms,0) AS active_ms,
      MAX(CASE WHEN e.type='scroll_depth' THEN CAST(json_extract(e.meta_json,'$.depth') AS INTEGER) WHEN e.type='page_exit' THEN CAST(json_extract(e.meta_json,'$.maxScroll') AS INTEGER) ELSE 0 END) AS max_scroll,
      (SELECT e2.path FROM events e2 WHERE e2.session_id=s.id AND e2.event_ts<?2 ORDER BY e2.event_ts DESC,e2.id DESC LIMIT 1) AS last_path,
      (SELECT COUNT(*) FROM replay_chunks rc WHERE rc.session_id=s.id) AS replay_chunks
    FROM sessions s LEFT JOIN events e ON e.session_id=s.id AND e.event_ts>=?1 AND e.event_ts<?2 LEFT JOIN session_activity sa ON sa.session_id=s.id
    WHERE s.started_at>=?1 AND s.started_at<?2 GROUP BY s.id ORDER BY s.last_seen_at DESC LIMIT 3000
  `).bind(period.start,period.end).all();
  const rows=(result.results as any[]).map(r=>{const productViews=Number(r.product_views||0),addToCart=Number(r.add_to_cart||0),checkout=Number(r.checkout_started||0),purchased=Boolean(r.purchased),exitStage=checkout>0?'checkout':addToCart>0?'cart':productViews>0?'product':'browse',priority=purchased?'converted':checkout>0?'checkout':addToCart>0?'cart':productViews>0?'product':'browse',priorityScore=priority==='checkout'?4:priority==='cart'?3:priority==='product'?2:priority==='converted'?0:1;return{id:String(r.id),startedAt:Number(r.started_at||0),lastSeenAt:Number(r.last_seen_at||0),landingPath:String(r.landing_path||'/'),lastPath:String(r.last_path||r.landing_path||'/'),referrer:String(r.referrer||''),utmSource:String(r.utm_source||''),utmCampaign:String(r.utm_campaign||''),fbclid:String(r.fbclid||''),events:Number(r.events||0),pageViews:Number(r.page_views||0),productViews,addToCart,cartViews:Number(r.cart_views||0),checkout,rageClicks:Number(r.rage_clicks||0),deadClicks:Number(r.dead_clicks||0),activeMs:Number(r.active_ms||0),maxScroll:Number(r.max_scroll||0),replayAvailable:Number(r.replay_chunks||0)>0,purchased,exitStage,priority,priorityScore};}).sort((a,b)=>b.priorityScore-a.priorityScore||b.lastSeenAt-a.lastSeenAt).slice(0,1000);
  const stages={browse:0,product:0,cart:0,checkout:0};for(const row of rows)stages[row.exitStage as keyof typeof stages]++;const avgActiveMs=rows.length?rows.reduce((s,r)=>s+r.activeMs,0)/rows.length:0,avgScroll=rows.length?rows.reduce((s,r)=>s+r.maxScroll,0)/rows.length:0;
  return{rows,period,summary:{avgActiveMs,avgScroll,withAtc:rows.filter(r=>r.addToCart>0).length,withCheckout:rows.filter(r=>r.checkout>0).length,problemSessions:rows.filter(r=>r.rageClicks+r.deadClicks>0).length,stages}};
};
