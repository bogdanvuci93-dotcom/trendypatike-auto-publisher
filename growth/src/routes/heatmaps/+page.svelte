<script lang="ts">
  import { onDestroy } from 'svelte';

  type ClickPoint = { x:number;y:number;rage:boolean;dead:boolean;target:string;label:string;href:string;sessionId:string;vw:number;vh:number;device:string };
  type PageRow = {
    path:string;
    clicks:ClickPoint[];
    scrolls:number[];
    totalClicks:number;
    rageClicks:number;
    deadClicks:number;
    avgScroll:number;
    maxScroll:number;
    targets:{target:string;label:string;href:string;clicks:number;rage:number;dead:number}[];
    defaultDevice:string;
    snapshotWidth:number;
    snapshotHeight:number;
    devices:{device:string;sessions:number}[];
  };

  export let data: { pages:PageRow[] };

  let selected = data.pages[0]?.path || '';
  let frame: HTMLIFrameElement | null = null;
  let resizeObserver: ResizeObserver | null = null;
  let timers:number[] = [];
  let stageHeight = 900;
  let snapshotNonce = 0;

  $: page = data.pages.find((p)=>p.path===selected) || data.pages[0];
  $: liveUrl = page ? `https://trendypatike.com${page.path}` : 'https://trendypatike.com';
  $: snapshotSrc = page ? `/heatmaps/snapshot?path=${encodeURIComponent(page.path)}&r=${snapshotNonce}` : '';
  $: sameLayoutClicks = page ? page.clicks.filter((p)=>p.device===page.defaultDevice || p.device==='unknown') : [];
  $: plottedClicks = sameLayoutClicks.length ? sameLayoutClicks : (page?.clicks || []);
  $: hiddenSignals = page ? Math.max(0,page.clicks.length-plottedClicks.length) : 0;
  $: if (page) stageHeight = Math.max(650,Math.min(1600,page.snapshotHeight*1.2));

  function clearFrameWatchers() {
    resizeObserver?.disconnect();
    resizeObserver = null;
    for (const id of timers) window.clearTimeout(id);
    timers = [];
  }

  function syncFrameHeight() {
    try {
      const doc = frame?.contentDocument;
      if (!doc) return;
      const height = Math.max(
        doc.documentElement?.scrollHeight || 0,
        doc.body?.scrollHeight || 0,
        page?.snapshotHeight || 650
      );
      if (height > 0) stageHeight = Math.max(650,Math.min(24000,height));
    } catch {
      // The snapshot route is same-origin. If a browser blocks inspection,
      // keep the recorded viewport fallback instead of breaking the page.
    }
  }

  function frameLoaded() {
    clearFrameWatchers();
    syncFrameHeight();
    timers.push(window.setTimeout(syncFrameHeight,350));
    timers.push(window.setTimeout(syncFrameHeight,1200));
    timers.push(window.setTimeout(syncFrameHeight,2500));
    try {
      const root = frame?.contentDocument?.documentElement;
      if (root && typeof ResizeObserver !== 'undefined') {
        resizeObserver = new ResizeObserver(syncFrameHeight);
        resizeObserver.observe(root);
      }
    } catch {}
  }

  function refreshSnapshot() {
    clearFrameWatchers();
    snapshotNonce += 1;
  }

  onDestroy(clearFrameWatchers);
</script>

<header>
  <div class="eyebrow">STOREFRONT · 7 DAYS</div>
  <h1>Heatmaps</h1>
  <p>Prava trenutna stranica sa klikovima nacrtanim direktno preko mesta na kojima su kupci kliknuli.</p>
</header>

