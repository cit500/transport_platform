<script setup>
import { computed, ref, watch } from 'vue';
import { api } from '../../services/api.js';

const props = defineProps({
    assetId: { type: [Number, String], default: null },
    result: { type: Object, default: null },
    hazardLabel: { type: String, default: '地震' },
    modelHint: { type: String, default: '' }
});
const emit = defineEmits(['close']);

const detail = ref(null);
const loading = ref(false);
const loadError = ref('');

const BRIDGE_LABELS = {
    bridge_type: '桥梁类型', total_length_m: '桥梁全长 (m)', deck_width_m: '桥面宽 (m)',
    span_count: '跨数', max_span_m: '最大跨径 (m)', pier_count: '墩数',
    representative_pier_height_m: '代表性墩高 (m)', pier_section_type: '墩身截面形式',
    pier_section_width_m: '墩截面宽 (m)', pier_section_height_m: '墩截面高 (m)',
    concrete_strength_mpa: '混凝土强度 (MPa)', steel_strength_mpa: '钢筋强度 (MPa)',
    reinforcement_ratio: '配筋率', bearing_type: '支座类型', bearing_count: '支座数量',
    bearing_stiffness_kn_m: '支座刚度 (kN/m)', has_restrainer: '是否设挡块',
    design_load_grade: '设计荷载等级', design_load_ton: '设计荷载 (t)',
    vertical_clearance_m: '竖向净空 (m)', horizontal_clearance_m: '横向净空 (m)'
};
const TUNNEL_LABELS = {
    tunnel_type: '隧道类型', total_length_m: '隧道长度 (m)', diameter_m: '洞径 (m)',
    buried_depth_m: '埋深 (m)', section_type: '断面形式', lining_thickness_cm: '衬砌厚度 (cm)',
    concrete_strength_mpa: '混凝土强度 (MPa)', steel_strength_mpa: '钢筋强度 (MPa)',
    elastic_modulus_gpa: '弹性模量 (GPa)', surrounding_rock_grade: '围岩级别',
    groundwater_level: '地下水状况', site_category: '场地类别',
    vertical_clearance_m: '竖向净空 (m)', horizontal_clearance_m: '横向净空 (m)',
    lane_count: '车道数'
};
const STATUS_TEXT = { IN_SERVICE: '运营中', MAINTENANCE: '养护中', CLOSED: '停用' };
const PASS_TEXT = { PASS: '完全通行', CONDITIONAL: '条件通行', BLOCKED: '禁止通行', PENDING_DATA: '待补数据' };
const DS_TEXT = ['DS0 基本完好', 'DS1 轻微损伤', 'DS2 中等损伤', 'DS3 严重损伤', 'DS4 毁坏'];
const DS_COLORS = ['#829BAA', '#668AA0', '#52768F', '#405D79', '#314760'];

const assetType = computed(() => detail.value?.assetType || props.result?.assetType || 'BRIDGE');

const baseRows = computed(() => {
    const d = detail.value;
    if (!d) return [];
    return [
        ['设施编码', d.assetCode || '--'],
        ['设施类型', d.assetType === 'TUNNEL' ? '隧道' : '桥梁'],
        ['所属行政区', d.regionName || d.regionCode || '--'],
        ['坐标', `${Number(d.longitude).toFixed(4)}, ${Number(d.latitude).toFixed(4)}`],
        ['建设年份', d.constructionYear ?? '--'],
        ['设计等级', d.designGrade || '--'],
        ['设计速度', d.designSpeedKmh != null ? `${d.designSpeedKmh} km/h` : '--'],
        ['基线状态', d.baselineConditionLevel || '--'],
        ['服务状态', STATUS_TEXT[d.serviceStatus] || d.serviceStatus || '--']
    ];
});

const professionalRows = computed(() => {
    const raw = detail.value?.detail || {};
    const labels = assetType.value === 'TUNNEL' ? TUNNEL_LABELS : BRIDGE_LABELS;
    const rows = [];
    for (const [key, label] of Object.entries(labels)) {
        const value = raw[key];
        if (value == null || value === '') continue;
        rows.push([label, key === 'has_restrainer' ? (Number(value) ? '是' : '否') : String(value)]);
    }
    return rows;
});

const roadRows = computed(() => (detail.value?.roads || []).slice(0, 4).map((r) => [
    r.roadName || r.roadRef || `道路 ${r.roadEdgeId}`,
    [r.roadClass, r.relationType === 'PRIMARY' ? '主边' : r.relationType, r.lengthM != null ? `${Number(r.lengthM).toFixed(0)} m` : null]
        .filter(Boolean).join(' · ')
]));

const stateRows = computed(() => {
    const states = props.result?.stateProbabilities;
    if (!states) return [];
    return [0, 1, 2, 3, 4].map((i) => ({
        label: DS_TEXT[i], value: Number(states[`DS${i}`] ?? 0) * 100, color: DS_COLORS[i]
    }));
});

