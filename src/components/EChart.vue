<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { GaugeChart, PieChart, RadarChart } from 'echarts/charts';
import { TooltipComponent, RadarComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([GaugeChart, PieChart, RadarChart, TooltipComponent, RadarComponent, CanvasRenderer]);
const props = defineProps({ option: { type: Object, required: true } });
const element = ref();
let chart;
let observer;
onMounted(() => {
    chart = echarts.init(element.value);
    chart.setOption(props.option, true);
    observer = new ResizeObserver(() => chart?.resize());
    observer.observe(element.value);
});
watch(() => props.option, (option) => chart?.setOption(option, true), { deep: true });
onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose(); });
</script>

<template><div ref="element"></div></template>
