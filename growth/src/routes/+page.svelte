<script lang="ts">
  import MetricCard from '$lib/components/MetricCard.svelte';
  import PerformanceChart from '$lib/components/PerformanceChart.svelte';
  import { recommendAd } from '$lib/growth/rules';

  export let data: {
    live:boolean; error:string|null; shopCurrency:string; metaCurrency:string;
    overview:{revenue:number;spend:number;roas:number;orders:number;conversionRate:number;cpa:number;sessions:number;addToCart:number;checkout:number;avgSessionActiveMs:number};
    behavior:{topTimePath:string;topTimeAvgMs:number;topTimeSessions:number;topExitPath:string;topExitCount:number;topExitShare:number};
    trend:{label:string;revenue:number;spend:number}[];
    ads:{name:string;spend:number;revenue:number;purchases:number;ctr:number;cpc:number;cpm:number;atcRate:number;currency:string}[];
  };

  const money=(n:number,currency='RSD')=>{try{return new Intl.NumberFormat('sr-RS',{style:'currency',currency,maximumFractionDigits:currency==='RSD'?0:2}).format(n)}catch{return `${new Intl.NumberFormat('sr-RS',{maximumFractionDigits:2}).format(n)} ${currency}`}};
  const pct=(n:number)=>`${n.toFixed(1)}%`;
  const rate=(a:number,b:number)=>b?a/b*100:0;
  const dur=(ms:number)=>{const sec=Math.max(0,Math.round(ms/1000));return sec<60?`${sec}s`:`${Math.floor(sec/60)}m ${sec%60}s`;};
  const status=(s:string)=>({SCALE:'SKALIRAJ',KEEP:'OSTAVI',WATCH:'PRATI',PAUSE:'PAUZIRAJ',WEBSITE_ISSUE:'PROBLEM SAJT',LOW_SAMPLE:'MALO PODATAKA'}[s]||s);
  $: atcRate=rate(data.overview.addToCart,data.overview.sessions);
  $: checkoutRate=rate(data.overview.checkout,data.overview.addToCart);
  $: funnelMessage=!data.overview.sessions?'Čekam današnje sesije.':atcRate<4?`Najveći signal je poseta → korpa: samo ${pct(atcRate)} sesija je dodalo proizvod.`:data.overview.addToCart>0&&checkoutRate<35?`Najveći signal je korpa → checkout: prolazi ${pct(checkoutRate)} ATC sesija.`:`Današnji funnel nema očigledan kritičan pad u prvim koracima.`;
</script>

