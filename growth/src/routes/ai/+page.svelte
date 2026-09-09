<script lang="ts">
  export let data: {
    shopify: { revenue:number; orders:number; aov:number; topTitle:string; topRevenue:number; topShare:number };
    storefront: { sessions:number; productViews:number; atcSessions:number; checkoutSessions:number; rageSessions:number };
    ads: { accountName:string; currency:string; adId:string; adName:string; spend:number; impressions:number; clicks:number; purchases:number; purchaseValue:number; ctr:number; cpc:number; roas:number }[];
  };

  const moneyRsd = (n:number) => `${new Intl.NumberFormat('sr-RS').format(Math.round(n))} RSD`;
  const pct = (n:number) => `${n.toFixed(1)}%`;
  const rate = (part:number, total:number) => total ? (part / total) * 100 : 0;

  $: atcRate = rate(data.storefront.atcSessions, data.storefront.sessions);
  $: checkoutRate = rate(data.storefront.checkoutSessions, data.storefront.atcSessions);
  $: rageRate = rate(data.storefront.rageSessions, data.storefront.sessions);

  $: insights = (() => {
    const out: { level:'good'|'watch'|'action'; title:string; body:string }[] = [];

    if (!data.storefront.sessions) {
      out.push({
        level: 'action',
        title: 'Storefront tracking još ne šalje podatke',
        body: 'Shopify prodaje se vide, ali Sessions, PDP, ATC i Checkout još nisu povezani. Dok to ne proradi, ne donosimo zaključke o ponašanju posetilaca.'
      });
    } else {
      if (atcRate < 4) out.push({ level:'action', title:'Add-to-cart stopa je niska', body:`ATC je ${pct(atcRate)} u poslednjih 7 dana. Fokus: proizvodna stranica, cena, veličine, dostava i jasniji CTA.` });
      else if (atcRate >= 8) out.push({ level:'good', title:'Dobra add-to-cart stopa', body:`ATC je ${pct(atcRate)}. Proizvodne stranice trenutno rade solidno; više pažnje prebaci na checkout i oglašavanje.` });
      else out.push({ level:'watch', title:'ATC je srednji', body:`ATC je ${pct(atcRate)}. Ima prostora za test boljeg CTA-a, benefita i prikaza dostave.` });

      if (data.storefront.atcSessions > 0 && checkoutRate < 35) out.push({ level:'action', title:'Prevelik pad Cart → Checkout', body:`Samo ${pct(checkoutRate)} ATC sesija prelazi ka checkoutu. Proveri cart drawer, trošak dostave, CTA i eventualne tehničke prepreke.` });
      if (rageRate >= 5) out.push({ level:'action', title:'Rage-click signal', body:`${pct(rageRate)} sesija ima rage-click. Otvori Sessions i Heatmaps i traži elemente na koje korisnici više puta klikću bez rezultata.` });
    }

    if (data.shopify.topShare >= 30 && data.shopify.topTitle) {
      out.push({ level:'watch', title:'Prihod je koncentrisan na jedan proizvod', body:`${data.shopify.topTitle} nosi oko ${pct(data.shopify.topShare)} prihoda poslednjih 30 dana. Drži stock pod kontrolom i testiraj slične modele, ali nemoj zavisiti od samo jednog proizvoda.` });
    }

    for (const ad of data.ads.slice(0, 8)) {
      const label = `${ad.adName}${ad.accountName ? ` · ${ad.accountName}` : ''}`;
      if (ad.spend > 0 && ad.purchases === 0 && ad.clicks >= 15 && ad.ctr >= 2) {
        out.push({ level:'action', title:`Klikovi dolaze, kupovine ne: ${label}`, body:`CTR ${pct(ad.ctr)} i ${ad.clicks} klikova pokazuju da oglas privlači pažnju, ali nema kupovine. Pre povećanja budžeta proveri landing page, cenu, veličine i checkout.` });
      } else if (ad.spend > 0 && ad.ctr < 1.2 && ad.impressions >= 500) {
        out.push({ level:'action', title:`Slab CTR: ${label}`, body:`CTR je ${pct(ad.ctr)}. Pre promene sajta prvo testiraj novi creative, hook ili thumbnail.` });
      } else if (ad.purchases > 0 && ad.roas >= 3) {
        out.push({ level:'good', title:`Jak ROAS: ${label}`, body:`ROAS ${ad.roas.toFixed(2)}. Kandidat je za pažljivo skaliranje, npr. mali koraci umesto naglog povećanja budžeta.` });
      } else if (ad.purchases > 0 && ad.roas > 0 && ad.roas < 1.5) {
        out.push({ level:'watch', title:`Nizak ROAS: ${label}`, body:`ROAS ${ad.roas.toFixed(2)}. Ne skalirati dok ne utvrdimo da li je problem creative, publika ili konverzija sajta.` });
      }
    }

    if (!out.length) out.push({ level:'good', title:'Nema kritičnog signala', body:'Trenutni podaci ne pokazuju jasnu hitnu intervenciju. Nastavi sa prikupljanjem podataka i gledaj promene iz dana u dan.' });
    return out.slice(0, 12);
  })();
