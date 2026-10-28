<script setup>
import { computed } from 'vue';

const props = defineProps({
    assets: { type: Array, default: () => [] },
    selectedAssetId: { type: [Number, String], default: null },
    hazardLabel: { type: String, default: '灾害' }
});
const emit = defineEmits(['select', 'inspect']);

const DS_COLORS = ['#829BAA', '#668AA0', '#52768F', '#405D79', '#314760'];
const PASS_TEXT = { PASS: '完全通行', CONDITIONAL: '条件通行', BLOCKED: '禁止通行', PENDING_DATA: '待补数据' };

const visible = computed(() => props.assets || []);

function segments(asset) {
    const states = asset.stateProbabilities || {};
    return [0, 1, 2, 3, 4].map((i) => Number(states[`DS${i}`] ?? 0) * 100);
}
</script>

<template>
<section class="tech-panel disaster-result-panel">
    <h2 class="tech-panel-title">桥隧风险结果详情</h2>
    <div class="disaster-asset-list scroll-region">
        <article v-for="asset in visible" :key="asset.assetId" class="disaster-asset-item clickable"
                 :class="{ 'is-current': Number(asset.assetId) === Number(selectedAssetId) }"
                 :data-status="asset.passabilityStatus" @click="emit('select', asset)">
            <header>
                <strong>{{ asset.assetName }}</strong>
                <span class="asset-type-chip">{{ asset.assetType === 'TUNNEL' ? '隧道' : '桥梁' }}</span>
                <span class="damage-badge" :data-ds="asset.damageState">{{ asset.damageState }}</span>
            </header>
            <div v-if="asset.stateProbabilities" class="ds-bar">
                <i v-for="(w, i) in segments(asset)" :key="i" :style="{ width: w + '%', background: DS_COLORS[i] }"></i>
            </div>
            <p class="ds-meta">
                IM {{ asset.imValue ?? '--' }}
                <span v-if="asset.extrapolated" class="extrapolated-tag">外推</span>
                · {{ PASS_TEXT[asset.passabilityStatus] || asset.passabilityStatus }}
                <button class="asset-inspect-button" title="查看完整评估详情"
                        @click.stop="emit('inspect', asset)">ⓘ</button>
            </p>
        </article>
        <p v-if="!visible.length" class="empty-tip">完成{{ hazardLabel }}评估后展示结果，点击条目查看该设施的曲线与概率。</p>
    </div>
</section>
</template>
