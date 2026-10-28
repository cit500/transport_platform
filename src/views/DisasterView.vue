<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { storeToRefs } from 'pinia';
import PlatformHeader from '../components/PlatformHeader.vue';
import TransportMap from '../components/TransportMap.vue';
import HazardSourcePanel from '../components/disaster/HazardSourcePanel.vue';
import AssetEvaluatePanel from '../components/disaster/AssetEvaluatePanel.vue';
import RiskDetailPanel from '../components/disaster/RiskDetailPanel.vue';
import AssetDetailModal from '../components/disaster/AssetDetailModal.vue';
import FragilityCurveChart from '../components/disaster/FragilityCurveChart.vue';
import { api } from '../services/api.js';
import { usePlatformStore, useUiStore } from '../stores/platform.js';

const platform = usePlatformStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { mapData } = storeToRefs(platform);

const mode = ref(route.query.type === 'debris' ? 'DEBRIS_FLOW' : 'EARTHQUAKE');
const bootstrap = reactive({ regions: [], assets: [], assetCount: 0, models: { EARTHQUAKE: [], DEBRIS_FLOW: [] } });

const form = reactive({ longitude: 106.55, latitude: 29.56, pgaG: 0.20 });
const parsedRecord = ref(null);
const debrisContext = reactive({});
const pickMode = ref('');

const bridgeSelected = ref([]);
const tunnelSelected = ref([]);
const allowResearch = reactive({ BRIDGE: false, TUNNEL: true });
const bridgeResult = ref(null);
const tunnelResult = ref(null);
const bridgeLoading = ref(false);
const tunnelLoading = ref(false);

const selectedAssetId = ref(null);
const detailAsset = ref(null);
const curves = ref([]);
const curveModel = ref(null);
const bottom = ref('result');
const logs = ref([]);
const mapRef = ref();
const saveDialog = reactive({ open: false, name: '', saving: false });

// 地图区与底部指标栏之间的可拖拽分隔
const centerCol = ref();
const bottomHeight = ref(230);
function startResize(event) {
    event.preventDefault();
    const col = centerCol.value;
    if (!col) return;
    const rect = col.getBoundingClientRect();
    const move = (ev) => {
        bottomHeight.value = Math.min(Math.max(rect.bottom - ev.clientY, 120), rect.height * 0.55);
    };
    const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
}

const hazardLabel = computed(() => (mode.value === 'EARTHQUAKE' ? '地震' : '泥石流'));
const DS_TEXT = ['基本完好', '轻微损伤', '中等损伤', '严重损伤', '毁坏'];
const DS_COLORS = ['#829BAA', '#668AA0', '#52768F', '#405D79', '#314760'];

const mergedAssets = computed(() => [
    ...(bridgeResult.value?.assets || []),
    ...(tunnelResult.value?.assets || [])
]);
const primaryResult = computed(() => {
    if (bridgeResult.value?.assets?.length) return bridgeResult.value;
    if (tunnelResult.value?.assets?.length) return tunnelResult.value;
    return bridgeResult.value || tunnelResult.value;
});
const selectedAsset = computed(() =>
    mergedAssets.value.find((a) => Number(a.assetId) === Number(selectedAssetId.value)) || null);
const currentIm = computed(() => selectedAsset.value?.imValue ?? null);

const mergedSummary = computed(() => {
    const assets = mergedAssets.value;
    if (!assets.length) return null;
    let evaluated = 0, pending = 0, affected = 0, damageSum = 0;
    for (const a of assets) {
        if (a.damageState === 'PENDING_DATA') { pending++; continue; }
        evaluated++;
        damageSum += Number(a.damageProbability || 0) / 100;
        if (a.damageState && a.damageState !== 'DS0') affected++;
    }
    const avg = evaluated ? damageSum / evaluated : 0;
    const ratio = assets.length ? affected / assets.length : 0;
    const score = Math.round((0.5 * avg + 0.5 * ratio) * 10000) / 100;
    const times = [bridgeResult.value?.evaluatedAt, tunnelResult.value?.evaluatedAt].filter(Boolean);
    return {
        evaluated,
        pending,
        bridgeCount: assets.filter((a) => a.assetType === 'BRIDGE').length,
        tunnelCount: assets.filter((a) => a.assetType === 'TUNNEL').length,
        score,
        level: score >= 60 ? '高风险' : score >= 30 ? '中风险' : '低风险',
        evaluatedAt: times.length ? times[times.length - 1] : null
    };
});

