<script setup>
import { computed, nextTick, onMounted, reactive, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useRouter } from 'vue-router';
import PlatformHeader from '../components/PlatformHeader.vue';
import TransportMap from '../components/TransportMap.vue';
import EChart from '../components/EChart.vue';
import { usePlatformStore, useUiStore } from '../stores/platform.js';
import { api } from '../services/api.js';

const platform = usePlatformStore();
const ui = useUiStore();
const router = useRouter();
const { dashboard, mapData } = storeToRefs(platform);
const indicator = ref(null);
const selectedRegion = ref(null);
const mapRef = ref();
const layerPanelOpen = ref(false);
const visibleLayers = reactive({ regions: true, roads: false, assets: false });
const baseLayer = ref('administrative');
const search = ref('');
const chat = reactive([{ role: 'assistant', text: '欢迎进入交通网络多灾韧性评价可视化平台。' }]);
const message = ref('');
const loadingError = ref('');
const damageColors = { DS0:'#39c889', DS1:'#76c76b', DS2:'#f6c85f', DS3:'#f3a654', DS4:'#ef6b75' };
const damageRanges = { DS0:'0–20%', DS1:'20–40%', DS2:'40–60%', DS3:'60–80%', DS4:'80–100%' };
const indicatorOptions = [['resilienceIndex','韧性指数'],['connectivityScore','路网连通度'],['recoveryCapacity','灾害恢复能力']];
const indicatorLabel = computed(() => Object.fromEntries(indicatorOptions)[indicator.value] || '行政区划');
const format = (v, digits=0) => Number(v || 0).toLocaleString('zh-CN',{maximumFractionDigits:digits});
const average = (key) => {
    const values = (dashboard.value.regions || []).filter((row) => row[key] != null).map((row) => Number(row[key])).filter(Number.isFinite);
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
};
const overallMetric = computed(() => ({
    regionName: '重庆市总体',
    resilienceIndex: dashboard.value.resilienceOverall?.resilienceIndex ?? average('resilienceIndex'),
    connectivityScore: dashboard.value.resilienceOverall?.connectivityScore ?? average('connectivityScore'),
    recoveryCapacity: dashboard.value.resilienceOverall?.recoveryCapacity ?? average('recoveryCapacity')
}));
const metric = computed(() => selectedRegion.value || overallMetric.value);
const radarMetrics = computed(() => [
    ['resilienceIndex','韧性指数'],['connectivityScore','路网连通度'],['recoveryCapacity','灾害恢复能力']
].map(([key, name]) => ({ name, value: metric.value[key] == null ? null : Number(metric.value[key]) })));
const resilienceRadarOption = computed(() => ({
    title: {
        text: metric.value.regionName,
        left: 8, top: 6,
        textStyle: { color: '#8fdfff', fontSize: 13, fontWeight: 500 },
        backgroundColor: 'rgba(3, 30, 54, .88)',
        borderColor: 'rgba(68, 201, 251, .35)',
        borderWidth: 1,
        borderRadius: 3,
        padding: [4, 10]
    },
    tooltip: { trigger: 'item', formatter: (params) => `${params.name}<br/>${radarMetrics.value.map((item) => `${item.name}：${item.value == null ? '暂无结果' : item.value.toFixed(1)}`).join('<br/>')}` },
    radar: {
        center: ['50%', '56%'], radius: '58%', splitNumber: 4,
        indicator: radarMetrics.value.map((item) => ({ name: `${item.name}\n${item.value == null ? '—' : item.value.toFixed(1)}`, max: 100 })),
        axisName: { color: '#a9c8df', fontSize: 12, lineHeight: 17 },
        axisLine: { lineStyle: { color: 'rgba(102, 153, 207, .35)' } },
        splitLine: { lineStyle: { color: 'rgba(102, 153, 207, .26)' } },
        splitArea: { areaStyle: { color: ['rgba(28, 55, 88, .08)', 'rgba(28, 55, 88, .22)'] } }
    },
    series: [{ type: 'radar', symbol: 'circle', symbolSize: 5,
        lineStyle: { color: '#5b9dff', width: 2 }, itemStyle: { color: '#79d7ff' },
        areaStyle: { color: 'rgba(67, 160, 245, .28)' },
        data: [{ name: metric.value.regionName, value: radarMetrics.value.map((item) => Math.max(0, Math.min(100, item.value || 0))) }]
    }]
}));
const damageOption = computed(() => ({ color:(dashboard.value.damageDistribution||[]).map(x=>damageColors[x.name]), tooltip:{trigger:'item',formatter:(item)=>`${item.name}（${damageRanges[item.name]}）<br/>${item.value} 处`}, series:[{type:'pie',radius:['70%','90%'],label:{show:false},data:dashboard.value.damageDistribution||[]}]}));
const gaugeOption = (value, name) => ({ series:[{type:'gauge',startAngle:210,endAngle:-30,radius:'92%',progress:{show:true,width:7},axisLine:{lineStyle:{width:7}},pointer:{show:false},axisTick:{show:false},splitLine:{show:false},axisLabel:{show:false},title:{offsetCenter:[0,'68%'],fontSize:11},detail:{offsetCenter:[0,'2%'],formatter:value==null?'暂无结果':'{value}%',fontSize:18},data:[{value:value==null?0:Number(Number(value).toFixed(1)),name}]}] });
const assistantAnswers = computed(() => Object.fromEntries((dashboard.value.assistantQuestions||[]).map(x=>[x.questionCode,x.answerText])));
const assistantBusy = ref(false);
const assistantStageCollapsed = ref(false);
const chatScrollRef = ref();
async function scrollChatToBottom() { await nextTick(); const el = chatScrollRef.value; if (el) el.scrollTop = el.scrollHeight; }
async function ask(code, text) {
    const question = (typeof text === 'string' ? text : '').trim() || message.value.trim();
    if (!question || assistantBusy.value) return;
    chat.push({ role: 'user', text: question });
    message.value = '';
    assistantBusy.value = true;
    chat.push({ role: 'assistant', text: '正在思考…' });
    const pending = chat[chat.length - 1];
    scrollChatToBottom();
    const history = chat.slice(0, -2).slice(-10).map((m) => ({ role: m.role, text: m.text }));
    try {
        const { answer } = await api('/assistant/chat', { method: 'POST', body: JSON.stringify({ question, history }) });
        pending.text = answer || '抱歉，我暂时没有生成有效回答，请换个问法试试。';
    } catch (e) {
        pending.text = assistantAnswers.value[code] || `大模型服务暂不可用（${e.message}），请稍后重试。`;
    } finally { assistantBusy.value = false; scrollChatToBottom(); }
}
function findRegion(){const name=search.value.trim();if(!name)return;const found=(dashboard.value.regions||[]).find(x=>x.regionName?.includes(name));if(found){setBaseLayer('administrative');selectedRegion.value=found;mapRef.value?.selectRegion(found.regionName);}else ui.toast('未找到匹配行政区');}
function showOverall(){selectedRegion.value=null;mapRef.value?.selectRegion(null);}
function setLayer(name, checked) {
    if (baseLayer.value === 'administrative' || !['roads', 'assets'].includes(name)) return;
    visibleLayers[name] = checked;
    mapRef.value?.toggleLayer(name, checked);
}
function setBaseLayer(name) {
    if (!['administrative', 'satellite', 'electronic'].includes(name)) return;
    baseLayer.value = name;
    const administrative = name === 'administrative';
    visibleLayers.regions = administrative;
    mapRef.value?.setBase(name);
    mapRef.value?.toggleLayer('regions', administrative);
    if (administrative) {
        for (const layer of ['roads', 'assets']) {
            visibleLayers[layer] = false;
            mapRef.value?.toggleLayer(layer, false);
        }
    }
    layerPanelOpen.value = false;
}
function toggleIndicator(name) { indicator.value = indicator.value === name ? null : name; }
onMounted(async()=>{try{await Promise.all([platform.loadDashboard(),platform.loadMap('regions'),platform.loadMap('roads'),platform.loadMap('assets')]);}catch(e){loadingError.value=e.message;ui.toast('后台未连接，页面已使用空状态');}});
</script>

