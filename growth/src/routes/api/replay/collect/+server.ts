import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const MAX_BODY = 300_000;
const MAX_SESSION_BYTES = 900_000;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function hostAllowed(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  return host === 'trendypatike.com' || host.endsWith('.trendypatike.com') || host.endsWith('.myshopify.com') || host.endsWith('.shopifypreview.com');
}
function trustedOrigin(value: string | null) { if (!value) return null; try { const u=new URL(value); return u.protocol==='https:'&&hostAllowed(u.hostname)?u.origin:null; } catch { return null; } }
function sourceAllowed(request: Request) { if(trustedOrigin(request.headers.get('origin')))return true; try{const u=new URL(request.headers.get('referer')||'');return u.protocol==='https:'&&hostAllowed(u.hostname);}catch{return false;} }
function cors(origin:string|null){return{'Access-Control-Allow-Origin':trustedOrigin(origin)||'https://trendypatike.com','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'86400','Cache-Control':'no-store',Vary:'Origin'};}
function safeId(value:unknown){const id=String(value||'').slice(0,80);return /^[A-Za-z0-9_-]{10,80}$/.test(id)?id:'';}

function sanitizeReplayEvents(value:unknown){
  if(!Array.isArray(value))return[];
  const allowed=new Set(['snapshot','pointer','scroll','click','visibility','viewport','route']);
  const out:any[]=[];
  for(const raw of value.slice(0,220)){
    if(!raw||typeof raw!=='object')continue;
    const r=raw as any,kind=String(r.kind||''),t=Number(r.t||0);if(!allowed.has(kind)||!Number.isFinite(t)||t<=0)continue;
    if(kind==='snapshot'){
      const html=String(r.html||'');if(!html||html.length>240000)continue;
      out.push({kind,t,html,path:String(r.path||'/').slice(0,500),vw:Math.max(1,Math.min(2400,Number(r.vw)||0)),vh:Math.max(1,Math.min(2000,Number(r.vh)||0)),x:Math.max(0,Number(r.x)||0),y:Math.max(0,Number(r.y)||0)});
    }else if(kind==='viewport'){
      out.push({kind,t,vw:Math.max(240,Math.min(2400,Number(r.vw)||0)),vh:Math.max(320,Math.min(2000,Number(r.vh)||0)),dpr:Math.max(1,Math.min(4,Number(r.dpr)||1)),device:String(r.device||'').slice(0,20),path:String(r.path||'/').slice(0,500)});
    }else if(kind==='route'){
      out.push({kind,t,path:String(r.path||'/').slice(0,500)});
    }else if(kind==='pointer'||kind==='click'){
      out.push({kind,t,x:Math.max(0,Math.min(3000,Number(r.x)||0)),y:Math.max(0,Math.min(3000,Number(r.y)||0)),label:kind==='click'?String(r.label||'').slice(0,100):undefined});
    }else if(kind==='scroll')out.push({kind,t,x:Math.max(0,Number(r.x)||0),y:Math.max(0,Number(r.y)||0)});
    else out.push({kind,t,state:String(r.state||'').slice(0,20)});
  }
  return out;
}

export const OPTIONS:RequestHandler=async({request})=>{const origin=request.headers.get('origin');if(!trustedOrigin(origin))return new Response(null,{status:403,headers:{Vary:'Origin','Cache-Control':'no-store'}});return new Response(null,{status:204,headers:cors(origin)});};
export const POST:RequestHandler=async({request,platform})=>{
  const origin=request.headers.get('origin');if(!sourceAllowed(request))return json({ok:false,error:'Storefront source not allowed'},{status:403,headers:cors(origin)});
  const db=platform?.env?.DB;if(!db)return json({ok:false,error:'Database unavailable'},{status:503,headers:cors(origin)});
  let raw='';try{raw=await request.text();if(raw.length>MAX_BODY)throw new Error();}catch{return json({ok:false,error:'Replay payload too large'},{status:413,headers:cors(origin)});}
  let body:any;try{body=JSON.parse(raw);}catch{return json({ok:false,error:'Invalid replay payload'},{status:400,headers:cors(origin)});}
  const sessionId=safeId(body?.sessionId);if(!sessionId)return json({ok:false,error:'Invalid session id'},{status:400,headers:cors(origin)});
  const events=sanitizeReplayEvents(body?.events);if(!events.length)return json({ok:true,accepted:0},{headers:cors(origin)});
  const dataJson=JSON.stringify(events),bytes=new TextEncoder().encode(dataJson).length,seq=Math.max(1,Math.floor(Number(body?.seq||events[0]?.t||Date.now()))),startedAt=Math.min(...events.map(e=>Number(e.t||Date.now()))),endedAt=Math.max(...events.map(e=>Number(e.t||startedAt)));
  const existing=await db.prepare('SELECT COALESCE(SUM(bytes),0) AS bytes FROM replay_chunks WHERE session_id=?1').bind(sessionId).first<{bytes:number}>();
  if(Number(existing?.bytes||0)+bytes>MAX_SESSION_BYTES)return json({ok:true,accepted:0,capped:true,limitBytes:MAX_SESSION_BYTES},{headers:cors(origin)});
  await db.prepare(`INSERT INTO replay_chunks(session_id,seq,started_at,ended_at,data_json,bytes,created_at) VALUES(?1,?2,?3,?4,?5,?6,?7) ON CONFLICT(session_id,seq) DO NOTHING`).bind(sessionId,seq,startedAt,endedAt,dataJson,bytes,Date.now()).run();
  if(Math.random()<0.08)await db.prepare('DELETE FROM replay_chunks WHERE created_at < ?1').bind(Date.now()-RETENTION_MS).run().catch(()=>{});
  return json({ok:true,accepted:events.length,bytes,capped:false},{headers:cors(origin)});
};
