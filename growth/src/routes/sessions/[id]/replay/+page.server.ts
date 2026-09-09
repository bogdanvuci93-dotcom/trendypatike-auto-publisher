import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ platform, params }) => {
  const db = platform?.env?.DB;
  if (!db) throw error(503, 'Database unavailable');

  const session = await db.prepare(`
    SELECT id,started_at,last_seen_at,landing_path,utm_source,utm_campaign,fbclid
    FROM sessions WHERE id=?1
  `).bind(params.id).first<any>();
  if (!session) throw error(404, 'Session not found');

  const result = await db.prepare(`
    SELECT seq,started_at,ended_at,data_json,bytes
    FROM replay_chunks
    WHERE session_id=?1
    ORDER BY started_at ASC,seq ASC
    LIMIT 120
  `).bind(params.id).all();

  const events: any[] = [];
  let bytes = 0;
  for (const row of result.results as any[]) {
    bytes += Number(row.bytes || 0);
    try {
      const parsed = JSON.parse(String(row.data_json || '[]'));
      if (Array.isArray(parsed)) events.push(...parsed);
    } catch {}
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
      fbclid:String(session.fbclid||'')
    },
    events,
    bytes,
    chunks:(result.results as any[]).length
  };
};
