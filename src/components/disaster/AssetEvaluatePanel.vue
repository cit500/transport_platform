<script setup>
import { computed, ref } from 'vue';

const props = defineProps({
    assetType: { type: String, required: true },
    candidates: { type: Array, default: () => [] },
    selectedIds: { type: Array, default: () => [] },
    result: { type: Object, default: null },
    allowResearch: { type: Boolean, default: false },
    loading: { type: Boolean, default: false },
    picking: { type: Boolean, default: false }
});
const emit = defineEmits(['update:selectedIds', 'update:allowResearch', 'pick', 'run', 'select', 'inspect']);

const addOpen = ref(false);
const addQuery = ref('');

const typeLabel = computed(() => (props.assetType === 'TUNNEL' ? '隧道' : '桥梁'));

const candidatesById = computed(() => {
    const map = new Map();
    for (const item of props.candidates) map.set(Number(item.assetId ?? item.id), item);
    return map;
});

const addable = computed(() => props.candidates.filter(
    (item) => !props.selectedIds.includes(Number(item.assetId ?? item.id))
));

const addableFiltered = computed(() => {
    const q = addQuery.value.trim();
    if (!q) return addable.value;
    return addable.value.filter((a) => String(a.assetName || '').includes(q)
        || String(a.regionCode || '').includes(q));
});

const rows = computed(() => props.selectedIds.map((id, index) => {
    const info = candidatesById.value.get(Number(id)) || {};
    const assessed = (props.result?.assets || []).find((x) => Number(x.assetId) === Number(id));
    return { id: Number(id), index: index + 1, info, assessed: assessed || null };
}));

const currentModel = computed(() => {
    const first = (props.result?.assets || []).find((x) => x.modelName);
    return first ? `${first.modelName}${first.modelVersion ? ' · ' + first.modelVersion : ''}` : '';
});

function openAdd() {
    addQuery.value = '';
    addOpen.value = true;
}

function add(id) {
    const value = Number(id);
    if (!props.selectedIds.includes(value)) emit('update:selectedIds', [...props.selectedIds, value]);
    addOpen.value = false;
}

function remove(id) {
    emit('update:selectedIds', props.selectedIds.filter((x) => x !== Number(id)));
}

function selectRow(row) {
    emit('select', row.id);
    emit('inspect', row.id);
}

const PASS_TEXT = { PASS: '完全通行', CONDITIONAL: '条件通行', BLOCKED: '禁止通行', PENDING_DATA: '待补数据' };
</script>

<template>
<section class="tech-panel asset-eval-panel">
    <h2 class="tech-panel-title">{{ typeLabel }}评估</h2>

    <div class="asset-action-row">
        <button class="asset-action-button" :class="{ 'is-active': addOpen }"
                @click="openAdd">从数据库添加</button>
        <button class="asset-action-button" :class="{ 'is-active': picking }" @click="emit('pick')">
            {{ picking ? '点选中…' : '地图点选' }}
        </button>
        <button class="asset-action-button primary" :disabled="loading || !selectedIds.length" @click="emit('run')">
            {{ loading ? '评估中…' : '开始评估' }}
        </button>
    </div>

    <div class="asset-selected-list scroll-region">
        <div v-for="row in rows" :key="row.id" class="asset-selected-item" :class="{ 'has-result': row.assessed }"
             @click="selectRow(row)">
            <span class="asset-order">{{ row.index }}</span>
            <div class="asset-selected-main">
                <strong>{{ row.info.assetName || `设施 ${row.id}` }}</strong>
                <span v-if="row.assessed" class="damage-badge" :data-ds="row.assessed.damageState">
                    {{ row.assessed.damageState }}
                </span>
            </div>
            <div class="asset-selected-side">
                <span v-if="row.assessed" class="asset-pass-text">{{ PASS_TEXT[row.assessed.passabilityStatus] }}</span>
                <button class="asset-remove-button" title="移出评估" @click.stop="remove(row.id)">✕</button>
            </div>
        </div>
        <p v-if="!rows.length" class="empty-tip">尚未选择{{ typeLabel }}，可从上方添加。</p>
    </div>

    <div class="asset-panel-meta">
        <label class="research-toggle">
            <input type="checkbox" :checked="allowResearch"
                   @change="emit('update:allowResearch', $event.target.checked)" />
            <span>参考模型</span>
        </label>
        <span v-if="currentModel" class="asset-model-name">{{ currentModel }}</span>
    </div>

    <Teleport to="body">
        <div v-if="addOpen" class="asset-picker-overlay" @click.self="addOpen = false">
            <div class="asset-picker-modal">
                <header class="asset-picker-head">
                    <div>
                        <strong>从数据库添加{{ typeLabel }}</strong>
                        <small>共 {{ addable.length }} 处可添加</small>
                    </div>
                    <button class="asset-detail-close" @click="addOpen = false">✕</button>
                </header>
                <input v-model="addQuery" class="asset-picker-search" placeholder="按名称或行政区筛选" />
                <div class="asset-picker-list">
                    <button v-for="a in addableFiltered" :key="a.assetId ?? a.id" class="asset-picker-option"
                            @click="add(a.assetId ?? a.id)">
                        <span>{{ a.assetName }}</span>
                        <small>{{ a.regionCode || '未分区' }}</small>
                    </button>
                    <p v-if="!addableFiltered.length" class="empty-tip">
                        {{ addable.length ? '没有匹配的' + typeLabel + '。' : '没有更多可添加的' + typeLabel + '。' }}
                    </p>
                </div>
            </div>
        </div>
    </Teleport>
</section>
</template>
