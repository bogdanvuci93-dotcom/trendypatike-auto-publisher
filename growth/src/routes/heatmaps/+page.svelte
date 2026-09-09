<script lang="ts">
  export let data: {
    pages:{ path:string; clicks:{x:number;y:number;rage:boolean}[]; scrolls:number[]; totalClicks:number; rageClicks:number; avgScroll:number; maxScroll:number }[];
  };
  let selected = data.pages[0]?.path || '';
  $: page = data.pages.find((p)=>p.path===selected) || data.pages[0];
</script>

<header>
  <div class="eyebrow">STOREFRONT · 7 DAYS</div>
  <h1>Heatmaps</h1>
  <p>Normalizovana click mapa po stranici. Rage-click tačke su posebno označene.</p>
</header>

{#if data.pages.length}
  <section class="controls">
    <label for="heatmap-page">Page</label>
    <select id="heatmap-page" bind:value={selected}>{#each data.pages as p}<option value={p.path}>{p.path} · {p.totalClicks} clicks</option>{/each}</select>
  </section>

  {#if page}
    <section class="metrics">
      <div><span>Clicks</span><b>{page.totalClicks}</b></div>
      <div><span>Rage clicks</span><b>{page.rageClicks}</b></div>
      <div><span>Scroll sessions</span><b>{page.scrolls.length}</b></div>
      <div><span>Avg. max scroll</span><b>{page.avgScroll.toFixed(0)}%</b></div>
    </section>

    <div class="grid">
      <section class="panel">
        <div class="head"><div><div class="eyebrow">CLICK MAP</div><h2>{page.path}</h2></div><small>{page.clicks.length} plotted points</small></div>
        <div class="map">
          <div class="fold">approx. first fold</div>
          {#each page.clicks as point}
            <i class:rage={point.rage} style={`left:${point.x}%;top:${point.y}%;`}></i>
          {/each}
        </div>
      </section>

      <section class="panel side">
        <div class="eyebrow">SCROLL DEPTH</div><h2>Dubina stranice</h2>
        {#each [25,50,75,90,100] as mark}
          {@const count = page.scrolls.filter((d)=>d>=mark).length}
          <div class="scroll-row"><span>{mark}%</span><div><i style={`width:${page.scrolls.length ? Math.min(100,(count/page.scrolls.length)*100) : 0}%`}></i></div><b>{count}</b></div>
        {/each}
        <div class="note">Svaka sesija se računa jednom po svom najvećem dostignutom scroll nivou, pa brojevi ne dupliraju istog posetioca na 25%, 50%, 75% itd. Click mapa je normalizovana, ne screenshot stranice.</div>
      </section>
    </div>
  {/if}
{:else}
  <div class="empty">Još nema click/scroll podataka. Proveri tracker u Settings i otvori nekoliko stranica na shopu da stignu prve sesije.</div>
{/if}

<style>
  header{margin-bottom:22px}h1{font-size:34px;margin:4px 0 8px;letter-spacing:-.04em}h2{font-size:19px;margin:4px 0 0;word-break:break-all}header p{color:#8f99a8}.eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}.controls{display:flex;gap:12px;align-items:center;margin-bottom:12px}.controls label{font-size:12px;color:#8f99a8}.controls select{min-width:360px;max-width:70vw;background:#101318;color:#f4f7fb;border:1px solid #262c34;border-radius:11px;padding:10px 12px}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.metrics div,.panel{background:#101318;border:1px solid #20242b;border-radius:16px;padding:16px}.metrics span{display:block;color:#7f8997;font-size:11px;margin-bottom:8px}.metrics b{font-size:20px}.grid{display:grid;grid-template-columns:1.4fr .6fr;gap:12px}.panel{padding:20px}.head{display:flex;justify-content:space-between;gap:16px;align-items:end;margin-bottom:14px}.head small{color:#737d8b}.map{position:relative;height:900px;border-radius:14px;overflow:hidden;background:linear-gradient(#0c0f13,#11161d);border:1px solid #1d232b}.map:before{content:'';position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.025) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.025) 1px,transparent 1px);background-size:40px 40px}.map i{position:absolute;width:18px;height:18px;border-radius:50%;background:rgba(255,183,65,.55);box-shadow:0 0 0 7px rgba(255,183,65,.08);transform:translate(-50%,-50%)}.map i.rage{background:rgba(255,83,83,.85);box-shadow:0 0 0 9px rgba(255,83,83,.12)}.fold{position:absolute;z-index:2;top:24%;right:12px;color:#66717e;font-size:10px;border-top:1px dashed #313944;width:150px;padding-top:5px;text-align:right}.side h2{margin-bottom:22px}.scroll-row{display:grid;grid-template-columns:42px 1fr 34px;gap:10px;align-items:center;margin:15px 0}.scroll-row span,.scroll-row b{font-size:12px}.scroll-row div{height:9px;border-radius:99px;background:#20262d;overflow:hidden}.scroll-row i{display:block;height:100%;background:#8bf048;border-radius:99px}.note{margin-top:24px;padding:13px;background:#111a10;border:1px solid #263720;border-radius:12px;color:#92b484;font-size:12px;line-height:1.5}.empty{padding:18px;background:#0c0f13;border:1px dashed #2a313a;border-radius:14px;color:#8e98a7}@media(max-width:950px){.grid{grid-template-columns:1fr}.metrics{grid-template-columns:repeat(2,1fr)}.controls{display:grid}.controls select{min-width:0;max-width:100%;width:100%}}
</style>
