<script lang="ts">
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  const active = (path: string) => path === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(path);
  $: range = $page.url.searchParams.get('range') || 'today';
  $: chosenDate = $page.url.searchParams.get('date') || new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Belgrade',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  $: suffix = range === 'date' ? `?range=date&date=${encodeURIComponent(chosenDate)}` : `?range=${encodeURIComponent(range)}`;

  async function setRange(next: string) {
    const u = new URL($page.url);
    u.searchParams.set('range', next);
    if (next !== 'date') u.searchParams.delete('date');
    await goto(`${u.pathname}${u.search}`, { keepFocus: true, noScroll: true });
  }
  async function setDate(value: string) {
    if (!value) return;
    const u = new URL($page.url);
    u.searchParams.set('range', 'date');
    u.searchParams.set('date', value);
    await goto(`${u.pathname}${u.search}`, { keepFocus: true, noScroll: true });
  }
  const hrefFor = (path:string) => `${path}${suffix}`;
</script>

<svelte:head>
  <title>TrendyPatike Growth</title>
  <meta name="description" content="TrendyPatike growth intelligence dashboard" />
  <meta name="theme-color" content="#090b0e" />
</svelte:head>

<div class="shell">
  <aside>
    <div class="brand"><span>TP</span><div><strong>Growth</strong><small>live analytics</small></div></div>
    <nav>
      <a class:active={active('/')} href={hrefFor('/')}>Pregled</a>
      <a class:active={active('/ads')} href={hrefFor('/ads')}>Oglasi</a>
      <a class:active={active('/products')} href={hrefFor('/products')}>Proizvodi</a>
      <a class:active={active('/funnel')} href={hrefFor('/funnel')}>Prodajni levak</a>
      <a class:active={active('/sessions')} href={hrefFor('/sessions')}>Sesije kupaca</a>
      <a class:active={active('/heatmaps')} href={hrefFor('/heatmaps')}>Heatmaps</a>
      <a class:active={active('/ai')} href={hrefFor('/ai')}>Pametni saveti</a>
      <a class:active={active('/settings')} href="/settings">Podešavanja</a>
    </nav>
    <div class="syncbox">
      <div><i></i><b>SERVER AUTO</b></div>
      <small>Shopify 5 min · Meta 15 min</small>
      <em>Storefront događaji stižu odmah; teži sync je ograničen da čuva D1 free tier.</em>
    </div>
    <div class="free">0 € mode<br/><small>D1 free-tier guard enabled</small></div>
  </aside>

  <section class="workspace">
    {#if !$page.url.pathname.startsWith('/login') && !$page.url.pathname.startsWith('/connect/') && !$page.url.pathname.startsWith('/settings')}
      <div class="periodbar" aria-label="Period analitike">
        <div class="quick">
          <button class:active={range==='today'} on:click={()=>setRange('today')}>Danas</button>
          <button class:active={range==='yesterday'} on:click={()=>setRange('yesterday')}>Juče</button>
          <button class:active={range==='7d'} on:click={()=>setRange('7d')}>7 dana</button>
          <button class:active={range==='30d'} on:click={()=>setRange('30d')}>30 dana</button>
        </div>
        <label class:active={range==='date'}><span>Datum</span><input type="date" value={chosenDate} max={new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Belgrade'}).format(new Date())} on:change={(e)=>setDate((e.currentTarget as HTMLInputElement).value)} /></label>
      </div>
    {/if}
    <main><slot /></main>
  </section>
</div>

<style>
  :global(*){box-sizing:border-box}
  :global(html){background:#090b0e;scroll-behavior:smooth}
  :global(body){margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#090b0e;color:#f5f7fb;-webkit-font-smoothing:antialiased}
  :global(a){color:inherit;text-decoration:none}
  :global(button),:global(input),:global(select),:global(textarea){font-family:inherit}
  :global(button){-webkit-tap-highlight-color:transparent}
  :global(.panel),:global(.metrics>div),:global(.summary>div){animation:rise .38s cubic-bezier(.2,.8,.2,1) both}
  :global(.panel:hover){border-color:#2d353f;transition:border-color .2s ease,transform .2s ease}
  .shell{min-height:100vh;display:grid;grid-template-columns:232px minmax(0,1fr)}
  .workspace{min-width:0}
  aside{position:sticky;top:0;height:100vh;padding:22px 16px;border-right:1px solid #1d2128;background:rgba(13,16,20,.96);backdrop-filter:blur(16px);display:flex;flex-direction:column;z-index:30}
  .brand{display:flex;align-items:center;gap:10px;font-size:18px;margin:2px 6px 24px}.brand>span{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:#8bf048;color:#0b1408;font-weight:900;box-shadow:0 8px 30px rgba(139,240,72,.18)}.brand div{display:grid}.brand small{font-size:9px;color:#687381;font-weight:600;margin-top:2px}
  nav{display:grid;gap:6px}nav a{padding:11px 12px;border-radius:10px;color:#929cab;font-size:14px;transition:.18s ease}nav a:hover,nav a.active{background:#171b21;color:#fff;transform:translateX(2px)}
  .syncbox{margin-top:auto;margin-bottom:8px;padding:12px;border-radius:12px;background:#0d1710;border:1px solid #213321}.syncbox>div{display:flex;align-items:center;gap:7px;color:#aaf28b;font-size:11px}.syncbox i{width:7px;height:7px;border-radius:50%;background:#8bf048;box-shadow:0 0 0 4px rgba(139,240,72,.08)}.syncbox small,.syncbox em{display:block}.syncbox small{color:#7fa574;font-size:10px;margin-top:6px}.syncbox em{font-style:normal;color:#536c50;font-size:9px;margin-top:5px;line-height:1.4}
  .free{padding:12px;border-radius:12px;background:#101a10;border:1px solid #213321;color:#aaf28b;font-weight:700;font-size:12px}.free small{font-weight:500;color:#72946b}
  .periodbar{position:sticky;top:0;z-index:25;display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 30px;background:rgba(9,11,14,.88);border-bottom:1px solid #191e25;backdrop-filter:blur(18px)}
  .quick{display:flex;gap:7px;flex-wrap:wrap}.quick button,.periodbar label{border:1px solid #252c34;background:#0f1318;color:#96a0ae;border-radius:11px;min-height:38px;padding:0 12px;font-size:12px;font-weight:800;transition:.18s ease}.quick button{cursor:pointer}.quick button:hover,.quick button.active,.periodbar label.active{background:#172614;border-color:#426735;color:#baff9b;transform:translateY(-1px)}
  .periodbar label{display:flex;align-items:center;gap:8px}.periodbar label span{font-size:10px;text-transform:uppercase;letter-spacing:.08em}.periodbar input{border:0;background:transparent;color:#dfe7ef;font-size:12px;outline:none;max-width:132px;color-scheme:dark}
  main{padding:26px 30px 38px;max-width:1540px;width:100%;margin:0 auto;animation:fade .25s ease both}
  @keyframes rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}@keyframes fade{from{opacity:.4}to{opacity:1}}
  @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
  @media(max-width:800px){
    .shell{display:block;padding-bottom:76px}.workspace{width:100%}
    aside{height:64px;position:sticky;top:0;border-right:0;border-bottom:1px solid #1d2128;padding:10px 14px;display:flex;flex-direction:row;align-items:center}.brand{margin:0}.brand>span{width:34px;height:34px}.brand small{display:none}.brand strong{font-size:16px}
    aside nav{position:fixed;left:8px;right:8px;bottom:8px;z-index:60;display:flex;gap:5px;overflow-x:auto;padding:7px;background:rgba(15,18,23,.95);border:1px solid #242b33;border-radius:16px;box-shadow:0 14px 50px rgba(0,0,0,.45);backdrop-filter:blur(20px);scrollbar-width:none}aside nav::-webkit-scrollbar{display:none}aside nav a{flex:0 0 auto;padding:9px 11px;font-size:11px;border-radius:10px}aside nav a:hover,aside nav a.active{transform:none;background:#1b2418;color:#baff9b}
    .syncbox,.free{display:none}.periodbar{top:64px;padding:9px 12px;overflow-x:auto;justify-content:flex-start;scrollbar-width:none}.periodbar::-webkit-scrollbar{display:none}.quick{flex-wrap:nowrap}.quick button,.periodbar label{flex:0 0 auto;min-height:36px;padding:0 11px}.periodbar label span{display:none}
    main{padding:16px 12px 26px;overflow:hidden}:global(h1){font-size:30px!important;line-height:1.05}:global(h2){line-height:1.15}:global(.metrics),:global(.summary){gap:8px!important}:global(.panel){border-radius:15px!important}:global(.table-wrap){margin-left:-2px;margin-right:-2px;overflow-x:auto;-webkit-overflow-scrolling:touch}:global(table){min-width:720px}:global(button),:global(a){touch-action:manipulation}
  }
</style>
