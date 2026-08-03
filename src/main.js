/**
 * 交通网络安全韧性评估及可视化决策平台 - 主入口
 * 
 * 数据流转架构:
 *  前端 <-> API 层 <-> Spring Boot <-> MySQL <-> Python 算法
 *              ↕ (自动降级)
 *           mockData.js (本地模拟数据)
 */
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Chart } from 'chart.js';
import * as echarts from 'echarts';

window.L = L;
window.Chart = Chart;
window.echarts = echarts;

import { initMap, addAllBridgeMarkers, flyTo, getMap, toggleBaseMap, toggleOverlayByName, highlightRoadEdge, updateRoadnetFeatureProperties, refreshRoadnetLayer } from './utils/mapUtils.js';
import { initHeader } from './components/Header.js';
import { initLeftPanel } from './components/LeftPanel.js';
import { initRightPanel } from './components/RightPanel.js';
import { openHeavyVehicleModule, isHeavyVehicleActive, closeHeavyVehicleModule } from './components/HeavyVehicleModule.js';
import { openDebrisResilienceModule, isDebrisResilienceActive, closeDebrisResilienceModule } from './components/DebrisResilienceModule.js';
import { openDataManagement } from './components/DataManagementModule.js';
import { openBridgeDetail } from './components/BridgeDetailWindow.js';
import { initAdminDivisionLayer, toggleAdminDivisionLayer, showAdminDivisionLayer, hideAdminDivisionLayer } from './components/AdminDivisionLayer.js';
import api, { checkBackendFast, setBackendAvailable, resetBackendStatus } from './api/index.js';

// 全局数据缓存（从 API 获取，启动时填充）
let bridges = [];

// ============================================================
// 数据源检测与指示
// ============================================================

function updateDataSourceBadge(status, message) {
    var badge = document.getElementById('data-source-badge');
    if (!badge) return;
    badge.className = 'data-source-badge ' + status;
    badge.textContent = message;
}

/**
 * 检测后端连接状态并更新数据源指示器
 */
async function detectBackendAndShowSource() {
    updateDataSourceBadge('', '📡 检测中...');
    try {
        var online = await checkBackendFast();
        if (online) {
            updateDataSourceBadge('online', '🟢 后端 MySQL');
        } else {
            updateDataSourceBadge('offline', '🟡 本地 Mock 数据');
        }
        return online;
    } catch (e) {
        updateDataSourceBadge('offline', '🟡 本地 Mock 数据');
        return false;
    }
}

// ============================================================
// 全局 Toast 通知系统
// ============================================================
window.showToast = function (message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || 'ℹ️'}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(40px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
};

// ============================================================
// 应用初始化
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🏗️ 交通网络安全韧性评估及可视化决策平台 启动中...');

    try {
        // ==================== 第一步：检测数据源 ====================
        var backendOnline = await detectBackendAndShowSource();
        console.log('🔌 数据源: ' + (backendOnline ? '后端 MySQL' : '本地 Mock 数据'));

        // ==================== 第二步：并行加载所有数据 ====================
        console.log('📡 正在获取数据（优先调用后端 API，不可用时降级到 mock）...');

        const [bridgesData] = await Promise.all([
            api.getBridges()
        ]);

        bridges = bridgesData;

        // 保存到全局，供其他组件访问
        window.__bridges = bridges;

        console.log(`✅ 数据加载完成: ${bridges.length} 座桥梁`);

        // ==================== 第二步：初始化地图 ====================
        const map = initMap('map');
        window.__map = map;
        console.log('✅ Leaflet 地图已初始化');

        // ==================== 第三步：渲染地图要素 ====================
        addAllBridgeMarkers(bridges, (bridge) => {
            openBridgeDetail(bridge.uuid);
        });
        console.log('✅ 地图要素已渲染');

        // 3.1 初始化 ECharts 动态行政区划图层
        await initAdminDivisionLayer();
        console.log('✅ 动态行政区划图层已初始化');

        // ==================== 第四步：初始化 UI 组件 ====================
        initHeader();
        initLeftPanel();
        initRightPanel();
        console.log('✅ UI 组件已初始化');

        // ==================== 第五步：绑定交互控件 ====================
        initMapControls(map);

        // 5.1 默认激活行政区划视图
        activateDefaultLayer('admin-division');

        // 6. 绑定业务入口按钮
        initBusinessButtons();

        // 7. 绑定搜索栏
        initSearchBar();

        console.log('🎉 平台启动完成');
        showToast('🏗️ 交通网络安全韧性评估平台已就绪', 'success');

    } catch (err) {
        console.error('❌ 平台启动失败:', err);
        showToast('平台启动失败: ' + err.message, 'error');
    }
});

