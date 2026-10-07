<script lang="ts">
  export let data:{shopify:{revenue:number;orders:number;aov:number;topTitle:string;topRevenue:number;topShare:number};storefront:{sessions:number;productViews:number;atcSessions:number;checkoutSessions:number;rageSessions:number};ads:{accountName:string;currency:string;adId:string;adName:string;spend:number;impressions:number;clicks:number;purchases:number;purchaseValue:number;ctr:number;cpc:number;roas:number}[]};
  const moneyRsd=(n:number)=>`${new Intl.NumberFormat('sr-RS').format(Math.round(n))} RSD`;
  const pct=(n:number)=>`${n.toFixed(1)}%`;
  const rate=(a:number,b:number)=>b?a/b*100:0;
  $: atcRate=rate(data.storefront.atcSessions,data.storefront.productViews||data.storefront.sessions);
  $: checkoutRate=rate(data.storefront.checkoutSessions,data.storefront.atcSessions);
  $: rageRate=rate(data.storefront.rageSessions,data.storefront.sessions);

  type Insight={level:'good'|'watch'|'action';title:string;body:string;evidence:string[];why:string;next:string[]};
  type AdvisorAction={id:string;label:string;kind:'link'|'sync';href?:string;provider?:'shopify'|'meta';tone?:'primary'|'warn'};
  type ChatMsg={role:'user'|'assistant';text:string;title?:string;evidence?:string[];actions?:AdvisorAction[];limitations?:string;meta?:string};

  let period='7d',input='',loading=false,actionBusy='';
  let messages:ChatMsg[]=[{role:'assistant',title:'AI Growth asistent je spreman',text:'Pitaj me „zašto“ i neću gledati samo jednu stopu. Analiziraću funnel, Heatmaps signale, prioritetne replay događaje, Shopify prodaju i Meta Ads, pa ću dati konkretan fix i način da proverimo da li je uspeo.',meta:'Cloudflare Workers AI · realni podaci iz tvoje prodavnice'}];
  const prompts=['Zašto je ATC nizak i šta tačno da promenim?','Zašto kupci odustaju posle korpe?','Pogledaj replay-e i reci gde ih najviše gubimo','Da li Meta dovodi loš saobraćaj ili je problem sajt?'];

  async function ask(text=input){
    const q=text.trim();if(!q||loading)return;
    messages=[...messages,{role:'user',text:q}];input='';loading=true;
    try{
      const r=await fetch('/api/advisor/chat',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({message:q,period})});
      const x:any=await r.json();
      messages=[...messages,{role:'assistant',title:x.title||'Analiza',text:x.answer||x.error||'Nisam uspeo da analiziram.',evidence:x.evidence||[],actions:x.actions||[],limitations:x.limitations,meta:x.ok?`${x.ai?'PRAVI AI':'DATA FALLBACK'} · ${x.pagesReviewed||0} stranica · ${x.replaysReviewed||0} prioritetnih replay-a · ${x.aiRequestsRemaining??'—'} AI upita ostalo danas`:undefined}];
    }catch(e){messages=[...messages,{role:'assistant',title:'Greška',text:'Analiza trenutno nije uspela. Pokušaj ponovo.'}];}
    finally{loading=false;setTimeout(()=>document.getElementById('ai-chat')?.scrollIntoView({behavior:'smooth',block:'start'}),50);}
  }

  async function askInsight(item:Insight){
    const q=`Detaljno analiziraj pametni savet „${item.title}“. Trenutni signal je: ${item.body}. Brojke: ${item.evidence.join('; ')}. Nemoj stati na ovoj stopi: pregledaj dostupne Heatmaps signale i prioritetne session replay događaje, pronađi najverovatnije razloge, reci koliko replay-a/signala to podržava i daj TAČAN fix: koju stranicu, element, tekst ili raspored menjam, šta prvo, i kako merimo rezultat.`;
    await ask(q);
  }

  async function runAction(a:AdvisorAction){
    if(a.kind==='link'&&a.href){location.href=a.href;return;}
    if(a.kind==='sync'&&a.provider){
      actionBusy=a.id;
      try{
        const r=await fetch('/api/advisor/action',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:a.provider})});
        const x:any=await r.json();
        messages=[...messages,{role:'assistant',title:x.ok?'Gotovo':'Akcija nije uspela',text:x.ok?`${a.provider==='meta'?'Meta Ads':'Shopify'} podaci su osveženi. Pitaj me ponovo i analiziraću sveže podatke.`:(x.error||'Greška pri osvežavanju.')}];
      }finally{actionBusy='';}
    }
  }

  $: insights=(()=>{const out:Insight[]=[];
    if(!data.storefront.sessions)out.push({level:'action',title:'Nema dovoljno podataka o ponašanju kupaca',body:'Tracker još nema dovoljno sesija za zaključke.',evidence:['7d sesije: 0'],why:'Bez sesija ne možemo pouzdano analizirati ATC, checkout, heatmap ni replay.',next:['Proveri tracker signal u Podešavanjima','Sačekaj realne posete']});
    else{
      if(atcRate<4)out.push({level:'action',title:'Add-to-cart stopa je niska',body:`Samo ${pct(atcRate)} PDP sesija dodaje proizvod u korpu.`,evidence:[`Sesije: ${data.storefront.sessions}`,`PDP sesije: ${data.storefront.productViews}`,`ATC sesije: ${data.storefront.atcSessions}`,`PDP→ATC: ${pct(atcRate)}`],why:'Ovo označava gde je pad, ali samo replay/heatmap mogu da pokažu šta korisnici rade neposredno pre izlaza.',next:['AI neka pregleda replay-e bez ATC','Uporedi exit elemente, scroll i rage/dead klikove','Promeni samo element koji podaci označe kao problem']});
      if(data.storefront.atcSessions>0&&checkoutRate<35)out.push({level:'action',title:'Prevelik pad od korpe do checkouta',body:`Samo ${pct(checkoutRate)} ATC sesija nastavlja na checkout.`,evidence:[`ATC: ${data.storefront.atcSessions}`,`Checkout: ${data.storefront.checkoutSessions}`,`ATC→Checkout: ${pct(checkoutRate)}`],why:'Signal je u cart koraku; uzrok treba potvrditi redosledom klikova, vremenom i exit događajima.',next:['AI neka analizira ATC bez checkout replay-e','Proveri cart drawer, dostavu, ukupnu cenu i Checkout CTA']});
      if(rageRate>=5)out.push({level:'action',title:'Kupci imaju frustrirajuće klikove',body:`${pct(rageRate)} sesija ima rage-click.`,evidence:[`Rage sesije: ${data.storefront.rageSessions}`,`Sve sesije: ${data.storefront.sessions}`,`Rage stopa: ${pct(rageRate)}`],why:'Više brzih klikova na isto mesto je jak signal da element ne reaguje kako korisnik očekuje.',next:['AI neka izdvoji elemente sa najviše rage/dead klikova','Pogledaj replay neposredno pre tih klikova']});
    }
    if(data.shopify.topShare>=30&&data.shopify.topTitle)out.push({level:'watch',title:'Prihod zavisi od jednog proizvoda',body:`${data.shopify.topTitle} nosi oko ${pct(data.shopify.topShare)} preuzetog 30-dnevnog prihoda.`,evidence:[`Preuzeti 30d prihod: ${moneyRsd(data.shopify.revenue)}`,`Top proizvod: ${data.shopify.topTitle}`,`Udeo: ${pct(data.shopify.topShare)}`],why:'Prihod sada računa samo validne, fulfilled/preuzete porudžbine, pa koncentracija bolje odražava stvarno realizovanu prodaju.',next:['Drži stock pod kontrolom','Testiraj slične modele i creative varijante']});
    for(const ad of data.ads.slice(0,8)){
      const label=`${ad.adName}${ad.accountName?` · ${ad.accountName}`:''}`;
      if(ad.spend>0&&ad.purchases===0&&ad.clicks>=15&&ad.ctr>=2)out.push({level:'action',title:`Klikovi dolaze, kupovine ne: ${label}`,body:`CTR ${pct(ad.ctr)}, ${ad.clicks} klikova i 0 Meta kupovina.`,evidence:[`Spend: ${ad.spend.toFixed(2)} ${ad.currency}`,`Impressions: ${ad.impressions}`,`Clicks: ${ad.clicks}`,`CTR: ${pct(ad.ctr)}`,`Purchases: ${ad.purchases}`],why:'Creative dobija klik, ali tek storefront + replay podaci mogu da pokažu gde posle klika nastaje prekid.',next:['AI neka uporedi Meta klikove sa Facebook sesijama','Ne povećavaj budžet dok ne znamo da li curi PDP, cart ili checkout']});
      else if(ad.purchases>0&&ad.roas>=3)out.push({level:'good',title:`Jak ROAS: ${label}`,body:`ROAS je ${ad.roas.toFixed(2)}.`,evidence:[`Spend: ${ad.spend.toFixed(2)} ${ad.currency}`,`Purchases: ${ad.purchases}`,`Meta revenue: ${ad.purchaseValue.toFixed(2)} ${ad.currency}`,`ROAS: ${ad.roas.toFixed(2)}`],why:'Meta pripisuje višestruko veći prihod od potrošnje.',next:['Ako uzorak nije mali, skaliraj postepeno','Prati CPA i frequency posle izmene']});
    }
    if(!out.length)out.push({level:'good',title:'Nema kritičnog signala',body:'Trenutni pragovi ne pokazuju jedan očigledan problem.',evidence:[`Preuzete 30d porudžbine: ${data.shopify.orders}`,`7d sesije: ${data.storefront.sessions}`],why:'Nijedan ugrađeni prag nije aktiviran; AI i dalje može da traži slabije obrasce u heatmap/replay podacima.',next:['Pitaj AI šta bi testirao sledeće','Prati promene po danima']});
    return out.slice(0,12);
  })();
