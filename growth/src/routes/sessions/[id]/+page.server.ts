import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, params }) => {
  const db = platform?.env?.DB;
  if (!db) throw error(503, 'Database unavailable');

  const session = await db.prepare(`
    SELECT id,started_at,last_seen_at,landing_path,referrer,utm_source,utm_campaign,fbclid
    FROM sessions WHERE id=?1
  `).bind(params.id).first<any>();
  if (!session) throw error(404, 'Session not found');

  const result = await db.prepare(`
    SELECT id,type,path,event_ts,meta_json
    FROM events
    WHERE session_id=?1
    ORDER BY event_ts ASC,id ASC
    LIMIT 2000
  `).bind(params.id).all();

  const events = (result.results as any[]).map((r) => {
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(String(r.meta_json || '{}')); } catch {}
    return { id:Number(r.id), type:String(r.type||''), path:String(r.path||'/'), ts:Number(r.event_ts||0), meta };
  });

  const pages = new Map<string,{path:string;activeMs:number;visibleMs:number;maxScroll:number;clicks:number;rage:number;dead:number;atc:number;checkout:number}>();
  const getPage = (path:string) => {
    let p=pages.get(path);
    if(!p){p={path,activeMs:0,visibleMs:0,maxScroll:0,clicks:0,rage:0,dead:0,atc:0,checkout:0};pages.set(path,p);}
    return p;
  };

  let atc=0,checkout=0,productViews=0,rage=0,dead=0;
  for(const event of events){
    const p=getPage(event.path);
    if(event.type==='product_view')productViews++;
    if(event.type==='click')p.clicks++;
    if(event.type==='rage_click'){p.rage++;rage++;}
    if(event.type==='dead_click'){p.dead++;dead++;}
    if(event.type==='add_to_cart'){p.atc++;atc++;}
    if(event.type==='checkout_started'){p.checkout++;checkout++;}
    if(event.type==='scroll_depth')p.maxScroll=Math.max(p.maxScroll,Number(event.meta.depth||0));
    if(event.type==='heartbeat'||event.type==='page_exit'){
      p.activeMs=Math.max(p.activeMs,Number(event.meta.activeMs||0));
      p.visibleMs=Math.max(p.visibleMs,Number(event.meta.visibleMs||0));
      p.maxScroll=Math.max(p.maxScroll,Number(event.meta.maxScroll||0));
    }
  }

  const journey=[...pages.values()].filter((p)=>p.path).sort((a,b)=>{
    const ai=events.findIndex((e)=>e.path===a.path); const bi=events.findIndex((e)=>e.path===b.path); return ai-bi;
  });
  const lastPath=events[events.length-1]?.path || String(session.landing_path||'/');
  const exitStage=checkout>0?'checkout':atc>0?'cart':productViews>0?'product':'browse';
  let likelyReason='Nema dovoljno signala za pouzdan razlog odustajanja.';
  if(exitStage==='checkout')likelyReason='Kupac je stigao do checkouta, ali nema potvrđene kupovine u ovoj tracker sesiji. Proveri dostavu, plaćanje i trenje u checkoutu.';
  else if(exitStage==='cart')likelyReason='Kupac je dodao proizvod u korpu, ali nije krenuo na checkout. Proveri cart drawer, cenu dostave i jasnoću Checkout dugmeta.';
  else if(exitStage==='product'&&rage+dead>0)likelyReason='Kupac je ostao na proizvodu i imao problematične klikove. Otvori click timeline ispod i proveri elemente koji ne reaguju kako očekuje.';
  else if(exitStage==='product')likelyReason='Kupac je gledao proizvod, ali nije dodao u korpu. Najčešće treba proveriti cenu, veličine, dostupnost, dostavu i CTA — ovo je signal, ne dokaz razloga.';
  else if(rage+dead>0)likelyReason='Sesija je završila tokom pregledanja uz problematične klikove. Proveri navigaciju i elemente sa dead/rage signalima.';

  return {
    session:{id:String(session.id),startedAt:Number(session.started_at||0),lastSeenAt:Number(session.last_seen_at||0),landingPath:String(session.landing_path||'/'),referrer:String(session.referrer||''),utmSource:String(session.utm_source||''),utmCampaign:String(session.utm_campaign||''),fbclid:String(session.fbclid||'')},
    events,journey,lastPath,exitStage,likelyReason,summary:{productViews,atc,checkout,rage,dead}
  };
};
