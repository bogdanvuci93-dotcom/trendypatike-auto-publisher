<script lang="ts">
  export let data: {
    session:{id:string;startedAt:number;lastSeenAt:number;landingPath:string;referrer:string;utmSource:string;utmCampaign:string;fbclid:string};
    events:{id:number;type:string;path:string;ts:number;meta:Record<string,unknown>}[];
    journey:{path:string;activeMs:number;visibleMs:number;maxScroll:number;clicks:number;rage:number;dead:number;atc:number;checkout:number}[];
    lastPath:string;exitStage:string;likelyReason:string;summary:{productViews:number;atc:number;checkout:number;rage:number;dead:number};
    replay:{available:boolean;chunks:number;bytes:number};
  };
  const label=(type:string)=>({session_start:'Session start',page_view:'Page view',product_view:'Product view',click:'Click',rage_click:'Rage click',dead_click:'Dead click',scroll_depth:'Scroll',add_to_cart:'Add to cart',cart_view:'Cart view',checkout_started:'Checkout',heartbeat:'Active',page_exit:'Page exit'}[type]||type);
  const delta=(ts:number)=>{const sec=Math.max(0,Math.round((ts-data.session.startedAt)/1000));return sec<60?`+${sec}s`:`+${Math.floor(sec/60)}m ${sec%60}s`;};
  const dur=(ms:number)=>{const sec=Math.round(ms/1000);return sec<60?`${sec}s`:`${Math.floor(sec/60)}m ${sec%60}s`;};
  const metaText=(event:(typeof data.events)[number])=>{
    if(event.type==='scroll_depth')return `${event.meta.depth??0}% depth`;
    if(['click','rage_click','dead_click'].includes(event.type))return `${event.meta.label||event.meta.target||'page'}${event.meta.href?' → '+event.meta.href:''}`;
    if(event.type==='product_view')return String(event.meta.handle||'');
    if(['add_to_cart','cart_view','checkout_started'].includes(event.type))return String(event.meta.source||'');
    if(event.type==='page_exit'||event.type==='heartbeat')return `${dur(Number(event.meta.activeMs||0))} active · ${event.meta.maxScroll||0}% scroll`;
    if(event.type==='session_start')return `${event.meta.device||''} · ${event.meta.vw||'?'}×${event.meta.vh||'?'}`;
    return '';
  };
</script>