const resolvedModel = computed(() => {
    const r = props.result;
    if (r?.modelName) {
        return {
            name: r.modelName,
            version: r.modelVersion || '--',
            evaluated: true,
            imType: r.imType,
            imValue: r.imValue,
            extrapolated: !!r.extrapolated
        };
    }
    return { name: props.modelHint || '尚未确定', version: '--', evaluated: false };
});

async function loadAsset(id) {
    detail.value = null;
    loadError.value = '';
    if (id == null) return;
    loading.value = true;
    try {
        detail.value = await api(`/admin/assets/${id}`);
    } catch (e) {
        loadError.value = e.message;
    } finally {
        loading.value = false;
    }
}

watch(() => props.assetId, (id) => loadAsset(id), { immediate: true });
</script>

<template>
<Teleport to="body">
    <div v-if="assetId != null" class="asset-detail-overlay" @click.self="emit('close')">
        <div class="asset-detail-modal asset-info-modal">
            <header class="asset-detail-head">
                <div>
                    <strong>{{ detail?.assetName || result?.assetName || '设施信息' }}</strong>
                    <span class="model-badge" :class="assetType === 'TUNNEL' ? 'tunnel' : 'ok'">
                        {{ assetType === 'TUNNEL' ? '隧道' : '桥梁' }}
                    </span>
                    <span v-if="result?.damageState" class="model-badge"
                          :class="result.damageState === 'PENDING_DATA' ? 'muted' : 'ok'">
                        {{ result.damageState }}
                    </span>
                </div>
                <button class="asset-detail-close" @click="emit('close')">✕</button>
            </header>

            <div class="asset-detail-body">
                <p v-if="loading" class="empty-tip">正在读取设施档案…</p>
                <p v-if="loadError" class="panel-error">设施档案读取失败：{{ loadError }}（以下仅显示基础信息）</p>

                <section v-if="baseRows.length" class="asset-detail-block">
                    <h3>基础信息</h3>
                    <div class="asset-detail-grid">
                        <template v-for="row in baseRows" :key="row[0]">
                            <span>{{ row[0] }}</span><strong>{{ row[1] }}</strong>
                        </template>
                    </div>
                </section>

                <section v-if="professionalRows.length" class="asset-detail-block">
                    <h3>{{ assetType === 'TUNNEL' ? '隧道专业属性' : '桥梁专业属性' }}</h3>
                    <div class="asset-detail-grid">
                        <template v-for="row in professionalRows" :key="row[0]">
                            <span>{{ row[0] }}</span><strong>{{ row[1] }}</strong>
                        </template>
                    </div>
                </section>

                <section class="asset-detail-block">
                    <h3>本次{{ hazardLabel }}评估所用模型</h3>
                    <div class="asset-detail-grid">
                        <span>模型名称</span><strong>{{ resolvedModel.name }}</strong>
                        <span>模型版本</span><strong>{{ resolvedModel.version }}</strong>
                        <template v-if="resolvedModel.evaluated">
                            <span>强度指标类型</span><strong>{{ resolvedModel.imType || '--' }}</strong>
                            <span>强度指标取值</span><strong>{{ resolvedModel.imValue ?? '--' }}</strong>
                            <span>适用范围</span>
                            <strong :class="{ 'warn-text': resolvedModel.extrapolated }">
                                {{ resolvedModel.extrapolated ? '超出模型验证范围（外推）' : '位于模型验证范围内' }}
                            </strong>
                        </template>
                        <template v-else>
                            <span>评估状态</span><strong>尚未评估，显示的是当前配置的默认模型</strong>
                        </template>
                    </div>
                </section>

                <section v-if="stateRows.length" class="asset-detail-block">
                    <h3>损伤状态概率分布</h3>
                    <div v-for="row in stateRows" :key="row.label" class="asset-ds-row">
                        <span class="asset-ds-label">{{ row.label }}</span>
                        <div class="asset-ds-track">
                            <i :style="{ width: row.value + '%', background: row.color }"></i>
                        </div>
                        <strong>{{ row.value.toFixed(1) }}%</strong>
                    </div>
                </section>

                <section v-if="result?.stateProbabilities" class="asset-detail-block">
                    <h3>评估结论</h3>
                    <div class="asset-detail-grid">
                        <span>通行状态</span><strong>{{ PASS_TEXT[result.passabilityStatus] || result.passabilityStatus }}</strong>
                        <span>损伤概率</span><strong>{{ Number(result.damageProbability || 0).toFixed(1) }} %</strong>
                        <span>距灾害源</span><strong>{{ result.distanceKm ?? '--' }} km</strong>
                    </div>
                </section>

                <section v-if="roadRows.length" class="asset-detail-block">
                    <h3>关联路网</h3>
                    <div class="asset-detail-grid">
                        <template v-for="row in roadRows" :key="row[0]">
                            <span>{{ row[0] }}</span><strong>{{ row[1] || '--' }}</strong>
                        </template>
                    </div>
                </section>
            </div>
        </div>
    </div>
</Teleport>
</template>