<header><div><div class="eyebrow">TRENDYPATIKE · LIVE</div><h1>Pregled</h1><p>Sve najvažnije na jednom mestu. Klikni bilo koju gornju karticu za objašnjenje metrike.</p></div><div class="live"><i></i>{data.live?'podaci uživo':'čekam podatke'}</div></header>
{#if data.error}<div class="error"><b>Dijagnostika:</b> {data.error}</div>{/if}

<section class="metrics">
  <MetricCard label="Današnji prihod" value={money(data.overview.revenue,data.shopCurrency)} note="Shopify · važeće porudžbine" explain="Prihod od današnjih Shopify porudžbina koje nisu otkazane, refundirane ili vraćene." formula="zbir validnih order total vrednosti danas" interpretation="Ovo je prodaja, ne profit." />
  <MetricCard label="Današnje porudžbine" value={String(data.overview.orders)} note={`${data.overview.conversionRate.toFixed(2)}% sesija → order`} explain="Broj validnih Shopify porudžbina napravljenih danas." formula="broj validnih orders" interpretation="Stopu konverzije gledamo zajedno sa brojem sesija." />
  <MetricCard label="Današnje sesije" value={data.overview.sessions.toLocaleString('sr-RS')} note={`${data.overview.addToCart} korpa · ${data.overview.checkout} checkout`} explain="Jedna sesija je jedna poseta kupca dok ne bude neaktivan oko 30 minuta." formula="jedinstveni storefront session ID-jevi danas" interpretation="Više sesija nije dovoljno ako ne prelaze u korpu i kupovinu." />
  <MetricCard label="Aktivno vreme" value={dur(data.overview.avgSessionActiveMs)} note="prosek po današnjoj sesiji" explain="Vreme kada je kupac stvarno imao otvoren i fokusiran sajt, sabrano kroz stranice." formula="zbir aktivnog vremena po stranici ÷ sesije" interpretation="Bolje od običnog session duration jer ne broji dugo ostavljen tab kao angažovanje." />
  <MetricCard label="Meta ROAS · 7d" value={data.overview.roas.toFixed(2)} note="Meta pripisan prihod / spend" explain="Koliko prihoda Meta pripisuje na 1 jedinicu potrošnje oglasa." formula="Meta purchase value ÷ Meta spend" interpretation="ROAS moraš porediti sa maržom; veliki ROAS nije isto što i profit." />
  <MetricCard label="Meta CPA · 7d" value={data.metaCurrency&&data.overview.cpa?money(data.overview.cpa,data.metaCurrency):'—'} note="cena pripisane kupovine" explain="Koliko oglašavanje u proseku košta po Meta pripisanoj kupovini." formula="Meta spend ÷ Meta purchases" interpretation="Niži CPA je bolji samo dok kvalitet i vrednost porudžbine ostaju dobri." />
</section>

<section class="plain-grid">
  <article><span>GDE NAJVIŠE OSTAJU</span><b>{data.behavior.topTimePath||'—'}</b><p>{data.behavior.topTimePath?`Oko ${dur(data.behavior.topTimeAvgMs)} aktivno po poseti toj stranici · ${data.behavior.topTimeSessions} sesija u 7d.`:'Još nema dovoljno podataka.'}</p><a href="/heatmaps">Otvori Heatmaps →</a></article>
  <article><span>GDE NAJČEŠĆE ZAVRŠE</span><b>{data.behavior.topExitPath||'—'}</b><p>{data.behavior.topExitPath?`${data.behavior.topExitCount} sesija · oko ${pct(data.behavior.topExitShare)} poslednjih zabeleženih stranica.`:'Još nema dovoljno podataka.'}</p><a href="/sessions">Vidi sesije →</a></article>
  <article><span>NAJVEĆI FUNNEL SIGNAL DANAS</span><b>{funnelMessage}</b><p>Sesije → korpa {pct(atcRate)} · korpa → checkout {data.overview.addToCart?pct(checkoutRate):'—'}.</p><a href="/funnel">Otvori prodajni levak →</a></article>
</section>

<section class="panel chart-panel"><div class="panel-head"><div><div class="eyebrow">POSLEDNJIH 7 DANA</div><h2>Prodaja i trošak oglasa</h2></div></div><PerformanceChart rows={data.trend} />{#if data.metaCurrency&&data.metaCurrency!==data.shopCurrency}<div class="currency-note">Shopify je u {data.shopCurrency}, Meta u {data.metaCurrency}; linije se ne sabiraju kao ista valuta.</div>{/if}</section>

<div class="cols">
  <section class="panel"><div class="panel-head"><div><div class="eyebrow">OGLASI · 7 DANA</div><h2>Brza procena</h2></div><a href="/ads">Svi detalji →</a></div>
    {#if data.ads.length}<div class="list">{#each data.ads.slice(0,6) as ad}{@const rec=recommendAd(ad)}<article><div><strong>{ad.name}</strong><small>Spend {money(ad.spend,ad.currency||data.metaCurrency||'RSD')} · CPM {money(ad.cpm,ad.currency||data.metaCurrency||'RSD')} · CTR {ad.ctr.toFixed(2)}% · {ad.purchases} kup.</small></div><span class:good={rec.status==='SCALE'||rec.status==='KEEP'} class:bad={rec.status==='PAUSE'} class:warn={rec.status==='WATCH'||rec.status==='WEBSITE_ISSUE'||rec.status==='LOW_SAMPLE'}>{status(rec.status)}</span><p>{rec.reason}</p></article>{/each}</div>{:else}<div class="empty">Auto-sync još nije povukao Meta podatke.</div>{/if}
  </section>

  <section class="panel"><div class="panel-head"><div><div class="eyebrow">DANAS</div><h2>Put do kupovine</h2></div><a href="/funnel">Detaljno →</a></div><div class="funnel"><div><b>{data.overview.sessions}</b><span>sesije</span></div><em>↓</em><div><b>{data.overview.addToCart}</b><span>korpa</span></div><em>↓</em><div><b>{data.overview.checkout}</b><span>checkout</span></div><em>↓</em><div><b>{data.overview.orders}</b><span>porudžbine</span></div></div><div class="callout">Dashboard se osvežava sam. Dok je otvoren radi live sync na 30 sekundi; server nastavlja i kad ga zatvoriš.</div></section>
</div>

<style>
  header{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-bottom:24px}header p{margin:7px 0 0;color:#87919f;font-size:13px}h1{font-size:34px;margin:4px 0 0;letter-spacing:-.04em}h2{font-size:20px;margin:4px 0 0}.eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}.live{font-size:12px;color:#9aa4b3;background:#11151a;border:1px solid #20252d;padding:9px 11px;border-radius:99px}.live i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#8bf048;margin-right:7px}.error{margin-bottom:12px;padding:13px 14px;border-radius:13px;background:#2c1719;border:1px solid #5b272b;color:#ffb2b7;font-size:13px;line-height:1.45}.metrics{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:12px}
  .plain-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}.plain-grid article{padding:17px;border-radius:17px;background:#0f1410;border:1px solid #263224}.plain-grid span{display:block;color:#748270;font-size:10px;font-weight:900;letter-spacing:.08em}.plain-grid b{display:block;margin-top:8px;font-size:14px;overflow-wrap:anywhere}.plain-grid p{color:#889684;font-size:12px;line-height:1.45;margin:8px 0}.plain-grid a{color:#9de989;font-size:11px;font-weight:800}
  .panel{border:1px solid #20242b;background:#101318;border-radius:20px;padding:20px}.chart-panel{margin-bottom:12px}.panel-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:12px}.panel-head>a{font-size:11px;color:#93dc80}.currency-note{margin-top:8px;color:#c8b675;background:#211e12;border:1px solid #3d371d;border-radius:12px;padding:11px 13px;font-size:12px;line-height:1.45}.cols{display:grid;grid-template-columns:1.35fr .65fr;gap:12px}.list{display:grid;gap:8px}.list article{display:grid;grid-template-columns:1fr auto;gap:5px 16px;padding:15px;background:#0c0f13;border:1px solid #1c2128;border-radius:14px}.list small{display:block;color:#7f8997;margin-top:5px}.list p{grid-column:1/-1;margin:4px 0 0;color:#a9b1bd;font-size:13px}.list span{align-self:start;padding:6px 9px;border-radius:99px;font-size:9px;font-weight:900;background:#242932}.list span.good{background:#17301d;color:#90ee86}.list span.bad{background:#351a1a;color:#ff8f8f}.list span.warn{background:#332b17;color:#ffd472}.empty{padding:18px;background:#0c0f13;border:1px dashed #2a313a;border-radius:14px;color:#8e98a7;font-size:13px}.funnel{display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr;align-items:center;gap:8px;margin-top:26px}.funnel div{text-align:center;padding:14px 5px;border-radius:14px;background:#0c0f13;border:1px solid #1c2128}.funnel b{display:block;font-size:21px}.funnel span{font-size:11px;color:#7f8997}.funnel em{font-style:normal;color:#505966}.callout{margin-top:20px;padding:14px;border-radius:14px;background:#101a10;border:1px solid #213321;color:#9bc88d;font-size:12px;line-height:1.5}
  @media(max-width:1200px){.metrics{grid-template-columns:repeat(3,1fr)}.cols{grid-template-columns:1fr}.plain-grid{grid-template-columns:1fr}}@media(max-width:650px){header{display:block}.live{display:inline-block;margin-top:14px}.metrics{grid-template-columns:repeat(2,1fr)}.funnel{grid-template-columns:1fr}}
</style>
