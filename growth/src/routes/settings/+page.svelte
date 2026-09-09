<script lang="ts">
  export let data: {
    connections: Record<string, unknown>[];
    connected: string | null;
    configured: { db: boolean; encryption: boolean; shopify: boolean; meta: boolean };
    autosync: { browserSeconds:number; serverMinutes:number; fullMinutes:number; state:Record<string,{lastSuccessAt:number;lastAttemptAt:number;lastError:string;result:Record<string,unknown>}> };
    tracker: { scriptUrl: string; sessions24h: number; lastSeenAt:number; collectorUrl:string };
  };

  let shop = '';
  let shopifySync = '';
  let metaSync = '';
  let syncingShopify = false;
  let syncingMeta = false;

  const connected = (provider: string) => data.connections.some((c) => c.provider === provider);
  $: trackerSnippet = `<script src="${data.tracker.scriptUrl}" defer><\/script>`;
  const when = (n:number) => n ? new Date(n).toLocaleString('sr-RS') : 'još nema uspešnog sync-a';

  async function copyTracker() { await navigator.clipboard.writeText(trackerSnippet); }
  async function runSync(provider: 'shopify' | 'meta') {
    if (provider === 'shopify') { syncingShopify = true; shopifySync = 'Osvežavam…'; } else { syncingMeta = true; metaSync = 'Osvežavam…'; }
    try {
      const res = await fetch(`/api/sync/${provider}`, { method: 'POST' });
      const payload = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new Error(String(payload.error || `HTTP ${res.status}`));
      const message = provider === 'shopify'
        ? `✓ ${payload.orders ?? 0} porudžbina · ${payload.items ?? 0} stavki`
        : `✓ ${payload.rows ?? 0} redova oglasa · ${payload.since ?? ''} → ${payload.until ?? ''}`;
      if (provider === 'shopify') shopifySync = message; else metaSync = message;
    } catch (e) {
      const message = `Greška: ${e instanceof Error ? e.message : 'sync failed'}`;
      if (provider === 'shopify') shopifySync = message; else metaSync = message;
    } finally { syncingShopify = false; syncingMeta = false; }
  }
</script>

