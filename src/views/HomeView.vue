<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import PlatformHeader from '../components/PlatformHeader.vue';
import TransportMap from '../components/TransportMap.vue';
import EChart from '../components/EChart.vue';
import { usePlatformStore, useUiStore } from '../stores/platform.js';

const platform = usePlatformStore();
const ui = useUiStore();
const router = useRouter();
const { dashboard, mapData } = storeToRefs(platform);
const indicator = ref('risk');
const selectedRegion = ref(null);
const mapRef = ref();
const layerPanelOpen = ref(true);
const visibleLayers = reactive({ regions: true, roads: false, assets: false });
const baseLayer = ref('none');
const search = ref('');
const chat = reactive([{ role: 'assistant', text: '欢迎进入交通网络多灾韧性评价可视化平台。' }]);
const message = ref('');
const loadingError = ref('');
const colors = { '低风险':'#35da87','中风险':'#efd253','高风险':'#ff9748','极高风险':'#ff5669','暂无数据':'#526f84' };
const indicatorLegends = {
    risk: [['低风险','#35da87'],['中风险','#efd253'],['高风险','#ff9748'],['极高风险','#ff5669']],
    resilience: [['高韧性','#42e4dc'],['较高韧性','#3996f2'],['中等韧性','#efd253'],['低韧性','#ff6171']],
    passability: [['畅通','#35da87'],['条件通行','#efd253'],['受限','#ff9748'],['阻断','#ff5669']]
};
const activeLegend = computed(() => indicatorLegends[indicator.value] || []);
const format = (v, digits=0) => Number(v || 0).toLocaleString('zh-CN',{maximumFractionDigits:digits});
const average = (key) => {
    const values = (dashboard.value.regions || []).map((row) => Number(row[key])).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
};
const overallMetric = computed(() => ({
    regionName: '重庆市总体',
    resilienceScore: average('resilienceScore'),
    connectivity: average('connectivity'),
    guaranteeRate: average('guaranteeRate'),
    networkEfficiency: average('networkEfficiency'),
    redundancy: average('redundancy'),
    recoveryCapacity: average('recoveryCapacity'),
    resilienceLevel: '综合韧性'
}));
const metric = computed(() => selectedRegion.value || overallMetric.value);
const resilienceBars = computed(() => [
    ['网络运行效率', metric.value.networkEfficiency],
    ['路网冗余度', metric.value.redundancy],
    ['恢复能力', metric.value.recoveryCapacity],
    ['通行保障率', metric.value.guaranteeRate]
]);
const riskOption = computed(() => ({ color:(dashboard.value.riskDistribution||[]).map(x=>colors[x.name]), tooltip:{trigger:'item'}, series:[{type:'pie',radius:['70%','90%'],label:{show:false},data:dashboard.value.riskDistribution||[]}]}));
const gaugeOption = (value, name) => ({ series:[{type:'gauge',startAngle:210,endAngle:-30,radius:'92%',progress:{show:true,width:7},axisLine:{lineStyle:{width:7}},pointer:{show:false},axisTick:{show:false},splitLine:{show:false},axisLabel:{show:false},title:{offsetCenter:[0,'68%'],fontSize:11},detail:{offsetCenter:[0,'2%'],formatter:'{value}%',fontSize:18},data:[{value:Number(Number(value||0).toFixed(1)),name}]}] });
const assistantAnswers = computed(() => Object.fromEntries((dashboard.value.assistantQuestions||[]).map(x=>[x.questionCode,x.answerText])));
function ask(code, text) { const question=text||message.value.trim(); if(!question)return; chat.push({role:'user',text:question}); chat.push({role:'assistant',text:assistantAnswers.value[code]||'您可以通过顶部导航进入重车、灾害和韧性评估模块。'}); message.value=''; }
function findRegion(){const name=search.value.trim();const found=(dashboard.value.regions||[]).find(x=>x.regionName?.includes(name));if(found)selectedRegion.value=found;else ui.toast('未找到匹配行政区');}
function setLayer(name, checked) { visibleLayers[name] = checked; mapRef.value?.toggleLayer(name, checked); }
function setBaseLayer(name) {
    baseLayer.value = name;
    mapRef.value?.setBase(name);
}
function toggleBaseLayer(name) { setBaseLayer(baseLayer.value === name ? 'none' : name); }
onMounted(async()=>{try{await Promise.all([platform.loadDashboard(),platform.loadMap('regions'),platform.loadMap('roads'),platform.loadMap('assets')]);}catch(e){loadingError.value=e.message;ui.toast('后台未连接，页面已使用空状态');}});
</script>

