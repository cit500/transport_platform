<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { adminApi } from '../services/api.js';
import { usePlatformStore, useUiStore } from '../stores/platform.js';

const ui = useUiStore();
const platform = usePlatformStore();
const tab = ref('overview');
const loading = ref(false);
const error = ref('');
const rows = ref([]);
const summary = ref({});
const page = ref(0);
const totalPages = ref(1);
const query = ref('');
const vehicleForm = reactive({ id: null, profileName: '', grossWeightTon: 100, vehicleLengthM: 18, vehicleWidthM: 3.2, vehicleHeightM: 4.5, axleCount: 6, plannedSpeedKmh: 30, isDefault: false });
const showVehicleForm = ref(false);
const editorOpen = ref(false);
const editor = reactive({});

const tabs = [
    ['overview', '数据概览'], ['roads', '道路数据'], ['assets', '桥隧设施'], ['vehicles', '重车参数'],
    ['earthquake', '地震场景'], ['debris', '泥石流场景'], ['tasks', '评估任务'], ['publications', '首页发布'], ['notices', '灾害动态'], ['questions', '数字人问答']
];
const title = computed(() => tabs.find((item) => item[0] === tab.value)?.[1] || '数据管理');

async function load() {
    loading.value = true; error.value = '';
    try {
        if (tab.value === 'overview') { summary.value = await adminApi('/summary'); rows.value = []; }
        else {
            const endpoints = { roads: `/roads?page=${page.value}&size=20&q=${encodeURIComponent(query.value)}`, assets: `/assets?page=${page.value}&size=20&q=${encodeURIComponent(query.value)}`, vehicles: '/vehicles', earthquake: '/scenarios/earthquake', debris: '/scenarios/debris', tasks: `/tasks?page=${page.value}&size=20&q=${encodeURIComponent(query.value)}`, publications: '/publications', notices: '/notices', questions: '/questions' };
            const data = await adminApi(endpoints[tab.value]);
            rows.value = Array.isArray(data) ? data : (data.content || []);
            totalPages.value = data.totalPages || 1;
        }
    } catch (e) { error.value = e.message; }
    finally { loading.value = false; }
}
watch(() => ui.dataManagementOpen, (open) => { if (open) load(); });
watch(tab, () => { page.value = 0; query.value = ''; showVehicleForm.value = false; editorOpen.value = false; load(); });

