/**
 * 交通网络安全韧性评估及可视化决策平台 - 主入口
 * 
 * HOME-2: 首页总览与空间态势大屏重构
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

import { initMap, addAllBridgeMarkers, flyTo, getMap, toggleBaseMap, toggleOverlayByName, highlightRoadEdge, flyToRoadEdge, updateRoadnetFeatureProperties, refreshRoadnetLayer, loadFormalAssetLayer, clearFormalAssetLayer } from './utils/mapUtils.js';
import { initHeader } from './components/Header.js';
import { initLeftPanel, refreshLeftPanel } from './components/LeftPanel.js';
import { initRightPanel, refreshRightPanel } from './components/RightPanel.js';
import { openHeavyVehicleModule, isHeavyVehicleActive, closeHeavyVehicleModule } from './components/HeavyVehicleModule.js';
import { openHeavyVehicleAssessmentModule, isHeavyVehicleAssessmentActive, closeHeavyVehicleAssessmentModule } from './components/HeavyVehicleAssessmentModule.js';
import { openDebrisResilienceModule, isDebrisResilienceActive, closeDebrisResilienceModule } from './components/DebrisResilienceModule.js';
import { openDisasterRiskAssessmentModule, isDisasterRiskAssessmentActive, closeDisasterRiskAssessmentModule } from './components/DisasterRiskAssessmentModule.js';
import { openRoadNetworkResilienceModule, isRoadNetworkResilienceActive, closeRoadNetworkResilienceModule } from './components/RoadNetworkResilienceModule.js';
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
            updateDataSourceBadge('offline', '🟡 后端数据服务离线');
        }
        return online;
    } catch (e) {
        updateDataSourceBadge('offline', '🟡 后端数据服务离线');
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
// HOME-2: 首页数据刷新函数
// ============================================================
window.refreshDashboardData = function() {
    console.log('[Dashboard] 刷新首页数据...');
    refreshLeftPanel();
    refreshRightPanel();
    // 刷新地图上的正式Asset图层
    loadFormalAssetLayer();
    // 刷新行政区划图层
    initAdminDivisionLayer();
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
        // HOME-2B: 不再使用 Legacy Marker，仅使用正式资产图层
        // addAllBridgeMarkers(bridges, (bridge) => {
        //     openBridgeDetail(bridge.uuid);
        // });
        console.log('✅ 地图要素已渲染 (Legacy Marker 已禁用)');

        // 3.1 初始化 ECharts 动态行政区划图层
        await initAdminDivisionLayer();
        console.log('✅ 动态行政区划图层已初始化');

        // 3.2 加载正式资产图层 (HOME-2B: 首页默认显示)
        await loadFormalAssetLayer(map);
        console.log('✅ 正式资产图层已加载');

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

        // 8. 初始化任务日志折叠Panel
        initTaskLogPanel();

        // 9. 窗口resize处理
        window.addEventListener('resize', function() {
            var map = getMap();
            if (map) {
                map.invalidateSize();
            }
        });

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
// HOME-2: 任务日志折叠Panel
// ============================================================
function initTaskLogPanel() {
    var header = document.getElementById('task-panel-header');
    var content = document.getElementById('task-panel-content');
    var panel = document.getElementById('bottom-task-panel');
    var toggle = document.getElementById('task-panel-toggle');
    
    if (!header || !content || !toggle) return;

    // 展开高度
    var EXPANDED_H = 220;

    function setTaskPanelHeight(h) {
        document.documentElement.style.setProperty('--task-panel-h', h + 'px');
    }

    // 默认展开
    content.style.display = 'block';
    toggle.textContent = '▼';
    setTaskPanelHeight(EXPANDED_H);
    if (panel) {
        panel.style.height = EXPANDED_H + 'px';
    }
    var isOpen = true;

    header.addEventListener('click', function() {
        isOpen = !isOpen;
        content.style.display = isOpen ? 'block' : 'none';
        toggle.textContent = isOpen ? '▼' : '▲';
        
        // 更新CSS变量让中间地图区域和搜索栏/地图按钮同步调整
        // --task-panel-h 表示面板总高度（包含标题栏），收起时36px，展开时EXPANDED_H
        var targetH = isOpen ? EXPANDED_H : 36;
        setTaskPanelHeight(targetH);
        if (panel) {
            panel.style.height = targetH + 'px';
        }

        // 展开/收起后调整地图尺寸
        var map = getMap();
        if (map) {
            setTimeout(function() {
                map.invalidateSize();
            }, 350);
        }
    });

    // 初始化Tab切换
    var tabBtns = document.querySelectorAll('[data-task-tab]');
    tabBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            tabBtns.forEach(function(b) { b.classList.remove('active'); });
            btn.classList.add('active');
            // 当前阶段所有Tab默认显示"暂无任务"
            var listContent = document.getElementById('task-list-content');
            if (listContent) {
                listContent.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px;">暂无任务</div>';
            }
        });
    });
}

// ============================================================
// 底部评估日志与任务记录表格 (旧版保留但不再使用)
// ============================================================
function initAlertTable() {
    // HOME-2: 不再使用旧的预设任务表格
    // 保留函数以兼容旧代码调用
    console.log('[AlertTable] HOME-2: 任务日志已迁移到折叠Panel');
}


// ============================================================
// 业务入口按钮
// ============================================================
function initBusinessButtons() {
    // 重车通行安全评估
    document.getElementById('btn-heavy-vehicle')?.addEventListener('click', () => {
        if (isDebrisResilienceActive()) closeDebrisResilienceModule();
        if (isHeavyVehicleActive()) closeHeavyVehicleModule();
        openHeavyVehicleAssessmentModule();
    });

    // 灾害韧性评估
    document.getElementById('btn-debris-resilience')?.addEventListener('click', () => {
        if (isHeavyVehicleActive()) closeHeavyVehicleModule();
        if (isHeavyVehicleAssessmentActive()) closeHeavyVehicleAssessmentModule();
        openDisasterRiskAssessmentModule();
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

    // HOME-2: 统一使用 refreshDashboardData
    window.refreshDashboardData();
});

// ============================================================
// V1.3D: 路网 Edge 联动事件
// ============================================================
window.addEventListener('road-edge-selected', function (event) {
    var detail = event.detail || {};
    var edgeId = detail.edgeId;
    var source = detail.source || 'unknown';

    console.log('[路网联动] road-edge-selected:', edgeId, '来源:', source);

    if (!edgeId) return;

    // 地图高亮 + 定位
    if (typeof highlightRoadEdge === 'function') {
        highlightRoadEdge(String(edgeId));
    }
    if (typeof flyToRoadEdge === 'function') {
        flyToRoadEdge(String(edgeId));
    }
});

// ============================================================
// V1.4E: 正式资产联动事件
// ============================================================
window.addEventListener('asset-selected', function (event) {
    var detail = event.detail || {};
    var assetId = detail.assetId;
    var source = detail.source || 'unknown';
    var lat = detail.lat;
    var lng = detail.lng;

    console.log('[资产联动] asset-selected:', assetId, '来源:', source);

    if (!assetId) return;

    // 如果有坐标，飞行到该位置
    if (lat && lng && typeof flyTo === 'function') {
        flyTo(lat, lng, 12);
    }

    // 如果来自 DataManagement，打开资产详情窗口
    if (source === 'data-management') {
        import('./components/AssetDetailWindow.js').then(module => {
            module.openAssetDetail(assetId);
        }).catch(err => {
            console.error('[资产联动] 加载详情窗口失败:', err);
        });
    }
});

// 将 initAlertTable 暴露到全局，供后台模块调用
window.__refreshAlertTable = initAlertTable;

// ============================================================
// 面板间协调 (防止重复打开模块)
// ============================================================
// 当打开新模块时，自动关闭其他模块的逻辑已在业务按钮中处理