<header><div class="eyebrow">TRENDYPATIKE · 0 € MODE</div><h1>Podešavanja</h1><p>Ovde samo proveravaš da li su veze zdrave. Podaci se osvežavaju automatski — nema potrebe da klikćeš Sync.</p></header>
{#if data.connected}<div class="success">✓ {data.connected === 'shopify' ? 'Shopify' : 'Meta Ads'} je uspešno povezan.</div>{/if}

<section class="auto">
  <div><span>Dok je dashboard otvoren</span><b>svakih {data.autosync.browserSeconds} sekundi</b><small>Shopify + današnji Meta podaci, pa se ekran sam osveži.</small></div>
  <div><span>Kad je dashboard zatvoren</span><b>svakih {data.autosync.serverMinutes} minut</b><small>Cloudflare pozadinski sync čuva podatke svežim.</small></div>
  <div><span>Puna istorijska provera</span><b>svakih {data.autosync.fullMinutes} minuta</b><small>Vraća 7d Meta istoriju i proverava starije Shopify porudžbine/refund.</small></div>
</section>

<section class="checks"><div class:ok={data.configured.db}>D1 <b>{data.configured.db ? 'READY' : 'MISSING'}</b></div><div class:ok={data.configured.encryption}>Encryption <b>{data.configured.encryption ? 'READY' : 'MISSING'}</b></div><div class="ok">LIVE AUTO <b>{data.autosync.browserSeconds}s</b></div><div class="ok">SERVER <b>{data.autosync.serverMinutes}m</b></div></section>

<div class="grid">
  <article>
    <div class="top"><div><span>SHOPIFY</span><h2>TrendyPatike Store</h2></div><strong class:on={connected('shopify')}>{connected('shopify') ? 'POVEZAN' : 'NIJE POVEZAN'}</strong></div>
    <p>Prihod, porudžbine i proizvodi. Otkazane, refundirane, voided i vraćene porudžbine ne ulaze u prodajne metrike.</p>
    {#if connected('shopify')}
      <div class="health"><b>Poslednji uspešan sync:</b> {when(data.autosync.state.shopify?.lastSuccessAt || 0)}{#if data.autosync.state.shopify?.lastError}<small>{data.autosync.state.shopify.lastError}</small>{/if}</div>
    {:else if data.configured.shopify && data.configured.db && data.configured.encryption}
      <form action="/connect/shopify" method="get"><label for="shop">Shopify shop domain</label><div class="row"><input id="shop" name="shop" bind:value={shop} placeholder="trendypatike.myshopify.com" required /><button>Poveži Shopify</button></div></form>
    {:else}<div class="pending">Cloudflare secrets još nisu podešeni.</div>{/if}
  </article>

  <article>
    <div class="top"><div><span>META ADS</span><h2>Facebook / Instagram Ads</h2></div><strong class:on={connected('meta')}>{connected('meta') ? 'POVEZAN' : 'NIJE POVEZAN'}</strong></div>
    <p>Spend, impressions, reach, frequency, CPM, CTR, CPC, link clicks, landing views, ATC, checkout, purchases, CPA i ROAS. Veza ostaje read-only.</p>
    {#if connected('meta')}
      <div class="health"><b>Poslednji uspešan sync:</b> {when(data.autosync.state.meta?.lastSuccessAt || 0)}{#if data.autosync.state.meta?.lastError}<small>{data.autosync.state.meta.lastError}</small>{/if}</div>
    {:else if data.configured.meta && data.configured.db && data.configured.encryption}<a class="button" href="/connect/meta">Poveži Meta Ads</a>{:else}<div class="pending">Cloudflare secrets još nisu podešeni.</div>{/if}
  </article>
</div>

<section class="tracker-card"><div class="tracker-head"><div><span class="eyebrow">STOREFRONT TRACKER</span><h2>Ponašanje kupaca</h2></div><strong class:on={data.tracker.sessions24h>0}>{data.tracker.sessions24h>0 ? `${data.tracker.sessions24h} sesija / 24h` : 'ČEKA SIGNAL'}</strong></div><p>Prati aktivno vreme, stranice, scroll, klikove, add-to-cart, checkout i mesto odustajanja. Poslednji signal: <b>{data.tracker.lastSeenAt ? when(data.tracker.lastSeenAt) : '—'}</b>. Ne čitamo vrednosti input polja, email, telefon ni adresu.</p><div class="snippet"><code>{trackerSnippet}</code><button on:click={copyTracker}>Kopiraj kod</button></div><div class="tracker-features">Page/PDP · active time · exact exit position · ATC · Cart · Checkout · click labels · scroll · rage/dead clicks · UTM/fbclid</div></section>

<details class="manual"><summary>Ručni sync — samo ako želiš test/fallback</summary><div class="manual-actions"><button on:click={() => runSync('shopify')} disabled={syncingShopify}>{syncingShopify ? 'Osvežavam…' : 'Shopify sada'}</button><button on:click={() => runSync('meta')} disabled={syncingMeta}>{syncingMeta ? 'Osvežavam…' : 'Meta sada'}</button></div>{#if shopifySync}<div class:syncerror={shopifySync.startsWith('Greška')} class="syncstatus">{shopifySync}</div>{/if}{#if metaSync}<div class:syncerror={metaSync.startsWith('Greška')} class="syncstatus">{metaSync}</div>{/if}</details>
<section class="note"><b>Bitno:</b> normalno korišćenje je potpuno automatsko. Meta write akcije su i dalje zaključane, tako da aplikacija ne može sama da promeni budžet ili ugasi oglas.</section>

<style>
  header{margin-bottom:24px;max-width:900px}h1{font-size:34px;margin:4px 0 8px;letter-spacing:-.04em}header p,article p,.tracker-card p{color:#8f99a8;line-height:1.55}.eyebrow,article span{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}.success{margin-bottom:14px;padding:12px 14px;background:#112114;border:1px solid #28442b;border-radius:12px;color:#9ef18e}
  .auto{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px}.auto>div{padding:16px;border-radius:16px;background:#101a10;border:1px solid #253a22}.auto span,.auto small{display:block;color:#7ea071;font-size:11px}.auto b{display:block;color:#c9ffb7;font-size:18px;margin:7px 0}.auto small{line-height:1.4}
  .checks{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}.checks div{font-size:11px;padding:8px 10px;border-radius:99px;background:#241719;color:#e7a3a3}.checks div.ok{background:#132016;color:#9ee890}.checks b{margin-left:5px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.grid article,.tracker-card{padding:20px;border:1px solid #20242b;background:#101318;border-radius:20px}.top,.tracker-head{display:flex;justify-content:space-between;gap:16px}.top h2,.tracker-head h2{margin:5px 0 0}.top strong,.tracker-head strong{font-size:10px;height:max-content;padding:6px 8px;border-radius:99px;background:#2b1b1d;color:#ff9696}.top strong.on,.tracker-head strong.on{background:#17301d;color:#90ee86}.health{margin-top:14px;padding:10px 12px;border-radius:10px;background:#0b0e12;border:1px solid #20262d;color:#9aa4b2;font-size:12px}.health small{display:block;color:#ff9f9f;margin-top:5px}label{font-size:12px;color:#aeb6c2;display:block;margin:18px 0 7px}.row{display:flex;gap:8px}input{min-width:0;flex:1;background:#090c10;border:1px solid #282e37;color:white;border-radius:10px;padding:11px 12px}button,.button{display:inline-block;border:0;background:#8bf048;color:#0b1408;font-weight:900;border-radius:10px;padding:11px 14px;cursor:pointer;text-decoration:none}button:disabled{opacity:.55;cursor:wait}.pending{margin-top:18px;padding:11px 12px;background:#171a20;border-radius:10px;color:#7f8997;font-size:12px}.tracker-card{margin-top:12px}.snippet{display:flex;gap:10px;align-items:center;background:#090c10;border:1px solid #272e36;border-radius:12px;padding:10px 10px 10px 13px}.snippet code{min-width:0;flex:1;color:#c7d0db;overflow:auto;white-space:nowrap;font-size:12px}.tracker-features{margin-top:12px;color:#78926f;font-size:11px}.manual{margin-top:12px;padding:14px;border:1px solid #20262d;border-radius:14px;background:#0d1116;color:#909aa8}.manual summary{cursor:pointer;font-weight:800;font-size:12px}.manual-actions{display:flex;gap:8px;margin-top:12px}.syncstatus{margin-top:10px;color:#9ee890;font-size:12px}.syncstatus.syncerror{color:#ff9f9f}.note{margin-top:12px;border:1px solid #27301e;background:#12180f;color:#a9c991;padding:15px;border-radius:14px;font-size:13px;line-height:1.5}
  @media(max-width:900px){.auto,.grid{grid-template-columns:1fr}.row{display:grid}.tracker-head{display:grid}.snippet{display:grid}.snippet button{width:max-content}}
</style>