<template>
<div class="dashboard-v2"><PlatformHeader :show-admin-menu="true" />
<main class="dashboard-main">
<aside class="dashboard-column dashboard-left-column">
  <section class="tech-panel overview-panel"><h2 class="tech-panel-title">数据概览</h2><span class="demo-badge">{{ loadingError?'后台离线':'后台数据' }}</span><div class="overview-grid">
    <article class="overview-metric overview-primary"><span>行政区数</span><strong>{{ format(dashboard.overview.regionCount) }}</strong><small>个</small><i class="metric-map-icon"></i></article>
    <article class="overview-metric"><span>道路总数</span><strong>{{ format(dashboard.overview.roadCount) }}</strong><small>条</small></article><article class="overview-metric"><span>道路总里程</span><strong>{{ format(dashboard.overview.roadLengthKm,1) }}</strong><small>km</small></article><article class="overview-metric"><span>桥梁总数</span><strong>{{ format(dashboard.overview.bridgeCount) }}</strong><small>座</small></article><article class="overview-metric"><span>隧道总数</span><strong>{{ format(dashboard.overview.tunnelCount) }}</strong><small>座</small></article>
  </div></section>
  <section class="tech-panel heavy-panel"><h2 class="tech-panel-title">重车通行概况</h2><span class="demo-badge">最近任务</span><div class="vehicle-summary"><div class="vehicle-icon">▰</div><div><strong>{{ dashboard.defaultVehicle.profileName||'暂无重车评估' }}</strong><p>{{ dashboard.defaultVehicle.axleCount||'--' }}轴 · {{ dashboard.defaultVehicle.vehicleLengthM||'--' }} × {{ dashboard.defaultVehicle.vehicleWidthM||'--' }} × {{ dashboard.defaultVehicle.vehicleHeightM||'--' }}m</p></div><button class="tiny-action" @click="router.push({name:'admin-data'})">参数</button></div>
  <div class="pass-rate-row"><EChart class="pass-gauge" :option="gaugeOption(dashboard.passSummary?.find(x=>x.assetType==='BRIDGE')?.strictPassRate,'桥梁通行率')"/><EChart class="pass-gauge" :option="gaugeOption(dashboard.passSummary?.find(x=>x.assetType==='TUNNEL')?.strictPassRate,'隧道通行率')"/></div>
  <div class="mini-section-heading"><span>桥隧通行结果</span><span>已评估 {{ dashboard.heavyResults.filter(x=>x.passabilityStatus).length }} / {{ dashboard.heavyResults.length }}</span></div>
  <div class="result-scroll scroll-region"><div v-for="item in dashboard.heavyResults" :key="item.assetId" class="result-row" :title="item.evaluatedAt ? `最近评估：${item.evaluatedAt}` : '暂无评估结果'"><div class="result-name"><strong>{{ item.assetName }}</strong><small>{{ item.restrictionReason||'暂无评估结果' }}</small></div><span class="result-type">{{ item.assetType==='BRIDGE'?'桥梁':'隧道' }}</span><span class="result-badge" :class="item.passabilityStatus==='PASS'?'result-pass':item.passabilityStatus==='CONDITIONAL'?'result-condition':item.passabilityStatus==='DENY'?'result-deny':'result-pending'">{{ {PASS:'可通行',CONDITIONAL:'条件通行',DENY:'禁止通行'}[item.passabilityStatus]||'暂无评估' }}</span></div><p v-if="!dashboard.heavyResults?.length" class="empty-tip">暂无桥隧设施</p></div></section>
