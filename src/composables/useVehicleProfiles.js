import { computed, ref } from 'vue';

const STORAGE_KEY = 'plant.heavy.vehicle-profiles.v1';
const DEFAULT_PROFILE = { id:'default', profileName:'默认100吨重型运输车', grossWeightTon:100,
    vehicleLengthM:18, vehicleWidthM:3.2, vehicleHeightM:4.5, axleCount:6, plannedSpeedKmh:30 };
const NUMBERS = ['grossWeightTon','vehicleLengthM','vehicleWidthM','vehicleHeightM','axleCount','plannedSpeedKmh'];

export function validateVehicleProfile(profile) {
    const name = String(profile.profileName || '').trim();
    if (!name || name.length > 60) throw new Error('请填写不超过60字的方案名称');
    const clean = { id:profile.id, profileName:name };
    for (const key of NUMBERS) {
        const value = Number(profile[key]);
        if (!Number.isFinite(value) || value <= 0) throw new Error('车辆参数必须为大于0的有效数值');
        if (key === 'axleCount' && !Number.isInteger(value)) throw new Error('轴数必须为正整数');
        clean[key] = value;
    }
    return clean;
}

/** 暂无后台车辆方案实体：独立本机存储，不伪装成已入库或已完成通行评估。 */
export function useVehicleProfiles() {
    const profiles = ref([{ ...DEFAULT_PROFILE }]), selectedId = ref('default'), error = ref('');
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const saved = JSON.parse(raw);
            if (!Array.isArray(saved) || !saved.length || saved.length > 100) throw new Error();
            const ids = new Set();
            const parsed = saved.map(profile => {
                if (typeof profile.id !== 'string' || !profile.id || ids.has(profile.id)) throw new Error();
                ids.add(profile.id); return validateVehicleProfile(profile);
            });
            profiles.value = parsed; selectedId.value = parsed[0].id;
        }
    } catch { error.value = '本机方案无法读取，已使用默认参数'; }
    const selectedProfile = computed(() => profiles.value.find(p => p.id === selectedId.value) || profiles.value[0]);
    function save(profile) {
        error.value = '';
        try {
            const clean = validateVehicleProfile(profile);
            if (!clean.id) clean.id = 'vehicle-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8);
            const exists = profiles.value.some(p => p.id === clean.id);
            if (!exists && profiles.value.length >= 100) throw new Error('本机方案已达100条，请编辑已有方案');
            const next = exists ? profiles.value.map(p => p.id === clean.id ? clean : p) : [...profiles.value, clean];
            localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
            profiles.value = next; selectedId.value = clean.id; return true;
        } catch (e) {
            error.value = /方案|参数|轴数/.test(e.message || '') ? e.message : '当前浏览器无法保存方案，请检查存储权限或空间';
            return false;
        }
    }
    return { profiles, selectedId, selectedProfile, error, save };
}
