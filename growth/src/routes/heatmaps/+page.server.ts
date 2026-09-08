import type { PageServerLoad } from './$types';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { pages: [] };

  const result = await db.prepare(`
    SELECT path,type,meta_json,event_ts
    FROM events
    WHERE event_ts >= ?1 AND type IN ('click','rage_click','scroll_depth')
    ORDER BY event_ts DESC
    LIMIT 4000
  `).bind(Date.now() - SEVEN_DAYS).all();

  const byPath = new Map<string, {
    path:string;
    clicks:{ x:number; y:number; rage:boolean }[];
    scrolls:number[];
    totalClicks:number;
    rageClicks:number;
  }>();

  for (const row of result.results as any[]) {
    const path = String(row.path || '/');
    let group = byPath.get(path);
    if (!group) {
      group = { path, clicks: [], scrolls: [], totalClicks: 0, rageClicks: 0 };
      byPath.set(path, group);
    }
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(String(row.meta_json || '{}')); } catch {}

    if (row.type === 'click' || row.type === 'rage_click') {
      const x = Number(meta.xPct);
      const y = Number(meta.docYPct);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        group.clicks.push({ x: Math.max(0,Math.min(100,x)), y: Math.max(0,Math.min(100,y)), rage: row.type === 'rage_click' });
      }
      group.totalClicks += 1;
      if (row.type === 'rage_click') group.rageClicks += 1;
    }
    if (row.type === 'scroll_depth') {
      const depth = Number(meta.depth);
      if (Number.isFinite(depth)) group.scrolls.push(Math.max(0,Math.min(100,depth)));
    }
  }

  const pages = [...byPath.values()]
    .map((g) => ({
      ...g,
      avgScroll: g.scrolls.length ? g.scrolls.reduce((a,b)=>a+b,0)/g.scrolls.length : 0,
      maxScroll: g.scrolls.length ? Math.max(...g.scrolls) : 0
    }))
    .sort((a,b) => b.totalClicks - a.totalClicks)
    .slice(0,50);

  return { pages };
};
