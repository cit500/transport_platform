<script setup>
defineProps({ open: Boolean, base: { type: String, default: 'satellite' }, overlays: { type: Object, required: true }, items: { type: Array, required: true } });
defineEmits(['base-change', 'overlay-change', 'close']);
</script>

<template>
  <div v-if="open" class="shared-map-layers" @keydown.esc.stop="$emit('close')">
    <strong>地图模式</strong>
    <div class="shared-map-base-options" role="radiogroup" aria-label="地图模式">
      <button v-for="mode in [['satellite','卫星地图'],['electronic','电子地图']]" :key="mode[0]" type="button" role="radio"
              :aria-checked="base===mode[0]" :class="{'is-active':base===mode[0]}" @click="$emit('base-change',mode[0])">{{ mode[1] }}</button>
    </div>
    <strong>叠加图层</strong>
    <label v-for="item in items" :key="item.key" :class="{'is-locked':item.disabled}" :title="item.hint || ''">
      <input type="checkbox" :checked="overlays[item.key]" :disabled="item.disabled" @change="$emit('overlay-change',{key:item.key,checked:$event.target.checked})">
      <span>{{ item.label }}<small v-if="item.detail">{{ item.detail }}</small></span>
    </label>
  </div>
</template>

<style scoped>
.shared-map-layers { position:absolute; z-index:650; top:70px; right:56px; width:220px; padding:14px; color:#b8d7e7; border:1px solid #315975; background:#051a2df5; box-shadow:0 8px 24px #0006; font-size:12px; }
.shared-map-layers strong { display:block; margin-bottom:9px; font-size:13px; color:#d0e6ef; }
.shared-map-base-options { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:16px; }
.shared-map-base-options button { padding:7px 4px; border:1px solid #315975; background:#0a263b; color:#a5c6d8; font-size:12px; cursor:pointer; }
.shared-map-base-options button.is-active { border-color:#45d4ee; color:#80e9fc; background:#0d3b50; }
.shared-map-layers label { display:flex; gap:8px; align-items:center; margin:10px 0; cursor:pointer; }
.shared-map-layers input { accent-color:#45d4ee; }
.shared-map-layers small { margin-left:7px; color:#6e93ac; font-size:10px; }
.shared-map-layers .is-locked { opacity:.5; cursor:default; }
button:focus-visible,input:focus-visible { outline:2px solid #45d4ee; outline-offset:2px; }
</style>