{#if data.pages.length}
  <section class="controls">
    <label for="heatmap-page">Page</label>
    <select id="heatmap-page" bind:value={selected}>{#each data.pages as p}<option value={p.path}>{p.path} · {p.totalClicks} clicks</option>{/each}</select>
    <button type="button" class="refresh" on:click={refreshSnapshot}>Refresh snapshot</button>
    <a class="open" href={liveUrl} target="_blank" rel="noreferrer">Open original ↗</a>
  </section>

  {#if page}
    <section class="metrics">
      <div><span>Clicks</span><b>{page.totalClicks}</b></div>
      <div><span>Rage clicks</span><b>{page.rageClicks}</b></div>
      <div><span>Dead clicks</span><b>{page.deadClicks}</b></div>
      <div><span>Avg. max scroll</span><b>{page.avgScroll.toFixed(0)}%</b></div>
    </section>

    <div class="grid">
      <section class="panel snapshot-panel">
        <div class="head">
          <div>
            <div class="eyebrow">LIVE PAGE HEATMAP</div>
            <h2>{page.path}</h2>
            <small>{page.defaultDevice} layout · recorded viewport ≈ {page.snapshotWidth}×{page.snapshotHeight}px</small>
          </div>
          <small>{plottedClicks.length} plotted signals{hiddenSignals ? ` · ${hiddenSignals} other-device signals hidden` : ''}</small>
        </div>

        <div class="snapshot-scroll">
          <div class="snapshot-stage" style={`width:${page.snapshotWidth}px;height:${stageHeight}px;`}>
            <iframe
              bind:this={frame}
              src={snapshotSrc}
              title={`Storefront snapshot ${page.path}`}
              scrolling="no"
              on:load={frameLoaded}
            ></iframe>
            <div class="overlay" aria-label="Heatmap click overlay">
              {#each plottedClicks as point}
                <span
                  class:rage={point.rage}
                  class:dead={point.dead}
                  title={`${point.label || point.target || 'click'}${point.href ? ` → ${point.href}` : ''}`}
                  style={`left:${point.x}%;top:${point.y}%;`}
                ></span>
              {/each}
            </div>
          </div>
        </div>

        <div class="snapshot-note">
          Ovo nije prazan grafikon: ispod tačaka je HTML/CSS snapshot trenutno live TrendyPatike stranice. Snapshot je namerno neaktivan, pa klik u njemu ne može da doda proizvod u korpu niti da utiče na analitiku. Ako se tema promeni nakon posete kupca, stari klik može malo odstupati od sadašnjeg elementa.
        </div>
      </section>

      <section class="panel side">
        <div class="eyebrow">SCROLL DEPTH</div><h2>Dubina stranice</h2>
        {#each [25,50,75,90,100] as mark}
          {@const count = page.scrolls.filter((d)=>d>=mark).length}
          <div class="scroll-row"><span>{mark}%</span><div><i style={`width:${page.scrolls.length ? Math.min(100,(count/page.scrolls.length)*100) : 0}%`}></i></div><b>{count}</b></div>
        {/each}
        <div class="note"><b>Marker boje:</b><br>narandžasto = običan klik<br>crveno = rage click<br>ljubičasti prsten = dead click.<br><br>Za tačno poravnanje prikazujemo raspored uređaja sa najviše zabeleženih sesija na toj stranici.</div>
      </section>
    </div>

    <section class="panel targets">
      <div class="head"><div><div class="eyebrow">EXACT ELEMENTS</div><h2>Na šta kupci stvarno klikću</h2></div></div>
      {#if page.targets.length}
        <div class="table-wrap"><table><thead><tr><th>Element / label</th><th>Target</th><th>Destination</th><th>Clicks</th><th>Rage</th><th>Dead</th></tr></thead><tbody>
          {#each page.targets as t}<tr><td><strong>{t.label || '—'}</strong></td><td><code>{t.target || '—'}</code></td><td><code>{t.href || '—'}</code></td><td>{t.clicks}</td><td class:bad={t.rage>0}>{t.rage}</td><td class:bad={t.dead>0}>{t.dead}</td></tr>{/each}
        </tbody></table></div>
      {:else}<div class="empty">Još nema click signala za ovu stranicu.</div>{/if}
    </section>
  {/if}
{:else}
  <div class="empty">Još nema click/scroll podataka.</div>
{/if}

<style>
  header{margin-bottom:22px}h1{font-size:34px;margin:4px 0 8px;letter-spacing:-.04em}h2{font-size:19px;margin:4px 0 2px;word-break:break-all}header p{color:#8f99a8}.eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}.controls{display:flex;gap:10px;align-items:center;margin-bottom:12px;flex-wrap:wrap}.controls label{font-size:12px;color:#8f99a8}.controls select{min-width:360px;max-width:58vw;background:#101318;color:#f4f7fb;border:1px solid #262c34;border-radius:11px;padding:10px 12px}.open,.refresh{padding:10px 13px;border-radius:10px;background:#8bf048;color:#0b1408;font-weight:900;text-decoration:none;font-size:12px;border:0;cursor:pointer}.refresh{background:#20262d;color:#dce3ec}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.metrics div,.panel{background:#101318;border:1px solid #20242b;border-radius:16px;padding:16px}.metrics span{display:block;color:#7f8997;font-size:11px;margin-bottom:8px}.metrics b{font-size:20px}.grid{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(260px,.45fr);gap:12px}.panel{padding:20px}.head{display:flex;justify-content:space-between;gap:16px;align-items:end;margin-bottom:14px}.head small{color:#737d8b;font-size:11px}.snapshot-panel{min-width:0}.snapshot-scroll{overflow:auto;max-width:100%;border:1px solid #20262e;border-radius:14px;background:#080a0d}.snapshot-stage{position:relative;max-width:none;background:white;overflow:hidden}.snapshot-stage iframe{position:absolute;inset:0;width:100%;height:100%;border:0;background:white;pointer-events:none}.overlay{position:absolute;inset:0;z-index:4;pointer-events:none}.overlay span{position:absolute;width:20px;height:20px;border-radius:50%;background:rgba(255,174,48,.78);box-shadow:0 0 0 7px rgba(255,174,48,.2),0 1px 5px rgba(0,0,0,.5);transform:translate(-50%,-50%);pointer-events:auto}.overlay span.rage{background:rgba(255,74,74,.92);box-shadow:0 0 0 9px rgba(255,74,74,.22),0 1px 5px rgba(0,0,0,.5)}.overlay span.dead{outline:3px solid #9b72ff;outline-offset:3px}.snapshot-note{margin-top:12px;padding:12px 13px;background:#0b0e12;border:1px solid #20262d;border-radius:12px;color:#8994a3;font-size:11px;line-height:1.55}.side h2{margin-bottom:22px}.scroll-row{display:grid;grid-template-columns:42px 1fr 34px;gap:10px;align-items:center;margin:15px 0}.scroll-row span,.scroll-row b{font-size:12px}.scroll-row div{height:9px;border-radius:99px;background:#20262d;overflow:hidden}.scroll-row i{display:block;height:100%;background:#8bf048;border-radius:99px}.note{margin-top:24px;padding:13px;background:#111a10;border:1px solid #263720;border-radius:12px;color:#92b484;font-size:12px;line-height:1.55}.targets{margin-top:12px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:11px;border-bottom:1px solid #1e232a}th{color:#77818f;font-size:10px;text-transform:uppercase}code{color:#aeb8c6}.bad{color:#ff958b;font-weight:800}.empty{padding:18px;background:#0c0f13;border:1px dashed #2a313a;border-radius:14px;color:#8e98a7}@media(max-width:1050px){.grid{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}.controls{display:grid;grid-template-columns:1fr}.controls select{min-width:0;max-width:100%;width:100%}.open,.refresh{width:max-content}}@media(max-width:600px){.metrics{grid-template-columns:1fr 1fr}.panel{padding:14px}.head{display:grid;align-items:start}}
</style>
