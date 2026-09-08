<script lang="ts">
  export let data: {
    session:{ id:string; startedAt:number; lastSeenAt:number; landingPath:string; referrer:string; utmSource:string; utmCampaign:string; fbclid:string };
    events:{ id:number; type:string; path:string; ts:number; meta:Record<string,unknown> }[];
  };

  const label = (type:string) => ({
    session_start:'Session start',page_view:'Page view',product_view:'Product view',click:'Click',rage_click:'Rage click',scroll_depth:'Scroll',add_to_cart:'Add to cart',checkout_started:'Checkout'
  }[type] || type);
  const delta = (ts:number) => {
    const sec = Math.max(0,Math.round((ts-data.session.startedAt)/1000));
    return sec < 60 ? `+${sec}s` : `+${Math.floor(sec/60)}m ${sec%60}s`;
  };
  const metaText = (event:(typeof data.events)[number]) => {
    if (event.type === 'scroll_depth') return `${event.meta.depth ?? 0}% depth`;
    if (event.type === 'click' || event.type === 'rage_click') return String(event.meta.target || 'page');
    if (event.type === 'product_view') return String(event.meta.handle || '');
    if (event.type === 'add_to_cart' || event.type === 'checkout_started') return String(event.meta.source || '');
    if (event.type === 'session_start') return `${event.meta.device || ''} · ${event.meta.vw || '?'}×${event.meta.vh || '?'}`;
    return '';
  };
</script>

<header>
  <a class="back" href="/sessions">← Sessions</a>
  <div class="eyebrow">SESSION TIMELINE</div>
  <h1>{new Date(data.session.startedAt).toLocaleString('sr-RS')}</h1>
  <p>{data.session.landingPath} · {data.session.utmSource || (data.session.fbclid ? 'facebook' : data.session.referrer ? 'referral' : 'direct')}</p>
</header>

<section class="facts">
  <div><span>Duration</span><b>{Math.max(0,Math.round((data.session.lastSeenAt-data.session.startedAt)/1000))}s</b></div>
  <div><span>Events</span><b>{data.events.length}</b></div>
  <div><span>Campaign</span><b>{data.session.utmCampaign || '—'}</b></div>
  <div><span>Referrer</span><b>{data.session.referrer || '—'}</b></div>
</section>

<section class="panel">
  <div class="timeline">
    {#each data.events as event}
      <article class:hot={event.type==='rage_click'} class:goal={event.type==='add_to_cart' || event.type==='checkout_started'}>
        <div class="time">{delta(event.ts)}</div>
        <div class="dot"></div>
        <div class="body">
          <strong>{label(event.type)}</strong>
          <code>{event.path}</code>
          {#if metaText(event)}<small>{metaText(event)}</small>{/if}
        </div>
      </article>
    {/each}
  </div>
</section>

<section class="privacy">Tracker namerno ne čita input vrednosti, email, telefon, adresu ni tekst koji kupac unosi u forme. Ovo je behavioural timeline, ne snimanje ličnih podataka.</section>

<style>
  header{margin-bottom:22px}.back{display:inline-block;margin-bottom:16px;color:#8bf048;font-size:13px}h1{font-size:30px;margin:4px 0 8px;letter-spacing:-.04em}header p{color:#8f99a8}.eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}.facts{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.facts div,.panel{background:#101318;border:1px solid #20242b;border-radius:16px;padding:16px}.facts span{display:block;color:#7f8997;font-size:11px;margin-bottom:8px}.facts b{font-size:14px;overflow-wrap:anywhere}.panel{padding:20px}.timeline{display:grid}.timeline article{display:grid;grid-template-columns:72px 16px 1fr;gap:12px;min-height:64px}.time{font-size:11px;color:#747e8d;padding-top:3px;text-align:right}.dot{position:relative;width:10px;height:10px;margin-top:3px;border-radius:50%;background:#596372}.dot:after{content:'';position:absolute;top:12px;left:4px;width:1px;height:48px;background:#282e36}.timeline article:last-child .dot:after{display:none}.body{padding-bottom:18px}.body strong{display:block;font-size:14px;margin-bottom:5px}.body code{display:block;color:#aab4c2;font-size:12px;word-break:break-all}.body small{display:block;color:#6f7a88;margin-top:5px}.hot .dot{background:#ff7d70}.hot .body strong{color:#ff9d92}.goal .dot{background:#8bf048}.goal .body strong{color:#a6f187}.privacy{margin-top:12px;padding:14px;border-radius:14px;background:#101a10;border:1px solid #213321;color:#91b985;font-size:12px;line-height:1.5}@media(max-width:800px){.facts{grid-template-columns:repeat(2,1fr)}}
</style>
