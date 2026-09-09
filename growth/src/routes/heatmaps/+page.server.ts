import type { PageServerLoad } from './$types';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

type PageGroup = {
  path:string;
  clicks:{ x:number; y:number; rage:boolean }[];
  scrollBySession:Map<string,number>;
  totalClicks:number;
  rageClicks:number;
};

export const load: PageServerLoad = async ({ platform }) => {
  const db = platform?.env?.DB;
  if (!db) return { pages: [] };

  const result = await db.prepare(`
    SELECT session_id,path,type,meta_json,event_ts
    FROM events
    WHERE event_ts >= ?1 AND type IN ('click','rage_click','scroll_depth')
    ORDER BY event_ts DESC
    LIMIT 6000
  `).bind(Date.now() - SEVEN_DAYS).all();

  const byPath = new Map<string, PageGroup>();

  for (const row of result.results as any[]) {
    const path = String(row.path || '/');
    let group = byPath.get(path);
    if (!group) {
      group = { path, clicks: [], scrollBySession: new Map(), totalClicks: 0, rageClicks: 0 };
      byPath.set(path, group);
    }

    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(String(row.meta_json || '{}')); } catch {}

    if (row.type === 'click' || row.type === 'rage_click') {
      const x = Number(meta.xPct);
      const y = Number(meta.docYPct);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        group.clicks.push({
          x: Math.max(0, Math.min(100, x)),
          y: Math.max(0, Math.min(100, y)),
          rage: row.type === 'rage_click'
        });
      }
      if (row.type === 'click') group.totalClicks += 1;
      if (row.type === 'rage_click') group.rageClicks += 1;
    }

    if (row.type === 'scroll_depth') {
      const depth = Number(meta.depth);
      const sessionId = String(row.session_id || '');
      if (sessionId && Number.isFinite(depth)) {
        const safeDepth = Math.max(0, Math.min(100, depth));
        group.scrollBySession.set(sessionId, Math.max(group.scrollBySession.get(sessionId) || 0, safeDepth));
      }
    }
  }

  const pages = [...byPath.values()]
    .map((g) => {
      const scrolls = [...g.scrollBySession.values()];
      return {
        path: g.path,
        clicks: g.clicks,
        scrolls,
        totalClicks: g.totalClicks,
        rageClicks: g.rageClicks,
        avgScroll: scrolls.length ? scrolls.reduce((a,b) => a + b, 0) / scrolls.length : 0,
        maxScroll: scrolls.length ? Math.max(...scrolls) : 0
      };
    })
    .sort((a,b) => b.totalClicks - a.totalClicks)
    .slice(0,50);

  return { pages };
};