const candidates = (type) => (bootstrap.assets || []).filter((a) => a.assetType === type);

// 地图默认只展示已加入评估清单的设施；点选模式下临时展开该类型候选供点选
const mapAssets = computed(() => {
    const resultMap = new Map(mergedAssets.value.map((a) => [Number(a.assetId), a]));
    const pickType = pickMode.value.startsWith('asset-') ? pickMode.value.slice('asset-'.length) : null;
    const selected = new Set([...bridgeSelected.value, ...tunnelSelected.value].map(Number));
    const source = pickType
        ? (bootstrap.assets || []).filter((a) => a.assetType === pickType)
        : (bootstrap.assets || []).filter((a) => selected.has(Number(a.assetId)));
    return source.map((a) => {
        const result = resultMap.get(Number(a.assetId));
        return {
            id: a.assetId,
            assetId: a.assetId,
            assetName: a.assetName,
            assetType: a.assetType,
            longitude: a.longitude,
            latitude: a.latitude,
            status: result?.passabilityStatus,
            damageState: result?.damageState
        };
    });
});

const epicenter = computed(() => {
    if (form.longitude == null || form.latitude == null) return null;
    const rings = mode.value === 'EARTHQUAKE'
        ? [10, 25, 50]
        : (primaryResult.value?.influenceRadiusKm ? [primaryResult.value.influenceRadiusKm] : [10]);
    return { longitude: form.longitude, latitude: form.latitude, ringsKm: rings, label: hazardLabel.value + '源' };
});

const dsRows = computed(() => {
    const states = selectedAsset.value?.stateProbabilities;
    if (!states) return [];
    return [0, 1, 2, 3, 4].map((i) => ({
        label: `DS${i}`, text: DS_TEXT[i], color: DS_COLORS[i],
        value: Number(states[`DS${i}`] ?? 0)
    }));
});
const exceedRows = computed(() => {
    const ex = selectedAsset.value?.exceedanceProbabilities;
    if (!ex) return [];
    return [1, 2, 3, 4].map((i) => ({ label: `P(≥DS${i})`, value: Number(ex[`DS${i}`] ?? 0) * 100 }));
});

const derivation = computed(() => {
    const primary = primaryResult.value;
    if (!primary) return [];
    const rows = [];
    if (mode.value === 'EARTHQUAKE') {
        rows.push(['强度来源', primary.imMode === 'GROUND_MOTION' ? '上传地震动记录解析 PGA' : '输入统一 PGA']);
        rows.push(['PGA', `${Number(primary.pgaG || 0).toFixed(4)} g`]);
        if (primary.groundMotion) {
            rows.push(['地震动记录', `${primary.groundMotion.filename} · ${primary.groundMotion.npts} 点 · 持时 ${Number(primary.groundMotion.durationS || 0).toFixed(1)} s`]);
        }
        rows.push(['震中坐标', `${primary.sourceLongitude}, ${primary.sourceLatitude}`]);
    } else {
        const s = primary.summaryJson || {};
        rows.push(['清水峰值流量', `${Number(s.clearWaterPeakFlowM3s || 0).toFixed(2)} m³/s`]);
        rows.push(['泥石流峰值流量', `${Number(s.debrisPeakFlowM3s || 0).toFixed(2)} m³/s`]);
        rows.push(['概化沟宽', `${Number(s.channelWidthM || 0).toFixed(2)} m`]);
        rows.push(['流速 / 流深', `${Number(s.flowVelocityMs || 0).toFixed(2)} m/s / ${Number(s.flowDepthM || 0).toFixed(2)} m`]);
        rows.push(['强度指标 I（桥梁）', Number(s.intensityBridge || 0).toFixed(3)]);
        rows.push(['强度指标 I（隧道）', Number(s.intensityTunnel || 0).toFixed(3)]);
        rows.push(['影响半径', `${primary.influenceRadiusKm} km（${primary.influenceRadiusAuto ? '自动推导' : '显式指定'}）`]);
        rows.push(['发生概率', `${(Number(primary.occurrenceProbability || 0) * 100).toFixed(1)} %`]);
    }
    const summary = mergedSummary.value;
    if (summary) {
        rows.push(['参与桥梁', `${summary.bridgeCount} 处`]);
        rows.push(['参与隧道', `${summary.tunnelCount} 处`]);
        rows.push(['待补数据', `${summary.pending} 处`]);
    }
    return rows;
});

