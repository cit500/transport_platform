<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import { api } from '../services/api.js';
import { PASSABILITY, statusLabel, vehicleFields, vehicleSnapshot, assetFieldLabels } from '../services/heavyAssessment.js';

const props = defineProps({ open:Boolean, asset:Object, vehicle:{type:Object,required:true}, scenarioId:String, saved:Object });
const emit = defineEmits(['close','saved','invalidated']);
const context = ref(null), assessment = ref(null), phase = ref('idle'), progress = ref(0), error = ref('');
const effectiveStatus = ref(''), reason = ref(''), discardPrompt = ref(false), rerunPrompt = ref(false);
const dialog = ref(), closeButton = ref();
let version = 0, controller, priorFocus, selectedVehicle;
const busy = computed(() => ['loading','running','saving'].includes(phase.value));
const asset = computed(() => context.value?.asset || assessment.value?.asset || props.asset || {});
const parameters = computed(() => Object.entries(asset.value.detail || {}).filter(([key]) => key !== 'asset_id'));
const manual = computed(() => assessment.value && effectiveStatus.value !== assessment.value.algorithmStatus);
const dirty = computed(() => assessment.value && (!assessment.value.savedAssessmentId
    || effectiveStatus.value !== assessment.value.effectiveStatus || (manual.value ? reason.value.trim() : '') !== (assessment.value.overrideReason || '')));
const phaseLabel = computed(() => ({loading:'正在读取设施档案',running:'正在执行随机模拟评估',saving:'正在保存评估结果',done:'评估已完成',saved:'结果已保存',idle:'参数已就绪',failed:'操作失败'})[phase.value]);
function requestClose() {
    if (busy.value) return;
    if (dirty.value) { discardPrompt.value=true; return; }
    emit('close');
}
function keydown(event) {
    if (!props.open) return;
    if (event.key === 'Escape') { event.preventDefault(); requestClose(); }
    if (event.key !== 'Tab' || !dialog.value) return;
    const items = [...dialog.value.querySelectorAll('button,input,select,textarea')].filter(el => !el.disabled);
    const first=items[0],last=items.at(-1);
    if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first?.focus(); }
}
watch(() => props.open, async open => {
    const session=++version; controller?.abort();
    if (!open) { document.removeEventListener('keydown',keydown); priorFocus?.focus(); return; }
    priorFocus=document.activeElement; document.addEventListener('keydown',keydown);
    selectedVehicle=vehicleSnapshot(props.vehicle);
    controller=new AbortController(); context.value=null; assessment.value=null; error.value='';
    discardPrompt.value=false; rerunPrompt.value=false; phase.value='loading'; progress.value=15;
    await nextTick(); closeButton.value?.focus();
    try {
        const data=await api('/heavy/assets/'+props.asset.id+'/context',{signal:controller.signal});
        if(session!==version)return;
        context.value=data;
        if(props.saved && props.saved.assetVersion===data.assetVersion) {
            assessment.value=JSON.parse(JSON.stringify(props.saved));
            effectiveStatus.value=assessment.value.effectiveStatus;
            reason.value=assessment.value.overrideReason || '';
            phase.value='saved'; progress.value=100;
        } else {
            if(props.saved)emit('invalidated',props.asset.id);
            phase.value='idle'; progress.value=0;
        }
    } catch(e) { if(session===version && e.name!=='AbortError') { error.value=e.message; phase.value='failed'; progress.value=0; } }
});
function start() {
    if(busy.value||!context.value)return;
    if(assessment.value && (manual.value||dirty.value)) { rerunPrompt.value=true; return; }
    run(false);
}
async function run(keepOverride) {
    const session=version, previousStatus=effectiveStatus.value, previousReason=reason.value;
    const hadManual=manual.value;
    rerunPrompt.value=false; error.value=''; phase.value='running'; progress.value=45;
    try {
        const data=await api('/heavy/assets/'+props.asset.id+'/assess',{method:'POST',signal:controller.signal,
            body:JSON.stringify({vehicle:selectedVehicle,scenarioId:props.scenarioId})});
        if(session!==version)return;
        assessment.value=data; context.value={asset:data.asset,assetVersion:data.assetVersion};
        effectiveStatus.value=keepOverride&&hadManual ? previousStatus : data.algorithmStatus;
        reason.value=keepOverride&&hadManual ? previousReason : '';
        phase.value='done'; progress.value=100;
    } catch(e) { if(session===version && e.name!=='AbortError') { error.value=e.message; phase.value='failed'; progress.value=0; } }
}
async function save() {
    if(!assessment.value||busy.value)return;
    if(manual.value && !reason.value.trim()) { error.value='人工调整请填写理由'; return; }
    const session=version; phase.value='saving'; error.value='';
    try {
        const saved=await api('/heavy/assessment-saves',{method:'POST',signal:controller.signal,body:JSON.stringify({
            draftToken:assessment.value.draftToken, savedAssessmentId:assessment.value.savedAssessmentId,
            scenarioId:props.scenarioId,vehicle:selectedVehicle,
            overrideStatus:manual.value?effectiveStatus.value:null,overrideReason:reason.value.trim()
        })});
        if(session!==version)return;
        assessment.value=saved; phase.value='saved'; emit('saved',saved); emit('close');
    } catch(e) { if(session===version && e.name!=='AbortError') { error.value=e.message; phase.value='done'; } }
}
function restore() { effectiveStatus.value=assessment.value.algorithmStatus; reason.value=''; }
onBeforeUnmount(() => { version++; controller?.abort(); document.removeEventListener('keydown',keydown); });
</script>