// ============================================================
// 地图控件 + 图层抽屉
// ============================================================
function initMapControls(map) {
    document.getElementById('btn-zoom-in')?.addEventListener('click', function () { map.zoomIn(); });
    document.getElementById('btn-zoom-out')?.addEventListener('click', function () { map.zoomOut(); });

    // 图层抽屉切换 (使用 HTML 中定义的 drawer)
    var layerBtn = document.getElementById('btn-layer-control');
    var drawer = document.getElementById('layer-drawer');
    var drawerOpen = false;

    if (layerBtn && drawer) {
        layerBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            drawerOpen = !drawerOpen;
            drawer.classList.toggle('open', drawerOpen);
            layerBtn.classList.toggle('active', drawerOpen);
        });

        document.addEventListener('click', function closeDrawer(e) {
            if (drawerOpen && !drawer.contains(e.target) && e.target !== layerBtn) {
                drawerOpen = false;
                drawer.classList.remove('open');
                layerBtn.classList.remove('active');
            }
        });
    }

    // 4种互斥底图层 + 覆盖层切换 (路网/桥隧/云图)
    var baseLayerNames = ['base', 'satellite', 'admin-division', 'bigemap-electronic', 'bigemap-satellite'];
    var overlayNames = ['road', 'bridge', 'heat'];

    // 获取所有底图项和覆盖层项
    var baseItems = document.querySelectorAll('#layer-drawer .layer-item[data-layer="base"], #layer-drawer .layer-item[data-layer="satellite"], #layer-drawer .layer-item[data-layer="admin-division"], #layer-drawer .layer-item[data-layer="bigemap-electronic"], #layer-drawer .layer-item[data-layer="bigemap-satellite"]');
    var overlayItems = document.querySelectorAll('#layer-drawer .layer-item[data-layer="road"], #layer-drawer .layer-item[data-layer="bridge"], #layer-drawer .layer-item[data-layer="heat"]');

    // 底图层 3路互斥点击
    baseItems.forEach(function (item) {
        item.addEventListener('click', function () {
            var name = item.dataset.layer;
            var toggle = item.querySelector('.layer-toggle');
            // 如果点击的是已激活项，不做任何事（保持激活）
            if (toggle.classList.contains('active')) return;

            // 1. 清除所有底图层激活状态
            baseItems.forEach(function (bi) {
                bi.querySelector('.layer-toggle').classList.remove('active');
            });
            toggle.classList.add('active');

            if (name === 'admin-division') {
                // --- 切换到行政区划 ---
                // 隐藏 Leaflet 底图（设为透明）
                var mapEl = document.getElementById('map');
                if (mapEl) mapEl.style.opacity = '0';

                // 关闭所有覆盖层（保存当前状态供恢复）
                overlayItems.forEach(function (oi) {
                    var ot = oi.querySelector('.layer-toggle');
                    var on = oi.dataset.layer;
                    if (ot.classList.contains('active')) {
                        toggleOverlayByName(on, false);
                    }
                    oi.classList.add('disabled');
                });

                // 显示行政区划
                showAdminDivisionLayer('overlay');
                showToast('已切换: 行政区划', 'info');

            } else {
                // --- 切换到暗色底图 或 卫星影像 ---
                // 隐藏行政区划
                hideAdminDivisionLayer();

                // 恢复 Leaflet 底图可见
                var mapEl = document.getElementById('map');
                if (mapEl) mapEl.style.opacity = '';

                // 重新启用覆盖层，恢复其地图状态
                overlayItems.forEach(function (oi) {
                    oi.classList.remove('disabled');
                    var ot = oi.querySelector('.layer-toggle');
                    var on = oi.dataset.layer;
                    if (ot.classList.contains('active')) {
                        toggleOverlayByName(on, true);
                    }
                });

                // 切换底图
                var baseType = name === 'base' ? 'dark' : name === 'satellite' ? 'satellite' : name === 'bigemap-electronic' ? 'bigemap-electronic' : 'bigemap-satellite';
                toggleBaseMap(baseType);
                var baseLabel = name === 'base' ? '暗色底图' : name === 'satellite' ? '卫星影像' : name === 'bigemap-electronic' ? '电子地图' : '卫星地图';
                showToast('已切换: ' + baseLabel, 'info');
            }
        });
    });

    // 覆盖层切换 (路网/桥隧/云图) — 仅在底图模式下有效
    overlayItems.forEach(function (item) {
        item.addEventListener('click', function () {
            // 检查是否在底图模式下（行政区划激活时禁止）
            var adminItem = document.querySelector('#layer-drawer .layer-item[data-layer="admin-division"] .layer-toggle');
            if (adminItem && adminItem.classList.contains('active')) {
                showToast('当前为行政区划模式，请先切换底图', 'warning');
                return;
            }

            var toggle = item.querySelector('.layer-toggle');
            toggle.classList.toggle('active');
            var name = item.dataset.layer;
            var active = toggle.classList.contains('active');

            toggleOverlayByName(name, active);
            showToast(item.querySelector('span:last-child')?.textContent + (active ? ' ✓' : ' ✗'), 'info');
        });
    });

    // 用户下拉菜单切换
    var userBtn = document.getElementById('header-user');
    var userDropdown = document.getElementById('user-dropdown');
    if (userBtn && userDropdown) {
        userBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            userBtn.classList.toggle('open');
            userDropdown.classList.toggle('open');
        });
        document.addEventListener('click', function closeDropdown(e) {
            if (!userBtn.contains(e.target)) {
                userBtn.classList.remove('open');
                userDropdown.classList.remove('open');
            }
        });
        userDropdown.querySelectorAll('.dropdown-item').forEach(function (item) {
            item.addEventListener('click', function () {
                userBtn.classList.remove('open');
                userDropdown.classList.remove('open');
                showToast(item.textContent.trim(), 'info');
            });
        });
    }

    // 底部预警表格数据填充
    initAlertTable();
}