</aside>
<section class="dashboard-center-column">
  <section class="map-panel" :class="{'is-administrative':baseLayer==='administrative'}">
    <TransportMap ref="mapRef" class-name="overview-map" :class="{'is-administrative':baseLayer==='administrative'}" :regions="mapData.regions" :region-details="dashboard.regions" :region-indicator="indicator" :roads="mapData.roads" :assets="mapData.assets?.features?.map(f=>({...f.properties,longitude:f.geometry?.coordinates?.[0],latitude:f.geometry?.coordinates?.[1]}))||[]" :default-layer-visibility="visibleLayers" default-base="administrative" :decorated-regions="true" :show-region-labels="baseLayer==='administrative'" @region-click="selectedRegion=$event.details"/>
    <div class="map-grid-overlay" :class="{'is-district-grid':baseLayer==='administrative'}"></div>
    <div v-if="baseLayer==='administrative'" class="indicator-switcher" aria-label="行政区指标">
      <button v-for="item in indicatorOptions" :key="item[0]" class="indicator-button" :class="{'is-active':indicator===item[0]}" :aria-pressed="indicator===item[0]" @click="toggleIndicator(item[0])">{{ item[1] }}</button>
    </div>
    <form class="map-search-box" @submit.prevent="findRegion"><input v-model="search" type="search" placeholder="搜索行政区"><button title="搜索">⌕</button></form>
    <div class="map-tool-rail"><button title="放大" @click="mapRef.zoomIn()">＋</button><button title="缩小" @click="mapRef.zoomOut()">−</button><button title="复位" @click="mapRef.reset()">⌂</button><button title="图层" :aria-expanded="layerPanelOpen" @click.stop="layerPanelOpen=!layerPanelOpen">▱</button></div>
    <div class="map-layer-popover" :class="{'is-open':layerPanelOpen}" @click.stop>
      <div class="map-layer-section-title"><strong>地图模式</strong><small>始终选择一种</small></div>
      <div class="map-base-options" role="radiogroup" aria-label="地图模式">
        <button v-for="mode in [['administrative','行政区划'],['satellite','卫星地图'],['electronic','电子地图']]" :key="mode[0]" type="button" role="radio" :class="{'is-active':baseLayer===mode[0]}" :aria-checked="baseLayer===mode[0]" @click="setBaseLayer(mode[0])">{{ mode[1] }}</button>
      </div>
      <div class="layer-divider"></div>
      <strong>业务叠加图层</strong>
      <template v-if="baseLayer!=='administrative'">
        <label><input :checked="visibleLayers.roads" type="checkbox" @change="setLayer('roads',$event.target.checked)"> 高速/快速路网</label>
        <label><input :checked="visibleLayers.assets" type="checkbox" @change="setLayer('assets',$event.target.checked)"> 桥梁隧道</label>
      </template>
      <p v-else class="map-layer-hint">切换至卫星或电子地图后可叠加路网和桥隧。</p>
    </div>
    <div class="map-caption"><span class="pulse-dot"></span><span>{{ selectedRegion?.regionName||'重庆市' }} · {{ baseLayer==='administrative' ? indicatorLabel : baseLayer==='satellite' ? '卫星地图' : '电子地图' }}</span></div>
    <div v-if="baseLayer==='administrative' && indicator" class="dynamic-map-legend metric-gradient-legend" :aria-label="`${indicatorLabel}连续颜色图例`"><span>低 0</span><i></i><span>50 中</span><i></i><span>100 高</span></div>
    <div v-else-if="baseLayer==='administrative'" class="map-district-hint">悬停区县查看详情 · 点击指标可为区划着色</div>
  </section>
  <section class="geological-ticker"><div class="ticker-label"><span class="alert-pulse"></span>灾害动态</div><div class="ticker-viewport"><div class="ticker-track"><span v-for="n in dashboard.hazardNotices" :key="n.id" class="ticker-event">{{ n.regionName }} · {{ n.content }}</span></div></div></section>