</script>

<header>
  <div class="eyebrow">AI GROWTH ADVISOR · LIVE DATA</div>
  <h1>Pametni saveti</h1>
  <p>Pravi AI odgovor iz Shopify, Meta Ads, Heatmaps i session replay signala. AI dobija samo analitičke podatke — ne email, telefon, adresu ni sadržaj input polja.</p>
</header>

<section id="ai-chat" class="chat panel">
  <div class="chat-head"><div><div class="eyebrow">AI ANALITIČAR</div><h2>Pitaj „zašto“ i traži konkretan fix</h2><p class="sub">Hard guard: najviše 30 AI analiza dnevno. Ako AI nije dostupan, dobijaš označen data-fallback.</p></div><select bind:value={period} aria-label="Period analize"><option value="today">Danas</option><option value="yesterday">Juče</option><option value="7d">7 dana</option><option value="30d">30 dana</option></select></div>
  <div class="prompt-row">{#each prompts as p}<button type="button" on:click={()=>ask(p)}>{p}</button>{/each}</div>
  <div class="thread">
    {#each messages as m}
      <div class="msg" class:user={m.role==='user'} class:assistant={m.role==='assistant'}>
        {#if m.title}<b>{m.title}</b>{/if}
        {#if m.meta}<div class="msg-meta">{m.meta}</div>{/if}
        <p>{m.text}</p>
        {#if m.evidence?.length}<div class="evidence-row">{#each m.evidence as e}<span>{e}</span>{/each}</div>{/if}
        {#if m.actions?.length}<div class="action-row">{#each m.actions as a}<button type="button" class:primary={a.tone==='primary'} disabled={actionBusy===a.id} on:click={()=>runAction(a)}>{actionBusy===a.id?'Radim…':a.label}</button>{/each}</div>{/if}
        {#if m.limitations}<small>{m.limitations}</small>{/if}
      </div>
    {/each}
    {#if loading}<div class="msg assistant"><b>AI analizira funnel, heatmap i replay signale…</b></div>{/if}
  </div>
  <form on:submit|preventDefault={()=>ask()}><textarea bind:value={input} rows="3" placeholder="Npr. Zašto ljudi na Lot 38 izlaze bez dodavanja u korpu i šta tačno da promenim?"></textarea><button class="send" disabled={loading||!input.trim()}>AI analiza</button></form>
</section>

<section class="metrics"><div><span>30d preuzeti prihod</span><b>{moneyRsd(data.shopify.revenue)}</b><small>samo fulfilled/validne</small></div><div><span>30d preuzete porudžbine</span><b>{data.shopify.orders}</b><small>bez otkazanih/refundiranih</small></div><div><span>Prosečna preuzeta porudžbina</span><b>{moneyRsd(data.shopify.aov)}</b></div><div><span>7d storefront sesije</span><b>{data.storefront.sessions}</b></div></section>

<section class="panel"><div class="head"><div class="eyebrow">PRIORITETI</div><h2>Šta prvo da uradiš</h2><p class="sub">Svaki savet možeš da pošalješ AI-u da proveri heatmap + replay pre nego što išta menjaš.</p></div><div class="cards">
  {#each insights as item}
    <details class:good={item.level==='good'} class:watch={item.level==='watch'} class:action={item.level==='action'}>
      <summary><div><span class="badge">{item.level==='good'?'DOBRO':item.level==='watch'?'PRATI':'AKCIJA'}</span><h3>{item.title}</h3><p>{item.body}</p></div><b class="more">Detalji +</b></summary>
      <div class="detail"><section><h4>Brojke koje su aktivirale savet</h4>{#each item.evidence as e}<div class="evidence">{e}</div>{/each}</section><section><h4>Šta ovaj signal znači</h4><p>{item.why}</p></section><section><h4>Pre AI provere</h4><ol>{#each item.next as n}<li>{n}</li>{/each}</ol></section><button type="button" class="ai-fix" on:click={()=>askInsight(item)}>AI: analiziraj replay/heatmap i daj konkretan fix</button><small>AI mora da veže fix za konkretne brojke/signale. Ako nema dovoljno dokaza, treba da kaže šta nedostaje umesto da izmisli razlog.</small></div>
    </details>
  {/each}
</div></section>

<section class="panel"><div class="head"><div class="eyebrow">FUNNEL · 7 DANA</div><h2>Brzi pregled sajta</h2></div><div class="mini-grid"><div><span>Sesije</span><b>{data.storefront.sessions}</b></div><div><span>PDP</span><b>{data.storefront.productViews}</b></div><div><span>ATC</span><b>{data.storefront.atcSessions}</b><small>{data.storefront.productViews?pct(atcRate):'—'}</small></div><div><span>Checkout</span><b>{data.storefront.checkoutSessions}</b><small>{data.storefront.atcSessions?pct(checkoutRate):'—'}</small></div><div><span>Rage-click</span><b>{data.storefront.rageSessions}</b><small>{data.storefront.sessions?pct(rageRate):'—'}</small></div></div></section>

<style>
  header{margin-bottom:22px;max-width:980px}h1{font-size:38px;margin:4px 0 8px;letter-spacing:-.04em}h2{font-size:22px;margin:4px 0 0}h3{font-size:16px;margin:8px 0 6px}h4{font-size:12px;margin:0 0 8px;color:#dce3ec}.eyebrow{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}header p,.sub,details p{color:#8f99a8;line-height:1.55}.sub{font-size:12px;margin:6px 0 0}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.metrics>div,.panel{background:#101318;border:1px solid #20242b;border-radius:16px;padding:16px}.metrics span,.mini-grid span{display:block;color:#7f8997;font-size:11px;margin-bottom:8px}.metrics b{font-size:20px}.metrics small{display:block;color:#6f7987;margin-top:6px}.panel{padding:20px;margin-bottom:12px}.chat{border-color:#315234}.chat-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.chat-head select{background:#0b0e12;color:#dfe7ef;border:1px solid #2b323b;border-radius:10px;padding:10px 12px}.prompt-row,.action-row,.evidence-row{display:flex;gap:8px;flex-wrap:wrap}.prompt-row{margin:14px 0}.prompt-row button,.action-row button{background:#171c22;color:#c7d0dc;border:1px solid #29313a;border-radius:999px;padding:8px 11px;font-size:12px;cursor:pointer}.action-row button.primary,.send,.ai-fix{background:#8bf048;color:#071006;border-color:#8bf048;font-weight:800}.thread{display:grid;gap:10px;max-height:620px;overflow:auto;padding:2px}.msg{max-width:90%;border-radius:14px;padding:13px 14px}.msg.assistant{background:#0b0e12;border:1px solid #222a32}.msg.user{margin-left:auto;background:#19301b;border:1px solid #315337}.msg p{margin:7px 0;color:#b8c1cc;line-height:1.6;white-space:pre-wrap}.msg small{display:block;margin-top:9px;color:#707b88;line-height:1.45}.msg-meta{font-size:10px;color:#8bf048;margin-top:5px;font-weight:700}.evidence-row{margin:10px 0}.evidence-row span{background:#151a20;border:1px solid #29313a;color:#d2d9e2;border-radius:9px;padding:6px 8px;font-size:11px}.action-row{margin-top:10px}.action-row button:disabled,.send:disabled{opacity:.55;cursor:default}.chat form{display:grid;grid-template-columns:1fr auto;gap:10px;margin-top:14px}.chat textarea{resize:vertical;background:#090c10;color:#eef3f7;border:1px solid #2a3139;border-radius:12px;padding:12px;font:inherit;line-height:1.45}.send{border:0;border-radius:12px;padding:0 18px}.head{margin-bottom:14px}.cards{display:grid;gap:10px}.cards details{background:#0b0e12;border:1px solid #242a32;border-radius:14px;padding:0}.cards details.good{border-color:#29442c}.cards details.watch{border-color:#4c4021}.cards details.action{border-color:#55302f}.cards summary{display:flex;justify-content:space-between;gap:20px;padding:15px;cursor:pointer;list-style:none}.cards summary::-webkit-details-marker{display:none}.badge{display:inline-block;font-size:9px;font-weight:900;letter-spacing:.1em;padding:5px 7px;border-radius:99px;background:#242a32;color:#aeb7c4}.good .badge{background:#15301b;color:#9df08e}.watch .badge{background:#302912;color:#f0d77b}.action .badge{background:#32191b;color:#ff9c9c}.more{font-size:11px;color:#8bf048;white-space:nowrap}.detail{border-top:1px solid #20262d;padding:15px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}.detail section{background:#101318;border:1px solid #20262d;border-radius:12px;padding:12px}.detail p,.detail li{font-size:12px;color:#aab3bf;line-height:1.5}.detail ol{padding-left:18px;margin:0}.evidence{font-size:12px;color:#d8e0ea;padding:7px 8px;background:#0c0f13;border-radius:8px;margin:5px 0}.detail>small{grid-column:1/-1;color:#6f7987}.ai-fix{grid-column:1/-1;border:0;border-radius:11px;padding:11px 14px;cursor:pointer;font-size:13px}.mini-grid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}.mini-grid div{background:#0b0e12;border:1px solid #20252c;border-radius:12px;padding:12px}.mini-grid b{font-size:18px}.mini-grid small{display:block;color:#8f99a8;margin-top:4px}
  @media(max-width:900px){h1{font-size:34px}.metrics{grid-template-columns:repeat(2,1fr)}.detail{grid-template-columns:1fr}.mini-grid{grid-template-columns:repeat(2,1fr)}.chat-head{flex-direction:column}.chat form{grid-template-columns:1fr}.send{padding:12px}.msg{max-width:100%}}
</style>
