<script setup>
import { ref } from 'vue';
import { api } from '../../services/api.js';

const props = defineProps({
    mode: { type: String, default: 'EARTHQUAKE' },
    longitude: { type: Number, default: 106.55 },
    latitude: { type: Number, default: 29.56 },
    pgaG: { type: Number, default: 0.2 },
    parsed: { type: Object, default: null },
    context: { type: Object, default: () => ({}) },
    picking: { type: Boolean, default: false }
});
const emit = defineEmits(['update:mode', 'update:longitude', 'update:latitude', 'update:pgaG',
    'parsed', 'update:context', 'pick', 'meta']);

const uploading = ref(false);
const uploadError = ref('');
const llmLoading = ref(false);
const llmMessage = ref('');
const llmSource = ref('');
const rawOutput = ref('');
const showRaw = ref(false);

const TYPES = [['EARTHQUAKE', '地震评估'], ['DEBRIS_FLOW', '泥石流评估']];

const DEBRIS_FIELDS = [
    ['intensityMmH', '短历时雨强 (mm/h)', 0.1],
    ['last6hMm', '近 6 小时降雨 (mm)', 1],
    ['last24hMm', '近 24 小时降雨 (mm)', 1],
    ['antecedentMm', '前期降雨 (mm)', 1],
    ['catchmentAreaKm2', '流域面积 (km²)', 0.1],
    ['averageSlopeDegree', '平均坡度 (°)', 0.5],
    ['channelLengthKm', '沟道长度 (km)', 0.1],
    ['reliefM', '相对高差 (m)', 1]
];
const DEBRIS_LEVELS = {
    looseMaterialLevel: ['较少', '中等', '丰富'],
    soilMoistureLevel: ['干燥', '潮湿', '饱和'],
    channelCondition: ['沟道不发育', '沟道一般', '沟道发育']
};
const LEVEL_LABEL = {
    looseMaterialLevel: '松散物源', soilMoistureLevel: '土体含水', channelCondition: '沟道条件'
};

function switchMode(type) {
    if (type !== props.mode) emit('update:mode', type);
}

async function onFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    uploadError.value = '';
    uploading.value = true;
    try {
        const content = await file.text();
        // AT2 由表头决定单位；纯数值记录按 g 解析
        const isAt2 = file.name.toLowerCase().endsWith('.at2');
        const result = await api('/disaster/parse-ground-motion', {
            method: 'POST',
            body: JSON.stringify({ filename: file.name, content, unit: isAt2 ? null : 'g', dt: null })
        });
        // 保留原始文本，评估时需要连同解析结果一起提交给后端重新解析
        emit('parsed', { ...result, __content: content });
    } catch (e) {
        uploadError.value = e.message;
        emit('parsed', null);
    } finally {
        uploading.value = false;
        event.target.value = '';
    }
}

function clearRecord() {
    emit('parsed', null);
}

function updateContext(key, value) {
    emit('update:context', { ...props.context, [key]: value });
}

async function fetchContext() {
    llmLoading.value = true;
    llmMessage.value = '正在向大模型请求环境参数…';
    try {
        const response = await api('/disaster/debris-context', {
            method: 'POST',
            body: JSON.stringify({ regionName: '', longitude: props.longitude, latitude: props.latitude, hours: 6 })
        });
        emit('update:context', { ...props.context, ...response.data });
        rawOutput.value = response.raw || '';
        llmSource.value = response.source;
        llmMessage.value = response.message || '';
        emit('meta', { source: response.source, message: response.message, raw: response.raw });
    } catch (e) {
        llmMessage.value = '获取失败：' + e.message;
        llmSource.value = 'FALLBACK';
    } finally {
        llmLoading.value = false;
    }
}
</script>

<template>
<section class="tech-panel hazard-source-panel">
    <div class="hazard-type-row">
        <button v-for="t in TYPES" :key="t[0]" :class="{ 'is-active': mode === t[0] }"
                @click="switchMode(t[0])">{{ t[1] }}</button>
    </div>

    <template v-if="mode === 'EARTHQUAKE'">
        <div class="field-row field-row-3">
            <label class="field-label">震中经度
                <input type="number" step="0.0001" :value="longitude"
                       @input="emit('update:longitude', Number($event.target.value))" />
            </label>
            <label class="field-label">震中纬度
                <input type="number" step="0.0001" :value="latitude"
                       @input="emit('update:latitude', Number($event.target.value))" />
            </label>
            <button class="map-pick-button" :class="{ 'is-active': picking }" @click="emit('pick')">
                {{ picking ? '点选中…' : '地图点选' }}
            </button>
        </div>

        <div class="field-row field-row-2">
            <label class="field-label">PGA (g)
                <input type="number" step="0.01" min="0" :value="pgaG" :disabled="!!parsed"
                       @input="emit('update:pgaG', Number($event.target.value))" />
            </label>
            <label class="upload-button">
                <input type="file" accept=".at2,.txt" :disabled="!!parsed" @change="onFile" />
                <span>{{ uploading ? '解析中…' : parsed ? '已加载记录' : '选择地震动文件' }}</span>
            </label>
        </div>

        <div v-if="parsed" class="gm-result">
            <p>PGA <strong>{{ parsed.pgaG?.toFixed(4) }} g</strong> · {{ parsed.format }} · {{ parsed.npts }} 点</p>
            <p v-if="parsed.durationS != null">持时 {{ parsed.durationS?.toFixed(2) }} s</p>
            <p v-for="w in parsed.warnings || []" :key="w" class="panel-hint">{{ w }}</p>
            <button class="text-action" @click="clearRecord">移除记录，改用输入 PGA</button>
        </div>
        <p v-if="uploadError" class="panel-error">{{ uploadError }}</p>
    </template>

    <template v-else>
        <div class="field-row field-row-3">
            <label class="field-label">灾害源经度
                <input type="number" step="0.0001" :value="longitude"
                       @input="emit('update:longitude', Number($event.target.value))" />
            </label>
            <label class="field-label">灾害源纬度
                <input type="number" step="0.0001" :value="latitude"
                       @input="emit('update:latitude', Number($event.target.value))" />
            </label>
            <button class="map-pick-button" :class="{ 'is-active': picking }" @click="emit('pick')">
                {{ picking ? '点选中…' : '地图点选' }}
            </button>
        </div>

        <button class="secondary-run-button debris-llm-button" :disabled="llmLoading" @click="fetchContext">
            {{ llmLoading ? '获取中…' : '用大模型获取环境数据' }}
        </button>
        <p v-if="llmMessage" class="context-source" :data-source="llmSource">{{ llmMessage }}</p>

        <div class="debris-field-grid">
            <label v-for="f in DEBRIS_FIELDS" :key="f[0]" class="field-label">
                {{ f[1] }}
                <input type="number" :step="f[2]" :value="context[f[0]] ?? ''"
                       @input="updateContext(f[0], Number($event.target.value))" />
            </label>
            <label v-for="(options, key) in DEBRIS_LEVELS" :key="key" class="field-label">
                {{ LEVEL_LABEL[key] }}
                <select :value="context[key] ?? ''" @change="updateContext(key, $event.target.value)">
                    <option v-for="o in options" :key="o" :value="o">{{ o }}</option>
                </select>
            </label>
        </div>

        <button v-if="rawOutput" class="text-action" @click="showRaw = !showRaw">
            {{ showRaw ? '隐藏模型原始输出' : '查看模型原始输出' }}
        </button>
        <pre v-if="rawOutput && showRaw" class="debris-raw">{{ rawOutput }}</pre>
    </template>
</section>
</template>
