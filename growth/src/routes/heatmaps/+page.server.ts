import type { PageServerLoad } from './$types';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

type SessionView = { vw:number; vh:number; device:string };
type ClickPoint = {
  x:number;
  y:number;
  rage:boolean;
  dead:boolean;
  target:string;
  label:string;
  href:string;
  sessionId:string;
  vw:number;
  vh:number;
  device:string;
};
type PageGroup = {
  path:string;
  clicks:ClickPoint[];
  scrollBySession:Map<string,number>;
  targetCounts:Map<string,{target:string;label:string;href:string;clicks:number;rage:number;dead:number}>;
  pageSessions:Set<string>;
  totalClicks:number;
  rageClicks:number;
  deadClicks:number;
};

function parseMeta(raw: unknown) {
  try { return JSON.parse(String(raw || '{}')) as Record<string,unknown>; }
  catch { return {} as Record<string,unknown>; }
}

function median(values:number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a,b)=>a-b);
  const mid = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1] + sorted[mid]) / 2;
}

function normalizeDevice(value:string, vw:number) {
  const v = value.toLowerCase();
  if (v === 'mobile' || v === 'tablet' || v === 'desktop') return v;
  if (vw > 0) return vw < 768 ? 'mobile' : vw < 1100 ? 'tablet' : 'desktop';
  return 'unknown';
}

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { pages: [] };

  const result = await db.prepare(`
    SELECT session_id,path,type,meta_json,event_ts
    FROM events
    WHERE event_ts >= ?1
      AND type IN ('session_start','click','rage_click','dead_click','scroll_depth')
    ORDER BY event_ts DESC
    LIMIT 16000
  `).bind(Date.now() - SEVEN_DAYS).all();

  const rows = result.results as any[];
  const sessionViews = new Map<string,SessionView>();

  // First pass is important because click events are newer than session_start
  // and therefore arrive before it in the DESC query.
  for (const row of rows) {
    if (row.type !== 'session_start') continue;
    const meta = parseMeta(row.meta_json);
    const vw = Math.max(0, Math.min(3000, Number(meta.vw) || 0));
    const vh = Math.max(0, Math.min(3000, Number(meta.vh) || 0));
    const device = normalizeDevice(String(meta.device || ''), vw);
    sessionViews.set(String(row.session_id || ''), { vw, vh, device });
  }

  const byPath = new Map<string, PageGroup>();
  for (const row of rows) {
    if (row.type === 'session_start') continue;
    const path = String(row.path || '/');
    const sessionId = String(row.session_id || '');
    let group = byPath.get(path);
    if (!group) {
      group = {
        path,
        clicks: [],
        scrollBySession: new Map(),
        targetCounts: new Map(),
        pageSessions: new Set(),
        totalClicks: 0,
        rageClicks: 0,
        deadClicks: 0
      };
      byPath.set(path, group);
    }
    if (sessionId) group.pageSessions.add(sessionId);

    const meta = parseMeta(row.meta_json);
    const view = sessionViews.get(sessionId);
    const metaVw = Number(meta.vw) || 0;
    const metaVh = Number(meta.vh) || 0;
    const vw = Math.max(0, Math.min(3000, metaVw || view?.vw || 0));
    const vh = Math.max(0, Math.min(3000, metaVh || view?.vh || 0));
    const device = normalizeDevice(String(meta.device || view?.device || ''), vw);

    if (row.type === 'click' || row.type === 'rage_click' || row.type === 'dead_click') {
      const x = Number(meta.xPct);
      const y = Number(meta.docYPct);
      const target = String(meta.target || '').slice(0,120);
      const label = String(meta.label || '').slice(0,100);
      const href = String(meta.href || '').slice(0,300);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        group.clicks.push({
          x: Math.max(0,Math.min(100,x)),
          y: Math.max(0,Math.min(100,y)),
          rage: row.type === 'rage_click',
          dead: row.type === 'dead_click',
          target,
          label,
          href,
          sessionId,
          vw,
          vh,
          device
        });
      }
      const key = `${label}|${target}|${href}`;
      const agg = group.targetCounts.get(key) || {target,label,href,clicks:0,rage:0,dead:0};
      if (row.type === 'click') { group.totalClicks++; agg.clicks++; }
      if (row.type === 'rage_click') { group.rageClicks++; agg.rage++; }
      if (row.type === 'dead_click') { group.deadClicks++; agg.dead++; }
      group.targetCounts.set(key,agg);
    }

    if (row.type === 'scroll_depth') {
      const depth = Number(meta.depth);
      if (sessionId && Number.isFinite(depth)) {
        group.scrollBySession.set(sessionId,Math.max(group.scrollBySession.get(sessionId)||0,Math.max(0,Math.min(100,depth))));
      }
    }
  }

  const pages = [...byPath.values()].map((g)=>{
    const scrolls = [...g.scrollBySession.values()];
    const deviceSessions = new Map<string,Set<string>>();
    for (const point of g.clicks) {
      if (!deviceSessions.has(point.device)) deviceSessions.set(point.device,new Set());
      if (point.sessionId) deviceSessions.get(point.device)?.add(point.sessionId);
    }
    for (const sessionId of g.pageSessions) {
      const device = sessionViews.get(sessionId)?.device || 'unknown';
      if (!deviceSessions.has(device)) deviceSessions.set(device,new Set());
      deviceSessions.get(device)?.add(sessionId);
    }

    const rankedDevices = [...deviceSessions.entries()]
      .map(([device,sessions])=>({device,sessions:sessions.size}))
      .sort((a,b)=>b.sessions-a.sessions);
    const defaultDevice = rankedDevices.find((d)=>d.device!=='unknown')?.device || rankedDevices[0]?.device || 'desktop';
    const viewportPoints = g.clicks.filter((p)=>p.device===defaultDevice && p.vw>0);
    const fallbackPoints = g.clicks.filter((p)=>p.vw>0);
    const sourcePoints = viewportPoints.length ? viewportPoints : fallbackPoints;
    const snapshotWidth = Math.round(Math.max(320,Math.min(1800,median(sourcePoints.map((p)=>p.vw)) || (defaultDevice==='mobile'?390:defaultDevice==='tablet'?820:1366))));
    const snapshotHeight = Math.round(Math.max(500,Math.min(1600,median(sourcePoints.map((p)=>p.vh).filter(Boolean)) || (defaultDevice==='mobile'?844:768))));

    return {
      path:g.path,
      clicks:g.clicks,
      scrolls,
      totalClicks:g.totalClicks,
      rageClicks:g.rageClicks,
      deadClicks:g.deadClicks,
      avgScroll:scrolls.length?scrolls.reduce((a,b)=>a+b,0)/scrolls.length:0,
      maxScroll:scrolls.length?Math.max(...scrolls):0,
      targets:[...g.targetCounts.values()].sort((a,b)=>(b.clicks+b.rage+b.dead)-(a.clicks+a.rage+a.dead)).slice(0,20),
      defaultDevice,
      snapshotWidth,
      snapshotHeight,
      devices: rankedDevices
    };
  }).sort((a,b)=>(b.totalClicks+b.rageClicks+b.deadClicks)-(a.totalClicks+a.rageClicks+a.deadClicks)).slice(0,50);

  return { pages };
};
