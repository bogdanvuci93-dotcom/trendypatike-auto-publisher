<script lang="ts">
  import { onMount } from 'svelte';
  import type { EChartsType } from 'echarts/core';

  export let rows: { label: string; revenue: number; spend: number }[] = [];
  let container: HTMLDivElement;

  onMount(() => {
    let chart: EChartsType | undefined;
    let destroyed = false;

    const resize = () => chart?.resize();

    void (async () => {
      const echarts = await import('echarts/core');
      const { LineChart } = await import('echarts/charts');
      const { GridComponent, TooltipComponent, LegendComponent } = await import('echarts/components');
      const { CanvasRenderer } = await import('echarts/renderers');
      echarts.use([LineChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

      if (destroyed) return;

      chart = echarts.init(container);
      chart.setOption({
        tooltip: { trigger: 'axis' },
        legend: { data: ['Prihod', 'Meta spend'], textStyle: { color: '#aab3c2' } },
        grid: { left: 12, right: 12, top: 42, bottom: 20, containLabel: true },
        xAxis: { type: 'category', data: rows.map((r) => r.label), axisLabel: { color: '#737d8c' }, axisLine: { lineStyle: { color: '#252a32' } } },
        yAxis: { type: 'value', axisLabel: { color: '#737d8c' }, splitLine: { lineStyle: { color: '#1d2229' } } },
        series: [
          { name: 'Prihod', type: 'line', smooth: true, symbolSize: 7, data: rows.map((r) => r.revenue) },
          { name: 'Meta spend', type: 'line', smooth: true, symbolSize: 7, data: rows.map((r) => r.spend) }
        ]
      });

      addEventListener('resize', resize);
    })();

    return () => {
      destroyed = true;
      removeEventListener('resize', resize);
      chart?.dispose();
    };
  });
</script>

<div bind:this={container} class="chart"></div>

<style>
  .chart{width:100%;height:330px}
</style>
