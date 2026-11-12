<script setup>
import { nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue';

const props = defineProps({ open: Boolean, profile: { type: Object, required: true }, error: { type: String, default: '' } });
const emit = defineEmits(['close', 'save']);
const draft = reactive({}), dialog = ref(), nameInput = ref();
let previousFocus;
const fields = [
    { key:'grossWeightTon',label:'总车重',unit:'t',step:.1,min:.1 },
    { key:'vehicleLengthM',label:'长度',unit:'m',step:.1,min:.1 },
    { key:'vehicleWidthM',label:'宽度',unit:'m',step:.1,min:.1 },
    { key:'vehicleHeightM',label:'高度',unit:'m',step:.1,min:.1 },
    { key:'axleCount',label:'轴数',unit:'轴',step:1,min:1 },
    { key:'plannedSpeedKmh',label:'计划速度',unit:'km/h',step:1,min:1 }
];
function keydown(event) {
    if (!props.open) return;
    if (event.key === 'Escape') { event.preventDefault(); emit('close'); }
    if (event.key !== 'Tab') return;
    const elements = [...dialog.value.querySelectorAll('button,input')].filter(el => !el.disabled);
    const first = elements[0], last = elements.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
watch(() => props.open, async open => {
    if (open) {
        Object.keys(draft).forEach(key => delete draft[key]); Object.assign(draft, props.profile);
        previousFocus = document.activeElement;
        document.addEventListener('keydown', keydown);
        await nextTick(); nameInput.value?.focus();
    } else {
        document.removeEventListener('keydown', keydown);
        previousFocus?.focus();
    }
});
onBeforeUnmount(() => document.removeEventListener('keydown', keydown));
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="vehicle-dialog-backdrop" @click.self="$emit('close')">
      <section ref="dialog" class="vehicle-dialog" role="dialog" aria-modal="true" aria-labelledby="vehicle-dialog-title">
        <header><div><small>重车参数方案</small><h2 id="vehicle-dialog-title">编辑车辆参数</h2></div><button aria-label="关闭车辆参数弹窗" @click="$emit('close')">×</button></header>
        <form @submit.prevent="$emit('save',{...draft})">
          <label class="vehicle-profile-name">方案名称<input ref="nameInput" v-model="draft.profileName" required maxlength="60" placeholder="为这组参数命名"></label>
          <div class="vehicle-dialog-grid"><label v-for="field in fields" :key="field.key">{{ field.label }}<span>{{ field.unit }}</span><input v-model.number="draft[field.key]" type="number" :step="field.step" :min="field.min" required :aria-label="field.label"></label></div>
          <p class="vehicle-local-note">方案保存到当前浏览器，作为单设施随机模拟评估的参数快照，不参与当前路径筛选。</p>
          <p v-if="error" class="vehicle-dialog-error" role="alert">{{ error }}</p>
          <footer><button type="button" @click="$emit('close')">取消</button><button type="submit" class="is-primary">保存方案</button><button type="button" @click="$emit('save',{...draft,id:null})">另存新方案</button></footer>
        </form>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.vehicle-dialog-backdrop { position:fixed; inset:0; z-index:6000; background:#000a; display:flex; align-items:center; justify-content:center; padding:24px; }
.vehicle-dialog { width:min(600px,calc(100vw - 48px)); max-height:90vh; overflow-y:auto; border:1px solid #3d677f; background:#091b2b; box-shadow:0 24px 80px #000a; color:#bdd7e7; border-radius:8px; font-family:"Microsoft YaHei",sans-serif; }
header { padding:20px 24px; display:flex; align-items:center; justify-content:space-between; border-bottom:1px solid #243d51; }
header small { color:#668fa7; font-size:12px; } h2 { margin:5px 0 0; font-size:20px; font-weight:500; color:#d4edf6; }
header button { font-size:24px; border:0; background:none; color:#96bed1; cursor:pointer; }
form { padding:20px 24px 24px; } label { display:block; font-size:13px; } label span { float:right; color:#648fa8; }
input { display:block; width:100%; box-sizing:border-box; height:38px; padding:7px 10px; margin-top:8px; border:1px solid #2b4d65; border-radius:3px; background:#041321; color:#d4eaf5; }
.vehicle-dialog-grid { display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-top:20px; }
.vehicle-local-note { font-size:12px; color:#6f98b0; margin:20px 0; line-height:1.6; }
.vehicle-dialog-error { color:#ff9caa; font-size:12px; }
footer { display:flex; gap:8px; justify-content:flex-end; } footer button { border:1px solid #365e76; padding:9px 16px; background:#102b40; color:#b8d8e8; border-radius:3px; cursor:pointer; } footer .is-primary { background:#12617b; border-color:#3498b5; color:#e0faff; }
button:focus-visible,input:focus-visible { outline:2px solid #45d4ee; outline-offset:2px; }
</style>
