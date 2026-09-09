import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const ALLOWED_TYPES = new Set([
  'session_start','page_view','product_view','click','rage_click','dead_click','scroll_depth',
  'add_to_cart','cart_view','checkout_started','heartbeat','page_exit'
]);

const DAY = 24 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW = 5 * 60 * 1000;
const BEACON_SITE = 'tp_20260909';
const COLLECTOR_VERSION = '2026-09-09.4';
const GIF = new Uint8Array([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]);

function hostAllowed(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === 'trendypatike.com' || host.endsWith('.trendypatike.com') || host.endsWith('.myshopify.com') || host.endsWith('.shopifypreview.com');
}
function trustedOrigin(value: string | null) {
  if (!value) return null;
  try { const url = new URL(value); if (url.protocol === 'https:' && hostAllowed(url.hostname)) return url.origin; } catch {}
  return null;
}
function sourceAllowed(request: Request) {
  if (trustedOrigin(request.headers.get('origin'))) return true;
  const referer = request.headers.get('referer');
  if (!referer) return false;
  try { const url = new URL(referer); return url.protocol === 'https:' && hostAllowed(url.hostname); } catch { return false; }
}
function beaconSourceAllowed(request: Request, url: URL) {
  if (sourceAllowed(request)) return true;
  if (url.searchParams.get('site') !== BEACON_SITE) return false;
  const dest = request.headers.get('sec-fetch-dest');
  return !dest || dest === 'image' || dest === 'empty';
}
function cors(origin: string | null) {
  return {
    'Access-Control-Allow-Origin': trustedOrigin(origin) || 'https://trendypatike.com',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Cache-Control': 'no-store',
    Vary: 'Origin'
  };
}
function text(value: unknown, max = 500) { return String(value ?? '').slice(0, max); }
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
    number('vw',0,10000); number('vh',0,10000); number('screenW',0,10000); number('screenH',0,10000);
    out.device = text(meta.device,30); out.lang = text(meta.lang,20);
  } else if (type === 'click' || type === 'rage_click' || type === 'dead_click') {
    number('xPct',0,100); number('yPct',0,100); number('docYPct',0,100);
    out.target = text(meta.target,120); out.label = text(meta.label,100); out.href = text(meta.href,300);
  } else if (type === 'scroll_depth') {
    number('depth',0,100);
  } else if (type === 'add_to_cart' || type === 'cart_view' || type === 'checkout_started') {
    out.source = text(meta.source,100); out.product = text(meta.product,160);
  } else if (type === 'product_view') {
    out.handle = text(meta.handle,160);
  } else if (type === 'heartbeat' || type === 'page_exit') {
    number('activeMs',0,60*60*1000); number('visibleMs',0,60*60*1000); number('maxScroll',0,100);
    out.reason = text(meta.reason,40);
  }
  return out;
}