</section>
<aside class="dashboard-column dashboard-right-column">
 <section class="tech-panel risk-panel"><h2 class="tech-panel-title">灾害评估概况</h2><span class="demo-badge">桥隧受损</span>
  <div class="risk-summary-row"><EChart class="risk-pie-chart" :option="damageOption"/><div class="risk-legend-summary"><div v-for="item in dashboard.damageDistribution" :key="item.name" class="risk-summary-item"><i :style="{background:damageColors[item.name]}"></i><span>{{ item.name }}（{{ damageRanges[item.name] }}）</span><strong>{{ item.value }}处</strong></div></div></div>
  <div class="asset-damage-list scroll-region"><div v-for="asset in dashboard.damageResults" :key="asset.assetId" class="asset-damage-row" :title="asset.evaluatedAt ? `最近评估：${asset.evaluatedAt}` : '暂无评估结果'"><strong>{{ asset.assetName }}</strong><span class="asset-damage-score">{{ asset.damageProbability == null ? '—' : `${Number(asset.damageProbability).toFixed(1)}%` }}</span><span class="asset-damage-level" :style="{color:damageColors[asset.damageLevel]||'#7894aa',borderColor:damageColors[asset.damageLevel]||'#526f84'}">{{ asset.damageLevel||'暂无' }}</span></div><p v-if="!dashboard.damageResults?.length" class="empty-tip">暂无桥隧设施</p></div></section>
<section class="tech-panel resilience-panel"><h2 class="tech-panel-title">区域韧性概况</h2><span class="demo-badge">区域结果</span><div class="resilience-radar-wrap"><EChart class="resilience-radar" :option="resilienceRadarOption"/><button v-if="selectedRegion" class="radar-reset-region" @click="showOverall">查看重庆市总体</button></div></section>
 <section class="tech-panel assistant-panel"><h2 class="tech-panel-title">数字人助手</h2><span class="assistant-status"><i></i>在线</span><div class="assistant-stage" :class="{'is-collapsed':assistantStageCollapsed}"><div class="assistant-avatar"><div class="avatar-head"></div><div class="avatar-body"></div><span>韧安助手</span></div><div class="assistant-bubble">您好，我可以介绍平台功能和评估模块。</div></div><div class="assistant-chat-wrap"><button class="assistant-collapse" :class="{'is-collapsed':assistantStageCollapsed}" :title="assistantStageCollapsed?'展开形象':'收起形象'" :aria-label="assistantStageCollapsed?'展开形象':'收起形象'" @click="assistantStageCollapsed=!assistantStageCollapsed"></button><div ref="chatScrollRef" class="assistant-chat"><div v-for="(m,i) in chat" :key="i" class="chat-message" :class="m.role==='assistant'?'assistant-message':'user-message'">{{ m.text }}</div></div></div><div class="assistant-prompts"><button @click="ask('platform','平台有哪些功能？')">平台有哪些功能？</button><button @click="ask('map','地图颜色代表什么？')">地图颜色代表什么？</button><button @click="ask('heavy','如何进行重车评估？')">如何进行重车评估？</button></div><form class="assistant-input-row" @submit.prevent="ask('',message)"><input v-model="message" :disabled="assistantBusy" placeholder="请输入您想了解的问题"><button :disabled="assistantBusy">{{ assistantBusy ? '…' : '发送' }}</button></form></section>
</aside></main></div>
</template>
