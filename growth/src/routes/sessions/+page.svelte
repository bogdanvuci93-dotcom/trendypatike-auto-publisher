<script lang="ts">
  export let data: {
    rows: {
      id:string; startedAt:number; lastSeenAt:number; landingPath:string; lastPath:string; referrer:string; utmSource:string; utmCampaign:string; fbclid:string;
      events:number; pageViews:number; productViews:number; addToCart:number; cartViews:number; checkout:number; rageClicks:number; deadClicks:number; activeMs:number; maxScroll:number; exitStage:string; replayAvailable:boolean;
    }[];
  };

  const duration = (row:(typeof data.rows)[number]) => {
    const sec = Math.max(0, Math.round((row.activeMs || (row.lastSeenAt-row.startedAt))/1000));
    if (sec < 60) return `${sec}s`;
    return `${Math.floor(sec/60)}m ${sec%60}s`;
  };
  const source = (row: (typeof data.rows)[number]) => row.utmSource || (row.fbclid ? 'facebook' : row.referrer ? 'referral' : 'direct');
  const stage = (s:string) => ({browse:'Browse exit',product:'PDP exit',cart:'Cart exit',checkout:'Checkout exit'}[s] || s);
</script>

<header>
  <div class="eyebrow">STOREFRONT · LIVE JOURNEYS</div>
  <h1>Sesije kupaca</h1>
  <p>Otvori detalje ili pusti pravi replay da vidiš kursor, scroll, klikove i promene stranice redom.</p>
</header>

<section class="summary">
  <div><span>Sesije</span><b>{data.rows.length}</b></div>
  <div><span>Sa Add to cart</span><b>{data.rows.filter((r)=>r.addToCart>0).length}</b></div>
  <div><span>Stigle do checkouta</span><b>{data.rows.filter((r)=>r.checkout>0).length}</b></div>
  <div><span>Replay spreman</span><b>{data.rows.filter((r)=>r.replayAvailable).length}</b></div>
</section>

<section class="panel">
  {#if data.rows.length}
    <div class="table-wrap"><table>
      <thead><tr><th>Sesija</th><th>Replay</th><th>Izvor</th><th>Ulaz → izlaz</th><th>Aktivno</th><th>PDP</th><th>ATC</th><th>Checkout</th><th>Scroll</th><th>Odustao na</th><th>Problemi</th></tr></thead>
      <tbody>
        {#each data.rows as row}
          <tr>
            <td><a href={`/sessions/${row.id}`}><strong>{new Date(row.startedAt).toLocaleString('sr-RS')}</strong><small>Detalji sesije →</small></a></td>
            <td>{#if row.replayAvailable}<a class="play" href={`/sessions/${row.id}/replay`}>▶ Pusti</a>{:else}<span class="wait">čeka novu sesiju</span>{/if}</td>
            <td>{source(row)}{#if row.utmCampaign}<small>{row.utmCampaign}</small>{/if}</td>
            <td><code>{row.landingPath}</code><small>→ {row.lastPath}</small></td>
            <td>{duration(row)}</td><td>{row.productViews}</td><td>{row.addToCart}</td><td>{row.checkout}</td><td>{row.maxScroll}%</td><td><span class={`stage ${row.exitStage}`}>{stage(row.exitStage)}</span></td><td class:hot={row.rageClicks+row.deadClicks>0}>{row.rageClicks} rage · {row.deadClicks} dead</td>
          </tr>
        {/each}
      </tbody>
    </table></div>
  {:else}<div class="empty">Još nema storefront sesija.</div>{/if}
</section>

<style>
  header{margin-bottom:22px}h1{font-size:34px;margin:4px 0 8px;letter-spacing:-.04em}header p{color:#8f99a8}.eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.summary div,.panel{background:#101318;border:1px solid #20242b;border-radius:16px;padding:16px}.summary span{display:block;color:#7f8997;font-size:11px;margin-bottom:8px}.summary b{font-size:20px}.panel{padding:20px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:13px 10px;border-bottom:1px solid #1e232a;white-space:nowrap}th{color:#77818f;font-size:10px;text-transform:uppercase;letter-spacing:.08em}td:first-child{min-width:205px}td:nth-child(4){min-width:300px;max-width:390px;overflow:hidden;text-overflow:ellipsis}small{display:block;color:#65707e;margin-top:4px;font-size:10px}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#bcc5d2}.play{display:inline-block;background:#8bf048;color:#0b1408;font-weight:900;padding:7px 10px;border-radius:8px}.wait{color:#65707e;font-size:10px}.hot{color:#ff9a88;font-weight:800}.stage{font-size:10px;padding:5px 7px;border-radius:99px;background:#262b31;color:#aab2bd}.stage.product{background:#302a16;color:#e3cb6d}.stage.cart,.stage.checkout{background:#321b1d;color:#ff9d9d}.empty{padding:18px;background:#0c0f13;border:1px dashed #2a313a;border-radius:14px;color:#8e98a7}@media(max-width:850px){.summary{grid-template-columns:repeat(2,1fr)}}
</style>
