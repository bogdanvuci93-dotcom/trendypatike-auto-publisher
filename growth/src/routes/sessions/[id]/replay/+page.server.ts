import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, params }) => {
  const db = platform?.env?.DB;
  if (!db) throw error(503, 'Database unavailable');

  const session = await db.prepare(`
    SELECT id,started_at,last_seen_at,landing_path,utm_source,utm_campaign,fbclid,purchased
    FROM sessions WHERE id=?1
  `).bind(params.id).first<any>();
  if (!session) throw error(404, 'Session not found');

  const [replayResult, journeyResult] = await Promise.all([
    db.prepare(`
      SELECT seq,started_at,ended_at,data_json,bytes
      FROM replay_chunks
      WHERE session_id=?1
      ORDER BY started_at ASC,seq ASC
      LIMIT 120
    `).bind(params.id).all(),
    db.prepare(`
      SELECT path,event_ts
      FROM events
      WHERE session_id=?1 AND type='page_view'
      ORDER BY event_ts ASC,id ASC
      LIMIT 120
    `).bind(params.id).all()
  ]);

  const events: any[] = [];
  let bytes = 0;
  for (const row of replayResult.results as any[]) {
    bytes += Number(row.bytes || 0);
    try {
      const parsed = JSON.parse(String(row.data_json || '[]'));
      if (Array.isArray(parsed)) events.push(...parsed);
    } catch {}
  }

  // Keep route changes in the replay even if the full DOM snapshot was too large
  // and the recorder intentionally skipped it. The player can then render a
  // safe same-origin visual fallback for that exact storefront path.
  let lastRoute = '';
  for (const row of journeyResult.results as any[]) {
    const path = String(row.path || '/');
    if (path === lastRoute) continue;
    lastRoute = path;
    events.push({ kind:'route', t:Number(row.event_ts || 0), path });
  }

  if (!events.some((e) => e?.kind === 'route')) {
    events.push({ kind:'route', t:Number(session.started_at || Date.now()), path:String(session.landing_path || '/') });
  }

  events.sort((a,b)=>Number(a?.t||0)-Number(b?.t||0));

  return {
    session: {
      id:String(session.id),
      startedAt:Number(session.started_at||0),
      lastSeenAt:Number(session.last_seen_at||0),
      landingPath:String(session.landing_path||'/'),
      utmSource:String(session.utm_source||''),
      utmCampaign:String(session.utm_campaign||''),
      fbclid:String(session.fbclid||''),
      purchased:Boolean(session.purchased)
    },
    events,
    bytes,
    chunks:(replayResult.results as any[]).length,
    recordedSnapshots:events.filter((e)=>e?.kind==='snapshot' && typeof e?.html==='string' && e.html.length>0).length
  };
};
