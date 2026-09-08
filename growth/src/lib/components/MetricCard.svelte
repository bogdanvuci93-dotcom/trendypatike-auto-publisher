<script lang="ts">
  export let label: string;
  export let value: string;
  export let note = '';
</script>

<div class="card">
  <div class="label">{label}</div>
  <div class="value">{value}</div>
  {#if note}<div class="note">{note}</div>{/if}
</div>

<style>
  .card{padding:18px;border:1px solid #20242b;border-radius:18px;background:#111419;min-height:104px}
  .label{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#8e98a8}
  .value{font-size:28px;font-weight:800;margin-top:10px;color:#f6f8fb}
  .note{font-size:12px;color:#8e98a8;margin-top:5px}
</style>