function editVehicle(item = {}) {
    Object.assign(vehicleForm, { id: null, profileName: '', grossWeightTon: 100, vehicleLengthM: 18, vehicleWidthM: 3.2, vehicleHeightM: 4.5, axleCount: 6, plannedSpeedKmh: 30, isDefault: false }, item);
    showVehicleForm.value = true;
}
async function saveVehicle() {
    const path = vehicleForm.id ? `/vehicles/${vehicleForm.id}` : '/vehicles';
    await adminApi(path, { method: vehicleForm.id ? 'PUT' : 'POST', body: JSON.stringify(vehicleForm) });
    showVehicleForm.value = false; await platform.loadCatalogs(true); await load(); ui.toast('车辆参数已保存', 'success');
}
async function setDefault(id) { await adminApi(`/vehicles/${id}/default`, { method: 'PUT' }); await platform.loadCatalogs(true); await load(); }
const editorSchemas = {
    earthquake: [['scenarioName','场景名称','text'],['regionCode','行政区编码','text'],['intensityDegree','地震烈度','text'],['pgaG','PGA(g)','number'],['magnitudeMw','震级 Mw','number'],['durationS','持续时间(s)','number'],['longitude','经度','number'],['latitude','纬度','number']],
    debris: [['scenarioName','场景名称','text'],['regionCode','行政区编码','text'],['rainfallDurationH','降雨历时(h)','number'],['averageRainfallMmH','平均雨强','number'],['accumulatedRainfallMm','累计降雨','number'],['averageSlopeDegree','平均坡度','number'],['longitude','经度','number'],['latitude','纬度','number']],
    notices: [['eventTime','发生时间','datetime-local'],['regionCode','行政区编码','text'],['hazardType','灾害类型','text'],['warningLevel','预警等级','text'],['content','动态内容','textarea']],
    questions: [['questionCode','问题编码','text'],['displayOrder','展示顺序','number'],['questionText','预设问题','text'],['answerText','回答内容','textarea']],
    assets: [['assetCode','设施编码','text'],['assetName','设施名称','text'],['assetType','设施类型','text'],['regionCode','行政区编码','text'],['longitude','经度','number'],['latitude','纬度','number'],['serviceStatus','服务状态','text'],['detailJson','专有参数 JSON','textarea'],['roadsJson','道路绑定 JSON','textarea']]
};
const editorFields = computed(() => editorSchemas[tab.value] || []);
async function editRecord(item = {}) {
    let value = item;
    if (tab.value === 'assets' && item.id) value = await adminApi(`/assets/${item.id}`);
    Object.keys(editor).forEach((key) => delete editor[key]);
    Object.assign(editor, value, {
        detailJson: JSON.stringify(value.detail || {}, null, 2),
        roadsJson: JSON.stringify(value.roads || [], null, 2),
        _originalCode: value.questionCode
    });
    editorOpen.value = true;
}
async function saveRecord() {
    const body = { ...editor };
    delete body._originalCode; delete body.detailJson; delete body.roadsJson;
    if (tab.value === 'assets') {
        try { body.detail = JSON.parse(editor.detailJson || '{}'); body.roads = JSON.parse(editor.roadsJson || '[]'); }
        catch { return ui.toast('设施参数或道路绑定 JSON 格式不正确'); }
    }
    let path; let method;
    if (tab.value === 'assets') { path = editor.id ? `/assets/${editor.id}` : '/assets'; method = editor.id ? 'PUT' : 'POST'; }
    else if (['earthquake','debris'].includes(tab.value)) { path = editor.id ? `/scenarios/${tab.value}/${editor.id}` : `/scenarios/${tab.value}`; method = editor.id ? 'PUT' : 'POST'; }
    else if (tab.value === 'notices') { path = editor.id ? `/notices/${editor.id}` : '/notices'; method = editor.id ? 'PUT' : 'POST'; }
    else { path = editor._originalCode ? `/questions/${encodeURIComponent(editor._originalCode)}` : '/questions'; method = editor._originalCode ? 'PUT' : 'POST'; }
    await adminApi(path, { method, body: JSON.stringify(body) }); editorOpen.value = false; await load(); ui.toast('记录已保存', 'success');
}
async function setScenarioDefault(type,id) { await adminApi(`/scenarios/${type}/${id}/default`,{method:'PUT'}); await load(); }
async function publish(moduleCode,taskId) { await adminApi(`/publications/${moduleCode}`,{method:'PUT',body:JSON.stringify({taskId:Number(taskId)})}); await load(); ui.toast('首页发布任务已更新','success'); }
async function remove(type, id) {
    if (!window.confirm('确定执行删除/停用操作吗？')) return;
    const path = type === 'assets' ? `/assets/${id}` : type === 'vehicles' ? `/vehicles/${id}` : ['earthquake','debris'].includes(type) ? `/scenarios/${type}/${id}` : type === 'questions' ? `/questions/${encodeURIComponent(id)}` : `/notices/${id}`;
    await adminApi(path, { method: 'DELETE' }); await load(); ui.toast('操作完成', 'success');
}
const label = (value) => value == null || value === '' ? '-' : String(value);
</script>