</script>

<header>
  <div class="eyebrow">0 € GROWTH ADVISOR</div>
  <h1>AI</h1>
  <p>Automatske preporuke iz Shopify, Meta Ads i storefront podataka — bez plaćenog AI API-ja.</p>
</header>

<section class="metrics">
  <div><span>30d Revenue</span><b>{moneyRsd(data.shopify.revenue)}</b></div>
  <div><span>30d Orders</span><b>{data.shopify.orders}</b></div>
  <div><span>AOV</span><b>{moneyRsd(data.shopify.aov)}</b></div>
  <div><span>7d Sessions</span><b>{data.storefront.sessions}</b></div>
</section>

<section class="panel">
  <div class="head"><div class="eyebrow">PRIORITETI</div><h2>Šta bih sada uradio</h2></div>
  <div class="cards">
    {#each insights as item}
      <article class:good={item.level === 'good'} class:watch={item.level === 'watch'} class:action={item.level === 'action'}>
        <div class="badge">{item.level === 'good' ? 'GOOD' : item.level === 'watch' ? 'WATCH' : 'ACTION'}</div>
        <h3>{item.title}</h3>
        <p>{item.body}</p>
      </article>
    {/each}
  </div>
</section>

<section class="panel compact">
  <div class="head"><div class="eyebrow">FUNNEL · 7 DAYS</div><h2>Storefront health</h2></div>
  <div class="mini-grid">
    <div><span>Sessions</span><b>{data.storefront.sessions}</b></div>
    <div><span>PDP sessions</span><b>{data.storefront.productViews}</b></div>
    <div><span>ATC sessions</span><b>{data.storefront.atcSessions}</b><small>{data.storefront.sessions ? pct(atcRate) : '—'}</small></div>
    <div><span>Checkout sessions</span><b>{data.storefront.checkoutSessions}</b><small>{data.storefront.atcSessions ? pct(checkoutRate) : '—'}</small></div>
    <div><span>Rage-click</span><b>{data.storefront.rageSessions}</b><small>{data.storefront.sessions ? pct(rageRate) : '—'}</small></div>
  </div>
</section>

<style>
  header{margin-bottom:22px;max-width:850px}h1{font-size:38px;margin:4px 0 8px;letter-spacing:-.04em}h2{font-size:20px;margin:4px 0 0}h3{font-size:15px;margin:9px 0 7px}header p,article p{color:#8f99a8;line-height:1.55}.eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.metrics>div,.panel{background:#101318;border:1px solid #20242b;border-radius:16px;padding:16px}.metrics span,.mini-grid span{display:block;color:#7f8997;font-size:11px;margin-bottom:8px}.metrics b{font-size:20px}.panel{padding:20px;margin-bottom:12px}.head{margin-bottom:14px}.cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.cards article{background:#0b0e12;border:1px solid #242a32;border-radius:14px;padding:15px}.cards article.good{border-color:#29442c}.cards article.watch{border-color:#4c4021}.cards article.action{border-color:#55302f}.badge{display:inline-block;font-size:9px;font-weight:900;letter-spacing:.1em;padding:5px 7px;border-radius:99px;background:#242a32;color:#aeb7c4}.good .badge{background:#15301b;color:#9df08e}.watch .badge{background:#302912;color:#f0d77b}.action .badge{background:#32191b;color:#ff9c9c}.compact{padding-bottom:18px}.mini-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.mini-grid div{background:#0b0e12;border:1px solid #20252c;border-radius:12px;padding:12px}.mini-grid b{font-size:18px}.mini-grid small{display:block;color:#8f99a8;margin-top:4px}@media(max-width:900px){.metrics{grid-template-columns:repeat(2,1fr)}.cards{grid-template-columns:1fr}.mini-grid{grid-template-columns:repeat(2,1fr)}}
</style>
