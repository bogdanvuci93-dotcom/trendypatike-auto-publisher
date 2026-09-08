<script lang="ts">
  export let data: {
    connections: Record<string, unknown>[];
    connected: string | null;
    configured: { db: boolean; encryption: boolean; shopify: boolean; meta: boolean };
    tracker: { scriptUrl: string; sessions24h: number };
  };

  let shop = '';
  let shopifySync = '';
  let metaSync = '';
  let syncingShopify = false;
  let syncingMeta = false;

  const connected = (provider: string) => data.connections.some((c) => c.provider === provider);
  $: trackerSnippet = `<script src="${data.tracker.scriptUrl}" defer><\/script>`;

  async function copyTracker() {
    await navigator.clipboard.writeText(trackerSnippet);
  }

  async function runSync(provider: 'shopify' | 'meta') {
    if (provider === 'shopify') {
      syncingShopify = true;
      shopifySync = 'Syncing…';
    } else {
      syncingMeta = true;
      metaSync = 'Syncing…';
    }

    try {
      const res = await fetch(`/api/sync/${provider}`, { method: 'POST' });
      const payload = await res.json() as Record<string, unknown>;
      if (!res.ok) throw new Error(String(payload.error || `HTTP ${res.status}`));
      const message = provider === 'shopify'
        ? `✓ ${payload.orders ?? 0} orders · ${payload.items ?? 0} items synced`
        : `✓ ${payload.accounts ?? 0} ad account · ${payload.ads ?? 0} ads synced`;
      if (provider === 'shopify') shopifySync = message;
      else metaSync = message;
    } catch (e) {
      const message = `Greška: ${e instanceof Error ? e.message : 'sync failed'}`;
      if (provider === 'shopify') shopifySync = message;
      else metaSync = message;
    } finally {
      syncingShopify = false;
      syncingMeta = false;
    }
  }
</script>

<header>
  <div class="eyebrow">TRENDYPATIKE · 0 € MODE</div>
  <h1>Connections</h1>
  <p>Zvanični OAuth tokovi. Tokeni se čuvaju šifrovano u D1 i nikad se ne prikazuju u dashboardu.</p>
</header>

