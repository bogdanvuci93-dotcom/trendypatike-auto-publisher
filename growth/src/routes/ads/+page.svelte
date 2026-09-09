<script lang="ts">
  export let data: {
    lastSyncAt: number | null;
    range: { since:string; until:string };
    rows: { accountId:string; accountName:string; currency:string; campaignId:string; campaignName:string; adsetId:string; adsetName:string; adId:string; name:string; spend:number; impressions:number; clicks:number; purchases:number; revenue:number; ctr:number; cpc:number; roas:number; cpa:number }[];
    totals: { spend:number; impressions:number; clicks:number; purchases:number; revenue:number };
    currency: string;
    mixedCurrency: boolean;
  };

  const money = (n:number, currency = data.currency || 'RSD') => {
    if (!currency) return new Intl.NumberFormat('sr-RS', { maximumFractionDigits: 2 }).format(n);
    try {
      return new Intl.NumberFormat('sr-RS', { style: 'currency', currency, maximumFractionDigits: currency === 'RSD' ? 0 : 2 }).format(n);
    } catch {
      return `${new Intl.NumberFormat('sr-RS', { maximumFractionDigits: 2 }).format(n)} ${currency}`;
    }
  };
  const pct = (n:number) => `${n.toFixed(2)}%`;
</script>

<header>
  <div class="eyebrow">META ADS · LAST 7 DAYS</div>
  <h1>Ads performance</h1>
  <p>Stvarni dnevni Meta Insights za poslednjih 7 dana, sabrani po oglasu.</p>
</header>

{#if data.mixedCurrency}
  <div class="warning">Povezano je više Meta ad naloga sa različitim valutama. Ukupan spend/revenue se ne sabiraju kao jedna valuta dok ne izaberemo primarni nalog.</div>
{/if}

<section class="metrics">
  <div><span>7d Spend</span><b>{data.mixedCurrency ? 'Mixed' : money(data.totals.spend)}</b></div>
  <div><span>Impressions</span><b>{data.totals.impressions.toLocaleString('sr-RS')}</b></div>
  <div><span>Clicks</span><b>{data.totals.clicks.toLocaleString('sr-RS')}</b></div>
  <div><span>Purchases</span><b>{data.totals.purchases}</b></div>
  <div><span>Meta revenue</span><b>{data.mixedCurrency ? 'Mixed' : money(data.totals.revenue)}</b></div>
  <div><span>ROAS</span><b>{!data.mixedCurrency && data.totals.spend > 0 ? (data.totals.revenue/data.totals.spend).toFixed(2) : '—'}</b></div>
</section>

<section class="panel">
  <div class="head">
    <div><span class="eyebrow">ADS · {data.range.since} → {data.range.until}</span><h2>Oglasi</h2></div>
    {#if data.lastSyncAt}<small>Auto sync: {new Date(data.lastSyncAt).toLocaleString('sr-RS')}</small>{/if}
  </div>
  {#if data.rows.length}
    <div class="table-wrap"><table>
      <thead><tr><th>Ad</th><th>Campaign / ad set</th><th>Ad account</th><th>Spend</th><th>CTR</th><th>CPC</th><th>Purchases</th><th>Revenue</th><th>ROAS</th><th>CPA</th></tr></thead>
      <tbody>{#each data.rows as row}<tr>
        <td><strong>{row.name}</strong><small>{row.adId}</small></td>
        <td><strong>{row.campaignName || '—'}</strong><small>{row.adsetName || '—'}</small></td>
        <td><strong>{row.accountName}</strong><small>{row.accountId} · {row.currency || 'currency ?'}</small></td>
        <td>{money(row.spend, row.currency)}</td><td>{pct(row.ctr)}</td><td>{money(row.cpc, row.currency)}</td><td>{row.purchases}</td><td>{money(row.revenue, row.currency)}</td><td>{row.roas.toFixed(2)}</td><td>{row.purchases ? money(row.cpa, row.currency) : '—'}</td>
      </tr>{/each}</tbody>
    </table></div>
  {:else}
    <div class="empty">Još nema 7-dnevnih Meta podataka. Auto-sync će ih povući čim novi deployment bude aktivan.</div>
  {/if}
</section>

<style>
  header{margin-bottom:22px}h1{font-size:34px;margin:4px 0 8px;letter-spacing:-.04em}header p{color:#8f99a8}.eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}
  .warning{margin-bottom:12px;padding:13px 14px;border-radius:13px;background:#2a2413;border:1px solid #51451f;color:#f0d987;font-size:13px;line-height:1.45}
  .metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;margin-bottom:12px}.metrics div,.panel{background:#101318;border:1px solid #20242b;border-radius:16px;padding:16px}.metrics span{display:block;color:#7f8997;font-size:11px;margin-bottom:8px}.metrics b{font-size:19px}.panel{padding:20px}.head{display:flex;justify-content:space-between;align-items:end;margin-bottom:14px}.head h2{margin:4px 0 0}.head small{color:#7f8997}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:13px 10px;border-bottom:1px solid #1e232a;white-space:nowrap}th{color:#77818f;font-size:10px;text-transform:uppercase;letter-spacing:.08em}td:first-child{min-width:220px}td:nth-child(2){min-width:220px}td:nth-child(3){min-width:200px}td small{display:block;color:#65707e;margin-top:4px;font-size:10px}.empty{padding:18px;background:#0c0f13;border:1px dashed #2a313a;border-radius:14px;color:#8e98a7}@media(max-width:1100px){.metrics{grid-template-columns:repeat(3,1fr)}}@media(max-width:650px){.metrics{grid-template-columns:repeat(2,1fr)}}
</style>