function addLog(text) {
    logs.value.unshift({ time: new Date().toLocaleTimeString('zh-CN', { hour12: false }), text });
}

// ------------------------------------------------------------------ 地图交互

function onMapClick(point) {
    if (pickMode.value === 'epicenter') {
        form.longitude = Number(point.longitude.toFixed(4));
        form.latitude = Number(point.latitude.toFixed(4));
        pickMode.value = '';
        addLog(`已选取${hazardLabel.value}源：${form.longitude}, ${form.latitude}`);
    }
}

function onAssetClick(asset) {
    const type = pickMode.value === 'asset-BRIDGE' ? 'BRIDGE'
        : pickMode.value === 'asset-TUNNEL' ? 'TUNNEL' : null;
    if (type) {
        const id = Number(asset.assetId ?? asset.id);
        const target = type === 'BRIDGE' ? bridgeSelected : tunnelSelected;
        if (!target.value.includes(id)) {
            target.value = [...target.value, id];
            addLog(`已加入${type === 'BRIDGE' ? '桥梁' : '隧道'}评估清单：${asset.assetName}`);
        }
        pickMode.value = '';
        return;
    }
    if (mergedAssets.value.some((a) => Number(a.assetId) === Number(asset.assetId ?? asset.id))) {
        selectedAssetId.value = Number(asset.assetId ?? asset.id);
    }
}

function selectFromPanel(id) {
    if (mergedAssets.value.some((a) => Number(a.assetId) === Number(id))) {
        selectedAssetId.value = Number(id);
    }
}

// ------------------------------------------------------------------ 评估

function buildPayload(type) {
    const payload = {
        hazardType: mode.value,
        longitude: form.longitude,
        latitude: form.latitude,
        assetIds: type === 'BRIDGE' ? [...bridgeSelected.value] : [...tunnelSelected.value],
        allowResearch: allowResearch[type]
    };
    if (mode.value === 'EARTHQUAKE') {
        payload.pgaG = form.pgaG;
        if (parsedRecord.value) {
            payload.groundMotion = {
                filename: parsedRecord.value.filename,
                content: parsedRecord.value.__content,
                unit: parsedRecord.value.unit,
                dt: parsedRecord.value.dt
            };
        }
    } else if (Object.keys(debrisContext).length) {
        payload.debrisContext = { ...debrisContext };
    }
    return payload;
}

async function runEvaluate(type) {
    const loadingRef = type === 'BRIDGE' ? bridgeLoading : tunnelLoading;
    loadingRef.value = true;
    addLog(`正在计算${type === 'BRIDGE' ? '桥梁' : '隧道'}${hazardLabel.value}损伤概率。`);
    try {
        const result = await api('/disaster/evaluate', {
            method: 'POST',
            body: JSON.stringify(buildPayload(type))
        });
        if (type === 'BRIDGE') bridgeResult.value = result; else tunnelResult.value = result;
        if (!selectedAsset.value) {
            const first = (result.assets || []).find((a) => a.damageState !== 'PENDING_DATA') || (result.assets || [])[0];
            if (first) selectedAssetId.value = first.assetId;
        }
        addLog(`${type === 'BRIDGE' ? '桥梁' : '隧道'}评估完成：风险 ${result.riskLevel}（${result.riskScore} 分），待补数据 ${result.pendingCount} 处。`);
        ui.toast(`${type === 'BRIDGE' ? '桥梁' : '隧道'}评估完成`, 'success');
    } catch (e) {
        addLog('评估失败：' + e.message);
        ui.toast(e.message);
    } finally {
        loadingRef.value = false;
    }
}

// ------------------------------------------------------------------ 曲线联动

async function loadCurves(modelId) {
    if (!modelId) { curves.value = []; curveModel.value = null; return; }
    try {
        const data = await api(`/disaster/models/${modelId}/curves?points=401`);
        curves.value = data.curves || [];
        curveModel.value = data.model || null;
    } catch (e) {
        curves.value = [];
        curveModel.value = null;
        addLog('曲线加载失败：' + e.message);
    }
}