async function persist(db: any, body: any) {
  const sessionId = text(body?.sessionId,80);
  if (!/^[A-Za-z0-9_-]{10,80}$/.test(sessionId)) return { ok:false as const,status:400,error:'Invalid session id' };
  const session = body?.session && typeof body.session === 'object' ? body.session : {};
  const now = Date.now();
  const startedAt = boundedTime(session.startedAt,now,now);
  const lastSeenAt = Math.max(startedAt,boundedTime(session.lastSeenAt,now,now));

  const statements = [db.prepare(`
    INSERT INTO sessions(id,started_at,last_seen_at,landing_path,referrer,utm_source,utm_campaign,fbclid,purchased,revenue)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,0,0)
    ON CONFLICT(id) DO UPDATE SET
      last_seen_at=MAX(sessions.last_seen_at,excluded.last_seen_at),
      landing_path=CASE WHEN sessions.landing_path IS NULL OR sessions.landing_path='' THEN excluded.landing_path ELSE sessions.landing_path END,
      referrer=CASE WHEN sessions.referrer IS NULL OR sessions.referrer='' THEN excluded.referrer ELSE sessions.referrer END,
      utm_source=CASE WHEN sessions.utm_source IS NULL OR sessions.utm_source='' THEN excluded.utm_source ELSE sessions.utm_source END,
      utm_campaign=CASE WHEN sessions.utm_campaign IS NULL OR sessions.utm_campaign='' THEN excluded.utm_campaign ELSE sessions.utm_campaign END,
      fbclid=CASE WHEN sessions.fbclid IS NULL OR sessions.fbclid='' THEN excluded.fbclid ELSE sessions.fbclid END
  `).bind(sessionId,startedAt,lastSeenAt,text(session.landingPath,500)||'/',text(session.referrer,500),text(session.utmSource,120),text(session.utmCampaign,180),text(session.fbclid,300))];

  const events = Array.isArray(body?.events) ? body.events.slice(0,40) : [];
  for (const event of events) {
    const type = text(event?.type,40);
    if (!ALLOWED_TYPES.has(type)) continue;
    const path = text(event?.path,500) || '/';
    const ts = Math.max(startedAt,boundedTime(event?.ts,now,now));
    statements.push(db.prepare(`
      INSERT INTO events(session_id,type,path,event_ts,meta_json)
      SELECT ?1,?2,?3,?4,?5
      WHERE NOT EXISTS (SELECT 1 FROM events WHERE session_id=?1 AND type=?2 AND path=?3 AND event_ts=?4)
    `).bind(sessionId,type,path,ts,JSON.stringify(safeMeta(type,event?.meta))));
  }

  try {
    const results = await db.batch(statements);
    const accepted = (results.slice(1) as any[]).reduce((sum,result)=>sum+Number(result?.meta?.changes||0),0);
    return { ok:true as const,accepted };
  } catch (e) {
    console.error('Storefront collector persistence failed',e instanceof Error?e.message:'unknown error');
    return { ok:false as const,status:500,error:'Collector persistence failed' };
  }
}
function gifResponse() {
  return new Response(GIF,{status:200,headers:{'Content-Type':'image/gif','Cache-Control':'no-store, max-age=0','Cross-Origin-Resource-Policy':'cross-origin'}});
}

export const OPTIONS: RequestHandler = async ({ request }) => {
  const origin=request.headers.get('origin');
  if(!trustedOrigin(origin)) return new Response(null,{status:403,headers:{Vary:'Origin','Cache-Control':'no-store'}});
  return new Response(null,{status:204,headers:cors(origin)});
};
export const GET: RequestHandler = async ({ request,platform,url }) => {
  const db=platform?.env?.DB;
  if(url.searchParams.get('health')==='1') {
    if(!db) return json({ok:false,db:false,version:COLLECTOR_VERSION},{status:503,headers:{'Cache-Control':'no-store'}});
    try { await db.prepare('SELECT 1').first(); return json({ok:true,db:true,version:COLLECTOR_VERSION},{headers:{'Cache-Control':'no-store'}}); }
    catch { return json({ok:false,db:false,version:COLLECTOR_VERSION},{status:503,headers:{'Cache-Control':'no-store'}}); }
  }
  if(!db||!beaconSourceAllowed(request,url)) return gifResponse();
  let meta:Record<string,unknown>={};
  try { const raw=url.searchParams.get('m')||'{}'; if(raw.length<=1800) meta=JSON.parse(raw); } catch {}
  await persist(db,{sessionId:url.searchParams.get('sid')||'',session:{startedAt:url.searchParams.get('st'),lastSeenAt:url.searchParams.get('ls'),landingPath:url.searchParams.get('lp')||'/',referrer:url.searchParams.get('rf')||'',utmSource:url.searchParams.get('us')||'',utmCampaign:url.searchParams.get('uc')||'',fbclid:url.searchParams.get('fb')||''},events:[{type:url.searchParams.get('t')||'',path:url.searchParams.get('p')||'/',ts:url.searchParams.get('ts'),meta}]});
  return gifResponse();
};
export const POST: RequestHandler = async ({ request,platform }) => {
  const origin=request.headers.get('origin');
  if(!sourceAllowed(request)) return json({ok:false,error:'Storefront source not allowed'},{status:403,headers:cors(origin)});
  const db=platform?.env?.DB;
  if(!db) return json({ok:false,error:'Database unavailable'},{status:503,headers:cors(origin)});
  let body:any;
  try { const raw=await request.text(); if(raw.length>50000) throw new Error('payload too large'); body=JSON.parse(raw); }
  catch { return json({ok:false,error:'Invalid payload'},{status:400,headers:cors(origin)}); }
  const result=await persist(db,body);
  if(!result.ok) return json({ok:false,error:result.error},{status:result.status,headers:cors(origin)});
  return json({ok:true,accepted:result.accepted,version:COLLECTOR_VERSION},{headers:cors(origin)});
};
