import { defineStore } from 'pinia';
import { computed, reactive, ref } from 'vue';
import { api, adminApi } from '../services/api.js';

const EMPTY_DASHBOARD = () => ({ overview: {}, defaultVehicle: {}, passSummary: [], heavyResults: [], regions: [], riskDistribution: [], hazardNotices: [], assistantQuestions: [] });

export const usePlatformStore = defineStore('platform', () => {
    const dashboard = reactive(EMPTY_DASHBOARD());
    const mapData = reactive({ regions: null, roads: null, assets: null });
    const vehicles = ref([{
        id: 'default', profileName: '默认100吨重型运输车', grossWeightTon: 100,
        vehicleLengthM: 18, vehicleWidthM: 3.2, vehicleHeightM: 4.5,
        axleCount: 6, plannedSpeedKmh: 30, isDefault: true
    }]);
    const assets = ref([]);
    const loading = ref(false);
    const backendOnline = ref(true);
    const lastError = ref('');
    const recentTasks = reactive({ disaster: [], resilience: [] });

    const defaultVehicle = computed(() => vehicles.value.find((item) => item.isDefault) || vehicles.value[0] || dashboard.defaultVehicle || {});

    async function loadDashboard(force = false) {
        if (!force && dashboard.overview?.regionCount != null) return dashboard;
        loading.value = true;
        try {
            Object.assign(dashboard, EMPTY_DASHBOARD(), await api('/dashboard/bootstrap'));
            backendOnline.value = true;
            lastError.value = '';
        } catch (error) {
            backendOnline.value = false;
            lastError.value = error.message;
            throw error;
        } finally { loading.value = false; }
        return dashboard;
    }

    async function loadMap(name, force = false) {
        if (!force && mapData[name]) return mapData[name];
        mapData[name] = await api(`/map/${name}`);
        return mapData[name];
    }

    async function loadCatalogs(force = false) {
        if (!force && assets.value.length) return;
        const assetPage = await adminApi('/assets?page=0&size=100');
        assets.value = (assetPage?.content || []).filter((item) => item.longitude != null && item.latitude != null);
    }

    function rememberTask(type, task) {
        recentTasks[type] = [task, ...recentTasks[type].filter((item) => item.id !== task.id)].slice(0, 10);
    }

    return { dashboard, mapData, vehicles, assets, loading, backendOnline, lastError, recentTasks, defaultVehicle, loadDashboard, loadMap, loadCatalogs, rememberTask };
});

export const useUiStore = defineStore('ui', () => {
    const toasts = ref([]);
    let sequence = 0;
    function toast(message, kind = 'info') {
        const id = ++sequence;
        toasts.value.push({ id, message, kind });
        window.setTimeout(() => { toasts.value = toasts.value.filter((item) => item.id !== id); }, 2800);
    }
    return { toasts, toast };
});
