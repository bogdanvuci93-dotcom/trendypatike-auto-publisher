<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { invalidateAll } from '$app/navigation';

  const active = (path: string) => path === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(path);
  let autoStatus = 'pokrećem…';
  let lastAuto = 0;
  let syncing = false;

  async function fastSync() {
    if (syncing || typeof document === 'undefined' || document.visibilityState !== 'visible') return;
    if ($page.url.pathname.startsWith('/login') || $page.url.pathname.startsWith('/connect/')) return;
    syncing = true;
    autoStatus = 'osvežavam…';
    try {
      const results = await Promise.allSettled([
        fetch('/api/sync/shopify?fast=1', { method: 'POST' }),
        fetch('/api/sync/meta?fast=1', { method: 'POST' })
      ]);
      const ok = results.some((r) => r.status === 'fulfilled' && r.value.ok);
      lastAuto = Date.now();
      autoStatus = ok ? 'live' : 'server fallback';
      if (ok) await invalidateAll();
    } catch {
      autoStatus = 'server fallback';
    } finally {
      syncing = false;
    }
  }

  onMount(() => {
    const first = window.setTimeout(fastSync, 2500);
    const timer = window.setInterval(fastSync, 30000);
    const onVisible = () => { if (document.visibilityState === 'visible') fastSync(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });
</script>

<svelte:head>
  <title>TrendyPatike Growth</title>
  <meta name="description" content="TrendyPatike growth intelligence dashboard" />
</svelte:head>

<div class="shell">
  <aside>
    <div class="brand"><span>TP</span><div><strong>Growth</strong><small>live analytics</small></div></div>
    <nav>
      <a class:active={active('/')} href="/">Pregled</a>
      <a class:active={active('/ads')} href="/ads">Oglasi</a>
      <a class:active={active('/products')} href="/products">Proizvodi</a>
      <a class:active={active('/funnel')} href="/funnel">Prodajni levak</a>
      <a class:active={active('/sessions')} href="/sessions">Sesije kupaca</a>
      <a class:active={active('/heatmaps')} href="/heatmaps">Heatmaps</a>
      <a class:active={active('/ai')} href="/ai">Pametni saveti</a>
      <a class:active={active('/settings')} href="/settings">Podešavanja</a>
    </nav>
    <div class="syncbox">
      <div><i class:busy={syncing}></i><b>AUTO 30 SEK</b></div>
      <small>{autoStatus}{lastAuto ? ` · ${new Date(lastAuto).toLocaleTimeString('sr-RS')}` : ''}</small>
      <em>Server proverava i kad je panel zatvoren.</em>
    </div>
    <div class="free">0 € mode<br/><small>hard-cost guard enabled</small></div>
  </aside>
  <main><slot /></main>
</div>

<style>
  :global(*){box-sizing:border-box}
  :global(html){background:#090b0e}
  :global(body){margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#090b0e;color:#f5f7fb}
  :global(a){color:inherit;text-decoration:none}
  :global(button){font-family:inherit}
  .shell{min-height:100vh;display:grid;grid-template-columns:232px 1fr}
  aside{position:sticky;top:0;height:100vh;padding:22px 16px;border-right:1px solid #1d2128;background:#0d1014;display:flex;flex-direction:column}
  .brand{display:flex;align-items:center;gap:10px;font-size:18px;margin:2px 6px 24px}.brand>span{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:#8bf048;color:#0b1408;font-weight:900}.brand div{display:grid}.brand small{font-size:9px;color:#687381;font-weight:600;margin-top:2px}
  nav{display:grid;gap:6px}nav a{padding:11px 12px;border-radius:10px;color:#929cab;font-size:14px}nav a:hover,nav a.active{background:#171b21;color:#fff}
  .syncbox{margin-top:auto;margin-bottom:8px;padding:12px;border-radius:12px;background:#0d1710;border:1px solid #213321}.syncbox>div{display:flex;align-items:center;gap:7px;color:#aaf28b;font-size:11px}.syncbox i{width:7px;height:7px;border-radius:50%;background:#8bf048;box-shadow:0 0 0 4px rgba(139,240,72,.08)}.syncbox i.busy{animation:pulse .8s infinite alternate}.syncbox small,.syncbox em{display:block}.syncbox small{color:#7fa574;font-size:10px;margin-top:6px}.syncbox em{font-style:normal;color:#536c50;font-size:9px;margin-top:5px;line-height:1.4}
  .free{padding:12px;border-radius:12px;background:#101a10;border:1px solid #213321;color:#aaf28b;font-weight:700;font-size:12px}.free small{font-weight:500;color:#72946b}
  main{padding:30px;max-width:1540px;width:100%;margin:0 auto}
  @keyframes pulse{to{opacity:.35;transform:scale(.7)}}
  @media(max-width:800px){.shell{display:block}aside{height:auto;position:static;border-right:0;border-bottom:1px solid #1d2128}.brand{margin-bottom:14px}nav{grid-template-columns:repeat(4,minmax(115px,1fr));overflow:auto}.syncbox,.free{display:none}main{padding:18px}}
</style>
