import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const allowedTypes = new Set(['page_view','click','scroll','rage_click','add_to_cart','checkout_started','purchase']);

export const POST: RequestHandler = async ({ request, platform }) => {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body.type !== 'string' || !allowedTypes.has(body.type)) {
    return json({ ok: false, error: 'invalid_event' }, { status: 400 });
  }

  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.slice(0, 80) : '';
  const path = typeof body.path === 'string' ? body.path.slice(0, 500) : '/';
  if (!sessionId) return json({ ok: false, error: 'missing_session' }, { status: 400 });

  // Never accept form fields, email, phone, address or arbitrary DOM text.
  const rawMeta = body.meta && typeof body.meta === 'object' ? body.meta as Record<string, unknown> : {};
  const allowedMetaKeys = ['target','depth','count','referrer','utm_source','utm_campaign','fbclid','product_id','variant_id','value','currency'];
  const safeMeta = Object.fromEntries(allowedMetaKeys.filter((k) => k in rawMeta).map((k) => [k, rawMeta[k]]));

  const db = platform?.env?.DB;
  if (db) {
    await db.prepare(`INSERT INTO events (session_id, type, path, event_ts, meta_json) VALUES (?1, ?2, ?3, ?4, ?5)`)
      .bind(sessionId, body.type, path, Number(body.ts) || Date.now(), JSON.stringify(safeMeta))
      .run();
  }

  return json({ ok: true, persisted: Boolean(db) });
};
