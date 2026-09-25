<script setup>
import { computed, reactive, ref, watch, onMounted } from 'vue';
import PlatformHeader from '../components/PlatformHeader.vue';
import { adminApi } from '../services/api.js';
import { usePlatformStore, useUiStore } from '../stores/platform.js';

const platform = usePlatformStore();
const ui = useUiStore();
const tab = ref('overview');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const rows = ref([]);
const summary = ref({});
const page = ref(0);
const totalPages = ref(1);
const totalElements = ref(0);
const query = ref('');
const editorOpen = ref(false);
const editor = reactive({});
const roadQuery = ref('');
const roadOptions = ref([]);
const selectedRoads = ref([]);

const tabs = [
    { key: 'overview', icon: '◈', name: '数据概览', note: '数据质量与绑定状态' },
    { key: 'regions', icon: '▦', name: '行政区划', note: '固定基础数据 · 只读' },
    { key: 'road-nodes', icon: '⊙', name: '路网节点', note: '拓扑节点 · 只读' },
    { key: 'roads', icon: '⌁', name: '路网边', note: '道路网络 · 只读' },
    { key: 'assets', icon: '◇', name: '桥隧设施', note: '可编辑业务资产' }
];

const bridgeFields = [
    ['bridge_type','桥梁类型','text'],['total_length_m','全长（m）','number'],['deck_width_m','桥面宽度（m）','number'],
    ['span_count','跨数','number'],['max_span_m','最大跨径（m）','number'],['pier_count','桥墩数量','number'],
    ['representative_pier_height_m','代表墩高（m）','number'],['pier_section_type','桥墩截面类型','text'],
    ['pier_section_width_m','桥墩截面宽（m）','number'],['pier_section_height_m','桥墩截面高（m）','number'],
    ['concrete_strength_mpa','混凝土强度（MPa）','number'],['steel_strength_mpa','钢材强度（MPa）','number'],
    ['reinforcement_ratio','配筋率','number'],['bearing_type','支座类型','text'],['bearing_count','支座数量','number'],
    ['bearing_stiffness_kn_m','支座刚度（kN/m）','number'],['has_restrainer','是否有防落梁装置','boolean'],
    ['design_load_grade','设计荷载等级','text'],['design_load_ton','设计荷载（t）','number'],
    ['vertical_clearance_m','垂直净空（m）','number'],['horizontal_clearance_m','水平净空（m）','number']
];

const tunnelFields = [
    ['tunnel_type','隧道类型','text'],['total_length_m','全长（m）','number'],['diameter_m','洞径（m）','number'],
    ['buried_depth_m','埋深（m）','number'],['section_type','断面类型','text'],['lining_thickness_cm','衬砌厚度（cm）','number'],
    ['concrete_strength_mpa','混凝土强度（MPa）','number'],['steel_strength_mpa','钢材强度（MPa）','number'],
    ['elastic_modulus_gpa','弹性模量（GPa）','number'],['surrounding_rock_grade','围岩等级','text'],
    ['groundwater_level','地下水等级','text'],['site_category','场地类别','text'],
    ['vertical_clearance_m','垂直净空（m）','number'],['horizontal_clearance_m','水平净空（m）','number'],['lane_count','车道数','number']
];

const activeTab = computed(() => tabs.find((item) => item.key === tab.value));
const detailFields = computed(() => editor.assetType === 'TUNNEL' ? tunnelFields : bridgeFields);
const isReadOnlyTab = computed(() => ['regions','road-nodes','roads'].includes(tab.value));
const availableRoadOptions = computed(() => roadOptions.value.filter((road) =>
    !selectedRoads.value.some((selected) => Number(selected.roadEdgeId || selected.id) === Number(road.id))
    && (!road.boundAssetId || Number(road.boundAssetId) === Number(editor.id))
));
const statCards = computed(() => [
    ['行政区划', summary.value.regionCount, '固定区划目录'],
    ['路网节点', summary.value.roadNodeCount, '固定拓扑节点'],
    ['路网边', summary.value.roadEdgeCount, `${format(summary.value.roadLengthKm, 2)} km`],
    ['桥梁', summary.value.bridgeCount, '可维护设施'],
    ['隧道', summary.value.tunnelCount, '可维护设施'],
    ['未绑定设施', summary.value.unboundAssetCount, '应优先处理']
]);

function format(value, digits = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('zh-CN', { maximumFractionDigits: digits }) : '—';
}
function label(value) { return value == null || value === '' ? '—' : String(value); }
function assetTypeLabel(value) { return value === 'BRIDGE' ? '桥梁' : value === 'TUNNEL' ? '隧道' : value; }
function statusLabel(value) { return ({ IN_SERVICE:'运营中', MAINTENANCE:'养护中', CLOSED:'已停用' })[value] || value; }