<template>
<Teleport to="body"><div v-if="open" class="heavy-assessment-backdrop" @click.self="requestClose">
  <section ref="dialog" class="heavy-assessment-dialog" role="dialog" aria-modal="true" aria-labelledby="heavy-assessment-title">
    <header><div><span class="simulation-badge">随机模拟 · 非正式评估</span><h2 id="heavy-assessment-title">{{ asset.assetName }} · 通行评估</h2></div><button ref="closeButton" :disabled="busy" aria-label="关闭通行评估弹窗" @click="requestClose">×</button></header>
    <div class="heavy-assessment-body">
      <p class="assessment-simulation-note">本次结论由随机函数产生，仅用于演示评估、人工调整与保存流程，不代表实际通行能力。</p>
      <div class="assessment-parameter-columns">
        <section><h3>本次重车参数</h3><p>{{ selectedVehicle?.profileName }}</p><dl><template v-for="[key,label,unit] in vehicleFields" :key="key"><dt>{{ label }}</dt><dd>{{ selectedVehicle?.[key] }} {{ unit }}</dd></template></dl></section>
        <section><h3>{{ asset.assetType==='BRIDGE'?'桥梁':'隧道' }}参数</h3><p>{{ asset.assetCode || '读取中…' }}</p><dl>
          <dt>运营状态</dt><dd>{{ {IN_SERVICE:'运营中',MAINTENANCE:'维护中',CLOSED:'已关闭'}[asset.serviceStatus] || '缺失' }}</dd>
          <dt>建造年份</dt><dd>{{ asset.constructionYear || '缺失' }}</dd><dt>设计等级</dt><dd>{{ asset.designGrade || '缺失' }}</dd>
          <template v-for="[key,value] in parameters" :key="key"><dt>{{ assetFieldLabels[key] || key }}</dt><dd>{{ value==null||value==='' ? '缺失' : typeof value==='boolean' ? (value?'是':'否') : value }}</dd></template>
        </dl><p v-if="context && !parameters.length" class="assessment-missing">专业参数尚未录入；随机模拟仍可执行。</p></section>
      </div>
      <section class="assessment-progress-section"><div><strong>{{ phaseLabel }}</strong><span>{{ progress }}%</span></div><progress :value="progress" max="100" :aria-label="phaseLabel"></progress><small>读取参数 → 随机模拟 → 查看结论 → 保存；进度按实际请求阶段更新。</small></section>
      <section v-if="assessment" class="assessment-conclusion">
        <div><span>随机计算结论</span><strong :class="'pass-status-'+assessment.algorithmStatus">{{ statusLabel(assessment.algorithmStatus) }}</strong><small>{{ assessment.evaluatedAt?.replace('T',' ').slice(0,19) }} UTC</small></div>
        <p>{{ assessment.explanation }}</p>
        <div class="assessment-manual-controls"><label>当前有效状态<select v-model="effectiveStatus" :disabled="busy" aria-label="当前有效通行状态"><option v-for="s in PASSABILITY" :key="s.key" :value="s.key">{{ s.label }}</option></select></label><button :disabled="busy" @click="restore">恢复计算结论</button></div>
        <label v-if="manual" class="assessment-reason">人工调整理由<textarea v-model="reason" :disabled="busy" maxlength="500" rows="2" placeholder="填写本次任务下调整状态的理由"></textarea></label>
        <p class="assessment-effective">保存后生效：<strong :class="'pass-status-'+effectiveStatus">{{ statusLabel(effectiveStatus) }}</strong> · {{ manual?'人工调整（模拟）':'随机模拟' }}<span v-if="dirty"> · 尚未保存</span></p>
      </section>
      <p v-if="error" class="assessment-error" role="alert">{{ error }}</p>
      <div v-if="rerunPrompt" class="assessment-confirm" role="alert"><p>重新评估将产生新随机结论。如何处理当前人工调整及未保存结果？</p><button @click="run(false)">重新计算并清除调整</button><button v-if="manual" @click="run(true)">重新计算并保留调整</button><button @click="rerunPrompt=false">取消</button></div>
      <div v-if="discardPrompt" class="assessment-confirm" role="alert"><p>当前结果或调整尚未保存，是否放弃？</p><button @click="discardPrompt=false">继续编辑</button><button @click="$emit('close')">放弃并关闭</button></div>
    </div>
    <footer><span>{{ assessment?.savedAssessmentId ? '已保存记录 #'+assessment.savedAssessmentId : '保存后才同步清单与地图' }}</span><button :disabled="busy" @click="requestClose">返回</button><button :disabled="busy||!context" @click="start">{{ assessment?'重新评估':'开始评估' }}</button><button class="is-primary" :disabled="busy||!assessment||!dirty" @click="save">{{ phase==='saving'?'保存中…':'保存结果' }}</button></footer>
  </section>
