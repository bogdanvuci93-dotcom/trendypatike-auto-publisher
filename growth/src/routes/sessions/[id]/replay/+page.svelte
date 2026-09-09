<script lang="ts">
  import { onMount } from 'svelte';

  type ReplayEvent = { kind:string;t:number;html?:string;path?:string;vw?:number;vh?:number;x?:number;y?:number;label?:string;state?:string };
  export let data: { session:{id:string;startedAt:number;lastSeenAt:number;landingPath:string;utmSource:string;utmCampaign:string;fbclid:string}; events:ReplayEvent[]; bytes:number; chunks:number };

  let frame: HTMLIFrameElement;
  let playing = false;
  let speed = 1;
  let elapsed = 0;
  let duration = 0;
  let cursorX = 0;
  let cursorY = 0;
  let cursorVisible = false;
  let clickPulse = false;
  let currentPath = data.session.landingPath;
  let viewportW = 1366;
  let viewportH = 768;
  let index = 0;
  let startedWall = 0;
  let startedElapsed = 0;
  let raf = 0;

  const firstT = data.events[0]?.t || data.session.startedAt;
  const lastT = data.events[data.events.length-1]?.t || data.session.lastSeenAt || firstT;
  duration = Math.max(0, lastT - firstT);

  const fmt = (ms:number) => {
    const s=Math.max(0,Math.round(ms/1000));
    return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  };

  function decorateSnapshot(html:string) {
    const inject = `<base href="https://trendypatike.com/"><meta name="robots" content="noindex,nofollow"><style id="tp-replay-lock">html{scroll-behavior:auto!important}body{pointer-events:none!important}input,textarea,select{color:transparent!important;text-shadow:none!important}</style>`;
    return html.includes('<head>') ? html.replace('<head>', `<head>${inject}`) : inject + html;
  }

  function showSnapshot(ev:ReplayEvent) {
    if (!frame || !ev.html) return;
    currentPath = ev.path || currentPath;
    viewportW = Math.max(240, Number(ev.vw || viewportW));
    viewportH = Math.max(320, Number(ev.vh || viewportH));
    frame.srcdoc = decorateSnapshot(ev.html);
    frame.onload = () => {
      try { frame.contentWindow?.scrollTo(Number(ev.x||0), Number(ev.y||0)); } catch {}
    };
  }

  function apply(ev:ReplayEvent) {
    if (ev.kind==='snapshot') showSnapshot(ev);
    if (ev.kind==='pointer') { cursorX=Number(ev.x||0); cursorY=Number(ev.y||0); cursorVisible=true; }
    if (ev.kind==='scroll') { try { frame?.contentWindow?.scrollTo(Number(ev.x||0),Number(ev.y||0)); } catch {} }
    if (ev.kind==='click') {
      cursorX=Number(ev.x||0); cursorY=Number(ev.y||0); cursorVisible=true; clickPulse=false;
      requestAnimationFrame(()=>{clickPulse=true;setTimeout(()=>clickPulse=false,450);});
    }
  }

  function resetTo(ms:number) {
    elapsed=Math.max(0,Math.min(duration,ms));
    index=0; cursorVisible=false; currentPath=data.session.landingPath;
    let snapIndex=-1;
    for(let i=0;i<data.events.length;i++){
      const rel=Number(data.events[i].t||firstT)-firstT;
      if(rel<=elapsed&&data.events[i].kind==='snapshot') snapIndex=i;
      if(rel>elapsed) break;
    }
    if(snapIndex>=0){showSnapshot(data.events[snapIndex]);index=snapIndex+1;}
    while(index<data.events.length){const rel=Number(data.events[index].t||firstT)-firstT;if(rel>elapsed)break;apply(data.events[index]);index++;}
  }

  function loop(now:number) {
    if(!playing)return;
    elapsed=Math.min(duration,startedElapsed+(now-startedWall)*speed);
    while(index<data.events.length){const rel=Number(data.events[index].t||firstT)-firstT;if(rel>elapsed)break;apply(data.events[index]);index++;}
    if(elapsed>=duration){playing=false;return;}
    raf=requestAnimationFrame(loop);
  }

  function togglePlay(){
    if(!data.events.length)return;
    if(elapsed>=duration)resetTo(0);
    playing=!playing;
    if(playing){startedWall=performance.now();startedElapsed=elapsed;raf=requestAnimationFrame(loop);}else cancelAnimationFrame(raf);
  }

  function seek(value:number){playing=false;cancelAnimationFrame(raf);resetTo(value);}
  function setSpeed(v:number){speed=v;if(playing){startedWall=performance.now();startedElapsed=elapsed;}}

  onMount(()=>{if(data.events.length)resetTo(0);return()=>cancelAnimationFrame(raf);});
</script>

<header>
  <a class="back" href={`/sessions/${data.session.id}`}>← Nazad na detalje sesije</a>
  <div class="eyebrow">VISUAL SESSION REPLAY · PRIVACY MASKED</div>
  <h1>Replay kupca</h1>
  <p>{new Date(data.session.startedAt).toLocaleString('sr-RS')} · {data.session.utmSource || (data.session.fbclid ? 'facebook' : 'direct')} · {currentPath}</p>
