import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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

const DAY = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW = 5 * 60 * 1000;

function hostAllowed(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === 'trendypatike.com'
    || host === 'www.trendypatike.com'
    || host === 'trendypatike.myshopify.com'
    || host.endsWith('.trendypatike.com');
}

function trustedOrigin(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && hostAllowed(url.hostname)) return url.origin;
  } catch {
    // malformed header
  }
  return null;
}

function sourceAllowed(request: Request) {
  const origin = request.headers.get('origin');
  if (trustedOrigin(origin)) return true;

  const referer = request.headers.get('referer');
  if (!referer) return false;
  try {
    const url = new URL(referer);
    return url.protocol === 'https:' && hostAllowed(url.hostname);
  } catch {
    return false;
  }
}

function cors(origin: string | null) {
  const allowed = trustedOrigin(origin) || 'https://trendypatike.com';
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function text(value: unknown, max = 500) {
  return String(value ?? '').slice(0, max);
}

function boundedTime(value: unknown, fallback: number, now: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(now - 30 * DAY, Math.min(now + MAX_FUTURE_SKEW, n));
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
  if (!trustedOrigin(origin)) {
    return new Response(null, { status: 403, headers: { Vary: 'Origin' } });
  }
  return new Response(null, { status: 204, headers: cors(origin) });
};

export const POST: RequestHandler = async ({ request, platform }) => {
  const origin = request.headers.get('origin');
  if (!sourceAllowed(request)) {
    return json(
      { ok: false, error: 'Storefront source not allowed' },
      { status: 403, headers: cors(origin) }
    );
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
  const startedAt = boundedTime(session.startedAt, now, now);
  const lastSeenAt = Math.max(startedAt, boundedTime(session.lastSeenAt, now, now));

  const statements = [
    db.prepare(`
      INSERT INTO sessions(id,started_at,last_seen_at,landing_path,referrer,utm_source,utm_campaign,fbclid,purchased,revenue)
      VALUES(?1,?2,?3,?4,?5,?6,?7,?8,0,0)
      ON CONFLICT(id) DO UPDATE SET last_seen_at=MAX(sessions.last_seen_at, excluded.last_seen_at)
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
    const ts = Math.max(startedAt, boundedTime(event?.ts, now, now));
    const metaJson = JSON.stringify(safeMeta(type, event?.meta));
    statements.push(
      db.prepare(`
        INSERT INTO events(session_id,type,path,event_ts,meta_json)
        SELECT ?1,?2,?3,?4,?5
        WHERE NOT EXISTS (
          SELECT 1 FROM events
          WHERE session_id=?1 AND type=?2 AND path=?3 AND event_ts=?4
        )
      `).bind(sessionId, type, path, ts, metaJson)
    );
  }

  try {
    const results = await db.batch(statements);
    const accepted = (results.slice(1) as any[]).reduce((sum, result) => sum + Number(result?.meta?.changes || 0), 0);
    return json({ ok: true, accepted }, { headers: cors(origin) });
  } catch (e) {
    console.error('Storefront collector persistence failed', e instanceof Error ? e.message : 'unknown error');
    return json({ ok: false, error: 'Collector persistence failed' }, { status: 500, headers: cors(origin) });
  }
};