{#if data.connected}
  <div class="success">✓ {data.connected === 'shopify' ? 'Shopify' : 'Meta Ads'} je uspešno povezan.</div>
{/if}

<section class="checks">
  <div class:ok={data.configured.db}>D1 database <b>{data.configured.db ? 'READY' : 'MISSING'}</b></div>
  <div class:ok={data.configured.encryption}>Encryption key <b>{data.configured.encryption ? 'READY' : 'MISSING'}</b></div>
</section>

<div class="grid">
  <article>
    <div class="top"><div><span>SHOPIFY</span><h2>TrendyPatike Store</h2></div><strong class:on={connected('shopify')}>{connected('shopify') ? 'CONNECTED' : 'NOT CONNECTED'}</strong></div>
    <p>Orders, products i inventory za revenue, funnel i profit analizu.</p>
    {#if connected('shopify')}
      <div class="connected-actions">
        <button on:click={() => runSync('shopify')} disabled={syncingShopify}>{syncingShopify ? 'Syncing…' : 'Sync Shopify now'}</button>
        {#if shopifySync}<div class:syncerror={shopifySync.startsWith('Greška')} class="syncstatus">{shopifySync}</div>{/if}
      </div>
    {:else if data.configured.shopify && data.configured.db && data.configured.encryption}
      <form action="/connect/shopify" method="get">
        <label for="shop">Shopify shop domain</label>
        <div class="row"><input id="shop" name="shop" bind:value={shop} placeholder="trendypatike.myshopify.com" required /><button>Connect Shopify</button></div>
      </form>
    {:else}
      <div class="pending">Cloudflare secrets još nisu podešeni.</div>
    {/if}
  </article>

  <article>
    <div class="top"><div><span>META ADS</span><h2>Facebook / Instagram Ads</h2></div><strong class:on={connected('meta')}>{connected('meta') ? 'CONNECTED' : 'NOT CONNECTED'}</strong></div>
    <p>Campaign, ad set, ad, spend, CTR, CPC, purchases i ROAS. Početna dozvola je read-only.</p>
    {#if connected('meta')}
      <div class="connected-actions">
        <button on:click={() => runSync('meta')} disabled={syncingMeta}>{syncingMeta ? 'Syncing…' : 'Sync Meta Ads now'}</button>
        {#if metaSync}<div class:syncerror={metaSync.startsWith('Greška')} class="syncstatus">{metaSync}</div>{/if}
      </div>
    {:else if data.configured.meta && data.configured.db && data.configured.encryption}
      <a class="button" href="/connect/meta">Connect Meta Ads</a>
    {:else}
      <div class="pending">Cloudflare secrets još nisu podešeni.</div>
    {/if}
  </article>
</div>

<section class="tracker-card">
  <div class="tracker-head">
    <div><span class="eyebrow">STOREFRONT TRACKER</span><h2>Sessions + clicks + scroll + funnel</h2></div>
    <strong class:on={data.tracker.sessions24h>0}>{data.tracker.sessions24h>0 ? `${data.tracker.sessions24h} sessions / 24h` : 'WAITING FOR INSTALL'}</strong>
  </div>
  <p>Dodaj ovaj jedan script tag u Shopify <code>theme.liquid</code> neposredno pre <code>&lt;/body&gt;</code>. Ne čitamo input vrednosti, email, telefon ni adresu.</p>
  <div class="snippet"><code>{trackerSnippet}</code><button on:click={copyTracker}>Copy</button></div>
  <div class="tracker-features">Page views · Product views · Add to cart · Checkout intent · Click map · Scroll depth · Rage clicks · UTM/fbclid</div>
</section>

<section class="note">
  <b>Bezbednosno pravilo:</b> Meta veza je read-only. Budžet, pause/enable i druge write akcije ostaju zaključane dok ih odvojeno ne dodamo iza ručnog APPROVE dugmeta.
</section>

<style>
  header{margin-bottom:24px;max-width:760px}h1{font-size:34px;margin:4px 0 8px;letter-spacing:-.04em}header p,article p,.tracker-card p{color:#8f99a8;line-height:1.55}.eyebrow,article span{font-size:11px;color:#7e8897;font-weight:800;letter-spacing:.12em}.success{margin-bottom:14px;padding:12px 14px;background:#112114;border:1px solid #28442b;border-radius:12px;color:#9ef18e}.checks{display:flex;gap:8px;margin-bottom:12px}.checks div{font-size:11px;padding:8px 10px;border-radius:99px;background:#241719;color:#e7a3a3}.checks div.ok{background:#132016;color:#9ee890}.checks b{margin-left:5px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.grid article,.tracker-card{padding:20px;border:1px solid #20242b;background:#101318;border-radius:20px}.top,.tracker-head{display:flex;justify-content:space-between;gap:16px}.top h2,.tracker-head h2{margin:5px 0 0}.top strong,.tracker-head strong{font-size:10px;height:max-content;padding:6px 8px;border-radius:99px;background:#2b1b1d;color:#ff9696}.top strong.on,.tracker-head strong.on{background:#17301d;color:#90ee86}label{font-size:12px;color:#aeb6c2;display:block;margin:18px 0 7px}.row{display:flex;gap:8px}input{min-width:0;flex:1;background:#090c10;border:1px solid #282e37;color:white;border-radius:10px;padding:11px 12px}button,.button{display:inline-block;border:0;background:#8bf048;color:#0b1408;font-weight:900;border-radius:10px;padding:11px 14px;cursor:pointer;text-decoration:none}button:disabled{opacity:.55;cursor:wait}.connected-actions{margin-top:18px}.syncstatus{margin-top:10px;color:#9ee890;font-size:12px}.syncstatus.syncerror{color:#ff9f9f}.pending{margin-top:18px;padding:11px 12px;background:#171a20;border-radius:10px;color:#7f8997;font-size:12px}.tracker-card{margin-top:12px}.snippet{display:flex;gap:10px;align-items:center;background:#090c10;border:1px solid #272e36;border-radius:12px;padding:10px 10px 10px 13px}.snippet code{min-width:0;flex:1;color:#c7d0db;overflow:auto;white-space:nowrap;font-size:12px}.tracker-features{margin-top:12px;color:#78926f;font-size:11px}.note{margin-top:12px;border:1px solid #27301e;background:#12180f;color:#a9c991;padding:15px;border-radius:14px;font-size:13px;line-height:1.5}@media(max-width:800px){.grid{grid-template-columns:1fr}.row{display:grid}.checks{flex-wrap:wrap}.tracker-head{display:grid}.snippet{display:grid}.snippet button{width:max-content}}
</style>