/**
 * 激活默认图层（直接切换，不依赖click事件）
 */
function activateDefaultLayer(name) {
    var baseItems = document.querySelectorAll('#layer-drawer .layer-item[data-layer="base"], #layer-drawer .layer-item[data-layer="satellite"], #layer-drawer .layer-item[data-layer="admin-division"], #layer-drawer .layer-item[data-layer="bigemap-electronic"], #layer-drawer .layer-item[data-layer="bigemap-satellite"]');
    var overlayItems = document.querySelectorAll('#layer-drawer .layer-item[data-layer="road"], #layer-drawer .layer-item[data-layer="bridge"], #layer-drawer .layer-item[data-layer="heat"]');

    if (name === 'admin-division') {
        // 清除其他底图层激活状态
        baseItems.forEach(function (bi) {
            bi.querySelector('.layer-toggle').classList.remove('active');
        });
        // 激活行政区划
        var adminItem = document.querySelector('#layer-drawer .layer-item[data-layer="admin-division"] .layer-toggle');
        if (adminItem) adminItem.classList.add('active');

        // 隐藏 Leaflet 底图
        var mapEl = document.getElementById('map');
        if (mapEl) mapEl.style.opacity = '0';

        // 关闭并禁用覆盖层
        overlayItems.forEach(function (oi) {
            var ot = oi.querySelector('.layer-toggle');
            var on = oi.dataset.layer;
            if (ot.classList.contains('active')) {
                toggleOverlayByName(on, false);
            }
            oi.classList.add('disabled');
        });

        // 显示行政区划
        showAdminDivisionLayer('overlay');
    }
}

