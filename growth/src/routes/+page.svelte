<script lang="ts">
  import MetricCard from '$lib/components/MetricCard.svelte';
  import PerformanceChart from '$lib/components/PerformanceChart.svelte';
  import { recommendAd } from '$lib/growth/rules';

  export let data: {
    live: boolean;
    overview: { revenue: number; spend: number; roas: number; orders: number; conversionRate: number; cpa: number; sessions: number; addToCart: number; checkout: number };
    trend: { label: string; revenue: number; spend: number }[];
    ads: { name: string; spend: number; revenue: number; purchases: number; ctr: number; cpc: number; atcRate: number }[];
  };

  const money = (n: number) => `${new Intl.NumberFormat('sr-RS').format(Math.round(n))} RSD`;
</script>

<header>
  <div>
    <div class="eyebrow">TRENDYPATIKE · LIVE CONTROL CENTER</div>
    <h1>Growth Overview</h1>
  </div>
  <div class="live"><i></i>{data.live ? 'Live D1 data' : 'Waiting for data'}</div>
</header>

<section class="metrics">
  <MetricCard label="Revenue" value={money(data.overview.revenue)} note="Shopify today" />
  <MetricCard label="Meta spend" value={money(data.overview.spend)} note="Latest Meta snapshot" />
  <MetricCard label="ROAS" value={data.overview.roas.toFixed(2)} note="Shopify revenue / Meta spend" />
  <MetricCard label="Orders" value={String(data.overview.orders)} note={`${data.overview.conversionRate.toFixed(2)}% conversion`} />
  <MetricCard label="CPA" value={money(data.overview.cpa)} note="Meta spend / attributed purchases" />
  <MetricCard label="Sessions" value={data.overview.sessions.toLocaleString('sr-RS')} note={`${data.overview.addToCart} ATC · ${data.overview.checkout} checkout`} />
</section>

<section class="panel chart-panel">
  <div class="panel-head"><div><div class="eyebrow">7 DAYS</div><h2>Prihod vs. oglašavanje</h2></div></div>
  <PerformanceChart rows={data.trend} />
</section>

<div class="cols">
  <section class="panel">
    <div class="panel-head"><div><div class="eyebrow">ADS</div><h2>Campaign intelligence</h2></div></div>
    {#if data.ads.length}
      <div class="list">
        {#each data.ads as ad}
          {@const rec = recommendAd(ad)}
          <article>
            <div>
              <strong>{ad.name}</strong>
              <small>{money(ad.spend)} spend · {ad.purchases} purchase · CTR {ad.ctr.toFixed(2)}% · CPC {money(ad.cpc)}</small>
            </div>
            <span class:good={rec.status === 'SCALE' || rec.status === 'KEEP'} class:bad={rec.status === 'PAUSE'} class:warn={rec.status === 'WATCH' || rec.status === 'WEBSITE_ISSUE' || rec.status === 'LOW_SAMPLE'}>{rec.status.replace('_',' ')}</span>
            <p>{rec.reason}</p>
          </article>
        {/each}
      </div>
    {:else}
      <div class="empty">Nema Meta snapshot-a još. Idi na Settings i pokreni prvi sync.</div>
    {/if}
  </section>

  <section class="panel">
    <div class="panel-head"><div><div class="eyebrow">FUNNEL</div><h2>Današnje stanje</h2></div></div>
    <div class="funnel">
      <div><b>{data.overview.sessions}</b><span>Sessions</span></div><em>↓</em>
      <div><b>{data.overview.addToCart}</b><span>Add to cart</span></div><em>↓</em>
      <div><b>{data.overview.checkout}</b><span>Checkout</span></div><em>↓</em>
      <div><b>{data.overview.orders}</b><span>Purchases</span></div>
    </div>
    <div class="callout"><b>Live feed:</b> Shopify i Meta su povezani. Session funnel će se puniti čim tracker ubacimo na trendypatike.com.</div>
  </section>
</div>

<style>
  header{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:24px}
  h1{font-size:34px;margin:4px 0 0;letter-spacing:-.04em}h2{font-size:20px;margin:4px 0 0}
  .eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}
  .live{font-size:12px;color:#9aa4b3;background:#11151a;border:1px solid #20252d;padding:9px 11px;border-radius:99px}.live i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#8bf048;margin-right:7px}
  .metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:12px}
  .panel{border:1px solid #20242b;background:#101318;border-radius:20px;padding:20px}.chart-panel{margin-bottom:12px}
  .panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}
  .cols{display:grid;grid-template-columns:1.35fr .65fr;gap:12px}
  .list{display:grid;gap:8px}.list article{display:grid;grid-template-columns:1fr auto;gap:5px 16px;padding:15px;background:#0c0f13;border:1px solid #1c2128;border-radius:14px}.list small{display:block;color:#7f8997;margin-top:5px}.list p{grid-column:1/-1;margin:4px 0 0;color:#a9b1bd;font-size:13px}.list span{align-self:start;padding:6px 9px;border-radius:99px;font-size:10px;font-weight:900;background:#242932}.list span.good{background:#17301d;color:#90ee86}.list span.bad{background:#351a1a;color:#ff8f8f}.list span.warn{background:#332b17;color:#ffd472}
  .empty{padding:18px;background:#0c0f13;border:1px dashed #2a313a;border-radius:14px;color:#8e98a7;font-size:13px}
  .funnel{display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr;align-items:center;gap:8px;margin-top:28px}.funnel div{text-align:center;padding:14px 5px;border-radius:14px;background:#0c0f13;border:1px solid #1c2128}.funnel b{display:block;font-size:21px}.funnel span{font-size:11px;color:#7f8997}.funnel em{font-style:normal;color:#505966}
  .callout{margin-top:20px;padding:14px;border-radius:14px;background:#101a10;border:1px solid #213321;color:#9bc88d;font-size:13px;line-height:1.5}
  @media(max-width:1200px){.metrics{grid-template-columns:repeat(3,1fr)}.cols{grid-template-columns:1fr}}
  @media(max-width:650px){header{display:block}.live{display:inline-block;margin-top:14px}.metrics{grid-template-columns:repeat(2,1fr)}.funnel{grid-template-columns:1fr}.funnel em{transform:rotate(0deg)}}
</style>