<template>
<div class="dashboard-v2"><PlatformHeader :show-admin-menu="true" />
<main class="dashboard-main">
<aside class="dashboard-column dashboard-left-column">
  <section class="tech-panel overview-panel"><h2 class="tech-panel-title">数据概览</h2><span class="demo-badge">{{ loadingError?'后台离线':'后台数据' }}</span><div class="overview-grid">
    <article class="overview-metric overview-primary"><span>行政区数</span><strong>{{ format(dashboard.overview.regionCount) }}</strong><small>个</small><i class="metric-map-icon"></i></article>
    <article class="overview-metric"><span>道路总数</span><strong>{{ format(dashboard.overview.roadCount) }}</strong><small>条</small></article><article class="overview-metric"><span>道路总里程</span><strong>{{ format(dashboard.overview.roadLengthKm,1) }}</strong><small>km</small></article><article class="overview-metric"><span>评估桥梁</span><strong>{{ format(dashboard.overview.bridgeCount) }}</strong><small>座</small></article><article class="overview-metric"><span>评估隧道</span><strong>{{ format(dashboard.overview.tunnelCount) }}</strong><small>座</small></article>
  </div></section>
  <section class="tech-panel heavy-panel"><h2 class="tech-panel-title">重车通行概况</h2><span class="demo-badge">默认方案</span><div class="vehicle-summary"><div class="vehicle-icon">▰</div><div><strong>{{ dashboard.defaultVehicle.profileName||'默认车辆参数' }}</strong><p>{{ dashboard.defaultVehicle.axleCount||'--' }}轴 · {{ dashboard.defaultVehicle.vehicleLengthM||'--' }} × {{ dashboard.defaultVehicle.vehicleWidthM||'--' }} × {{ dashboard.defaultVehicle.vehicleHeightM||'--' }}m</p></div><button class="tiny-action" @click="router.push({name:'admin-data'})">参数</button></div>
  <div class="pass-rate-row"><EChart class="pass-gauge" :option="gaugeOption(dashboard.passSummary?.find(x=>x.assetType==='BRIDGE')?.strictPassRate,'桥梁通行率')"/><EChart class="pass-gauge" :option="gaugeOption(dashboard.passSummary?.find(x=>x.assetType==='TUNNEL')?.strictPassRate,'隧道通行率')"/></div><div class="mini-section-heading"><span>桥隧通行结果</span><span>可通行 / 条件 / 禁止</span></div><div class="result-scroll scroll-region"><div v-for="item in dashboard.heavyResults" :key="item.assetName" class="result-row"><div class="result-name"><strong>{{ item.assetName }}</strong><small>{{ item.restrictionReason }}</small></div><span class="result-type">{{ item.assetType==='BRIDGE'?'桥梁':'隧道' }}</span><span class="result-badge" :class="item.passabilityStatus==='PASS'?'result-pass':item.passabilityStatus==='CONDITIONAL'?'result-condition':'result-deny'">{{ item.passabilityStatus }}</span></div><p v-if="!dashboard.heavyResults?.length" class="empty-tip">暂无已发布结果</p></div></section>