// ============================================================
// 底部评估日志与任务记录表格
// ============================================================
function initAlertTable() {
    var tbody = document.getElementById('alert-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    // 从 API 获取评估任务日志（自动降级到 mockData）
    api.getAssessmentTaskLogs().then(function(data) {
        var statusColorMap = {
            '已完成': '#4ADE80',
            '已归档': '#38BDF8',
            '计算中': '#FBBF24',
            '待处理': '#F87171',
            '失败': '#94A3B8',
            '限制通行': '#FBBF24'
        };

        data.forEach(function (row) {
            var tr = document.createElement('tr');
            var statusColor = statusColorMap[row.status] || '#94A3B8';
            var statusLabel = row.status || '未知';

            tr.innerHTML =
                '<td style="font-size:11px;color:var(--text-muted);font-family:monospace;">' + row.time + '</td>' +
                '<td style="font-size:11px;">' + row.task_type + '</td>' +
                '<td style="font-weight:500;font-size:11px;">' + (row.asset_name || '-') + '</td>' +
                '<td style="font-size:11px;color:var(--text-secondary);">' + (row.district_name || '-') + '</td>' +
                '<td style="text-align:center;font-size:11px;">' + (row.disaster_risk_rate !== null ? row.disaster_risk_rate + '%' : '-') + '</td>' +
                '<td style="text-align:center;font-size:11px;">' + (row.resilience_score !== null ? row.resilience_score : '-') + '</td>' +
                '<td style="text-align:center;font-size:11px;">' + (row.traffic_guarantee_rate !== null ? row.traffic_guarantee_rate + '%' : '-') + '</td>' +
                '<td><span class="status-badge" style="color:' + statusColor + ';background:' + statusColor + '15;">' + statusLabel + '</span></td>';
            tbody.appendChild(tr);
        });

        if (!data || data.length === 0) {
            var tr = document.createElement('tr');
            tr.innerHTML = '<td colspan="8" style="text-align:center;font-size:12px;color:var(--text-muted);padding:12px;">暂无评估任务日志</td>';
            tbody.appendChild(tr);
        }
    });
}


// ============================================================
// 业务入口按钮
// ============================================================
function initBusinessButtons() {
    // 重车通行安全评估
    document.getElementById('btn-heavy-vehicle')?.addEventListener('click', () => {
        if (isDebrisResilienceActive()) closeDebrisResilienceModule();
        openHeavyVehicleModule();
    });

    // 灾害韧性评估
    document.getElementById('btn-debris-resilience')?.addEventListener('click', () => {
        if (isHeavyVehicleActive()) closeHeavyVehicleModule();
        openDebrisResilienceModule();
    });

    // 数据管理
    document.getElementById('btn-data-mgmt')?.addEventListener('click', () => {
        openDataManagement();
    });
}

// ============================================================
// 搜索栏
// ============================================================
function initSearchBar() {
    const input = document.getElementById('search-input');
    const btn = document.getElementById('search-btn');

    function doSearch() {
        const query = input.value.trim();
        if (!query) {
            showToast('请输入桥梁名称或道路编码', 'warning');
            return;
        }

        // 搜索桥梁
        const bridge = bridges.find(b =>
            b.name.includes(query) || b.uuid.toLowerCase().includes(query.toLowerCase())
        );

        if (bridge) {
            var lat = bridge.lat != null ? bridge.lat : bridge.latitude;
            var lng = bridge.lng != null ? bridge.lng : bridge.longitude;
            flyTo(lat, lng, 15);
            showToast(`📍 已定位至: ${bridge.name}`, 'success');
            // 延迟打开详情
            setTimeout(() => openBridgeDetail(bridge.uuid), 800);
        } else {
            showToast(`未找到匹配: "${query}"`, 'error');
        }
    }

    btn.addEventListener('click', doSearch);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSearch();
    });
}

// ============================================================
// 数据资产管理事件监听（后台编辑后刷新首页组件）
// ============================================================
window.addEventListener('dataAssetUpdated', function (event) {
    var detail = event.detail || {};
    var type = detail.type || '';

    console.log('[数据同步] 收到 dataAssetUpdated 事件:', type, detail.action);

    switch (type) {
        case 'bridge':
            // 刷新桥梁标记
            api.getBridges().then(function (data) {
                if (data && data.length > 0) {
                    window.__bridges = data;
                    addAllBridgeMarkers(data, function (bridge) {
                        openBridgeDetail(bridge.uuid);
                    });
                }
            });
            break;

        case 'roadnet':
            // 刷新路网样式
            if (detail.action === 'update' && detail.payload && detail.payload.edge_id) {
                if (detail.payload._highlight) {
                    highlightRoadEdge(detail.payload.edge_id);
                }
                updateRoadnetFeatureProperties(detail.payload.edge_id, detail.payload);
            } else if (detail.action === 'refresh' || detail.action === 'import') {
                refreshRoadnetLayer();
            }
            break;

        case 'district':
            // 刷新左侧区县桥隧数量、右侧区县韧性指数
            initLeftPanel();
            initRightPanel();
            break;

        case 'metric':
            // 刷新右侧指标卡片
            initRightPanel();
            break;

        case 'risk':
            // 刷新左侧风险排序
            initLeftPanel();
            break;

        case 'alert':
            // 刷新底部预警表格
            initAlertTable();
            break;

        case 'module':
            // 刷新模块按钮
            initRightPanel();
            break;


        default:
            // 全量刷新
            initLeftPanel();
            initRightPanel();
            initAlertTable();
            break;
    }
});

// 将 initAlertTable 暴露到全局，供后台模块调用
window.__refreshAlertTable = initAlertTable;

// ============================================================
// 面板间协调 (防止重复打开模块)
// ============================================================
// 当打开新模块时，自动关闭其他模块的逻辑已在业务按钮中处理