<template>
    <div v-if="ui.dataManagementOpen" class="dm-overlay" @click.self="ui.dataManagementOpen=false">
        <section class="dm-window" role="dialog" aria-modal="true" aria-label="平台数据管理">
            <header class="dm-header"><div><span class="dm-header-mark">DM</span><strong>平台数据管理</strong><small>Vue 3 响应式管理台</small></div><div class="dm-header-actions"><button class="dm-icon-button" @click="load">↻</button><button class="dm-icon-button" @click="ui.dataManagementOpen=false">×</button></div></header>
            <div class="dm-layout">
                <aside class="dm-sidebar"><button v-for="item in tabs" :key="item[0]" class="dm-nav-item" :class="{ 'is-active': tab===item[0] }" @click="tab=item[0]">{{ item[1] }}</button></aside>
                <main class="dm-main"><div class="dm-main-content">
                    <div class="dm-section-header"><div><h2>{{ title }}</h2><p>数据直接来自 transport_resilience_v2</p></div><div class="dm-toolbar-actions"><button v-if="tab==='vehicles'" class="dm-button dm-button-primary" @click="editVehicle()">＋ 新建方案</button><button v-else-if="['assets','earthquake','debris','notices','questions'].includes(tab)" class="dm-button dm-button-primary" @click="editRecord()">＋ 新建记录</button></div></div>
                    <form v-if="['roads','assets','tasks'].includes(tab)" class="dm-filter-bar" @submit.prevent="page=0;load()"><input v-model="query" placeholder="输入关键字"><button class="dm-button">查询</button></form>
                    <div v-if="loading" class="dm-state"><strong>正在读取后台数据…</strong></div>
                    <div v-else-if="error" class="dm-state dm-state-error"><strong>数据读取失败</strong><p>{{ error }}</p><button class="dm-button" @click="load">重新加载</button></div>
                    <div v-else-if="tab==='overview'" class="dm-overview-grid">
                        <article v-for="(value,key) in summary" :key="key" class="dm-stat-card"><span>{{ key }}</span><strong>{{ label(value) }}</strong></article>
                    </div>
                    <form v-else-if="tab==='vehicles' && showVehicleForm" class="dm-form" @submit.prevent="saveVehicle">
                        <div class="dm-form-grid"><label><span>方案名称</span><input v-model="vehicleForm.profileName" required></label><label><span>总重(t)</span><input v-model.number="vehicleForm.grossWeightTon" type="number" step="0.1"></label><label><span>长度(m)</span><input v-model.number="vehicleForm.vehicleLengthM" type="number" step="0.1"></label><label><span>宽度(m)</span><input v-model.number="vehicleForm.vehicleWidthM" type="number" step="0.1"></label><label><span>高度(m)</span><input v-model.number="vehicleForm.vehicleHeightM" type="number" step="0.1"></label><label><span>轴数</span><input v-model.number="vehicleForm.axleCount" type="number"></label><label><span>计划速度</span><input v-model.number="vehicleForm.plannedSpeedKmh" type="number"></label></div>
                        <div class="dm-form-actions"><button type="button" class="dm-button" @click="showVehicleForm=false">取消</button><button class="dm-button dm-button-primary">保存</button></div>
                    </form>
                    <form v-else-if="editorOpen" class="dm-form" @submit.prevent="saveRecord">
                        <div class="dm-form-grid"><label v-for="field in editorFields" :key="field[0]" :class="{ 'dm-form-wide': field[2]==='textarea' }"><span>{{ field[1] }}</span><textarea v-if="field[2]==='textarea'" v-model="editor[field[0]]"></textarea><input v-else v-model="editor[field[0]]" :type="field[2]" :step="field[2]==='number'?'any':undefined" required></label></div>
                        <div class="dm-form-actions"><button type="button" class="dm-button" @click="editorOpen=false">取消</button><button class="dm-button dm-button-primary">保存</button></div>
                    </form>
                    <div v-else class="dm-table-wrap"><table><thead><tr><th>编号</th><th>名称/任务</th><th>类型/状态</th><th>区域/说明</th><th>操作</th></tr></thead><tbody>
                        <tr v-for="item in rows" :key="item.id || item.taskCode || item.scenarioCode || item.questionCode || item.moduleCode"><td class="dm-code">{{ label(item.id || item.taskCode || item.scenarioCode || item.questionCode || item.moduleCode) }}</td><td><strong>{{ label(item.profileName || item.assetName || item.roadName || item.taskName || item.scenarioName || item.questionText || item.content) }}</strong><small>{{ label(item.roadRef || item.assetCode || item.algorithmVersion || item.answerText) }}</small></td><td>{{ label(item.assetType || item.moduleType || item.scenarioType || item.status || item.hazardType) }}</td><td>{{ label(item.regionName || item.description || item.warningLevel || item.publishedAt) }}</td><td><template v-if="tab==='vehicles'"><button class="dm-link" @click="editVehicle(item)">编辑</button><button v-if="!item.isDefault" class="dm-link" @click="setDefault(item.id)">设为默认</button><button class="dm-link dm-link-danger" @click="remove('vehicles',item.id)">删除</button></template><template v-else-if="['assets','earthquake','debris','notices','questions'].includes(tab)"><button class="dm-link" @click="editRecord(item)">编辑</button><button v-if="['earthquake','debris'].includes(tab)&&!item.isDefault" class="dm-link" @click="setScenarioDefault(tab,item.id)">设为默认</button><button class="dm-link dm-link-danger" @click="remove(tab,item.id||item.questionCode)">{{ tab==='assets'?'停用':'删除' }}</button></template><template v-else-if="tab==='tasks'&&item.status==='SUCCESS'"><button class="dm-link" @click="publish('HEAVY_PASSAGE',item.id)">发布重车</button><button class="dm-link" @click="publish('REGION_ASSESSMENT',item.id)">发布区域</button></template></td></tr>
                        <tr v-if="!rows.length"><td colspan="5"><div class="dm-state">暂无记录</div></td></tr>
                    </tbody></table></div>
                    <div v-if="totalPages>1" class="dm-pagination"><button :disabled="page===0" @click="page--;load()">上一页</button><span>{{ page+1 }} / {{ totalPages }}</span><button :disabled="page>=totalPages-1" @click="page++;load()">下一页</button></div>
                </div></main>
            </div>
        </section>
    </div>
</template>
