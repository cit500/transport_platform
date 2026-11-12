<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import PlatformHeader from '../components/PlatformHeader.vue';
import TransportMap from '../components/TransportMap.vue';
import MapLayerControl from '../components/MapLayerControl.vue';
import VehicleProfileDialog from '../components/VehicleProfileDialog.vue';
import HeavyAssessmentDialog from '../components/HeavyAssessmentDialog.vue';
import { useMapPanelResize } from '../composables/useMapPanelResize.js';
import { useVehicleProfiles } from '../composables/useVehicleProfiles.js';
import { api } from '../services/api.js';
import { PASSABILITY, statusLabel, vehicleSnapshot } from '../services/heavyAssessment.js';
import { usePlatformStore } from '../stores/platform.js';
import '../styles/route-planning.css';

const platform = usePlatformStore();
const { mapData } = storeToRefs(platform);
const form = reactive({ originLongitude: '', originLatitude: '', destinationLongitude: '', destinationLatitude: '' });
const result = ref(null), loading = ref(false), error = ref(''), mapError = ref('');
const pickMode = ref(''), mapRef = ref(), layerOpen = ref(false), logs = ref([]);
const layers = reactive({ regions:true, labels:false, route:true, roads:true, assets:true });
const layerItems = [{key:'regions',label:'行政边界'},{key:'labels',label:'区县名称标签'},
    {key:'route',label:'路网',detail:'规划路线'},{key:'roads',label:'背景路网'},{key:'assets',label:'沿线桥隧'}];