async function load() {
    loading.value = true;
    error.value = '';
    try {
        if (tab.value === 'overview') {
            summary.value = await adminApi('/summary');
            rows.value = [];
            return;
        }
        const search = encodeURIComponent(query.value.trim());
        const endpoint = tab.value === 'regions' ? '/regions' : `/${tab.value}?page=${page.value}&size=20&q=${search}`;
        const data = await adminApi(endpoint);
        rows.value = Array.isArray(data) ? data : data.content || [];
        totalPages.value = Array.isArray(data) ? 1 : Math.max(1, Number(data.totalPages || 1));
        totalElements.value = Array.isArray(data) ? data.length : Number(data.totalElements || 0);
    } catch (exception) {
        error.value = exception.message;
    } finally { loading.value = false; }
}

async function searchRoads() {
    try {
        roadOptions.value = await adminApi(`/road-options?q=${encodeURIComponent(roadQuery.value.trim())}&limit=30`);
    } catch (exception) { ui.toast(exception.message); }
}

function addRoad(road) {
    if (road.boundAssetId && Number(road.boundAssetId) !== Number(editor.id)) return ui.toast(`该路网边已绑定“${road.boundAssetName}”`);
    selectedRoads.value.push({ roadEdgeId:road.id, roadName:road.roadName, roadRef:road.roadRef, roadClass:road.roadClass, regionCode:road.regionCode, regionName:road.regionName, lengthM:road.lengthM });
    if (!editor.id && !editor.assetName?.trim()) {
        const roadLabel = road.roadName || road.roadRef || `路网边 #${road.id}`;
        editor.assetName = `${roadLabel}${editor.assetType === 'TUNNEL' ? '隧道' : '桥'}`;
    }
}
function removeRoad(roadEdgeId) { selectedRoads.value = selectedRoads.value.filter((road) => Number(road.roadEdgeId) !== Number(roadEdgeId)); }

function clearEditor() {
    Object.keys(editor).forEach((key) => delete editor[key]);
    Object.assign(editor, { assetType:'BRIDGE', serviceStatus:'IN_SERVICE', detail:{} });
    roadQuery.value = '';
    roadOptions.value = [];
    selectedRoads.value = [];
}

async function editAsset(item = null) {
    clearEditor();
    if (item?.id) {
        loading.value = true;
        try {
            const value = await adminApi(`/assets/${item.id}`);
            Object.assign(editor, value, { detail: { ...(value.detail || {}) } });
            selectedRoads.value = (value.roads || []).map((road) => ({ ...road }));
            await searchRoads();
        } catch (exception) {
            ui.toast(exception.message);
            return;
        } finally { loading.value = false; }
    } else await searchRoads();
    editorOpen.value = true;
}

async function saveAsset() {
    if (!editor.assetName?.trim()) return ui.toast('请填写设施名称');
    if (!selectedRoads.value.length) return ui.toast('请至少绑定一条路网边');
    saving.value = true;
    try {
        const body = { ...editor, detail: { ...(editor.detail || {}) }, roadEdgeIds: selectedRoads.value.map((road) => Number(road.roadEdgeId || road.id)) };
        delete body.roads;
        delete body.regionName;
        const path = editor.id ? `/assets/${editor.id}` : '/assets';
        await adminApi(path, { method: editor.id ? 'PUT' : 'POST', body: JSON.stringify(body) });
        editorOpen.value = false;
        await Promise.all([platform.loadCatalogs(true), load()]);
        ui.toast('桥隧设施及详细属性已保存', 'success');
    } catch (exception) { ui.toast(exception.message); }
    finally { saving.value = false; }
}

async function closeAsset(item) {
    if (!window.confirm(`确定停用“${item.assetName}”吗？记录会保留，可再次编辑恢复。`)) return;
    try {
        await adminApi(`/assets/${item.id}`, { method:'DELETE' });
        await Promise.all([platform.loadCatalogs(true), load()]);
        ui.toast('设施已标记为停用', 'success');
    } catch (exception) { ui.toast(exception.message); }
}

function changeTab(key) { if (tab.value !== key) tab.value = key; }
watch(tab, () => { page.value = 0; query.value = ''; editorOpen.value = false; load(); });
watch(() => editor.assetType, (next, previous) => { if (editorOpen.value && previous && next !== previous) editor.detail = {}; });
onMounted(load);
</script>

