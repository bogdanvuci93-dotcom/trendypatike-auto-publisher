<script lang="ts">
  export let data: { configured: boolean; next: string };
  export let form: { error?: string } | null;
</script>

<svelte:head><title>TrendyPatike Growth Login</title></svelte:head>

<main>
  <section>
    <div class="logo">TP</div>
    <div class="eyebrow">TRENDYPATIKE · PRIVATE</div>
    <h1>Growth login</h1>
    <p>Privatni pristup prodaji, Meta Ads podacima i session analitici.</p>

    {#if !data.configured}
      <div class="warn">DASHBOARD_PASSWORD još nije podešen u Cloudflare secrets.</div>
    {:else}
      <form method="POST">
        <label for="password">Lozinka</label>
        <input id="password" name="password" type="password" autocomplete="current-password" autofocus required />
        {#if form?.error}<div class="error">{form.error}</div>{/if}
        <button>Uđi u dashboard</button>
      </form>
    {/if}
  </section>
</main>

<style>
  :global(body){margin:0;background:#090b0f;color:#f5f7fb;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
  main{min-height:100vh;display:grid;place-items:center;padding:24px}section{width:min(420px,100%);background:#101318;border:1px solid #232832;border-radius:22px;padding:28px;box-sizing:border-box}.logo{width:46px;height:46px;display:grid;place-items:center;border-radius:13px;background:#8bf048;color:#0a1407;font-weight:950;margin-bottom:20px}.eyebrow{font-size:11px;color:#7d8796;font-weight:900;letter-spacing:.14em}h1{font-size:34px;letter-spacing:-.04em;margin:7px 0 8px}p{color:#929cab;line-height:1.55;margin:0 0 24px}label{display:block;font-size:12px;color:#aeb6c2;margin:0 0 8px}input{width:100%;box-sizing:border-box;background:#090c10;border:1px solid #2a3039;color:white;border-radius:11px;padding:13px 14px;font-size:16px;outline:none}input:focus{border-color:#6fc43a}button{margin-top:12px;width:100%;border:0;background:#8bf048;color:#0b1408;font-weight:950;border-radius:11px;padding:13px 14px;cursor:pointer}.error,.warn{margin:12px 0;padding:11px 12px;border-radius:10px;background:#30191b;color:#ffaaa8;font-size:13px}.warn{background:#302b18;color:#ffd97b}
</style>