</div></Teleport>
</template>

<style>
.heavy-assessment-backdrop { position:fixed; inset:0; z-index:6100; display:flex; align-items:center; justify-content:center; padding:24px; background:#000b; }
.heavy-assessment-dialog { width:min(920px,calc(100vw - 48px)); max-height:92vh; display:flex; flex-direction:column; border:1px solid #3d677f; border-radius:7px; background:#091b2b; color:#bad5e6; box-shadow:0 24px 80px #000b; font-family:"Microsoft YaHei",sans-serif; }
.heavy-assessment-dialog header { flex:none; display:flex; justify-content:space-between; align-items:center; padding:17px 22px; border-bottom:1px solid #27465f; }
.heavy-assessment-dialog h2 { font-size:19px; font-weight:500; margin:8px 0 0; color:#d4edf6; }
.heavy-assessment-dialog header button { background:transparent; border:0; color:#9ac4da; font-size:26px; }
.simulation-badge { display:inline-block; color:#ddb97a; background:#463b213d; border:1px solid #74603b; border-radius:3px; padding:3px 7px; font-size:11px; }
.heavy-assessment-body { min-height:0; overflow-y:auto; padding:15px 22px; }
.assessment-simulation-note { font-size:12px; color:#c7b284; margin:0 0 15px; line-height:1.7; }
.assessment-parameter-columns { display:grid; grid-template-columns:1fr 1.2fr; gap:14px; }
.assessment-parameter-columns section { border:1px solid #24415a; border-radius:4px; padding:13px; background:#051625; }
.assessment-parameter-columns h3 { font-size:14px; color:#b8deed; font-weight:500; margin:0; }
.assessment-parameter-columns p { font-size:12px; color:#718fa8; margin:8px 0 12px; }
.assessment-parameter-columns dl { display:grid; grid-template-columns:minmax(90px,1fr) minmax(50px,1fr); gap:9px; margin:0; font-size:12px; }
.assessment-parameter-columns dt { color:#6f96ae; } .assessment-parameter-columns dd { margin:0; color:#b9d4e3; overflow-wrap:anywhere; }
.assessment-progress-section { margin-top:16px; } .assessment-progress-section div { display:flex; justify-content:space-between; font-size:12px; }
.assessment-progress-section strong { font-weight:500; } .assessment-progress-section progress { width:100%; height:8px; margin:9px 0; accent-color:#46bed6; }
.assessment-progress-section small { font-size:11px; color:#6d91aa; }
.assessment-conclusion { margin-top:16px; padding:14px; border:1px solid #2c5168; background:#0c2638; }
.assessment-conclusion > div:first-child { display:flex; gap:15px; align-items:center; font-size:12px; } .assessment-conclusion small { color:#6d91a9; font-size:11px; margin-left:auto; }
.assessment-conclusion > p { font-size:12px; color:#8aa8bb; line-height:1.7; margin:10px 0; }
.assessment-manual-controls { display:flex; gap:14px; align-items:flex-end; } .assessment-manual-controls label { font-size:12px; flex:1; }
.assessment-manual-controls select,.assessment-reason textarea { display:block; width:100%; box-sizing:border-box; background:#041725; color:#b8d5e6; padding:8px; border:1px solid #34536b; margin-top:6px; }
.assessment-reason { display:block; font-size:12px; margin-top:12px; }
.heavy-assessment-dialog button { padding:7px 12px; color:#b3d1e1; border:1px solid #345c74; border-radius:3px; background:#102d42; cursor:pointer; font-size:12px; }
.heavy-assessment-dialog button:disabled { opacity:.4; cursor:not-allowed; } .heavy-assessment-dialog .is-primary { background:#146079; border-color:#348da8; }
.heavy-assessment-dialog footer { display:flex; align-items:center; justify-content:flex-end; gap:8px; padding:14px 22px; border-top:1px solid #27465f; }
.heavy-assessment-dialog footer span { font-size:11px; color:#6b91aa; margin-right:auto; }
.assessment-error { color:#ff9da9; font-size:12px; } .assessment-confirm { padding:12px; background:#392d1e; border:1px solid #756044; font-size:12px; margin-top:12px; }
.assessment-confirm button { margin:5px 8px 0 0; } .assessment-confirm p { margin:0 0 7px; }
.pass-status-PASS { color:#60cfac !important; } .pass-status-CONDITIONAL { color:#e5c16c !important; } .pass-status-BLOCKED { color:#f08799 !important; } .pass-status-PENDING_DATA { color:#8da6b8 !important; }
.heavy-assessment-dialog :focus-visible { outline:2px solid #45d4ee; outline-offset:2px; }
</style>
