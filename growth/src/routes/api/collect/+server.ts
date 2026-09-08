import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ALLOWED_ORIGINS = new Set([
  'https://trendypatike.com',
  'https://www.trendypatike.com'
]);

const ALLOWED_TYPES = new Set([
  'session_start',
  'page_view',
  'product_view',
  'click',
  'rage_click',
  'scroll_depth',
  'add_to_cart',
  'checkout_started'
]);

function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://trendypatike.com',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function text(value: unknown, max = 500) {
  return String(value ?? '').slice(0, max);
}

function safeMeta(type: string, input: unknown) {
  const meta = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const out: Record<string, unknown> = {};
  const number = (key: string, min: number, max: number) => {
    const n = Number(meta[key]);
    if (Number.isFinite(n)) out[key] = Math.max(min, Math.min(max, n));
  };

  if (type === 'session_start') {
    number('vw', 0, 10000);
    number('vh', 0, 10000);
    number('screenW', 0, 10000);
    number('screenH', 0, 10000);
    out.device = text(meta.device, 30);
    out.lang = text(meta.lang, 20);
  } else if (type === 'click' || type === 'rage_click') {
    number('xPct', 0, 100);
    number('yPct', 0, 100);
    number('docYPct', 0, 100);
    out.target = text(meta.target, 120);
  } else if (type === 'scroll_depth') {
    number('depth', 0, 100);
  } else if (type === 'add_to_cart' || type === 'checkout_started') {
    out.source = text(meta.source, 80);
  } else if (type === 'product_view') {
    out.handle = text(meta.handle, 160);
  }

  return out;
}

export const OPTIONS: RequestHandler = async ({ request }) => {
  const origin = request.headers.get('origin');
  return new Response(null, { status: 204, headers: cors(origin) });
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const origin = request.headers.get('origin');
  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return json({ ok: false, error: 'Origin not allowed' }, { status: 403, headers: cors(origin) });
  }

  const db = platform?.env?.DB;
  if (!db) return json({ ok: false, error: 'Database unavailable' }, { status: 503, headers: cors(origin) });

  let body: any;
  try {
    const raw = await request.text();
    if (raw.length > 50000) throw new Error('payload too large');
    body = JSON.parse(raw);
  } catch {
    return json({ ok: false, error: 'Invalid payload' }, { status: 400, headers: cors(origin) });
  }

  const sessionId = text(body?.sessionId, 80);
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(sessionId)) {
    return json({ ok: false, error: 'Invalid session id' }, { status: 400, headers: cors(origin) });
  }

  const session = body?.session && typeof body.session === 'object' ? body.session : {};
  const now = Date.now();
  const startedAt = Number.isFinite(Number(session.startedAt)) ? Number(session.startedAt) : now;
  const lastSeenAt = Number.isFinite(Number(session.lastSeenAt)) ? Number(session.lastSeenAt) : now;

  const statements = [
    db.prepare(`
      INSERT INTO sessions(id,started_at,last_seen_at,landing_path,referrer,utm_source,utm_campaign,fbclid,purchased,revenue)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,0,0)
      ON CONFLICT(id) DO UPDATE SET last_seen_at=excluded.last_seen_at
    `).bind(
      sessionId,
      startedAt,
      lastSeenAt,
      text(session.landingPath, 500) || '/',
      text(session.referrer, 500),
      text(session.utmSource, 120),
      text(session.utmCampaign, 180),
      text(session.fbclid, 300)
    )
  ];

  const events = Array.isArray(body?.events) ? body.events.slice(0, 40) : [];
  for (const event of events) {
    const type = text(event?.type, 40);
    if (!ALLOWED_TYPES.has(type)) continue;
    const path = text(event?.path, 500) || '/';
    const ts = Number.isFinite(Number(event?.ts)) ? Number(event.ts) : now;
    const metaJson = JSON.stringify(safeMeta(type, event?.meta));
    statements.push(
      db.prepare(`INSERT INTO events(session_id,type,path,event_ts,meta_json) VALUES(?1,?2,?3,?4,?5)`)
        .bind(sessionId, type, path, ts, metaJson)
    );
  }

  await db.batch(statements);
  return json({ ok: true, accepted: Math.max(0, statements.length - 1) }, { headers: cors(origin) });
};