watch(() => selectedAsset.value?.modelId, (id) => loadCurves(id));

// ------------------------------------------------------------------ 保存

function buildInputSnapshot() {
    const input = {
        hazardType: mode.value,
        longitude: form.longitude,
        latitude: form.latitude,
        allowResearchBridge: allowResearch.BRIDGE,
        allowResearchTunnel: allowResearch.TUNNEL
    };
    if (mode.value === 'EARTHQUAKE') {
        input.pgaG = form.pgaG;
        if (parsedRecord.value) {
            input.groundMotion = {
                filename: parsedRecord.value.filename, format: parsedRecord.value.format,
                npts: parsedRecord.value.npts, durationS: parsedRecord.value.durationS,
                pgaG: parsedRecord.value.pgaG, unit: parsedRecord.value.unit
            };
        }
    } else if (Object.keys(debrisContext).length) {
        input.debrisContext = { ...debrisContext };
    }
    return input;
}

function openSave() {
    const now = new Date();
    const stamp = `${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
    saveDialog.name = `${hazardLabel.value}风险评估任务-${stamp}`;
    saveDialog.open = true;
}

function closeSave() {
    if (!saveDialog.saving) saveDialog.open = false;
}

async function confirmSave() {
    if (!saveDialog.name?.trim() || !mergedAssets.value.length) return;
    saveDialog.saving = true;
    try {
        const saved = await api('/disaster/save', {
            method: 'POST',
            body: JSON.stringify({
                taskName: saveDialog.name.trim(),
                hazardType: mode.value,
                input: buildInputSnapshot(),
                bridgeResult: bridgeResult.value,
                tunnelResult: tunnelResult.value
            })
        });
        platform.rememberTask('disaster', {
            id: saved.id, taskCode: saved.taskCode, taskName: saved.taskName,
            moduleType: mode.value, status: 'SUCCESS'
        });
        await platform.loadDashboard(true);
        addLog(`任务已保存：${saved.taskName}（${saved.taskCode}）。`);
        ui.toast('评估任务已保存', 'success');
        saveDialog.open = false;
    } catch (e) {
        addLog('保存失败：' + e.message);
        ui.toast(e.message);
    } finally {
        saveDialog.saving = false;
    }
}

// ------------------------------------------------------------------ 模式切换与初始化

function resetWorkspace() {
    bridgeResult.value = null;
    tunnelResult.value = null;
    selectedAssetId.value = null;
    detailAsset.value = null;
    curves.value = [];
    curveModel.value = null;
    pickMode.value = '';
    bottom.value = 'result';
}

watch(mode, (value) => {
    resetWorkspace();
    form.longitude = value === 'EARTHQUAKE' ? 106.55 : 107.76;
    form.latitude = value === 'EARTHQUAKE' ? 29.56 : 29.33;
    parsedRecord.value = null;
    router.replace({ name: 'disaster', query: { type: value === 'EARTHQUAKE' ? 'earthquake' : 'debris' } });
});

onMounted(async () => {
    try {
        const data = await api('/disaster/bootstrap');
        Object.assign(bootstrap, data);
        await Promise.all([platform.loadMap('regions'), platform.loadMap('roads')]);
        addLog(`已加载 ${bootstrap.assetCount || 0} 处桥隧设施，可在左侧面板圈选评估对象。`);
    } catch (e) {
        ui.toast('灾害评估后台尚未连接');
        addLog(e.message);
    }
});
</script>

<template>
<div class="disaster-workbench">
    <PlatformHeader />

    <main class="heavy-main disaster-main">
        <aside class="heavy-column heavy-left-column">
            <HazardSourcePanel :mode="mode" :longitude="form.longitude" :latitude="form.latitude"
                               :pga-g="form.pgaG" :parsed="parsedRecord" :context="debrisContext"
                               :picking="pickMode === 'epicenter'"
                               @update:mode="mode = $event" @update:longitude="form.longitude = $event"
                               @update:latitude="form.latitude = $event" @update:pga-g="form.pgaG = $event"
                               @parsed="parsedRecord = $event"
                               @update:context="Object.assign(debrisContext, $event)"
                               @pick="pickMode = pickMode === 'epicenter' ? '' : 'epicenter'" />

            <AssetEvaluatePanel asset-type="BRIDGE" :candidates="candidates('BRIDGE')"
                                :selected-ids="bridgeSelected" :result="bridgeResult"
                                :allow-research="allowResearch.BRIDGE" :loading="bridgeLoading"
                                :picking="pickMode === 'asset-BRIDGE'"
                                @update:selected-ids="bridgeSelected = $event"
                                @update:allow-research="allowResearch.BRIDGE = $event"
                                @pick="pickMode = pickMode === 'asset-BRIDGE' ? '' : 'asset-BRIDGE'"
                                @run="runEvaluate('BRIDGE')"
                                @select="selectFromPanel" />

            <AssetEvaluatePanel asset-type="TUNNEL" :candidates="candidates('TUNNEL')"
                                :selected-ids="tunnelSelected" :result="tunnelResult"
                                :allow-research="allowResearch.TUNNEL" :loading="tunnelLoading"
                                :picking="pickMode === 'asset-TUNNEL'"
                                @update:selected-ids="tunnelSelected = $event"
                                @update:allow-research="allowResearch.TUNNEL = $event"
                                @pick="pickMode = pickMode === 'asset-TUNNEL' ? '' : 'asset-TUNNEL'"
                                @run="runEvaluate('TUNNEL')"
                                @select="selectFromPanel" />
        </aside>

        <section ref="centerCol" class="heavy-center-column">
            <section class="heavy-map-panel disaster-map-panel">
                <TransportMap ref="mapRef" :regions="mapData.regions" :roads="mapData.roads"
                              :assets="mapAssets" :epicenter="epicenter"
                              :pick-mode="pickMode" :selected-asset-id="selectedAssetId"
                              :interactive-regions="false"
                              @map-click="onMapClick" @asset-click="onAssetClick" />
                <div class="map-grid-overlay"></div>
                <div class="heavy-map-caption">
                    <span class="pulse-dot"></span>
                    <span>{{ hazardLabel }}评估 · {{ mergedSummary?.level || '待评估' }}</span>
                </div>
                <div class="heavy-map-tools">
                    <button @click="mapRef.zoomIn()">＋</button>
                    <button @click="mapRef.zoomOut()">−</button>
                    <button @click="mapRef.reset()">⌄</button>
                </div>
                <div v-if="pickMode" class="map-pick-banner">
                    {{ pickMode === 'epicenter' ? `在地图上点击选取${hazardLabel}源位置`
                        : pickMode === 'asset-BRIDGE' ? '在地图上点击桥梁标记加入评估'
                        : '在地图上点击隧道标记加入评估' }}
                    <button class="text-action" @click="pickMode = ''">取消</button>
                </div>
            </section>

            <div class="disaster-y-resizer" title="拖动调整地图与指标栏高度" @mousedown="startResize">
                <i></i><i></i><i></i>
            </div>

            <section class="heavy-bottom-panel" :style="{ height: bottomHeight + 'px' }">
                <div class="bottom-tabs">
                    <button v-for="t in [['result', '评估结果'], ['derivation', '推演过程'], ['logs', '任务日志']]"
                            :key="t[0]" :class="{ 'is-active': bottom === t[0] }" @click="bottom = t[0]">{{ t[1] }}</button>
                </div>

                <div v-if="bottom === 'result'" class="assessment-result-row">
                    <div class="curve-panel">
                        <p v-if="!selectedAsset" class="empty-tip">完成评估后，点击地图设施或右侧结果列表切换查看该设施的易损性曲线。</p>
                        <template v-else>
                            <p class="curve-caption">
                                {{ selectedAsset.assetName }} · {{ selectedAsset.modelName }} · 强度指标 {{ selectedAsset.imType }}（{{ curveModel?.imUnit || 'g' }}）
                            </p>
                            <FragilityCurveChart :curves="curves" :current-im="currentIm" :unit="curveModel?.imUnit || 'g'" />
                        </template>
                    </div>
                    <aside class="ds-legend">
                        <template v-if="selectedAsset?.stateProbabilities">
                            <h3>损伤概率</h3>
                            <div v-for="row in dsRows" :key="row.label" class="ds-legend-row">
                                <span class="ds-legend-color" :style="{ background: row.color }"></span>
                                <span class="ds-legend-label">{{ row.label }} {{ row.text }}</span>
                                <strong>{{ (row.value * 100).toFixed(1) }}%</strong>
                            </div>
                            <p v-if="selectedAsset.extrapolated" class="extrapolated-tag">当前 IM 超出模型验证范围，结果为外推</p>
                            <div class="ds-legend-exceed">
                                <span v-for="row in exceedRows" :key="row.label">{{ row.label }} = {{ row.value.toFixed(1) }}%</span>
                            </div>
                        </template>
                        <p v-else class="empty-tip">--</p>
                    </aside>
                </div>

                <div v-else-if="bottom === 'derivation'" class="derivation-flow">
                    <p v-if="!derivation.length" class="empty-tip">完成评估后展示计算过程。</p>
                    <div v-for="d in derivation" :key="d[0]" class="derivation-item">
                        <span>{{ d[0] }}</span><strong>{{ d[1] }}</strong>
                    </div>
                </div>

                <div v-else class="task-log-list">
                    <div v-for="l in logs" :key="l.time + l.text" class="task-log">
                        <time>{{ l.time }}</time><i></i><span>{{ l.text }}</span>
                    </div>
                </div>
            </section>
        </section>

        <aside class="heavy-column heavy-right-column">
            <section class="tech-panel disaster-summary-panel">
                <h2 class="tech-panel-title">{{ hazardLabel }}影响摘要</h2>
                <div class="disaster-risk-orbit" :data-risk="mergedSummary?.level || 'idle'">
                    <span>综合风险</span>
                    <strong>{{ mergedSummary?.level || '等待评估' }}</strong>
                    <small>{{ mergedSummary ? mergedSummary.score.toFixed(1) + '分' : '--' }}</small>
                </div>
                <div class="summary-metric-grid">
                    <div><span>{{ hazardLabel }}源</span><strong>{{ form.longitude }}, {{ form.latitude }}</strong></div>
                    <div v-if="mode === 'EARTHQUAKE'">
                        <span>PGA(g)</span>
                        <strong>{{ primaryResult ? Number(primaryResult.pgaG || 0).toFixed(3) : Number(form.pgaG || 0).toFixed(3) }}</strong>
                    </div>
                    <div v-else>
                        <span>发生概率</span>
                        <strong>{{ primaryResult ? (Number(primaryResult.occurrenceProbability || 0) * 100).toFixed(1) : '--' }}</strong>
                    </div>
                    <div><span>评估桥梁</span><strong>{{ mergedSummary?.bridgeCount ?? 0 }}</strong></div>
                    <div><span>评估隧道</span><strong>{{ mergedSummary?.tunnelCount ?? 0 }}</strong></div>
                </div>
                <div class="summary-rows">
                    <div><span>评估时间</span><strong>{{ mergedSummary?.evaluatedAt || '--' }}</strong></div>
                </div>
                <button class="primary-run-button" :disabled="!mergedAssets.length || saveDialog.saving" @click="openSave">
                    保存任务
                </button>
            </section>

            <RiskDetailPanel :assets="mergedAssets" :selected-asset-id="selectedAssetId"
                             :hazard-label="hazardLabel"
                             @select="selectedAssetId = Number($event.assetId)"
                             @inspect="detailAsset = $event" />
        </aside>
    </main>

    <AssetDetailModal :asset="detailAsset" :hazard-label="hazardLabel" @close="detailAsset = null" />

    <Teleport to="body">
        <div v-if="saveDialog.open" class="save-task-overlay" @click.self="closeSave">
            <div class="save-task-modal">
                <h3>保存评估任务</h3>
                <label class="field-label">任务名称
                    <input v-model="saveDialog.name" placeholder="例如：重庆中心城区地震评估" @keyup.enter="confirmSave" />
                </label>
                <p class="panel-hint">将保存 {{ mergedAssets.length }} 处设施的本{{ hazardLabel }}评估结果，保存前结果不会写入数据库。</p>
                <div class="save-task-actions">
                    <button class="secondary-run-button" :disabled="saveDialog.saving" @click="closeSave">取消</button>
                    <button class="primary-run-button" :disabled="saveDialog.saving || !saveDialog.name?.trim()" @click="confirmSave">
                        {{ saveDialog.saving ? '保存中…' : '确认保存' }}
                    </button>
                </div>
            </div>
        </div>
    </Teleport>
</div>
</template>