const centerCol = ref(), bottomTab = ref('summary');
const { bottomHeight, maxHeight, startResize, resizeBottom } = useMapPanelResize(centerCol, mapRef, 210);
const statusFilter = ref('ALL');
const { profiles, selectedId:vehicleProfileId, selectedProfile:vehicle, error:vehicleError, save:saveVehicleProfile } = useVehicleProfiles();
const vehicleDialogOpen = ref(false);
const assessmentDialogOpen = ref(false), assessmentAsset = ref(null), assessments = ref({});
const assessmentTab = ref('overview');
const newScenarioId = () => 'route-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,12);
const scenarioId = ref(newScenarioId());
const selectedAssessment = computed(() => selectedAsset.value == null ? null : assessments.value[String(selectedAsset.value)]);
const selectedFacility = computed(() => result.value?.assets?.find(a => String(a.id)===String(selectedAsset.value)) || null);
function assessmentOf(asset) { return assessments.value[String(asset.id)]; }
function effectiveStatus(asset) { return assessmentOf(asset)?.effectiveStatus || 'PENDING_DATA'; }
function sourceLabel(asset) { const item=assessmentOf(asset); return !item?'尚未评估':item.source==='MANUAL_SIMULATION'?'人工调整 · 模拟':'随机模拟'; }
function openAssessment(asset) {
    if(loading.value)return;
    selectedAsset.value=asset.id; assessmentTab.value='detail'; assessmentAsset.value=asset; assessmentDialogOpen.value=true;
}
function saveAssessment(saved) {
    assessments.value={...assessments.value,[String(saved.assetId)]:saved};
    addLog('已保存 '+saved.asset.assetName+'：'+statusLabel(saved.effectiveStatus)+'（'+(saved.source==='MANUAL_SIMULATION'?'人工调整 · 模拟':'随机模拟')+'），记录 #'+saved.savedAssessmentId);
}
function invalidateAssessment(id) {
    const next={...assessments.value}; delete next[String(id)]; assessments.value=next;
    addLog('设施档案已变化，原模拟结论已失效，请重新评估');
}
watch(() => JSON.stringify(vehicleSnapshot(vehicle.value)), () => {
    if(Object.keys(assessments.value).length)addLog('车辆参数已变化，沿线原结论已失效；已保存历史仍保留在数据库');
    assessments.value={}; statusFilter.value='ALL'; scenarioId.value=newScenarioId(); assessmentDialogOpen.value=false;
});
function editVehicle() { vehicleError.value=''; vehicleDialogOpen.value=true; }
function saveVehicle(profile) {
    if (saveVehicleProfile(profile)) { vehicleDialogOpen.value=false; addLog('车辆参数方案已保存到本机：'+vehicle.value.profileName); }
}
const statusOptions = computed(() => PASSABILITY.map(status => ({...status,
    count:(result.value?.assets||[]).filter(a=>effectiveStatus(a)===status.key).length
})));
const filteredAssets = computed(() => (result.value?.assets||[]).filter(a=>statusFilter.value==='ALL'||effectiveStatus(a)===statusFilter.value));
const base = ref('satellite'), selectedAsset = ref(null);
const routeAssets = computed(() => (result.value?.assets || []).map(a => ({
    ...a, latitude: a.focusLatitude, longitude: a.focusLongitude, status: effectiveStatus(a),
    statusLabel:statusLabel(effectiveStatus(a)), assessmentSourceLabel:sourceLabel(a)
})));
const format = (value, digits = 0) => value == null ? '—' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: digits });
const groups = computed(() => [
    { name: '沿线桥梁', type: 'BRIDGE', items: filteredAssets.value.filter(a => a.assetType === 'BRIDGE') },
    { name: '沿线隧道', type: 'TUNNEL', items: filteredAssets.value.filter(a => a.assetType === 'TUNNEL') }
]);
function validPoint(prefix) {
    const lon = form[prefix + 'Longitude'], lat = form[prefix + 'Latitude'];
    return lon !== '' && lat !== '' && Number.isFinite(Number(lon)) && Number.isFinite(Number(lat))
        && Math.abs(Number(lon)) <= 180 && Math.abs(Number(lat)) <= 90;
}
const endpoints = computed(() => ['origin', 'destination'].filter(validPoint).map(prefix => ({
    longitude: Number(form[prefix + 'Longitude']), latitude: Number(form[prefix + 'Latitude']),
    node: result.value?.[prefix]?.node, role: prefix
})));
const canPlan = computed(() => validPoint('origin') && validPoint('destination'));
function addLog(text) { logs.value.unshift({ id: Date.now() + Math.random(), time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), text }); logs.value = logs.value.slice(0, 30); }
function clearResult() {
    result.value=null; error.value=''; selectedAsset.value=null; statusFilter.value='ALL';
    assessmentDialogOpen.value=false; mapRef.value?.drawRoutes([]);
}
watch(() => Object.values(form), clearResult, { flush: 'sync' });
function togglePick(target) { if (!loading.value) pickMode.value = pickMode.value === target ? '' : target; }
function onMapClick(point) {
    if (!pickMode.value || loading.value) return;
    const prefix = pickMode.value;
    form[prefix + 'Longitude'] = Number(point.longitude.toFixed(7));
    form[prefix + 'Latitude'] = Number(point.latitude.toFixed(7));
    pickMode.value = '';
    addLog((prefix === 'origin' ? '起点' : '终点') + '已从地图选取');
}
function swap() {
    const { originLongitude, originLatitude } = form;
    form.originLongitude = form.destinationLongitude; form.originLatitude = form.destinationLatitude;
    form.destinationLongitude = originLongitude; form.destinationLatitude = originLatitude;
}
function reset() {
    Object.keys(form).forEach(key => { form[key] = ''; });
    clearResult(); assessments.value={}; scenarioId.value=newScenarioId(); pickMode.value = ''; mapRef.value?.reset(); addLog('已清空起终点与规划结果');
}
async function run() {
    if (!canPlan.value || loading.value) return;
    loading.value = true; pickMode.value = ''; clearResult();
    addLog('读取数据库路网，匹配最近节点并计算最短路径');
    try {
        const planned = await api('/heavy/plan', { method: 'POST', body: JSON.stringify(Object.fromEntries(Object.entries(form).map(([key, value]) => [key, Number(value)]))) });
        const candidates=(planned.assets||[]).map(a=>assessmentOf(a)).filter(Boolean);
        if(candidates.length) {
            try {
                const checked=await api('/heavy/assessment-validations',{method:'POST',body:JSON.stringify({
                    scenarioId:scenarioId.value,vehicle:vehicleSnapshot(vehicle.value),savedAssessmentIds:candidates.map(a=>a.savedAssessmentId)
                })});
                const valid=new Set(checked.validAssessmentIds.map(String)), next={...assessments.value};
                candidates.forEach(a=>{if(!valid.has(String(a.savedAssessmentId)))delete next[String(a.assetId)];});
                assessments.value=next;
            } catch(e) { assessments.value={}; addLog('旧评估结果未能核对，沿线设施需重新评估：'+e.message); }
        }
        result.value=planned;
        mapRef.value?.drawRoutes((result.value.segments || []).flatMap(segment => [
            { points: segment.points, style: { color: '#021323', weight: 9, opacity: .9 } },
            { points: segment.points, style: { color: '#45e4ff', weight: 5, opacity: 1 } }
        ]));
        if (result.value.status === 'SAME_NODE') mapRef.value?.focus(result.value.origin.node.latitude, result.value.origin.node.longitude, 13);
        addLog(result.value.message + '；服务端 ' + format(result.value.timings.totalMs, 1) + ' ms');
    } catch (e) { error.value = e.message; addLog('规划失败：' + e.message); }
    finally { loading.value = false; }
}
function focusAsset(asset) { selectedAsset.value=asset.id; assessmentTab.value='detail'; mapRef.value?.focusGently(asset.focusLatitude, asset.focusLongitude); }
function setOverlay(name, checked) { layers[name]=checked; if(name!=='labels') mapRef.value?.toggleLayer(name,checked); }
function setBase(value) { base.value = value; mapRef.value?.setBase(value); }
async function loadMap() {
    mapError.value = '';
    try { await Promise.all([platform.loadMap('roads'), platform.loadMap('regions')]); }
    catch (e) { mapError.value = '背景路网加载失败：' + e.message; }
}
onMounted(loadMap);
</script>

