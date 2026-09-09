<script lang="ts">
  export let label: string;
  export let value: string;
  export let note = '';
  export let explain = '';
  export let formula = '';
  export let interpretation = '';
  let open = false;
</script>

<div class:clickable={Boolean(explain || formula || interpretation)} class:open class="card" role={explain || formula || interpretation ? 'button' : undefined} tabindex={explain || formula || interpretation ? 0 : undefined} on:click={() => (explain || formula || interpretation) && (open = !open)} on:keydown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && (explain || formula || interpretation)) { e.preventDefault(); open = !open; } }}>
  <div class="top"><div class="label">{label}</div>{#if explain || formula || interpretation}<span class="help">?</span>{/if}</div>
  <div class="value">{value}</div>
  {#if note}<div class="note">{note}</div>{/if}
  {#if open}
    <div class="explain">
      {#if explain}<p>{explain}</p>{/if}
      {#if formula}<small><b>Kako se računa:</b> {formula}</small>{/if}
      {#if interpretation}<small><b>Kako da čitaš:</b> {interpretation}</small>{/if}
    </div>
  {/if}
</div>

<style>
  .card{padding:18px;border:1px solid #20242b;border-radius:18px;background:#111419;min-height:104px;transition:border-color .15s,background .15s}.card.clickable{cursor:pointer}.card.clickable:hover,.card.open{border-color:#35402f;background:#121812}.top{display:flex;justify-content:space-between;align-items:center;gap:8px}.label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#8e98a8}.help{display:grid;place-items:center;width:20px;height:20px;border-radius:50%;background:#20262d;color:#9ca7b5;font-size:11px;font-weight:900}.value{font-size:28px;font-weight:800;margin-top:10px;color:#f6f8fb}.note{font-size:12px;color:#8e98a8;margin-top:5px}.explain{margin-top:12px;padding-top:11px;border-top:1px solid #273026;color:#b2bdab;font-size:12px;line-height:1.5}.explain p{margin:0 0 8px}.explain small{display:block;color:#82917e;margin-top:5px}.explain b{color:#a9cda0}
</style>
