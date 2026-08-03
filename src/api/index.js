/**
 * 🌐 前端 API 调用层
 *
 * 策略：优先调用后端 Spring Boot API
 *       后端不可用时自动降级到本地 mockData（保证不报错）
 *
 * 使用方法：
 *   import api from '../api/index.js';
 *   const bridges = await api.getBridges();
 */

// API 基础地址（通过 Vite proxy 转发到 Spring Boot）
const API_BASE = '/api';

// ============================================================
// 后端连接状态缓存（避免重复超时等待）
// ============================================================

var _backendAvailable = null; // null=未知, true=在线, false=离线

/**
 * 设置后端连接状态（供外部调用）
 */
export function setBackendAvailable(available) {
    _backendAvailable = available;
}

/**
 * 检查后端是否可用（带缓存）
 */
export async function checkBackendFast() {
    if (_backendAvailable !== null) return _backendAvailable;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1200);
    try {
        const resp = await fetch(API_BASE + '/bridges', {
            method: 'HEAD',
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        _backendAvailable = resp.ok;
        return _backendAvailable;
    } catch (e) {
        clearTimeout(timeoutId);
        _backendAvailable = false;
        return false;
    }
}

/**
 * 重置后端状态缓存（允许重新尝试连接 API）
 * 供手动刷新按钮调用
 */
export function resetBackendStatus() {
    _backendAvailable = null;
}

// ============================================================
// 工具函数
// ============================================================

/**
 * 通用 fetch 封装 + 自动降级
 * @param {string} url - API 路径
 * @param {object} options - fetch 选项
 * @param {function} fallback - 降级函数，返回 Promise<data>
 * @param {number} timeout - 超时时间（毫秒）
 * @returns {Promise<any>} 响应数据
 */
async function fetchWithFallback(url, options = {}, fallback = null, timeout = 3000) {
    // 如果已知后端离线，立即降级，避免超时等待
    if (_backendAvailable === false) {
        if (fallback) return fallback();
        throw new Error('后端离线');
    }

    const controller = new AbortController();
    var effectiveTimeout = timeout;

    // 如果后端状态未知（首次），使用较短超时快速探测
    if (_backendAvailable === null) {
        effectiveTimeout = Math.min(timeout, 2000);
    }

    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeout);

    try {
        const response = await fetch(API_BASE + url, {
            ...options,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // 标记后端在线
        _backendAvailable = true;

        return await response.json();
    } catch (err) {
        clearTimeout(timeoutId);

        if (err.name === 'AbortError') {
            console.warn(`[API] ${url} 请求超时(${effectiveTimeout}ms)，降级到 mock 数据`);
        } else {
            console.warn(`[API] ${url} 请求失败: ${err.message}，降级到 mock 数据`);
        }

        // 标记后端离线（超时或连接失败）
        _backendAvailable = false;

        if (fallback) {
            return fallback();
        }
        throw err;
    }
}

/**
 * 从全局 window.__mockData 读取数据
 */
function getMock(name) {
    if (window.__mockData && window.__mockData[name] !== undefined) {
        return window.__mockData[name];
    }
    console.warn('[API] __mockData 中找不到', name);
    return [];
}

// ============================================================
// API 函数
// ============================================================

const api = {
    // ==================== 基础数据 ====================

    /**
     * 获取所有桥梁（首页地图用）
     */
    async getBridges() {
        return fetchWithFallback('/bridges', {}, () => getMock('bridges'));
    },

    /**
     * 根据 UUID 获取单个桥梁
     */
    async getBridgeByUuid(uuid) {
        return fetchWithFallback(`/bridges/${uuid}`, {}, () => {
            const list = getMock('bridges') || [];
            return list.find(b => b.uuid === uuid) || null;
        });
    },

    /**
     * 获取区县韧性指数排行
     */
    async getCountyResilienceScores() {
        return fetchWithFallback('/county-resilience-scores', {}, () => {
            const metrics = getMock('districtMetrics') || [];
            return metrics.map(function(d) {
                return { name: d.district_name, score: d.resilience_score };
            });
        });
    },

    /**
     * 获取区县桥隧数量排行
     */
    async getCountyBridgeCounts() {
        return fetchWithFallback('/county-bridge-counts', {}, () => {
            var districts = getMock('districtMetrics') || [];
            return districts.map(function(d) {
                return { name: d.district_name, count: d.asset_count || 0 };
            }).sort(function(a, b) { return b.count - a.count; });
        });
    },

    /**
     * 获取韧性历史趋势
     */
    async getResilienceHistory() {
        return fetchWithFallback('/resilience-history', {}, () => {
            var data = getMock('trendData') || [];
            if (data.length > 0) {
                return {
                    labels: data.map(function(d) { return d.time_label; }),
                    connectivity: data.map(function(d) { return d.connectivity * 100; }),
                    efficiency: data.map(function(d) { return d.network_efficiency * 100; })
                };
            }
            return { labels: ['1月', '2月', '3月', '4月', '5月', '6月'], connectivity: [], efficiency: [] };
        });
    },

    /**
     * 获取历史灾害事件
     */
    async getHistoricalEvents() {
        return fetchWithFallback('/historical-events', {}, () => getMock('historicalEvents'));
    },

    // ==================== 数据资产管理 API ====================

    // ---- 桥隧资产 ----
    async getBridgeArchives() {
        return fetchWithFallback('/data-mgmt/bridges', {}, () => getMock('bridgeArchives'));
    },
    async getBridges() {
        // 兼容旧接口名称，实际等同 getBridgeArchives
        return this.getBridgeArchives();
    },
    async getTunnels() {
        // 从桥隧资产中筛选隧道
        return fetchWithFallback('/data-mgmt/tunnels', {}, function() {
            var all = getMock('bridgeArchives') || [];
            return all.filter(function(a) { return a.asset_type === 'tunnel'; });
        });
    },
    async updateBridgeArchive(uuid, data) {
        return fetchWithFallback('/data-mgmt/bridges/' + uuid, { method: 'PUT', body: JSON.stringify(data) }, () => {
            var list = getMock('bridgeArchives') || [];
            var idx = list.findIndex(function(b) { return b.uuid === uuid; });
            if (idx >= 0) {
                list[idx] = Object.assign({}, list[idx], data);
                window.__mockData.bridgeArchives = list;
                window.__mockPersist && window.__mockPersist('bridgeArchives', list);
                return list[idx];
            }
            return null;
        });
    },
    async createBridgeArchive(data) {
        return fetchWithFallback('/data-mgmt/bridges', { method: 'POST', body: JSON.stringify(data) }, () => {
            var list = getMock('bridgeArchives') || [];
            var item = Object.assign({ uuid: 'BR_' + Date.now() }, data);
            list.push(item);
            window.__mockData.bridgeArchives = list;
            window.__mockPersist && window.__mockPersist('bridgeArchives', list);
            return item;
        });
    },
    async deleteBridgeArchive(uuid) {
        return fetchWithFallback('/data-mgmt/bridges/' + uuid, { method: 'DELETE' }, () => {
            var list = getMock('bridgeArchives') || [];
            window.__mockData.bridgeArchives = list.filter(function(b) { return b.uuid !== uuid; });
            window.__mockPersist && window.__mockPersist('bridgeArchives', window.__mockData.bridgeArchives);
            return { success: true };
        });
    },

    // ---- 路网业务属性 ----
    async getRoadnetEdges() {
        return fetchWithFallback('/data-mgmt/roadnet/edges', {}, () => getMock('roadnetBusinessAttributes'));
    },
    async updateRoadnetEdge(edgeId, data) {
        return fetchWithFallback('/data-mgmt/roadnet/edges/' + edgeId, { method: 'PUT', body: JSON.stringify(data) }, () => {
            var list = getMock('roadnetBusinessAttributes') || [];
            var idx = list.findIndex(function(e) { return e.edge_id === edgeId; });
            if (idx >= 0) {
                list[idx] = Object.assign({}, list[idx], data);
                window.__mockData.roadnetBusinessAttributes = list;
                window.__mockPersist && window.__mockPersist('roadnetBusinessAttributes', list);
                return list[idx];
            }
            return null;
        });
    },
    async importRoadnetAttributes(data) {
        // data 是数组，批量导入/覆盖
        return fetchWithFallback('/data-mgmt/roadnet/import', { method: 'POST', body: JSON.stringify(data) }, () => {
            window.__mockData.roadnetBusinessAttributes = data;
            window.__mockPersist && window.__mockPersist('roadnetBusinessAttributes', data);
            return { count: data.length };
        });
    },

    // ---- 区县区域指标 ----
    async getDistrictMetrics() {
        return fetchWithFallback('/data-mgmt/districts', {}, () => getMock('districtMetrics'));
    },
    async updateDistrictMetric(districtId, data) {
        return fetchWithFallback('/data-mgmt/districts/' + districtId, { method: 'PUT', body: JSON.stringify(data) }, () => {
            var list = getMock('districtMetrics') || [];
            var idx = list.findIndex(function(d) { return d.district_id === districtId; });
            if (idx >= 0) {
                list[idx] = Object.assign({}, list[idx], data);
                window.__mockData.districtMetrics = list;
                window.__mockPersist && window.__mockPersist('districtMetrics', list);
                return list[idx];
            }
            return null;
        });
    },

    // ---- 首页指标 ----
    async getDashboardMetrics() {
        return fetchWithFallback('/data-mgmt/dashboard-metrics', {}, () => getMock('dashboardMetrics'));
    },
    async updateDashboardMetric(metricId, data) {
        return fetchWithFallback('/data-mgmt/dashboard-metrics/' + metricId, { method: 'PUT', body: JSON.stringify(data) }, () => {
            var list = getMock('dashboardMetrics') || [];
            var idx = list.findIndex(function(m) { return m.metric_id === metricId; });
            if (idx >= 0) {
                list[idx] = Object.assign({}, list[idx], data);
                window.__mockData.dashboardMetrics = list;
                window.__mockPersist && window.__mockPersist('dashboardMetrics', list);
                return list[idx];
            }
            return null;
        });
    },

    // ---- 评估任务日志 ----
    async getAssessmentTaskLogs() {
        return fetchWithFallback('/tasks/logs', {}, () => getMock('assessmentTaskLogs'));
    },

    // ---- 平台任务与评估日志 ----
    async getPlatformTaskLogs() {
        return fetchWithFallback('/platform/task-logs', {}, () => getMock('platformTaskLogs'));
    },

    // ---- 风险排序 ----
    async getRiskRankings() {
        return fetchWithFallback('/data-mgmt/risk-rankings', {}, () => getMock('riskRankingItems'));
    },
    async updateRiskRanking(rankId, data) {
        return fetchWithFallback('/data-mgmt/risk-rankings/' + rankId, { method: 'PUT', body: JSON.stringify(data) }, () => {
            var list = getMock('riskRankingItems') || [];
            var idx = list.findIndex(function(r) { return r.rank_id === rankId; });
            if (idx >= 0) {
                list[idx] = Object.assign({}, list[idx], data);
                window.__mockData.riskRankingItems = list;
                window.__mockPersist && window.__mockPersist('riskRankingItems', list);
                return list[idx];
            }
            return null;
        });
    },
    async createRiskRanking(data) {
        return fetchWithFallback('/data-mgmt/risk-rankings', { method: 'POST', body: JSON.stringify(data) }, () => {
            var list = getMock('riskRankingItems') || [];
            var item = Object.assign({ rank_id: 'rr_' + Date.now() }, data);
            list.push(item);
            window.__mockData.riskRankingItems = list;
            window.__mockPersist && window.__mockPersist('riskRankingItems', list);
            return item;
        });
    },
    async deleteRiskRanking(rankId) {
        return fetchWithFallback('/data-mgmt/risk-rankings/' + rankId, { method: 'DELETE' }, () => {
            var list = getMock('riskRankingItems') || [];
            window.__mockData.riskRankingItems = list.filter(function(r) { return r.rank_id !== rankId; });
            window.__mockPersist && window.__mockPersist('riskRankingItems', window.__mockData.riskRankingItems);
            return { success: true };
        });
    },

    // ---- 趋势图 ----
    async getTrendData() {
        return fetchWithFallback('/data-mgmt/trends', {}, () => getMock('trendData'));
    },
    async updateTrendData(timeLabel, data) {
        return fetchWithFallback('/data-mgmt/trends/' + encodeURIComponent(timeLabel), { method: 'PUT', body: JSON.stringify(data) }, () => {
            var list = getMock('trendData') || [];
            var idx = list.findIndex(function(t) { return t.time_label === timeLabel; });
            if (idx >= 0) {
                list[idx] = Object.assign({}, list[idx], data);
                window.__mockData.trendData = list;
                window.__mockPersist && window.__mockPersist('trendData', list);
                return list[idx];
            }
            return null;
        });
    },
    async createTrendData(data) {
        return fetchWithFallback('/data-mgmt/trends', { method: 'POST', body: JSON.stringify(data) }, () => {
            var list = getMock('trendData') || [];
            list.push(data);
            window.__mockData.trendData = list;
            window.__mockPersist && window.__mockPersist('trendData', list);
            return data;
        });
    },
    async deleteTrendData(timeLabel) {
        return fetchWithFallback('/data-mgmt/trends/' + encodeURIComponent(timeLabel), { method: 'DELETE' }, () => {
            var list = getMock('trendData') || [];
            window.__mockData.trendData = list.filter(function(t) { return t.time_label !== timeLabel; });
            window.__mockPersist && window.__mockPersist('trendData', window.__mockData.trendData);
            return { success: true };
        });
    },

    // ---- 预警记录 ----
    async getAlertRecords() {
        return fetchWithFallback('/data-mgmt/alerts', {}, () => getMock('alertRecords'));
    },
    async createAlertRecord(data) {
        return fetchWithFallback('/data-mgmt/alerts', { method: 'POST', body: JSON.stringify(data) }, () => {
            var list = getMock('alertRecords') || [];
            var item = Object.assign({ alert_id: 'ALT_' + Date.now(), created_at: new Date().toISOString(), updated_at: null }, data);
            list.unshift(item);
            window.__mockData.alertRecords = list;
            window.__mockPersist && window.__mockPersist('alertRecords', list);
            return item;
        });
    },
    async updateAlertRecord(alertId, data) {
        return fetchWithFallback('/data-mgmt/alerts/' + alertId, { method: 'PUT', body: JSON.stringify(data) }, () => {
            var list = getMock('alertRecords') || [];
            var idx = list.findIndex(function(a) { return a.alert_id === alertId; });
            if (idx >= 0) {
                list[idx] = Object.assign({}, list[idx], data, { updated_at: new Date().toISOString() });
                window.__mockData.alertRecords = list;
                window.__mockPersist && window.__mockPersist('alertRecords', list);
                return list[idx];
            }
            return null;
        });
    },
    async deleteAlertRecord(alertId) {
        return fetchWithFallback('/data-mgmt/alerts/' + alertId, { method: 'DELETE' }, () => {
            var list = getMock('alertRecords') || [];
            window.__mockData.alertRecords = list.filter(function(a) { return a.alert_id !== alertId; });
            window.__mockPersist && window.__mockPersist('alertRecords', window.__mockData.alertRecords);
            return { success: true };
        });
    },

    // ---- 模块配置 ----
    async getModuleConfigs() {
        return fetchWithFallback('/data-mgmt/module-configs', {}, () => getMock('moduleConfigs'));
    },
    async updateModuleConfig(moduleId, data) {
        return fetchWithFallback('/data-mgmt/module-configs/' + moduleId, { method: 'PUT', body: JSON.stringify(data) }, () => {
            var list = getMock('moduleConfigs') || [];
            var idx = list.findIndex(function(m) { return m.module_id === moduleId; });
            if (idx >= 0) {
                list[idx] = Object.assign({}, list[idx], data);
                window.__mockData.moduleConfigs = list;
                window.__mockPersist && window.__mockPersist('moduleConfigs', list);
                return list[idx];
            }
            return null;
        });
    },

    // ---- 仿真存档 ----
    async getSimulationArchives() {
        return fetchWithFallback('/data-mgmt/simulation-archives', {}, () => getMock('simulationArchiveData'));
    },

    // ==================== 计算服务 ====================

    /**
     * 重车路径安全规避计算
     */
    async calculateRoute(params) {
        return fetchWithFallback('/route/calculate', {
            method: 'POST',
            body: JSON.stringify(params),
        }, () => null, 5000);
    },

    /**
     * 多灾种仿真解算
     */
    async simulateDisaster(params) {
        return fetchWithFallback('/disaster/simulate', {
            method: 'POST',
            body: JSON.stringify(params),
        }, () => null, 5000);
    },

    // ==================== 重车通行安全评估 API ====================

    /**
     * 获取车辆模板列表
     */
    async getVehicleProfiles() {
        return fetchWithFallback('/heavy-vehicle/vehicle-profiles', {}, () => getMock('vehicleProfiles'));
    },

    /**
     * 保存车辆模板
     */
    async saveVehicleProfile(profile) {
        return fetchWithFallback('/heavy-vehicle/vehicle-profiles', { method: 'POST', body: JSON.stringify(profile) }, () => {
            var list = getMock('vehicleProfiles') || [];
            var idx = list.findIndex(function(v) { return v.vehicleId === profile.vehicleId; });
            if (idx >= 0) { list[idx] = profile; }
            else { list.push(profile); }
            window.__mockData.vehicleProfiles = list;
            window.__mockPersist && window.__mockPersist('vehicleProfiles', list);
            return profile;
        });
    },

    /**
     * 获取沿途桥隧模板
     */
    async getRouteFacilityTemplates() {
        return fetchWithFallback('/heavy-vehicle/route-facility-templates', {}, () => getMock('routeFacilityTemplates'));
    },

    /**
     * 从路网搜索桥隧
     */
    async searchRoadnetFacilities(keyword, filters) {
        return fetchWithFallback('/heavy-vehicle/search-roadnet', { method: 'POST', body: JSON.stringify({ keyword: keyword, filters: filters || {} }) }, function() {
            var edges = getMock('roadnetBusinessAttributes') || [];
            if (!keyword && !filters) return edges;
            keyword = (keyword || '').toLowerCase();
            return edges.filter(function(e) {
                var name = (e.name || '').toLowerCase();
                var ref = (e.ref || '').toLowerCase();
                var district = (e.district_name || '').toLowerCase();
                return name.indexOf(keyword) >= 0 || ref.indexOf(keyword) >= 0 || district.indexOf(keyword) >= 0;
            });
        });
    },

    /**
     * 保存重车评估方案
     */
    async saveHeavyVehicleAssessmentScheme(scheme) {
        return fetchWithFallback('/heavy-vehicle/schemes', { method: 'POST', body: JSON.stringify(scheme) }, function() {
            var list = getMock('heavyVehicleAssessmentSchemes') || [];
            list.unshift(scheme);
            window.__mockData.heavyVehicleAssessmentSchemes = list;
            window.__mockPersist && window.__mockPersist('heavyVehicleAssessmentSchemes', list);
            return scheme;
        });
    },

    /**
     * 获取历史评估方案
     */
    async getHeavyVehicleAssessmentHistory() {
        return fetchWithFallback('/heavy-vehicle/schemes', {}, () => getMock('heavyVehicleAssessmentSchemes'));
    },

    /**
     * 获取桥梁隧道资产（用于补充限重/限高/限宽）
     */
    async getBridgeTunnelAssets() {
        return fetchWithFallback('/heavy-vehicle/bridge-tunnel-assets', {}, () => {
            var bridgeArchives = getMock('bridgeArchives') || [];
            var roadEdges = getMock('roadnetBusinessAttributes') || [];
            // 合并桥隧资产
            var assets = [];
            bridgeArchives.forEach(function(b) {
                assets.push({
                    facilityId: 'asset_' + (b.uuid || b.id || assets.length),
                    facilityType: 'bridge',
                    name: b.name || b.bridge_name || '未知桥梁',
                    roadRef: b.ref || b.road_ref || '',
                    districtName: b.district_name || '',
                    limitWeightT: b.limit_weight_t || b.limitWeightT || null,
                    limitHeightM: b.limit_height_m || b.limitHeightM || null,
                    limitWidthM: b.limit_width_m || b.limitWidthM || null,
                    lengthM: b.length_m || b.lengthM || null,
                    source: 'asset_library'
                });
            });
            return assets;
        });
    },
};

export default api;