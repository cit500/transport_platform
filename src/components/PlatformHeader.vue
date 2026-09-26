<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useClock } from '../composables/useClock.js';
import { useUiStore } from '../stores/platform.js';

const props = defineProps({ showAdminMenu: { type: Boolean, default: false } });
const router = useRouter();
const route = useRoute();
const ui = useUiStore();
const { time, date } = useClock();
const adminOpen = ref(false);
const adminWrap = ref(null);
const active = computed(() => route.name);
const go = (name) => router.push({ name });
function adminAction(action) {
    adminOpen.value = false;
    if (action === 'data') router.push({ name: 'admin-data' });
    else ui.toast('该管理功能将在后续接入');
}

function toggleAdminMenu() {
    if (!props.showAdminMenu) {
        ui.toast('请从首页进入数据管理');
        return;
    }
    adminOpen.value = !adminOpen.value;
}

function closeAdminMenu(event) {
    if (event.type === 'keydown' && event.key !== 'Escape') return;
    if (event.type === 'pointerdown' && adminWrap.value?.contains(event.target)) return;
    adminOpen.value = false;
}

onMounted(() => {
    document.addEventListener('pointerdown', closeAdminMenu);
    document.addEventListener('keydown', closeAdminMenu);
});
onUnmounted(() => {
    document.removeEventListener('pointerdown', closeAdminMenu);
    document.removeEventListener('keydown', closeAdminMenu);
});
</script>

<template>
    <header class="dashboard-header">
        <nav class="header-wing header-wing-left" aria-label="左侧导航">
            <div class="header-status-card"><strong>{{ time }}</strong><span>{{ date }}</span><span class="weather-line">🌦 重庆 · 多云 26℃</span></div>
            <button class="header-nav-item" :class="{ 'is-active': active === 'home' }" @click="go('home')">首页</button>
            <button class="header-nav-item" :class="{ 'is-active': active === 'heavy' }" @click="go('heavy')">重车通行评估</button>
        </nav>
        <div class="platform-title"><h1>交通网络多灾韧性评价可视化平台</h1></div>
        <nav class="header-wing header-wing-right" aria-label="右侧导航">
            <button class="header-nav-item" :class="{ 'is-active': active === 'disaster' }" @click="go('disaster')">灾害风险评估</button>
            <button class="header-nav-item" :class="{ 'is-active': active === 'resilience' }" @click="go('resilience')">路网韧性评估</button>
            <div ref="adminWrap" class="admin-nav-wrap">
                <button class="header-nav-item admin-nav-button" :class="{ 'is-active': active === 'admin-data' }" :aria-expanded="adminOpen" aria-haspopup="menu" @click.stop="toggleAdminMenu">管理员<span class="nav-chevron">⌄</span></button>
                <div v-if="showAdminMenu" class="admin-menu" :class="{ 'is-open': adminOpen }" role="menu">
                    <button @click="adminAction('profile')">个人信息</button><button @click="adminAction('data')">数据管理</button><button @click="adminAction('settings')">系统设置</button>
                </div>
            </div>
        </nav>
    </header>
</template>
