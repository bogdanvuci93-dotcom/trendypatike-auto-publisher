<script lang="ts">
  export let data:{sessions:number;productViews:number;addToCart:number;checkout:number;purchases:number;revenue:number;trackerReady:boolean};
  const money=(n:number)=>`${new Intl.NumberFormat('sr-RS').format(Math.round(n))} RSD`;
  const rate=(a:number,b:number)=>b>0?`${((a/b)*100).toFixed(1)}%`:'—';
</script>

<header><div class="eyebrow">TODAY · EUROPE/BELGRADE</div><h1>Funnel</h1><p>Jedinstvene storefront sesije po koraku, spojene sa današnjim Shopify porudžbinama.</p></header>

<section class="panel">
  <div class="steps">
    <div><span>Sessions</span><b>{data.sessions}</b><small>start</small></div>
    <i>→</i>
    <div><span>PDP sessions</span><b>{data.productViews}</b><small>{rate(data.productViews,data.sessions)} of sessions</small></div>
    <i>→</i>
    <div><span>ATC sessions</span><b>{data.addToCart}</b><small>{rate(data.addToCart,data.productViews)} of PDP</small></div>
    <i>→</i>
    <div><span>Checkout intent</span><b>{data.checkout}</b><small>{rate(data.checkout,data.addToCart)} of ATC</small></div>
    <i>→</i>
    <div><span>Shopify orders</span><b>{data.purchases}</b><small>{data.checkout ? rate(data.purchases,data.checkout) : 'order count'}</small></div>
  </div>
  <div class="revenue">Today Shopify revenue <strong>{money(data.revenue)}</strong></div>
</section>

{#if !data.trackerReady}
<section class="notice"><b>Storefront tracker još ne šalje sesije.</b> Shopify kupovine se vide odvojeno, dok će Sessions → PDP → ATC → Checkout početi da se pune čim tracker uspešno šalje na <code>/api/collect</code>.</section>
{/if}

<section class="hint">PDP, ATC i Checkout su broj jedinstvenih sesija koje su dostigle taj korak, ne broj svih ponovljenih klikova. Shopify orders su server-side porudžbine i zato nisu direktno vezane za isti tracker session ID.</section>

<style>
header{margin-bottom:22px}h1{font-size:34px;margin:4px 0 8px;letter-spacing:-.04em}header p{color:#8f99a8}.eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}.panel{background:#101318;border:1px solid #20242b;border-radius:18px;padding:22px}.steps{display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr auto 1fr;gap:10px;align-items:center}.steps div{background:#0c0f13;border:1px solid #1c2128;border-radius:14px;padding:18px;text-align:center}.steps span,.steps small{display:block;color:#7f8997}.steps span{font-size:11px;margin-bottom:8px}.steps b{font-size:28px}.steps small{font-size:10px;margin-top:6px}.steps i{font-style:normal;color:#4a5360}.revenue{margin-top:18px;padding:14px 16px;border-radius:12px;background:#101a10;border:1px solid #213321;color:#9bc88d}.revenue strong{float:right;color:#c9ffb7}.notice,.hint{margin-top:12px;padding:16px;border-radius:14px;line-height:1.5}.notice{background:#2a2415;border:1px solid #4a3d1d;color:#efd98c}.hint{background:#0d1116;border:1px solid #202731;color:#7f8997;font-size:12px}.notice code{color:inherit}@media(max-width:1000px){.steps{grid-template-columns:1fr}.steps i{transform:rotate(90deg)}}
</style>
