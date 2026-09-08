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
    LIMIT 1000
  `).bind(params.id).all();

  const events = (result.results as any[]).map((r) => {
    let meta: Record<string, unknown> = {};
    try { meta = JSON.parse(String(r.meta_json || '{}')); } catch {}
    return {
      id: Number(r.id),
      type: String(r.type || ''),
      path: String(r.path || '/'),
      ts: Number(r.event_ts || 0),
      meta
    };
  });

  return {
    session: {
      id: String(session.id),
      startedAt: Number(session.started_at || 0),
      lastSeenAt: Number(session.last_seen_at || 0),
      landingPath: String(session.landing_path || '/'),
      referrer: String(session.referrer || ''),
      utmSource: String(session.utm_source || ''),
      utmCampaign: String(session.utm_campaign || ''),
      fbclid: String(session.fbclid || '')
    },
    events
  };
};
