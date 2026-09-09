import type { PageServerLoad } from './$types';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

type PageGroup = {
  path:string;
  clicks:{ x:number; y:number; rage:boolean; dead:boolean; target:string; label:string; href:string }[];
  scrollBySession:Map<string,number>;
  targetCounts:Map<string,{target:string;label:string;href:string;clicks:number;rage:number;dead:number}>;
  totalClicks:number;
  rageClicks:number;
  deadClicks:number;
};

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { pages: [] };

  const result = await db.prepare(`
    SELECT session_id,path,type,meta_json,event_ts
    FROM events
    WHERE event_ts >= ?1 AND type IN ('click','rage_click','dead_click','scroll_depth')
    ORDER BY event_ts DESC
    LIMIT 12000
  `).bind(Date.now() - SEVEN_DAYS).all();

  const byPath = new Map<string, PageGroup>();
  for (const row of result.results as any[]) {
    const path = String(row.path || '/');
    let group = byPath.get(path);
    if (!group) {
      group = { path, clicks: [], scrollBySession: new Map(), targetCounts:new Map(), totalClicks:0, rageClicks:0, deadClicks:0 };
      byPath.set(path, group);
    }
    let meta:Record<string,unknown>={};
    try { meta=JSON.parse(String(row.meta_json||'{}')); } catch {}

    if (row.type === 'click' || row.type === 'rage_click' || row.type === 'dead_click') {
      const x=Number(meta.xPct), y=Number(meta.docYPct);
      const target=String(meta.target||'').slice(0,120), label=String(meta.label||'').slice(0,100), href=String(meta.href||'').slice(0,300);
      if(Number.isFinite(x)&&Number.isFinite(y)) group.clicks.push({x:Math.max(0,Math.min(100,x)),y:Math.max(0,Math.min(100,y)),rage:row.type==='rage_click',dead:row.type==='dead_click',target,label,href});
      const key=`${label}|${target}|${href}`;
      const agg=group.targetCounts.get(key)||{target,label,href,clicks:0,rage:0,dead:0};
      if(row.type==='click'){group.totalClicks++;agg.clicks++;}
      if(row.type==='rage_click'){group.rageClicks++;agg.rage++;}
      if(row.type==='dead_click'){group.deadClicks++;agg.dead++;}
      group.targetCounts.set(key,agg);
    }

    if(row.type==='scroll_depth'){
      const depth=Number(meta.depth),sessionId=String(row.session_id||'');
      if(sessionId&&Number.isFinite(depth))group.scrollBySession.set(sessionId,Math.max(group.scrollBySession.get(sessionId)||0,Math.max(0,Math.min(100,depth))));
    }
  }

  const pages=[...byPath.values()].map((g)=>{
    const scrolls=[...g.scrollBySession.values()];
    return {
      path:g.path,clicks:g.clicks,scrolls,totalClicks:g.totalClicks,rageClicks:g.rageClicks,deadClicks:g.deadClicks,
      avgScroll:scrolls.length?scrolls.reduce((a,b)=>a+b,0)/scrolls.length:0,maxScroll:scrolls.length?Math.max(...scrolls):0,
      targets:[...g.targetCounts.values()].sort((a,b)=>(b.clicks+b.rage+b.dead)-(a.clicks+a.rage+a.dead)).slice(0,20)
    };
  }).sort((a,b)=>(b.totalClicks+b.rageClicks+b.deadClicks)-(a.totalClicks+a.rageClicks+a.deadClicks)).slice(0,50);

  return { pages };
};
