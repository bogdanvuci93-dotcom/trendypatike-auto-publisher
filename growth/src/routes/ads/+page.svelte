<script lang="ts">
  type AdRow = { accountId:string;accountName:string;currency:string;campaignId:string;campaignName:string;adsetId:string;adsetName:string;adId:string;name:string;spend:number;impressions:number;reach:number;frequency:number;clicks:number;linkClicks:number;landingPageViews:number;addToCart:number;checkouts:number;purchases:number;revenue:number;ctr:number;cpc:number;cpm:number;linkCtr:number;landingRate:number;atcRate:number;checkoutRate:number;purchaseRate:number;roas:number;cpa:number };
  export let data: {
    lastSyncAt:number|null; range:{since:string;until:string}; rows:AdRow[];
    totals:{spend:number;impressions:number;reach:number;clicks:number;linkClicks:number;landingPageViews:number;addToCart:number;checkouts:number;purchases:number;revenue:number;ctr:number;cpc:number;cpm:number;frequency:number;roas:number;cpa:number};
    currency:string; mixedCurrency:boolean;
  };

  let openAd = '';
  let openHelp = '';
  const money=(n:number,currency=data.currency||'RSD')=>{try{return new Intl.NumberFormat('sr-RS',{style:'currency',currency,maximumFractionDigits:currency==='RSD'?0:2}).format(n)}catch{return `${new Intl.NumberFormat('sr-RS',{maximumFractionDigits:2}).format(n)} ${currency}`}};
  const pct=(n:number)=>`${n.toFixed(2)}%`;
  const num=(n:number)=>new Intl.NumberFormat('sr-RS',{maximumFractionDigits:1}).format(n);
  const help:Record<string,{title:string;text:string;formula:string;read:string}>={
    spend:{title:'Potrošnja',text:'Koliko je Meta naplatila za oglase u izabranom periodu.',formula:'zbir spend-a svih oglasa',read:'Nije dobro ili loše samo po sebi — poredi se sa kupovinama, CPA i ROAS.'},
    impressions:{title:'Impressions',text:'Koliko puta su oglasi prikazani. Ista osoba može napraviti više prikaza.',formula:'Meta broj prikaza',read:'Koristi se za CPM i CTR.'},
    cpm:{title:'CPM',text:'Cena za 1.000 prikaza oglasa.',formula:'spend ÷ impressions × 1.000',read:'Niži CPM znači jeftiniji reach, ali ne znači automatski više prodaje.'},
    ctr:{title:'CTR',text:'Procenat prikaza koji su završili klikom.',formula:'clicks ÷ impressions × 100',read:'Viši CTR obično znači da creative/hook privlači pažnju.'},
    cpc:{title:'CPC',text:'Prosečna cena jednog klika.',formula:'spend ÷ clicks',read:'Niži CPC je dobar samo ako klikovi posle prelaze u ATC/checkout/kupovinu.'},
    lpv:{title:'Landing Page Views',text:'Koliko puta je landing stranica zaista učitana posle klika.',formula:'Meta landing_page_view action',read:'Ako je mnogo klikova a malo LPV, proveri spor sajt ili pogrešne klikove.'},
    atc:{title:'Add to Cart',text:'Koliko Meta pripisuje dodavanja proizvoda u korpu.',formula:'Meta add_to_cart action',read:'Dobar signal da proizvodna stranica i ponuda imaju interesovanje.'},
    purchases:{title:'Kupovine',text:'Kupovine koje Meta pripisuje oglasu.',formula:'Meta purchase action',read:'Poredi sa Shopify porudžbinama; atribucija se može razlikovati.'},
    cpa:{title:'CPA',text:'Koliko u proseku košta jedna pripisana kupovina.',formula:'spend ÷ purchases',read:'Što je CPA niži u odnosu na tvoju maržu, oglas je zdraviji.'},
    roas:{title:'ROAS',text:'Koliko prihoda Meta pripisuje na svaki 1 RSD/EUR potrošen.',formula:'Meta revenue ÷ spend',read:'ROAS 3 znači oko 3 jedinice prihoda na 1 jedinicu ad spend-a.'},
    frequency:{title:'Frequency',text:'Koliko puta u proseku ista osoba vidi oglas.',formula:'Meta frequency, ovde weighted prosek po danima',read:'Ako raste a CTR pada, publika možda zamara creative.'}
  };
  const toggleHelp=(key:string)=>openHelp=openHelp===key?'':key;
</script>

<header><div class="eyebrow">META ADS · POSLEDNJIH 7 DANA</div><h1>Oglasi</h1><p>Prvo vidiš samo ono što je bitno. Klikni bilo koji “?” ili oglas da dobiješ detaljno objašnjenje i ceo funnel.</p></header>

