<script setup>
import { computed, reactive, ref, watch } from 'vue';
import { adminApi } from '../services/api.js';
import { usePlatformStore, useUiStore } from '../stores/platform.js';

const ui=useUiStore(),platform=usePlatformStore();
const tab=ref('overview'),loading=ref(false),error=ref(''),rows=ref([]),summary=ref({}),page=ref(0),totalPages=ref(1),query=ref(''),editorOpen=ref(false),editor=reactive({});
const tabs=[['overview','数据概览'],['regions','行政区划'],['roads','道路数据'],['assets','桥隧设施']];
const title=computed(()=>tabs.find(x=>x[0]===tab.value)?.[1]||'数据管理');
const fields=[['assetCode','设施编码','text'],['assetName','设施名称','text'],['assetType','设施类型（BRIDGE/TUNNEL）','text'],['regionCode','行政区编码','text'],['longitude','经度','number'],['latitude','纬度','number'],['constructionYear','建成年份','number'],['designGrade','设计等级','text'],['designSpeedKmh','设计速度','number'],['baselineConditionLevel','基准状态','text'],['baselineInspectionDate','基准检查日期','date'],['serviceStatus','服务状态','text'],['roadsJson','道路绑定 JSON','textarea']];

async function load(){loading.value=true;error.value='';try{
    if(tab.value==='overview'){summary.value=await adminApi('/summary');rows.value=[];}
    else {const endpoint=tab.value==='regions'?'/regions':`/${tab.value}?page=${page.value}&size=20&q=${encodeURIComponent(query.value)}`;const data=await adminApi(endpoint);rows.value=Array.isArray(data)?data:data.content||[];totalPages.value=data.totalPages||1;}
}catch(e){error.value=e.message}finally{loading.value=false}}
watch(()=>ui.dataManagementOpen,open=>{if(open)load()});watch(tab,()=>{page.value=0;query.value='';editorOpen.value=false;load()});
async function editAsset(item={}){let value=item;if(item.id)value=await adminApi(`/assets/${item.id}`);Object.keys(editor).forEach(k=>delete editor[k]);Object.assign(editor,{assetType:'BRIDGE',serviceStatus:'IN_SERVICE'},value,{roadsJson:JSON.stringify(value.roads||[],null,2)});editorOpen.value=true;}
async function saveAsset(){let roads;try{roads=JSON.parse(editor.roadsJson||'[]')}catch{return ui.toast('道路绑定 JSON 格式不正确')};const body={...editor,roads};delete body.roadsJson;delete body.detail;const path=editor.id?`/assets/${editor.id}`:'/assets';await adminApi(path,{method:editor.id?'PUT':'POST',body:JSON.stringify(body)});editorOpen.value=false;await platform.loadCatalogs(true);await load();ui.toast('桥隧记录已保存','success');}
async function closeAsset(id){if(!window.confirm('确定将该设施标记为停用吗？'))return;await adminApi(`/assets/${id}`,{method:'DELETE'});await platform.loadCatalogs(true);await load();}
const label=v=>v==null||v===''?'-':String(v);
</script>

<template>
<div v-if="ui.dataManagementOpen" class="dm-overlay" @click.self="ui.dataManagementOpen=false"><section class="dm-window" role="dialog" aria-modal="true" aria-label="平台数据管理">
<header class="dm-header"><div><span class="dm-header-mark">DM</span><strong>平台数据管理</strong><small>最小基础数据底座</small></div><div class="dm-header-actions"><button class="dm-icon-button" @click="load">↻</button><button class="dm-icon-button" @click="ui.dataManagementOpen=false">×</button></div></header>
<div class="dm-layout"><aside class="dm-sidebar"><button v-for="item in tabs" :key="item[0]" class="dm-nav-item" :class="{'is-active':tab===item[0]}" @click="tab=item[0]">{{ item[1] }}</button></aside>
<main class="dm-main"><div class="dm-main-content"><div class="dm-section-header"><div><h2>{{ title }}</h2><p>数据直接来自 transport_platform</p></div><button v-if="tab==='assets'" class="dm-button dm-button-primary" @click="editAsset()">＋ 新建设施</button></div>
<form v-if="['roads','assets'].includes(tab)" class="dm-filter-bar" @submit.prevent="page=0;load()"><input v-model="query" placeholder="输入名称或编号"><button class="dm-button">查询</button></form>
<div v-if="loading" class="dm-state"><strong>正在读取后台数据…</strong></div><div v-else-if="error" class="dm-state dm-state-error"><strong>数据读取失败</strong><p>{{ error }}</p><button class="dm-button" @click="load">重新加载</button></div>
<div v-else-if="tab==='overview'" class="dm-overview-grid"><article v-for="(value,key) in summary" :key="key" class="dm-stat-card"><span>{{ key }}</span><strong>{{ label(value) }}</strong></article></div>
<form v-else-if="editorOpen" class="dm-form" @submit.prevent="saveAsset"><div class="dm-form-grid"><label v-for="field in fields" :key="field[0]" :class="{'dm-form-wide':field[2]==='textarea'}"><span>{{ field[1] }}</span><textarea v-if="field[2]==='textarea'" v-model="editor[field[0]]"></textarea><input v-else v-model="editor[field[0]]" :type="field[2]" :step="field[2]==='number'?'any':undefined" :required="['assetCode','assetName','assetType'].includes(field[0])"></label></div><div class="dm-form-actions"><button type="button" class="dm-button" @click="editorOpen=false">取消</button><button class="dm-button dm-button-primary">保存</button></div></form>
<div v-else class="dm-table-wrap"><table><thead><tr><th>编号</th><th>名称</th><th>类型/等级</th><th>区域/规模</th><th>操作</th></tr></thead><tbody><tr v-for="item in rows" :key="item.id||item.regionCode"><td class="dm-code">{{ label(item.id||item.regionCode) }}</td><td><strong>{{ label(item.assetName||item.roadName||item.regionName) }}</strong><small>{{ label(item.assetCode||item.roadRef) }}</small></td><td>{{ label(item.assetType||item.roadClass) }}</td><td>{{ label(item.regionName||item.roadLengthKm) }}</td><td><template v-if="tab==='assets'"><button class="dm-link" @click="editAsset(item)">编辑</button><button class="dm-link dm-link-danger" @click="closeAsset(item.id)">停用</button></template></td></tr><tr v-if="!rows.length"><td colspan="5"><div class="dm-state">暂无记录</div></td></tr></tbody></table></div>
<div v-if="totalPages>1" class="dm-pagination"><button :disabled="page===0" @click="page--;load()">上一页</button><span>{{ page+1 }} / {{ totalPages }}</span><button :disabled="page>=totalPages-1" @click="page++;load()">下一页</button></div>
</div></main></div></section></div>
</template>