<header><a class="back" href="/sessions">← Sessions</a><div class="eyebrow">CUSTOMER JOURNEY</div><div class="title-row"><div><h1>{new Date(data.session.startedAt).toLocaleString('sr-RS')}</h1><p>{data.session.landingPath} · {data.session.utmSource||(data.session.fbclid?'facebook':data.session.referrer?'referral':'direct')}</p></div>{#if data.replay.available}<a class="replay" href={`/sessions/${data.session.id}/replay`}>▶ Pusti pravi replay</a>{:else}<span class="waiting">Replay se snima za nove sesije</span>{/if}</div></header>

<section class="facts"><div><span>Session length</span><b>{dur(Math.max(0,data.session.lastSeenAt-data.session.startedAt))}</b></div><div><span>Exit stage</span><b>{data.exitStage}</b></div><div><span>Last page</span><b>{data.lastPath}</b></div><div><span>Issues</span><b>{data.summary.rage} rage · {data.summary.dead} dead</b></div></section>

<section class="reason"><div class="eyebrow">LIKELY ABANDONMENT SIGNAL</div><b>{data.likelyReason}</b><small>Ovo je zaključak iz ponašanja, ne tvrdnja o tome šta je kupac mislio.</small></section>

<section class="panel"><div class="head"><div class="eyebrow">PAGE-BY-PAGE</div><h2>Gde se zadržao i dokle je stigao</h2></div><div class="journey">{#each data.journey as p}<article><a href={`https://trendypatike.com${p.path}`} target="_blank" rel="noreferrer">{p.path}</a><div class="stats"><span><b>{dur(p.activeMs)}</b> active</span><span><b>{p.maxScroll}%</b> scroll</span><span><b>{p.clicks}</b> clicks</span><span><b>{p.atc}</b> ATC</span><span><b>{p.checkout}</b> checkout</span></div>{#if p.rage+p.dead>0}<small class="problem">{p.rage} rage · {p.dead} dead clicks</small>{/if}</article>{/each}</div></section>

<section class="panel"><div class="head"><div class="eyebrow">FULL TIMELINE</div><h2>Šta je radio redom</h2></div><div class="timeline">{#each data.events as event}<article class:hot={event.type==='rage_click'||event.type==='dead_click'} class:goal={event.type==='add_to_cart'||event.type==='checkout_started'}><div class="time">{delta(event.ts)}</div><div class="dot"></div><div class="body"><strong>{label(event.type)}</strong><code>{event.path}</code>{#if metaText(event)}<small>{metaText(event)}</small>{/if}</div></article>{/each}</div></section>

<section class="privacy">Replay je privacy-masked: ne čuvamo input vrednosti, email, telefon, adresu, textarea ni contenteditable sadržaj.</section>

<style>
  header{margin-bottom:22px}.back{display:inline-block;margin-bottom:16px;color:#8bf048;font-size:13px}.title-row{display:flex;justify-content:space-between;align-items:end;gap:18px}h1{font-size:30px;margin:4px 0 8px;letter-spacing:-.04em}h2{font-size:19px;margin:4px 0 0}header p{color:#8f99a8}.replay{display:inline-block;background:#8bf048;color:#0b1408;font-weight:900;border-radius:11px;padding:12px 16px;white-space:nowrap}.waiting{font-size:11px;color:#7f8997;background:#11151a;border:1px solid #232933;padding:10px 12px;border-radius:10px}.eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.facts div,.panel{background:#101318;border:1px solid #20242b;border-radius:16px;padding:16px}.facts span{display:block;color:#7f8997;font-size:11px;margin-bottom:8px}.facts b{font-size:13px;overflow-wrap:anywhere}.reason{margin-bottom:12px;padding:16px;border-radius:16px;background:#231d10;border:1px solid #493b17;color:#f0d47f}.reason b{display:block;margin-top:8px;line-height:1.5}.reason small{display:block;color:#a99460;margin-top:7px}.panel{padding:20px;margin-bottom:12px}.head{margin-bottom:14px}.journey{display:grid;gap:8px}.journey article{padding:14px;border:1px solid #20262d;border-radius:12px;background:#0b0e12}.journey a{color:#d7dee8;font-weight:800;text-decoration:none}.stats{display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;color:#7f8997;font-size:11px}.stats b{color:#f3f5f8}.problem{display:block;color:#ff9c91;margin-top:8px}.timeline{display:grid}.timeline article{display:grid;grid-template-columns:72px 16px 1fr;gap:12px;min-height:64px}.time{font-size:11px;color:#747e8d;padding-top:3px;text-align:right}.dot{position:relative;width:10px;height:10px;margin-top:3px;border-radius:50%;background:#596372}.dot:after{content:'';position:absolute;top:12px;left:4px;width:1px;height:48px;background:#282e36}.timeline article:last-child .dot:after{display:none}.body{padding-bottom:18px}.body strong{display:block;font-size:14px;margin-bottom:5px}.body code{display:block;color:#aab4c2;font-size:12px;word-break:break-all}.body small{display:block;color:#6f7a88;margin-top:5px}.hot .dot{background:#ff7d70}.hot .body strong{color:#ff9d92}.goal .dot{background:#8bf048}.goal .body strong{color:#a6f187}.privacy{margin-top:12px;padding:14px;border-radius:14px;background:#101a10;border:1px solid #213321;color:#91b985;font-size:12px;line-height:1.5}@media(max-width:800px){.title-row{display:block}.replay,.waiting{display:inline-block;margin-top:12px}.facts{grid-template-columns:repeat(2,1fr)}}
</style>
