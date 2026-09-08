<script lang="ts">
  import { page } from '$app/stores';
  const active = (path: string) => path === '/' ? $page.url.pathname === '/' : $page.url.pathname.startsWith(path);
</script>

<svelte:head>
  <title>TrendyPatike Growth</title>
  <meta name="description" content="TrendyPatike growth intelligence dashboard" />
</svelte:head>

<div class="shell">
  <aside>
    <div class="brand"><span>TP</span><strong>Growth</strong></div>
    <nav>
      <a class:active={active('/')} href="/">Overview</a>
      <a class:active={active('/ads')} href="/ads">Ads</a>
      <a class:active={active('/products')} href="/products">Products</a>
      <a class:active={active('/funnel')} href="/funnel">Funnel</a>
      <a class:active={active('/sessions')} href="/sessions">Sessions</a>
      <a class:active={active('/heatmaps')} href="/heatmaps">Heatmaps</a>
      <a class:active={active('/ai')} href="/ai">AI</a>
      <a class:active={active('/settings')} href="/settings">Settings</a>
    </nav>
    <div class="free">0 € mode<br/><small>hard-cost guard enabled</small></div>
  </aside>
  <main><slot /></main>
</div>

<style>
  :global(*){box-sizing:border-box}
  :global(html){background:#090b0e}
  :global(body){margin:0;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#090b0e;color:#f5f7fb}
  :global(a){color:inherit;text-decoration:none}
  .shell{min-height:100vh;display:grid;grid-template-columns:220px 1fr}
  aside{position:sticky;top:0;height:100vh;padding:22px 16px;border-right:1px solid #1d2128;background:#0d1014;display:flex;flex-direction:column}
  .brand{display:flex;align-items:center;gap:10px;font-size:18px;margin:2px 6px 26px}
  .brand span{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:#8bf048;color:#0b1408;font-weight:900}
  nav{display:grid;gap:6px}
  nav a{padding:11px 12px;border-radius:10px;color:#929cab;font-size:14px}
  nav a:hover,nav a.active{background:#171b21;color:#fff}
  .free{margin-top:auto;padding:12px;border-radius:12px;background:#101a10;border:1px solid #213321;color:#aaf28b;font-weight:700;font-size:12px}
  .free small{font-weight:500;color:#72946b}
  main{padding:30px;max-width:1500px;width:100%;margin:0 auto}
  @media(max-width:800px){.shell{display:block}aside{height:auto;position:static;border-right:0;border-bottom:1px solid #1d2128}nav{grid-template-columns:repeat(4,1fr);overflow:auto}.free{display:none}main{padding:18px}}
</style>
