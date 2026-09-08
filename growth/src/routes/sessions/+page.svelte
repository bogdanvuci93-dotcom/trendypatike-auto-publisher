<script lang="ts">
  export let data: {
    rows: {
      id:string; startedAt:number; lastSeenAt:number; landingPath:string; referrer:string; utmSource:string; utmCampaign:string; fbclid:string;
      events:number; pageViews:number; productViews:number; addToCart:number; checkout:number; rageClicks:number;
    }[];
  };

  const duration = (a:number,b:number) => {
    const sec = Math.max(0, Math.round((b-a)/1000));
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec/60);
    return `${min}m ${sec%60}s`;
  };
  const source = (row: (typeof data.rows)[number]) => row.utmSource || (row.fbclid ? 'facebook' : row.referrer ? 'referral' : 'direct');
</script>

<header>
  <div class="eyebrow">STOREFRONT · LIVE</div>
  <h1>Sessions</h1>
  <p>Poslednje sesije sa putanjom kroz sajt, ATC signalima i rage-click detekcijom.</p>
</header>

<section class="summary">
  <div><span>Sessions loaded</span><b>{data.rows.length}</b></div>
  <div><span>With ATC</span><b>{data.rows.filter((r)=>r.addToCart>0).length}</b></div>
  <div><span>Checkout intent</span><b>{data.rows.filter((r)=>r.checkout>0).length}</b></div>
  <div><span>Rage-click sessions</span><b>{data.rows.filter((r)=>r.rageClicks>0).length}</b></div>
</section>

<section class="panel">
  {#if data.rows.length}
    <div class="table-wrap"><table>
      <thead><tr><th>Session</th><th>Source</th><th>Landing</th><th>Duration</th><th>Pages</th><th>Product views</th><th>ATC</th><th>Checkout</th><th>Rage</th></tr></thead>
      <tbody>
        {#each data.rows as row}
          <tr>
            <td><a href={`/sessions/${row.id}`}><strong>{new Date(row.startedAt).toLocaleString('sr-RS')}</strong><small>{row.id.slice(0,18)}…</small></a></td>
            <td>{source(row)}{#if row.utmCampaign}<small>{row.utmCampaign}</small>{/if}</td>
            <td><code>{row.landingPath}</code></td>
            <td>{duration(row.startedAt,row.lastSeenAt)}</td>
            <td>{row.pageViews}</td><td>{row.productViews}</td><td>{row.addToCart}</td><td>{row.checkout}</td><td class:hot={row.rageClicks>0}>{row.rageClicks}</td>
          </tr>
        {/each}
      </tbody>
    </table></div>
  {:else}
    <div class="empty">Još nema storefront sesija. Tracker mora prvo biti dodat u Shopify temu.</div>
  {/if}
</section>

<style>
  header{margin-bottom:22px}h1{font-size:34px;margin:4px 0 8px;letter-spacing:-.04em}header p{color:#8f99a8}.eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}
  .summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.summary div,.panel{background:#101318;border:1px solid #20242b;border-radius:16px;padding:16px}.summary span{display:block;color:#7f8997;font-size:11px;margin-bottom:8px}.summary b{font-size:20px}.panel{padding:20px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:13px 10px;border-bottom:1px solid #1e232a;white-space:nowrap}th{color:#77818f;font-size:10px;text-transform:uppercase;letter-spacing:.08em}td:first-child{min-width:210px}td:nth-child(3){max-width:280px;overflow:hidden;text-overflow:ellipsis}small{display:block;color:#65707e;margin-top:4px;font-size:10px}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#bcc5d2}.hot{color:#ff9a88;font-weight:800}.empty{padding:18px;background:#0c0f13;border:1px dashed #2a313a;border-radius:14px;color:#8e98a7}@media(max-width:850px){.summary{grid-template-columns:repeat(2,1fr)}}
</style>
