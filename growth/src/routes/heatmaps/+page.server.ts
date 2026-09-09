import type { PageServerLoad } from './$types';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

type SessionView = { vw:number; vh:number; device:string };
type ClickPoint = { x:number;y:number;rage:boolean;dead:boolean;target:string;label:string;href:string;sessionId:string;vw:number;vh:number;device:string };
type PageGroup = {
  path:string;
  clicks:ClickPoint[];
  scrollBySession:Map<string,number>;
  activeBySession:Map<string,number>;
  visibleBySession:Map<string,number>;
  targetCounts:Map<string,{target:string;label:string;href:string;clicks:number;rage:number;dead:number}>;
  pageSessions:Set<string>;
  exitSessions:Set<string>;
  totalClicks:number;
  rageClicks:number;
  deadClicks:number;
};

function parseMeta(raw: unknown) { try { return JSON.parse(String(raw || '{}')) as Record<string,unknown>; } catch { return {}; } }
function median(values:number[]) { if (!values.length) return 0; const sorted=[...values].sort((a,b)=>a-b); const mid=Math.floor(sorted.length/2); return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2; }
function normalizeDevice(value:string, vw:number) { const v=value.toLowerCase(); if(['mobile','tablet','desktop'].includes(v))return v; if(vw>0)return vw<768?'mobile':vw<1100?'tablet':'desktop'; return 'unknown'; }

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { pages: [], totals:{sessions:0,avgActiveMs:0,topExitPath:'',topExitCount:0} };

  const since = Date.now() - SEVEN_DAYS;
  const [eventResult, sessionResult] = await Promise.all([
    db.prepare(`
      SELECT session_id,path,type,meta_json,event_ts
      FROM events
      WHERE event_ts >= ?1
        AND type IN ('session_start','page_view','click','rage_click','dead_click','scroll_depth','heartbeat','page_exit')
      ORDER BY event_ts DESC
      LIMIT 24000
    `).bind(since).all(),
    db.prepare(`SELECT id,started_at,last_seen_at FROM sessions WHERE started_at>=?1`).bind(since).all()
  ]);

  const rows=eventResult.results as any[];
  const sessionViews=new Map<string,SessionView>();
  for(const row of rows){ if(row.type!=='session_start')continue; const meta=parseMeta(row.meta_json); const vw=Math.max(0,Math.min(3000,Number(meta.vw)||0)); const vh=Math.max(0,Math.min(3000,Number(meta.vh)||0)); sessionViews.set(String(row.session_id||''),{vw,vh,device:normalizeDevice(String(meta.device||''),vw)}); }

  const byPath=new Map<string,PageGroup>();
  const getGroup=(path:string)=>{ let g=byPath.get(path); if(!g){g={path,clicks:[],scrollBySession:new Map(),activeBySession:new Map(),visibleBySession:new Map(),targetCounts:new Map(),pageSessions:new Set(),exitSessions:new Set(),totalClicks:0,rageClicks:0,deadClicks:0};byPath.set(path,g);} return g; };

  for(const row of rows){
    if(row.type==='session_start')continue;
    const path=String(row.path||'/'), sessionId=String(row.session_id||'');
    const g=getGroup(path); if(sessionId)g.pageSessions.add(sessionId);
    const meta=parseMeta(row.meta_json), view=sessionViews.get(sessionId);
    const metaVw=Number(meta.vw)||0, metaVh=Number(meta.vh)||0;
    const vw=Math.max(0,Math.min(3000,metaVw||view?.vw||0)), vh=Math.max(0,Math.min(3000,metaVh||view?.vh||0));
    const device=normalizeDevice(String(meta.device||view?.device||''),vw);

    if(['click','rage_click','dead_click'].includes(row.type)){
      const x=Number(meta.xPct), y=Number(meta.docYPct), target=String(meta.target||'').slice(0,120), label=String(meta.label||'').slice(0,100), href=String(meta.href||'').slice(0,300);
      if(Number.isFinite(x)&&Number.isFinite(y))g.clicks.push({x:Math.max(0,Math.min(100,x)),y:Math.max(0,Math.min(100,y)),rage:row.type==='rage_click',dead:row.type==='dead_click',target,label,href,sessionId,vw,vh,device});
      const key=`${label}|${target}|${href}`, agg=g.targetCounts.get(key)||{target,label,href,clicks:0,rage:0,dead:0};
      if(row.type==='click'){g.totalClicks++;agg.clicks++;} if(row.type==='rage_click'){g.rageClicks++;agg.rage++;} if(row.type==='dead_click'){g.deadClicks++;agg.dead++;} g.targetCounts.set(key,agg);
    }
    if(row.type==='scroll_depth'){const depth=Number(meta.depth);if(sessionId&&Number.isFinite(depth))g.scrollBySession.set(sessionId,Math.max(g.scrollBySession.get(sessionId)||0,Math.max(0,Math.min(100,depth))));}
    if(row.type==='heartbeat'||row.type==='page_exit'){
      const active=Math.max(0,Number(meta.activeMs)||0), visible=Math.max(0,Number(meta.visibleMs)||0), scroll=Math.max(0,Number(meta.maxScroll)||0);
      if(sessionId){g.activeBySession.set(sessionId,Math.max(g.activeBySession.get(sessionId)||0,active));g.visibleBySession.set(sessionId,Math.max(g.visibleBySession.get(sessionId)||0,visible));g.scrollBySession.set(sessionId,Math.max(g.scrollBySession.get(sessionId)||0,scroll));}
      if(row.type==='page_exit'&&sessionId)g.exitSessions.add(sessionId);
    }
  }

  const pages=[...byPath.values()].map((g)=>{
    const scrolls=[...g.scrollBySession.values()];
    const activeTimes=[...g.activeBySession.values()];
    const visibleTimes=[...g.visibleBySession.values()];
    const deviceSessions=new Map<string,Set<string>>();
    for(const p of g.clicks){if(!deviceSessions.has(p.device))deviceSessions.set(p.device,new Set());if(p.sessionId)deviceSessions.get(p.device)?.add(p.sessionId);}
    for(const sid of g.pageSessions){const device=sessionViews.get(sid)?.device||'unknown';if(!deviceSessions.has(device))deviceSessions.set(device,new Set());deviceSessions.get(device)?.add(sid);}
    const rankedDevices=[...deviceSessions.entries()].map(([device,sessions])=>({device,sessions:sessions.size})).sort((a,b)=>b.sessions-a.sessions);
    const defaultDevice=rankedDevices.find((d)=>d.device!=='unknown')?.device||rankedDevices[0]?.device||'desktop';
    const viewportPoints=g.clicks.filter((p)=>p.device===defaultDevice&&p.vw>0); const fallbackPoints=g.clicks.filter((p)=>p.vw>0); const sourcePoints=viewportPoints.length?viewportPoints:fallbackPoints;
    const snapshotWidth=Math.round(Math.max(320,Math.min(1800,median(sourcePoints.map((p)=>p.vw))||(defaultDevice==='mobile'?390:defaultDevice==='tablet'?820:1366))));
    const snapshotHeight=Math.round(Math.max(500,Math.min(1600,median(sourcePoints.map((p)=>p.vh).filter(Boolean))||(defaultDevice==='mobile'?844:768))));
    const sessions=g.pageSessions.size;
    const exits=g.exitSessions.size;
    return {
      path:g.path,clicks:g.clicks,scrolls,totalClicks:g.totalClicks,rageClicks:g.rageClicks,deadClicks:g.deadClicks,
      sessions,exits,exitRate:sessions?exits/sessions*100:0,
      avgActiveMs:activeTimes.length?activeTimes.reduce((a,b)=>a+b,0)/activeTimes.length:0,
      avgVisibleMs:visibleTimes.length?visibleTimes.reduce((a,b)=>a+b,0)/visibleTimes.length:0,
      avgScroll:scrolls.length?scrolls.reduce((a,b)=>a+b,0)/scrolls.length:0,maxScroll:scrolls.length?Math.max(...scrolls):0,
      targets:[...g.targetCounts.values()].sort((a,b)=>(b.clicks+b.rage+b.dead)-(a.clicks+a.rage+a.dead)).slice(0,25),
      defaultDevice,snapshotWidth,snapshotHeight,devices:rankedDevices
    };
  }).sort((a,b)=>(b.sessions*4+b.totalClicks)-(a.sessions*4+a.totalClicks)).slice(0,60);

  const sessionRows=sessionResult.results as any[];
  const avgActiveMs=sessionRows.length?sessionRows.reduce((sum,r)=>sum+Math.max(0,Number(r.last_seen_at||0)-Number(r.started_at||0)),0)/sessionRows.length:0;
  const topExit=pages.slice().sort((a,b)=>b.exits-a.exits)[0];
  return { pages, totals:{sessions:sessionRows.length,avgActiveMs,topExitPath:topExit?.path||'',topExitCount:topExit?.exits||0} };
};
