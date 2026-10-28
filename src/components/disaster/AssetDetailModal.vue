<script setup>
import { computed } from 'vue';

const props = defineProps({
    asset: { type: Object, default: null },
    hazardLabel: { type: String, default: '地震' }
});
const emit = defineEmits(['close']);

const DS_COLORS = ['#829BAA', '#668AA0', '#52768F', '#405D79', '#314760'];
const DS_TEXT = ['DS0 基本完好', 'DS1 轻微损伤', 'DS2 中等损伤', 'DS3 严重损伤', 'DS4 毁坏'];
const STATUS_TEXT = { PASS: '正常通行', CONDITIONAL: '限行通行', BLOCKED: '阻断', PENDING_DATA: '待补数据' };

const stateRows = computed(() => {
    const states = props.asset?.stateProbabilities || {};
    return [0, 1, 2, 3, 4].map((i) => ({
        label: DS_TEXT[i],
        value: Number(states[`DS${i}`] ?? 0) * 100,
        color: DS_COLORS[i]
    }));
});
const exceedRows = computed(() => {
    const ex = props.asset?.exceedanceProbabilities || {};
    return [1, 2, 3, 4].map((i) => ({ label: `P(≥DS${i})`, value: Number(ex[`DS${i}`] ?? 0) * 100 }));
});
</script>

<template>
<Teleport to="body">
    <div v-if="asset" class="asset-detail-overlay" @click.self="emit('close')">
        <div class="asset-detail-modal">
            <header class="asset-detail-head">
                <div>
                    <strong>{{ asset.assetName }}</strong>
                    <span class="model-badge" :class="asset.damageState === 'PENDING_DATA' ? 'muted' : 'ok'">
                        {{ asset.damageState }}
                    </span>
                </div>
                <button class="asset-detail-close" @click="emit('close')">✕</button>
            </header>

            <div class="asset-detail-body">
                <section class="asset-detail-block">
                    <h3>设施信息</h3>
                    <div class="asset-detail-grid">
                        <span>设施类型</span><strong>{{ asset.assetType === 'TUNNEL' ? '隧道' : '桥梁' }}</strong>
                        <span>距灾害源</span><strong>{{ asset.distanceKm ?? '--' }} km</strong>
                        <span>坐标</span><strong>{{ Number(asset.longitude).toFixed(4) }}, {{ Number(asset.latitude).toFixed(4) }}</strong>
                        <span>通行状态</span><strong>{{ STATUS_TEXT[asset.passabilityStatus] || asset.passabilityStatus }}</strong>
                        <span>损伤概率</span><strong>{{ Number(asset.damageProbability || 0).toFixed(1) }} %</strong>
                    </div>
                </section>

                <section class="asset-detail-block">
                    <h3>强度指标（IM）</h3>
                    <div class="asset-detail-grid">
                        <span>IM 取值</span><strong>{{ asset.imValue ?? '--' }} {{ asset.imType === 'PGA' ? 'g' : '' }}</strong>
                        <span>IM 类型</span><strong>{{ asset.imType || '--' }}</strong>
                        <span>范围标记</span>
                        <strong :class="{ 'warn-text': asset.extrapolated }">
                            {{ asset.extrapolated ? '超出模型验证范围（外推结果）' : '位于模型验证范围内' }}
                        </strong>
                    </div>
                </section>

                <section v-if="asset.stateProbabilities" class="asset-detail-block">
                    <h3>损伤状态概率分布（和为 1）</h3>
                    <div v-for="row in stateRows" :key="row.label" class="asset-ds-row">
                        <span class="asset-ds-label">{{ row.label }}</span>
                        <div class="asset-ds-track">
                            <i :style="{ width: row.value + '%', background: row.color }"></i>
                        </div>
                        <strong>{{ row.value.toFixed(1) }}%</strong>
                    </div>
                    <div class="asset-exceed-row">
                        <span v-for="row in exceedRows" :key="row.label">{{ row.label }} = {{ row.value.toFixed(1) }}%</span>
                    </div>
                </section>

                <section class="asset-detail-block">
                    <h3>评估依据</h3>
                    <p class="asset-reason">{{ asset.assessmentReason }}</p>
                </section>

                <section class="asset-detail-block">
                    <h3>处置建议</h3>
                    <p class="asset-action">{{ asset.recommendedAction }}</p>
                </section>
            </div>
        </div>
    </div>
</Teleport>
</template>