</header>

{#if !data.events.length}
  <section class="empty"><h2>Nema replay snimka za ovu sesiju</h2><p>Replay počinje da se snima tek od novog tracker deploymenta. Stare sesije ne mogu retroaktivno da se pretvore u video.</p></section>
{:else}
  <section class="player">
    <div class="toolbar">
      <button on:click={togglePlay}>{playing ? '❚❚ Pauza' : '▶ Pusti'}</button>
      <strong>{fmt(elapsed)} / {fmt(duration)}</strong>
      <input aria-label="Replay position" type="range" min="0" max={Math.max(1,duration)} step="100" value={elapsed} on:input={(e)=>seek(Number((e.currentTarget as HTMLInputElement).value))} />
      <div class="speeds">{#each [0.5,1,2,4] as s}<button class:active={speed===s} on:click={()=>setSpeed(s)}>{s}×</button>{/each}</div>
    </div>

    <div class="meta"><span><b>{data.events.length}</b> replay signala</span><span><b>{data.chunks}</b> paketa</span><span><b>{Math.round(data.bytes/1024)} KB</b> snimka</span><span><b>{viewportW}×{viewportH}</b> viewport</span></div>

    <div class="stage-wrap">
      <div class="stage" style={`width:${viewportW}px;height:${viewportH}px`}>
        <iframe bind:this={frame} title="Session replay" sandbox="allow-same-origin"></iframe>
        {#if cursorVisible}<div class:clicking={clickPulse} class="cursor" style={`transform:translate(${cursorX}px,${cursorY}px)`}><i></i></div>{/if}
        {#if clickPulse}<div class="pulse" style={`left:${cursorX}px;top:${cursorY}px`}></div>{/if}
      </div>
    </div>
  </section>

  <section class="privacy"><b>Privatnost:</b> input vrednosti, email, telefon, adresa, textarea i contenteditable sadržaj se brišu pre snimanja. Replay čuva vizuelni DOM, scroll, kursor i klikove; skripte se ne izvršavaju u playeru. Snimci imaju hard storage limit i automatsko zadržavanje.</section>
{/if}

<style>
  header{margin-bottom:18px}.back{display:inline-block;color:#8bf048;font-size:12px;margin-bottom:12px}.eyebrow{font-size:10px;color:#7e8897;font-weight:900;letter-spacing:.12em}h1{font-size:34px;margin:4px 0 6px;letter-spacing:-.04em}header p{color:#8f99a8;margin:0}.player{background:#101318;border:1px solid #20242b;border-radius:18px;padding:16px}.toolbar{display:grid;grid-template-columns:auto auto 1fr auto;align-items:center;gap:12px;margin-bottom:10px}.toolbar>button{border:0;border-radius:9px;background:#8bf048;color:#091008;font-weight:900;padding:10px 14px;cursor:pointer}.toolbar strong{font-size:12px;color:#aeb7c3}.toolbar input{width:100%}.speeds{display:flex;gap:5px}.speeds button{border:1px solid #29303a;background:#0b0e12;color:#8d98a6;border-radius:8px;padding:7px 9px;cursor:pointer}.speeds button.active{color:#caffb1;border-color:#426735;background:#132012}.meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}.meta span{font-size:10px;color:#7f8997;background:#0b0e12;border:1px solid #1f252d;padding:7px 9px;border-radius:99px}.meta b{color:#e8edf4}.stage-wrap{overflow:auto;max-height:72vh;background:#050608;border-radius:14px;border:1px solid #20242b;padding:12px}.stage{position:relative;flex:none;background:#fff;overflow:hidden;margin:0 auto;box-shadow:0 12px 50px rgba(0,0,0,.35)}iframe{width:100%;height:100%;border:0;background:white;display:block}.cursor{position:absolute;left:0;top:0;width:18px;height:18px;pointer-events:none;z-index:20;transition:transform .08s linear}.cursor:before{content:'';position:absolute;width:13px;height:18px;background:#111;clip-path:polygon(0 0,100% 67%,57% 72%,78% 100%,62% 100%,43% 76%,10% 100%)}.cursor i{display:none}.pulse{position:absolute;width:34px;height:34px;border-radius:50%;border:3px solid #8bf048;transform:translate(-17px,-17px);z-index:19;pointer-events:none;animation:pulse .45s ease-out forwards}.privacy,.empty{margin-top:12px;padding:14px;border-radius:14px;background:#101a10;border:1px solid #213321;color:#9bc88d;font-size:12px;line-height:1.55}.empty h2{margin-top:0;color:#eef4eb}.empty p{margin-bottom:0}@keyframes pulse{from{opacity:1;transform:translate(-17px,-17px) scale(.4)}to{opacity:0;transform:translate(-17px,-17px) scale(1.4)}}@media(max-width:850px){.toolbar{grid-template-columns:1fr 1fr}.toolbar input{grid-column:1/-1}.stage-wrap{padding:6px}}
</style>
