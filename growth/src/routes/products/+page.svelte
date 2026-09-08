<script lang="ts">
  export let data: { rows:{ key:string; title:string; orders:number; units:number; revenue:number }[]; totals:{ revenue:number; units:number; orders:number; products:number } };
  const money = (n:number) => `${new Intl.NumberFormat('sr-RS').format(Math.round(n))} RSD`;
</script>

<header><div class="eyebrow">SHOPIFY · 30 DAY SYNC</div><h1>Products</h1><p>Koji proizvodi stvarno donose prihod i prodaju.</p></header>

<section class="metrics">
  <div><span>Revenue</span><b>{money(data.totals.revenue)}</b></div>
  <div><span>Units</span><b>{data.totals.units}</b></div>
  <div><span>Order lines</span><b>{data.totals.orders}</b></div>
  <div><span>Products</span><b>{data.totals.products}</b></div>
</section>

<section class="panel">
  <div class="head"><div class="eyebrow">RANKING</div><h2>Top products by revenue</h2></div>
  {#if data.rows.length}
    <div class="table-wrap"><table><thead><tr><th>#</th><th>Product</th><th>Orders</th><th>Units</th><th>Revenue</th></tr></thead><tbody>
      {#each data.rows as row, i}<tr><td>{i+1}</td><td><strong>{row.title}</strong></td><td>{row.orders}</td><td>{row.units}</td><td>{money(row.revenue)}</td></tr>{/each}
    </tbody></table></div>
  {:else}<div class="empty">Nema Shopify podataka. Pokreni Sync Shopify u Settings.</div>{/if}
</section>

<style>
  header{margin-bottom:22px}h1{font-size:34px;margin:4px 0 8px;letter-spacing:-.04em}h2{font-size:20px;margin:4px 0 0}header p{color:#8f99a8}.eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.metrics div,.panel{background:#101318;border:1px solid #20242b;border-radius:16px;padding:16px}.metrics span{display:block;color:#7f8997;font-size:11px;margin-bottom:8px}.metrics b{font-size:20px}.panel{padding:20px}.head{margin-bottom:14px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:13px}th,td{text-align:left;padding:13px 10px;border-bottom:1px solid #1e232a}th{color:#77818f;font-size:10px;text-transform:uppercase;letter-spacing:.08em}.empty{padding:18px;background:#0c0f13;border:1px dashed #2a313a;border-radius:14px;color:#8e98a7}@media(max-width:700px){.metrics{grid-template-columns:repeat(2,1fr)}}
</style>