<template>
<div class="heavy-workbench route-workbench">
  <PlatformHeader />
  <main class="heavy-main route-main">
    <aside class="heavy-column heavy-left-column route-left">
      <section class="tech-panel route-input-panel">
        <h2 class="tech-panel-title">路径规划</h2>
        <fieldset :disabled="loading">
          <template v-for="(item,index) in [{key:'origin',label:'起点'},{key:'destination',label:'终点'}]" :key="item.key">
            <div class="route-endpoint-line"><strong>{{ item.label }}</strong>
              <input v-model="form[item.key+'Longitude']" type="number" step="any" min="-180" max="180" placeholder="经度" :aria-label="item.label+'经度'">
              <input v-model="form[item.key+'Latitude']" type="number" step="any" min="-90" max="90" placeholder="纬度" :aria-label="item.label+'纬度'">
              <button type="button" :class="{'is-active':pickMode===item.key}" :aria-pressed="pickMode===item.key" @click="togglePick(item.key)">{{ pickMode===item.key ? '取消选点' : '地图选点' }}</button>
            </div>
            <div v-if="index===0" class="route-swap-row"><button type="button" title="交换起终点" aria-label="交换起终点" @click="swap">⇅</button></div>
          </template>
          <div class="run-actions"><button class="primary-run-button" :disabled="!canPlan" @click="run">{{ loading ? '规划中…' : '规划最短路径' }}</button><button class="secondary-run-button" @click="reset">重置</button></div>
        </fieldset>
        <p v-if="error" class="route-error" role="alert">{{ error }}</p>
      </section>
      <section v-for="group in groups" :key="group.type" class="tech-panel route-facility-panel">
        <h2 class="tech-panel-title">{{ group.name }}<span class="route-count">{{ group.items.length }} 处</span></h2>
        <div class="route-facility-scroll">
          <div v-for="(asset,index) in group.items" :key="asset.id" class="route-facility" :class="{'is-selected':selectedAsset===asset.id}">
            <span class="route-order">{{ index+1 }}</span><button class="route-facility-focus" @click="focusAsset(asset)"><strong>{{ asset.assetName }}<em :class="['route-facility-status','pass-status-'+effectiveStatus(asset)]">{{ statusLabel(effectiveStatus(asset)) }}</em></strong><small>{{ asset.assetCode }} · {{ sourceLabel(asset) }}</small></button>
            <button class="route-assess-button" :disabled="loading" @click="openAssessment(asset)">通行评估</button>
          </div>
          <p v-if="!group.items.length" class="empty-tip">{{ !result ? '规划完成后显示沿线清单' : !result.reachable ? '当前无可达路径' : statusFilter!=='ALL' ? '当前筛选条件下无设施' : '本路径未检索到绑定'+(group.type==='BRIDGE'?'桥梁':'隧道') }}</p>
        </div>
      </section>
    </aside>
    <section ref="centerCol" class="heavy-center-column route-center">
      <section class="heavy-map-panel">
        <TransportMap ref="mapRef" :roads="mapData.roads" :regions="mapData.regions" :assets="routeAssets" :route-endpoints="endpoints" :pick-mode="pickMode" :selected-asset-id="selectedAsset" :interactive-regions="false" :outline-regions="true" :show-region-labels="layers.labels" :region-indicator="''" :default-layer-visibility="{regions:true,roads:true,assets:true}" :center="[30.2,107.5]" :zoom="8" @map-click="onMapClick" @asset-click="focusAsset" />
        <div class="heavy-map-tools"><button title="放大" aria-label="放大" @click="mapRef?.zoomIn()">＋</button><button title="缩小" aria-label="缩小" @click="mapRef?.zoomOut()">−</button><button title="复位" aria-label="复位" @click="mapRef?.reset()">⌂</button><button title="图层" aria-label="图层" :aria-expanded="layerOpen" @click="layerOpen=!layerOpen">▱</button></div>
        <MapLayerControl :open="layerOpen" :base="base" :overlays="layers" :items="layerItems" @base-change="setBase" @overlay-change="setOverlay($event.key,$event.checked)" @close="layerOpen=false" />
        <div v-if="pickMode" class="route-pick-banner" role="status">点击地图选择{{ pickMode==='origin'?'起点':'终点' }}<button @click="pickMode=''">取消</button></div>
        <div v-if="mapError" class="route-map-error">{{ mapError }} <button @click="loadMap">重试</button></div>
        <div class="heavy-map-caption"><span class="pulse-dot"></span>{{ result ? result.message : '请选择起终点 · 路线将叠加显示在背景路网上' }}</div>
        <div class="route-map-legend"><span><i class="route-line-key"></i>最短路径</span><span><i class="route-snap-key"></i>节点匹配连接</span><span>设施状态仅为模拟</span></div>
      </section>
      <div class="disaster-y-resizer route-y-resizer" role="separator" aria-label="调整地图与底部面板高度" aria-orientation="horizontal" tabindex="0"
           :aria-valuenow="Math.round(bottomHeight)" :aria-valuemin="120" :aria-valuemax="Math.round(maxHeight)"
           @pointerdown="startResize" @keydown.up.prevent="resizeBottom(20)" @keydown.down.prevent="resizeBottom(-20)"><i></i><i></i><i></i></div>
      <section class="tech-panel route-summary-panel" :style="{height:bottomHeight+'px'}">
        <div class="bottom-tabs route-bottom-tabs" role="tablist" aria-label="路径信息页签">
          <button v-for="tab in [['summary','路径方案信息'],['network','路网与计算状态'],['logs','评估日志']]" :id="'route-tab-'+tab[0]" :key="tab[0]" role="tab" :aria-selected="bottomTab===tab[0]" :aria-controls="'route-panel-'+tab[0]" :class="{'is-active':bottomTab===tab[0]}" @click="bottomTab=tab[0]">{{ tab[1] }}</button>
        </div>
        <div v-if="bottomTab==='summary'" id="route-panel-summary" class="route-bottom-content" role="tabpanel" aria-labelledby="route-tab-summary">
        <div class="route-stat-grid">
          <article><span>路径总长度</span><strong>{{ format(result?.distanceKm,3) }}<small> km</small></strong></article>
          <article><span>途经路网边</span><strong>{{ result?.reachable ? result.edgeCount : '—' }}<small> 条</small></strong></article>
          <article><span>途经节点</span><strong>{{ result?.reachable ? result.nodeIds.length : '—' }}<small> 个</small></strong></article>
          <article><span>桥梁 / 隧道</span><strong>{{ result?.bridgeCount??0 }} / {{ result?.tunnelCount??0 }}<small> 处</small></strong></article>
          <article><span>算法求解耗时</span><strong>{{ format(result?.timings.solveMs,2) }}<small> ms</small></strong></article>
        </div>
        <div v-if="result" class="route-snap-summary"><span>起点 → 节点 #{{ result.origin.node.id }} · 匹配距离 {{ format(result.origin.snapDistanceM,1) }} m</span><span>终点 → 节点 #{{ result.destination.node.id }} · 匹配距离 {{ format(result.destination.snapDistanceM,1) }} m</span></div>
        </div>
        <div v-else-if="bottomTab==='network'" id="route-panel-network" class="route-bottom-content" role="tabpanel" aria-labelledby="route-tab-network">
          <div class="route-network-status"><i :class="{'is-ready':result?.reachable}"></i>{{ loading ? '正在规划' : error ? '规划失败' : result ? result.message : '等待规划' }}</div>
          <dl class="route-network-grid"><div><dt>网络节点数</dt><dd>{{ format(result?.network.nodeCount) }}</dd></div><div><dt>网络道路边数</dt><dd>{{ format(result?.network.edgeCount) }}</dd></div><div><dt>首建拓扑</dt><dd>{{ format(result?.network.buildMs,1) }} ms</dd></div><div><dt>节点匹配</dt><dd>{{ format(result?.timings.snapMs,2) }} ms</dd></div><div><dt>服务端总耗时</dt><dd>{{ format(result?.timings.totalMs,1) }} ms</dd></div></dl>
        </div>
        <div v-else id="route-panel-logs" class="route-bottom-content route-log-scroll" role="tabpanel" aria-labelledby="route-tab-logs"><p v-for="log in logs" :key="log.id"><time>{{ log.time }}</time>{{ log.text }}</p><p v-if="!logs.length" class="empty-tip">尚无评估日志</p></div>
      </section>
    </section>
    <aside class="heavy-column route-right">
      <section class="tech-panel route-vehicle-panel"><h2 class="tech-panel-title">重车任务配置<span class="route-panel-badge">本机方案</span></h2>
        <label class="route-profile-select">重车参数方案<select v-model="vehicleProfileId" aria-label="重车参数方案"><option v-for="profile in profiles" :key="profile.id" :value="profile.id">{{ profile.profileName }}</option></select></label>
        <div class="route-vehicle-details"><div><span>总车重</span><strong>{{ vehicle.grossWeightTon }}<small> t</small></strong></div><div><span>轴数</span><strong>{{ vehicle.axleCount }}<small> 轴</small></strong></div><div><span>长度</span><strong>{{ vehicle.vehicleLengthM }}<small> m</small></strong></div><div><span>宽度</span><strong>{{ vehicle.vehicleWidthM }}<small> m</small></strong></div><div><span>高度</span><strong>{{ vehicle.vehicleHeightM }}<small> m</small></strong></div><div><span>计划速度</span><strong>{{ vehicle.plannedSpeedKmh }}<small> km/h</small></strong></div></div>
        <button class="route-edit-vehicle" @click="editVehicle">编辑车辆参数</button>
        <p v-if="vehicleError && !vehicleDialogOpen" class="route-error" role="alert">{{ vehicleError }}</p>
      </section>
      <section class="tech-panel route-assessment-panel"><h2 class="tech-panel-title">沿线桥隧判定</h2>
        <div class="route-assessment-tabs"><button :class="{'is-active':assessmentTab==='overview'}" @click="assessmentTab='overview'">总览</button><button :class="{'is-active':assessmentTab==='detail'}" @click="assessmentTab='detail'">单设施</button><span>随机模拟</span></div>
        <template v-if="assessmentTab==='overview'">
        <div class="route-assessment-header"><span>沿线共 {{ result?.assets?.length||0 }} 处</span><button :class="{'is-active':statusFilter==='ALL'}" @click="statusFilter='ALL'">显示全部</button></div>
        <div class="route-status-filters"><button v-for="status in statusOptions" :key="status.key" :class="['status-'+status.key,{'is-active':statusFilter===status.key}]" :aria-pressed="statusFilter===status.key" @click="statusFilter=status.key"><span><i></i>{{ status.label }}</span><strong>{{ status.count }}</strong></button></div>
        <div class="route-assessment-note"><strong>{{ !result ? '等待路径规划' : '沿线已保存 '+result.assets.filter(a=>assessmentOf(a)).length+' 处模拟评估' }}</strong><p>点击状态筛选左侧清单；随机结论不代表真实通行能力。</p></div>
        </template>
        <div v-else class="route-single-assessment">
          <select v-model="selectedAsset" aria-label="选择沿线设施"><option :value="null">选择桥梁或隧道</option><option v-for="asset in result?.assets||[]" :key="asset.id" :value="asset.id">{{ asset.assetName }}</option></select>
          <template v-if="selectedFacility"><h3>{{ selectedFacility.assetName }}</h3><strong :class="'pass-status-'+effectiveStatus(selectedFacility)">{{ statusLabel(effectiveStatus(selectedFacility)) }}</strong><small>{{ sourceLabel(selectedFacility) }}</small>
            <dl v-if="selectedAssessment"><dt>原随机结论</dt><dd>{{ statusLabel(selectedAssessment.algorithmStatus) }}</dd><dt>评估车辆</dt><dd>{{ selectedAssessment.vehicle.profileName }}</dd><dt>记录编号</dt><dd>#{{ selectedAssessment.savedAssessmentId }}</dd></dl>
            <p>{{ selectedAssessment?.overrideReason || (selectedAssessment ? '当前显示已保存的随机模拟结果。' : '该设施尚未评估。') }}</p><button @click="openAssessment(selectedFacility)">打开评估详情</button>
          </template><p v-else class="empty-tip">选择设施查看或发起单独评估</p>
        </div>
      </section>
      <section class="tech-panel route-continuity-panel"><h2 class="tech-panel-title">执行保通路径规划</h2><div class="route-continuity-state"><span class="route-pending-dot"></span>{{ !result?.reachable ? '等待基础路径规划' : '模拟评估流程已接入' }}</div><p>当前结论由随机函数产生，保通路径重算将在后续迭代接入。</p><button disabled title="本轮仅演示单设施评估与人工调整">执行保通路径规划</button></section>
    </aside>
  </main>
  <VehicleProfileDialog :open="vehicleDialogOpen" :profile="vehicle" :error="vehicleError" @close="vehicleDialogOpen=false" @save="saveVehicle" />
  <HeavyAssessmentDialog :open="assessmentDialogOpen" :asset="assessmentAsset" :vehicle="vehicle" :scenario-id="scenarioId" :saved="assessmentAsset?assessments[String(assessmentAsset.id)]:null" @close="assessmentDialogOpen=false" @saved="saveAssessment" @invalidated="invalidateAssessment" />
</div>
</template>