</aside>
<section class="dashboard-center-column"><section class="map-panel"><TransportMap ref="mapRef" class-name="overview-map" :regions="mapData.regions" :region-details="dashboard.regions" :region-indicator="indicator" :roads="mapData.roads" :assets="mapData.assets?.features?.map(f=>({...f.properties,longitude:f.geometry?.coordinates?.[0],latitude:f.geometry?.coordinates?.[1]}))||[]" :default-layer-visibility="visibleLayers" default-base="none" :outline-regions="baseLayer!=='none'" :show-region-labels="visibleLayers.regions && baseLayer==='none'" @region-click="selectedRegion=$event.details"/><div class="map-grid-overlay"></div><div class="indicator-switcher indicator-switcher-left"><button v-for="item in [['risk','灾害风险等级'],['resilience','韧性等级'],['passability','通行等级']]" :key="item[0]" class="indicator-button" :class="{'is-active':indicator===item[0]}" @click="indicator=item[0]">{{ item[1] }}</button></div><form class="map-search-box map-search-box-right" @submit.prevent="findRegion"><input v-model="search" type="search" placeholder="搜索行政区"><button title="搜索">⌕</button></form><div class="map-tool-rail"><button title="放大" @click="mapRef.zoomIn()">＋</button><button title="缩小" @click="mapRef.zoomOut()">−</button><button title="复位" @click="mapRef.reset()">⌂</button><button title="图层" :aria-expanded="layerPanelOpen" @click.stop="layerPanelOpen=!layerPanelOpen">▱</button></div><div class="map-layer-popover" :class="{'is-open':layerPanelOpen}" @click.stop><strong>图层控制</strong><div class="map-base-options" aria-label="地图图层"><button type="button" :class="{'is-active':visibleLayers.regions}" :aria-pressed="visibleLayers.regions" @click="setLayer('regions',!visibleLayers.regions)">行政区划</button><button type="button" :class="{'is-active':baseLayer==='satellite'}" :aria-pressed="baseLayer==='satellite'" @click="toggleBaseLayer('satellite')">卫星地图</button><button type="button" :class="{'is-active':baseLayer==='electronic'}" :aria-pressed="baseLayer==='electronic'" @click="toggleBaseLayer('electronic')">电子地图</button></div><div class="layer-divider"></div><strong>业务叠加图层</strong><label><input :checked="visibleLayers.roads" type="checkbox" @change="setLayer('roads',$event.target.checked)"> 高速/快速路网</label><label><input :checked="visibleLayers.assets" type="checkbox" @change="setLayer('assets',$event.target.checked)"> 桥梁隧道</label></div><div class="map-caption"><span class="pulse-dot"></span><span>{{ selectedRegion?.regionName||'重庆市' }} · {{ {risk:'灾害风险等级',resilience:'韧性等级',passability:'通行等级'}[indicator] }}</span></div><div v-if="visibleLayers.regions && baseLayer==='none'" class="dynamic-map-legend" :aria-label="`${{risk:'灾害风险',resilience:'韧性',passability:'通行'}[indicator]}颜色图例`"><span v-for="item in activeLegend" :key="item[0]" class="map-legend-item"><i :style="{background:item[1],color:item[1]}"></i>{{ item[0] }}</span></div></section><section class="geological-ticker"><div class="ticker-label"><span class="alert-pulse"></span>地质灾害动态</div><div class="ticker-viewport"><div class="ticker-track"><span v-for="n in dashboard.hazardNotices" :key="n.id" class="ticker-event">{{ n.regionName }} · {{ n.content }}</span></div></div></section></section>
<aside class="dashboard-column dashboard-right-column">
 <section class="tech-panel risk-panel"><h2 class="tech-panel-title">区域风险概况</h2><span class="demo-badge">后台数据</span><div class="risk-summary-row"><EChart class="risk-pie-chart" :option="riskOption"/><div class="risk-legend-summary"><div v-for="item in dashboard.riskDistribution" :key="item.name" class="risk-summary-item"><i :style="{background:colors[item.name]}"></i><span>{{ item.name }}</span><strong>{{ item.value }}个</strong></div></div></div><div class="region-risk-scroll scroll-region"><div v-for="r in dashboard.regions" :key="r.regionCode" class="region-risk-row" @click="selectedRegion=r"><strong>{{ r.regionName }}</strong><span>{{ r.riskLevel||'暂无数据' }}</span></div></div></section>
 <section class="tech-panel resilience-panel"><h2 class="tech-panel-title">区域韧性概况</h2><span class="demo-badge">后台数据</span><div class="selected-region-heading"><div><span>当前区域</span><strong>{{ metric.regionName }}</strong></div><span class="level-badge" :class="metric.resilienceLevel==='低韧性'?'level-low':metric.resilienceLevel==='中等韧性'?'level-medium':'level-good'">{{ metric.resilienceLevel||'暂无数据' }}</span></div><div class="resilience-summary"><EChart class="resilience-gauge" :option="gaugeOption(metric.resilienceScore,'综合韧性指数')"/><div class="resilience-key-values"><div><span>路网连通度</span><strong>{{ Number(metric.connectivity||0).toFixed(2) }}</strong></div><div><span>通行保障率</span><strong>{{ Number(metric.guaranteeRate||0).toFixed(0) }}%</strong></div></div></div><div class="resilience-bars" aria-label="当前区域韧性指标"><div v-for="item in resilienceBars" :key="item[0]" class="resilience-bar-row"><span>{{ item[0] }}</span><div class="resilience-bar-track"><div class="resilience-bar-fill" :style="{width:`${Math.max(0,Math.min(100,Number(item[1])||0))}%`}"></div></div><strong>{{ Number(item[1]||0).toFixed(0) }}</strong></div></div><p class="region-hint">点击地图或上方区县列表，查看对应区域指标</p></section>
 <section class="tech-panel assistant-panel"><h2 class="tech-panel-title">数字人助手</h2><span class="assistant-status"><i></i>在线</span><div class="assistant-stage"><div class="assistant-avatar"><div class="avatar-head"></div><div class="avatar-body"></div><span>韧安助手</span></div><div class="assistant-bubble">您好，我可以介绍平台功能和评估模块。</div></div><div class="assistant-chat"><div v-for="(m,i) in chat" :key="i" class="chat-message" :class="m.role==='assistant'?'assistant-message':'user-message'">{{ m.text }}</div></div><div class="assistant-prompts"><button @click="ask('platform','平台有哪些功能？')">平台有哪些功能？</button><button @click="ask('map','地图颜色代表什么？')">地图颜色代表什么？</button><button @click="ask('heavy','如何进行重车评估？')">如何进行重车评估？</button></div><form class="assistant-input-row" @submit.prevent="ask('',message)"><input v-model="message" placeholder="请输入您想了解的问题"><button>发送</button></form><small class="assistant-disclaimer">静态演示助手 · 暂未接入大模型</small></section>
</aside></main></div>
</template>