<template>
<div class="dashboard-v2 data-admin-page">
    <PlatformHeader :show-admin-menu="true" />
    <main class="dm-shell">
        <header class="dm-page-header">
            <div><span class="dm-eyebrow">DATA GOVERNANCE</span><h2>平台数据管理</h2><p>固定基础数据只读，桥梁与隧道作为业务设施独立维护。</p></div>
            <div class="dm-page-actions"><span class="dm-connection"><i></i>transport_platform</span><button class="dm-icon-button" title="刷新" @click="load">↻</button></div>
        </header>
        <div class="dm-workspace">
            <aside class="dm-sidebar">
                <button v-for="item in tabs" :key="item.key" class="dm-nav-item" :class="{'is-active':tab===item.key}" @click="changeTab(item.key)">
                    <i>{{ item.icon }}</i><span><strong>{{ item.name }}</strong><small>{{ item.note }}</small></span>
                </button>
                <div class="dm-sidebar-foot"><span>管理边界</span><strong>行政区与路网由数据导入流程维护</strong><small>日常管理仅修改桥隧设施及其属性</small></div>
            </aside>
            <section class="dm-main"><div class="dm-main-content">
                <div class="dm-section-header">
                    <div><div class="dm-title-row"><h3>{{ activeTab?.name }}</h3><span v-if="isReadOnlyTab" class="dm-badge dm-badge-readonly">只读</span><span v-if="tab==='assets'" class="dm-badge dm-badge-editable">可维护</span></div><p>{{ activeTab?.note }}</p></div>
                    <button v-if="tab==='assets'" class="dm-button dm-button-primary" @click="editAsset()">＋ 新建桥隧</button>
                </div>

                <form v-if="['road-nodes','roads','assets'].includes(tab)" class="dm-filter-bar" @submit.prevent="page=0;load()">
                    <input v-model="query" type="search" :placeholder="tab==='road-nodes'?'输入节点 ID':tab==='assets'?'输入设施名称或编码':'输入道路名称、编号或边 ID'">
                    <button class="dm-button">查询</button><button v-if="query" type="button" class="dm-button dm-button-ghost" @click="query='';page=0;load()">清空</button>
                    <span class="dm-filter-note">共 {{ format(totalElements) }} 条</span>
                </form>

                <div v-if="loading" class="dm-state"><span class="dm-loader"></span><strong>正在读取数据库…</strong></div>
                <div v-else-if="error" class="dm-state dm-state-error"><strong>数据读取失败</strong><p>{{ error }}</p><button class="dm-button" @click="load">重新加载</button></div>

                <template v-else-if="tab==='overview'">
                    <div class="dm-stat-grid"><article v-for="card in statCards" :key="card[0]" class="dm-stat-card"><span>{{ card[0] }}</span><strong>{{ format(card[1], 2) }}</strong><small>{{ card[2] }}</small></article></div>
                    <div class="dm-guidance-grid">
                        <article><span>01 · 固定数据</span><h4>行政区、节点、路网边</h4><p>由经过校验的数据包统一导入，管理面板只提供检索和核查，避免人工修改破坏拓扑关系。</p></article>
                        <article><span>02 · 业务设施</span><h4>桥梁、隧道与详细属性</h4><p>公共信息与专业属性分表保存。设施可以维护、停用，并保留稳定编号。</p></article>
                        <article><span>03 · 空间关联</span><h4>桥隧可绑定多边，路网边独占</h4><p>坐标由所有绑定边的几何中心自动计算，首条绑定边决定设施的统计行政区。</p></article>
                    </div>
                </template>
                <div v-else class="dm-table-wrap"><table>
                    <thead><tr v-if="tab==='regions'"><th>行政区代码</th><th>名称</th><th>面积</th><th>路网边数</th><th>道路总长</th></tr>
                    <tr v-else-if="tab==='road-nodes'"><th>节点 ID</th><th>连接度</th><th>经度</th><th>纬度</th><th>维护方式</th></tr>
                    <tr v-else-if="tab==='roads'"><th>边 ID / 道路</th><th>行政区</th><th>等级</th><th>拓扑与规模</th><th>基础参数</th></tr>
                    <tr v-else><th>设施编码 / 名称</th><th>类型</th><th>行政区</th><th>绑定路网边</th><th>状态</th><th>操作</th></tr></thead>
                    <tbody>
                        <template v-if="tab==='regions'"><tr v-for="item in rows" :key="item.regionCode"><td class="dm-code">{{ item.regionCode }}</td><td><strong>{{ item.regionName }}</strong></td><td>{{ format(item.areaKm2,2) }} km²</td><td>{{ format(item.roadCount) }}</td><td>{{ format(item.roadLengthKm,2) }} km</td></tr></template>
                        <template v-else-if="tab==='road-nodes'"><tr v-for="item in rows" :key="item.id"><td class="dm-code">#{{ item.id }}</td><td>{{ label(item.streetCount) }}</td><td>{{ format(item.longitude,7) }}</td><td>{{ format(item.latitude,7) }}</td><td><span class="dm-badge dm-badge-readonly">数据导入</span></td></tr></template>
                        <template v-else-if="tab==='roads'"><tr v-for="item in rows" :key="item.id"><td><strong>#{{ item.id }} · {{ item.roadName||'未命名道路' }}</strong><small>{{ item.roadRef||'无道路编号' }}</small></td><td>{{ item.regionName }}</td><td><span class="dm-badge">{{ item.roadClass }}</span></td><td><strong>{{ item.fromNodeId }} → {{ item.toNodeId }}</strong><small>{{ format(Number(item.lengthM)/1000,3) }} km</small></td><td>{{ item.laneCount||'—' }} 车道 · {{ item.designSpeedKmh||'—' }} km/h</td></tr></template>
                        <template v-else><tr v-for="item in rows" :key="item.id"><td><strong>{{ item.assetName }}</strong><small>{{ item.assetCode }} · #{{ item.id }}</small></td><td><span class="dm-badge">{{ assetTypeLabel(item.assetType) }}</span></td><td>{{ item.regionName||'随路网确定' }}</td><td><template v-if="item.roadEdgeId"><strong>{{ item.bindingCount }} 条边 · 首条 #{{ item.roadEdgeId }}</strong><small>{{ item.roadName||'未命名道路' }} {{ item.roadRef?`· ${item.roadRef}`:'' }}</small></template><span v-else class="dm-warning">未绑定</span></td><td><span class="dm-status" :class="`is-${String(item.serviceStatus).toLowerCase()}`">{{ statusLabel(item.serviceStatus) }}</span></td><td><button class="dm-link" @click="editAsset(item)">编辑设施</button><button v-if="item.serviceStatus!=='CLOSED'" class="dm-link dm-link-danger" @click="closeAsset(item)">停用</button></td></tr></template>
                        <tr v-if="!rows.length"><td :colspan="tab==='assets'?6:5"><div class="dm-state">暂无符合条件的记录</div></td></tr>
                    </tbody>
                </table></div>
                <div v-if="totalPages>1" class="dm-pagination"><button :disabled="page===0" @click="page--;load()">上一页</button><span>第 {{ page+1 }} / {{ totalPages }} 页</span><button :disabled="page>=totalPages-1" @click="page++;load()">下一页</button></div>
            </div></section>
        </div>
        <footer class="dm-footer"><span><i></i>数据库连接正常</span><span>基础路网只读 · 桥隧设施事务化保存</span></footer>
    </main>
    <div v-if="editorOpen" class="dm-dialog-backdrop" @click.self="editorOpen=false">
        <form class="dm-dialog" aria-modal="true" role="dialog" @submit.prevent="saveAsset">
            <header class="dm-editor-heading"><div><span>{{ editor.id ? `设施 #${editor.id}` : 'NEW ASSET' }}</span><h3>{{ editor.id ? `维护 · ${editor.assetName}` : '新建桥隧设施' }}</h3></div><button type="button" class="dm-icon-button" aria-label="关闭" @click="editorOpen=false">×</button></header>
            <div class="dm-dialog-body">
                <section class="dm-form-section dm-form-section-flat">
                    <div class="dm-section-caption"><div><span>BASIC INFORMATION</span><h4>基本信息</h4></div><small>先确定设施类型，再填写名称与基础资料</small></div>
                    <div class="dm-type-picker" role="radiogroup" aria-label="设施类型">
                        <button type="button" :class="{'is-active':editor.assetType==='BRIDGE'}" @click="editor.assetType='BRIDGE'"><b>桥梁</b><span>BRIDGE</span></button>
                        <button type="button" :class="{'is-active':editor.assetType==='TUNNEL'}" @click="editor.assetType='TUNNEL'"><b>隧道</b><span>TUNNEL</span></button>
                    </div>
                    <div class="dm-form-grid">
                    <label><span>设施编码</span><input :value="editor.assetCode || '保存后由系统自动生成'" readonly class="dm-input-readonly"></label>
                    <label class="dm-field-wide"><span>设施名称 *</span><input v-model.trim="editor.assetName" required maxlength="200" placeholder="绑定首条路网边后可自动带出建议名称"></label>
                    <label><span>服务状态 *</span><select v-model="editor.serviceStatus" required><option value="IN_SERVICE">运营中</option><option value="MAINTENANCE">养护中</option><option value="CLOSED">已停用</option></select></label>
                    <label><span>建成年份</span><input v-model="editor.constructionYear" type="number" min="1800" max="2200"></label>
                    <label><span>设计等级</span><input v-model.trim="editor.designGrade"></label>
                    <label><span>设计速度（km/h）</span><input v-model="editor.designSpeedKmh" type="number" min="0"></label>
                    <label><span>基准状态</span><input v-model.trim="editor.baselineConditionLevel" placeholder="如 A、B、C"></label>
                    <label><span>基准检查日期</span><input v-model="editor.baselineInspectionDate" type="date"></label>
                    </div><div class="dm-derived-location"><span>自动空间定位</span><strong>{{ editor.longitude&&editor.latitude?`${editor.longitude}, ${editor.latitude}`:'将在保存时计算' }}</strong><small>坐标取全部绑定路网边几何中心的平均值，不允许人工录入。</small></div>
                </section>

                <section class="dm-binding-section dm-form-section">
                    <div class="dm-section-caption"><div><span>ROAD BINDING</span><h4>路网绑定</h4></div><small>{{ selectedRoads.length }} 条边已选择</small></div>
                    <div class="dm-binding-rule"><strong>绑定规则</strong><p>一个桥隧可以绑定多条连续或相关路网边；每条路网边只能被一个桥隧占用。列表中的顺序用于确定主边，第一条边决定统计行政区。</p></div>
                    <div class="dm-binding-columns">
                        <div class="dm-road-catalog"><div class="dm-card-title"><div><span>AVAILABLE EDGES</span><h4>查找可用路网边</h4></div><em>{{ availableRoadOptions.length }} 条结果</em></div>
                            <div class="dm-road-search"><input v-model="roadQuery" placeholder="道路名称、编号或边 ID" @keyup.enter.prevent="searchRoads()"><button type="button" class="dm-button" @click="searchRoads()">搜索</button></div>
                            <div class="dm-road-results"><article v-for="road in availableRoadOptions" :key="road.id"><div><strong>#{{ road.id }} · {{ road.roadName||'未命名道路' }}</strong><small>{{ road.roadRef||'无编号' }} · {{ road.roadClass }} · {{ road.regionName }} · {{ format(Number(road.lengthM)/1000,3) }} km</small></div><button type="button" @click="addRoad(road)">＋ 添加</button></article><p v-if="!availableRoadOptions.length">没有可添加的路网边，请更换关键词。</p></div>
                        </div>
                        <div class="dm-selected-road-list"><div class="dm-card-title"><div><span>BOUND EDGES</span><h4>已绑定路网边</h4></div><em>{{ selectedRoads.length }} 条</em></div>
                            <article v-for="(road,index) in selectedRoads" :key="road.roadEdgeId"><b>{{ index===0?'主边':String(index+1).padStart(2,'0') }}</b><div><strong>#{{ road.roadEdgeId }} · {{ road.roadName||'未命名道路' }}</strong><small>{{ road.roadRef||'无编号' }} · {{ road.roadClass||'未分类' }} · {{ road.regionName||editor.regionName||'待计算行政区' }}</small></div><button type="button" @click="removeRoad(road.roadEdgeId)">移除</button></article>
                            <div v-if="!selectedRoads.length" class="dm-binding-empty"><strong>尚未绑定路网边</strong><span>从左侧搜索结果中至少添加一条边。</span></div>
                        </div>
                    </div>
                </section>

                <details class="dm-professional-details">
                    <summary><span><b>专业属性</b><small>{{ editor.assetType==='BRIDGE'?'桥梁':'隧道' }}参数 · 可选填写</small></span><i>展开填写</i></summary>
                    <div class="dm-professional-content"><p class="dm-form-help">专业属性与设施公共信息分表保存；切换设施类型会清空这里尚未保存的字段。</p><div class="dm-form-grid">
                        <label v-for="field in detailFields" :key="field[0]"><span>{{ field[1] }}</span><select v-if="field[2]==='boolean'" v-model="editor.detail[field[0]]"><option :value="null">未知</option><option :value="true">是</option><option :value="false">否</option></select><input v-else v-model="editor.detail[field[0]]" :type="field[2]" :step="field[2]==='number'?'any':undefined"></label>
                    </div></div>
                </details>
            </div>
            <footer class="dm-dialog-actions"><span>保存时同步更新设施、专业详情、道路关系和自动坐标</span><div><button type="button" class="dm-button dm-button-ghost" @click="editorOpen=false">取消</button><button class="dm-button dm-button-primary" :disabled="saving">{{ saving?'正在保存…':'保存全部变更' }}</button></div></footer>
        </form>
    </div>
</div>
</template>