{#if data.mixedCurrency}<div class="warning">Povezano je više Meta naloga sa različitim valutama. Novčane total metrike se zato ne sabiraju kao jedna valuta.</div>{/if}

<section class="metrics">
  {#each [
    ['spend','Potrošnja',data.mixedCurrency?'Mixed':money(data.totals.spend)],
    ['impressions','Prikazi',data.totals.impressions.toLocaleString('sr-RS')],
    ['cpm','CPM',data.mixedCurrency?'—':money(data.totals.cpm)],
    ['ctr','CTR',pct(data.totals.ctr)],
    ['cpc','CPC',data.mixedCurrency?'—':money(data.totals.cpc)],
    ['purchases','Kupovine',String(data.totals.purchases)],
    ['cpa','CPA',data.mixedCurrency||!data.totals.purchases?'—':money(data.totals.cpa)],
    ['roas','ROAS',data.mixedCurrency?'—':data.totals.roas.toFixed(2)]
  ] as metric}
    <button class:active={openHelp===metric[0]} class="metric" on:click={()=>toggleHelp(metric[0])}><span>{metric[1]} <i>?</i></span><b>{metric[2]}</b></button>
  {/each}
</section>

{#if openHelp && help[openHelp]}
  <section class="helpbox"><strong>{help[openHelp].title}</strong><p>{help[openHelp].text}</p><small><b>Račun:</b> {help[openHelp].formula}</small><small><b>Kako da čitaš:</b> {help[openHelp].read}</small></section>
{/if}

<section class="panel funnel-total">
  <div class="head"><div><span class="eyebrow">META FUNNEL · 7 DANA</span><h2>Od prikaza do kupovine</h2></div>{#if data.lastSyncAt}<small>Auto: {new Date(data.lastSyncAt).toLocaleString('sr-RS')}</small>{/if}</div>
  <div class="funnel">
    <button on:click={()=>toggleHelp('impressions')}><b>{data.totals.impressions.toLocaleString('sr-RS')}</b><span>prikaza</span></button><i>→</i>
    <div><b>{data.totals.clicks.toLocaleString('sr-RS')}</b><span>klikova · {pct(data.totals.ctr)}</span></div><i>→</i>
    <button on:click={()=>toggleHelp('lpv')}><b>{num(data.totals.landingPageViews)}</b><span>landing views</span></button><i>→</i>
    <button on:click={()=>toggleHelp('atc')}><b>{num(data.totals.addToCart)}</b><span>add to cart</span></button><i>→</i>
    <div><b>{num(data.totals.checkouts)}</b><span>checkout</span></div><i>→</i>
    <button on:click={()=>toggleHelp('purchases')}><b>{num(data.totals.purchases)}</b><span>kupovine</span></button>
  </div>
</section>

<section class="panel">
  <div class="head"><div><span class="eyebrow">{data.range.since} → {data.range.until}</span><h2>Oglasi — klikni red za sve detalje</h2></div></div>
  {#if data.rows.length}
    <div class="table-wrap"><table>
      <thead><tr><th>Oglas</th><th>Spend</th><th><button on:click={()=>toggleHelp('cpm')}>CPM ?</button></th><th><button on:click={()=>toggleHelp('ctr')}>CTR ?</button></th><th><button on:click={()=>toggleHelp('cpc')}>CPC ?</button></th><th>Kupovine</th><th><button on:click={()=>toggleHelp('cpa')}>CPA ?</button></th><th><button on:click={()=>toggleHelp('roas')}>ROAS ?</button></th></tr></thead>
      <tbody>{#each data.rows as row}
        <tr class="adrow" class:opened={openAd===row.adId} on:click={()=>openAd=openAd===row.adId?'':row.adId}>
          <td><strong>{row.name}</strong><small>{row.campaignName||'—'} · {row.adsetName||'—'}</small></td><td>{money(row.spend,row.currency)}</td><td>{money(row.cpm,row.currency)}</td><td>{pct(row.ctr)}</td><td>{money(row.cpc,row.currency)}</td><td>{num(row.purchases)}</td><td>{row.purchases?money(row.cpa,row.currency):'—'}</td><td><b class:good={row.roas>=3} class:bad={row.spend>0&&row.roas<1.5}>{row.roas.toFixed(2)}</b></td>
        </tr>
        {#if openAd===row.adId}
          <tr class="details"><td colspan="8"><div class="detailgrid">
            <div><span>Prikazi</span><b>{row.impressions.toLocaleString('sr-RS')}</b></div><div><span>Reach* </span><b>{row.reach.toLocaleString('sr-RS')}</b></div><div><span>Frequency</span><b>{row.frequency.toFixed(2)}</b></div><div><span>Svi klikovi</span><b>{row.clicks}</b></div><div><span>Link klikovi</span><b>{row.linkClicks}</b></div><div><span>Landing views</span><b>{num(row.landingPageViews)}</b></div><div><span>Add to cart</span><b>{num(row.addToCart)}</b></div><div><span>Checkout</span><b>{num(row.checkouts)}</b></div><div><span>Click → purchase</span><b>{pct(row.purchaseRate)}</b></div><div><span>Meta prihod</span><b>{money(row.revenue,row.currency)}</b></div>
          </div><p class="plain">{row.purchases>0 ? `Ovaj oglas je potrošio ${money(row.spend,row.currency)} i Meta mu pripisuje ${num(row.purchases)} kupovina. CPA je ${money(row.cpa,row.currency)}, a ROAS ${row.roas.toFixed(2)}.` : `Ovaj oglas je potrošio ${money(row.spend,row.currency)} bez pripisane kupovine. Pogledaj CTR, landing views i ATC da vidiš da li problem počinje u oglasu ili na sajtu.`}</p><small class="reachnote">* Reach kroz 7 dana je zbir dnevnog reach-a, pa ista osoba može biti uračunata više dana.</small></td></tr>
        {/if}
      {/each}</tbody>
    </table></div>
  {:else}<div class="empty">Još nema Meta podataka. Auto-sync će ih sam povući.</div>{/if}
</section>

<style>
  header{margin-bottom:22px;max-width:900px}h1{font-size:34px;margin:4px 0 8px;letter-spacing:-.04em}h2{font-size:19px;margin:4px 0 0}header p{color:#8f99a8;line-height:1.5}.eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}.warning{margin-bottom:12px;padding:13px 14px;border-radius:13px;background:#2a2413;border:1px solid #51451f;color:#f0d987;font-size:13px;line-height:1.45}
  .metrics{display:grid;grid-template-columns:repeat(8,1fr);gap:8px;margin-bottom:10px}.metric{background:#101318;border:1px solid #20242b;border-radius:14px;padding:14px;text-align:left;color:#fff;cursor:pointer}.metric:hover,.metric.active{border-color:#3c4a34;background:#121912}.metric span{display:block;color:#7f8997;font-size:10px}.metric i{font-style:normal;display:inline-grid;place-items:center;width:17px;height:17px;border-radius:50%;background:#20262d}.metric b{display:block;font-size:18px;margin-top:8px}.helpbox{margin-bottom:10px;padding:15px;border-radius:14px;background:#152014;border:1px solid #2b4227;color:#d3e8cd}.helpbox p{margin:7px 0;color:#a7bda1}.helpbox small{display:block;margin-top:5px;color:#80977a}
  .panel{background:#101318;border:1px solid #20242b;border-radius:16px;padding:20px;margin-bottom:12px}.head{display:flex;justify-content:space-between;align-items:end;margin-bottom:14px}.head small{color:#7f8997}.funnel{display:grid;grid-template-columns:1fr auto 1fr auto 1fr auto 1fr auto 1fr auto 1fr;gap:8px;align-items:center}.funnel>div,.funnel>button{background:#0b0e12;border:1px solid #20262d;border-radius:12px;padding:13px;color:#fff;text-align:center}.funnel>button{cursor:pointer}.funnel b,.funnel span{display:block}.funnel b{font-size:18px}.funnel span{font-size:10px;color:#7f8997;margin-top:4px}.funnel i{font-style:normal;color:#4e5966}
  .table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th,td{text-align:left;padding:12px 10px;border-bottom:1px solid #1e232a;white-space:nowrap}th{color:#77818f;font-size:10px;text-transform:uppercase;letter-spacing:.07em}th button{background:none;border:0;padding:0;color:inherit;font:inherit;cursor:pointer}td:first-child{min-width:280px}td small{display:block;color:#65707e;margin-top:4px;font-size:10px}.adrow{cursor:pointer}.adrow:hover,.adrow.opened{background:#141a14}.good{color:#96ed83}.bad{color:#ff918b}.details td{white-space:normal;background:#0b0f0c}.detailgrid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.detailgrid div{padding:11px;border:1px solid #202a20;border-radius:10px;background:#101710}.detailgrid span,.detailgrid b{display:block}.detailgrid span{font-size:9px;color:#748170;text-transform:uppercase}.detailgrid b{font-size:15px;margin-top:5px}.plain{margin:12px 0 4px;color:#aeb9aa;line-height:1.5}.reachnote{color:#667364}.empty{padding:18px;background:#0c0f13;border:1px dashed #2a313a;border-radius:14px;color:#8e98a7}
  @media(max-width:1200px){.metrics{grid-template-columns:repeat(4,1fr)}.detailgrid{grid-template-columns:repeat(3,1fr)}}@media(max-width:850px){.metrics{grid-template-columns:repeat(2,1fr)}.funnel{grid-template-columns:1fr}.funnel i{transform:rotate(90deg)}.detailgrid{grid-template-columns:repeat(2,1fr)}}
</style>
