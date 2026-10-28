<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, MarkLineComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([LineChart, GridComponent, LegendComponent, MarkLineComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps({
    curves: { type: Array, default: () => [] },
    currentIm: { type: Number, default: null },
    unit: { type: String, default: 'g' }
});

const element = ref();
let chart;
let observer;

const option = computed(() => {
    const rows = (props.curves || []).filter((row) => !row.invalid);
    const axis = rows.map((row) => row.im);
    const colors = ['#829BAA', '#668AA0', '#52768F', '#405D79'];
    const series = [1, 2, 3, 4].map((ds) => ({
        name: `P(DS≥DS${ds})`,
        type: 'line',
        smooth: false,
        symbol: 'none',
        lineStyle: { width: 1.6, color: colors[ds - 1] },
        itemStyle: { color: colors[ds - 1] },
        data: rows.map((row) => row[`exceedanceDS${ds}`])
    }));
    if (props.currentIm != null && series.length) {
        series[0].markLine = {
            silent: true,
            symbol: 'none',
            label: { formatter: `当前 ${props.currentIm} ${props.unit}`, color: '#D85A30', fontSize: 11 },
            lineStyle: { color: '#D85A30', type: 'dashed', width: 1 },
            data: [{ xAxis: props.currentIm }]
        };
    }
    return {
        grid: { left: 44, right: 16, top: 26, bottom: 30 },
        tooltip: { trigger: 'axis', valueFormatter: (v) => (v == null ? '-' : Number(v).toFixed(4)) },
        legend: { top: 0, itemHeight: 8, itemWidth: 14, textStyle: { fontSize: 11, color: '#A9BCCF' } },
        xAxis: {
            type: 'category',
            data: axis,
            name: `IM (${props.unit})`,
            nameLocation: 'middle',
            nameGap: 20,
            nameTextStyle: { fontSize: 11, color: '#8FA3B8' },
            axisLabel: { fontSize: 10, color: '#8FA3B8', formatter: (v) => (Number(v) >= 1 ? Number(v).toFixed(1) : Number(v).toFixed(2)) },
            axisLine: { lineStyle: { color: 'rgba(120,180,220,.35)' } }
        },
        yAxis: {
            type: 'value',
            min: 0,
            max: 1,
            name: '超越概率',
            nameTextStyle: { fontSize: 11, color: '#8FA3B8' },
            axisLabel: { fontSize: 10, color: '#8FA3B8' },
            splitLine: { lineStyle: { color: 'rgba(120,180,220,.14)' } }
        },
        series
    };
});

onMounted(() => {
    chart = echarts.init(element.value);
    chart.setOption(option.value, true);
    observer = new ResizeObserver(() => chart?.resize());
    observer.observe(element.value);
});
watch(option, (value) => chart?.setOption(value, true), { deep: true });
onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose(); });
</script>

<template><div ref="element" class="fragility-curve"></div></template>

<style scoped>
.fragility-curve { width: 100%; flex: 1 1 auto; min-height: 120px; }
</style>
