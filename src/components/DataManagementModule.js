/**
 * 🗄️ 后台数据资产管理模块（全功能版）
 *
 * 8 个 Tab：
 *   1. 数据总览
 *   2. 桥隧资产库
 *   3. 高速/快速路网库
 *   4. 区县区域指标库
 *   5. 首页指标配置
 *   6. 风险排序配置
 *   7. 预警任务流水
 *   8. 历史仿真成果归档
 *
 * 数据来源：API 层（降级到 window.__mockData + localStorage）
 * 编辑后通过 CustomEvent 通知首页组件刷新
 */
import api, { checkBackendFast, setBackendAvailable, resetBackendStatus } from '../api/index.js';
import { saveMockData } from '../data/mockData.js';

var currentEditItem = null;
var currentEditTab = null;
var loadedTabs = {};      // 记录已加载的 Tab
var backendOnline = null;  // 后端连接状态缓存

export function openDataManagement() {
    showToast('🗄️ 正在打开后台数据资产管理...', 'info');

    // 临时禁用底层图层交互，防止遮挡弹窗
    document.body.classList.add('dm-modal-open');

    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'data-mgmt-overlay';

    overlay.innerHTML = buildDMLayout();
    document.getElementById('modal-container').appendChild(overlay);

    // 重置已加载状态
    loadedTabs = {};
    backendOnline = null;

    // ---------- 关闭 ----------
    function closeModal() {
        overlay.remove();
        document.body.classList.remove('dm-modal-open');
        showToast('已关闭后台数据资产管理', 'info');
    }
    document.getElementById('dm-close-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) { closeModal(); }
    });

    // ---------- 手动刷新按钮：重置后端缓存 + 重新加载当前 Tab ----------
    document.getElementById('dm-refresh-btn').addEventListener('click', function () {
        resetBackendStatus();  // 清除 _backendAvailable 缓存，允许重新尝试 API
        var activeTab = document.querySelector('#dm-tabs .tab-btn.active');
        if (activeTab) {
            var tabId = activeTab.dataset.tab;
            loadedTabs[tabId] = false;  // 强制重新加载
            var badge = document.getElementById('dm-backend-status');
            if (badge) {
                badge.innerHTML = '⏳ 重新检测中...';
                badge.style.color = 'var(--text-muted)';
            }
            // 先检测后端，再加载数据
            checkBackendStatus().then(function (online) {
                backendOnline = online;
                updateBackendBadge(online);
                loadedTabs[tabId] = true;
                loadTabData(tabId);
                showToast(online ? '✅ 已切换为后端数据库模式' : 'ℹ️ 后端仍不可用，继续使用本地数据', 'info');
            });
        }
    });

    // ---------- Tab 切换（懒加载） ----------
    document.querySelectorAll('#dm-tabs .tab-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
            document.querySelectorAll('#dm-tabs .tab-btn').forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            document.querySelectorAll('.dm-tab-content').forEach(function (tc) { tc.style.display = 'none'; });
            var tabId = btn.dataset.tab;
            document.getElementById('dm-tab-' + tabId).style.display = 'flex';

            if (!loadedTabs[tabId]) {
                loadedTabs[tabId] = true;
                loadTabData(tabId);
            }
        });
    });

    // ---------- 先检测后端状态，再加载默认 Tab（数据总览） ----------
    document.getElementById('dm-tab-overview').style.display = 'flex';
    loadedTabs['overview'] = true;

    checkBackendStatus().then(function (online) {
        backendOnline = online;
        updateBackendBadge(online);
        // ★ 关键修复：等待后端状态确定后再加载数据
        // 如果后端离线，API 调用会立即降级到 mock 数据（0 等待）
        loadOverviewTab();
    });

    // 搜索/筛选事件
    bindSearchEvents();
}

/**
 * 根据 Tab ID 加载对应数据（懒加载）
 */
function loadTabData(tabId) {
    switch (tabId) {
        case 'bridge':
            loadBridgeTab();
            break;
        case 'roadnet':
            loadRoadnetTab();
            break;
        case 'district':
            loadDistrictTab();
            break;
        case 'metric':
            loadMetricTab();
            break;
        case 'risk':
            loadRiskTab();
            break;
        case 'alert':
            loadAlertTab();
            break;
        case 'sim':
            loadSimTab();
            break;
        default:
            break;
    }
}

// ============================================================
// 构建页面布局
// ============================================================
function buildDMLayout() {
    return '<div class="modal-content glass-panel" style="width:96%;max-width:1500px;height:92vh;border-radius:12px 12px 0 0;align-self:flex-end;margin-bottom:0;display:flex;flex-direction:column;">'
        + '<div class="modal-header" style="flex-shrink:0;">'
        + '  <h2>🗄️ 后台数据资产管理</h2>'
        + '  <div style="display:flex;gap:8px;align-items:center;">'
        + '    <span id="dm-backend-status" style="font-size:11px;padding:2px 8px;border-radius:4px;background:rgba(255,255,255,0.05);">⏳ 检测中...</span>'
        + '    <button class="btn-secondary" style="padding:4px 10px;font-size:11px;" id="dm-refresh-btn">🔃 刷新</button>'
        + '    <button class="btn-secondary" style="padding:4px 10px;font-size:11px;" onclick="window.__dmResetAll()">🔄 恢复默认</button>'
        + '    <button class="modal-close-btn" id="dm-close-btn">✕</button>'
        + '  </div>'
        + '</div>'
        + '<div class="modal-body" style="padding:12px 20px;flex:1;overflow:hidden;display:flex;flex-direction:column;">'
        + '  <div class="tabs" id="dm-tabs" style="flex-shrink:0;">'
        + '    <button class="tab-btn active" data-tab="overview">📊 数据总览</button>'
        + '    <button class="tab-btn" data-tab="bridge">🌉 桥隧资产库</button>'
        + '    <button class="tab-btn" data-tab="roadnet">🛣️ 高速/快速路网库</button>'
        + '    <button class="tab-btn" data-tab="district">🏘️ 区县区域指标库</button>'
        + '    <button class="tab-btn" data-tab="metric">📈 首页指标配置</button>'
        + '    <button class="tab-btn" data-tab="risk">⚠️ 风险排序配置</button>'
        + '    <button class="tab-btn" data-tab="alert">🔔 预警任务流水</button>'
        + '    <button class="tab-btn" data-tab="sim">📁 历史仿真成果归档</button>'
        + '  </div>'

        // ========= Tab 1: 数据总览 =========
        + buildOverviewTab()

        // ========= Tab 2: 桥隧资产库 =========
        + buildBridgeTab()

        // ========= Tab 3: 高速/快速路网库 =========
        + buildRoadnetTab()

        // ========= Tab 4: 区县区域指标库 =========
        + buildDistrictTab()

        // ========= Tab 5: 首页指标配置 =========
        + buildMetricTab()

        // ========= Tab 6: 风险排序配置 =========
        + buildRiskTab()

        // ========= Tab 7: 预警任务流水 =========
        + buildAlertTab()

        // ========= Tab 8: 历史仿真成果归档 =========
        + buildSimTab()

        + '</div></div>';
}

// ==================== Tab 构建函数 ====================

function buildOverviewTab() {
    return '<div class="dm-tab-content" id="dm-tab-overview" style="display:none;flex:1;overflow:hidden;flex-direction:column;"><div style="flex:1;overflow-y:auto;">'
        + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:16px;" id="dm-overview-cards">'
        + '  <div class="stat-card"><div style="font-size:28px;font-weight:700;color:#4ADE80;" id="ov-bridge-count">-</div><div style="font-size:11px;color:var(--text-muted);">桥隧资产</div></div>'
        + '  <div class="stat-card"><div style="font-size:28px;font-weight:700;color:#38BDF8;" id="ov-road-count">-</div><div style="font-size:11px;color:var(--text-muted);">道路边数</div></div>'
        + '  <div class="stat-card"><div style="font-size:28px;font-weight:700;color:#FBBF24;" id="ov-district-count">-</div><div style="font-size:11px;color:var(--text-muted);">区县数</div></div>'
        + '  <div class="stat-card"><div style="font-size:28px;font-weight:700;color:#F87171;" id="ov-alert-count">-</div><div style="font-size:11px;color:var(--text-muted);">预警数量</div></div>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">'
        + '  <div class="stat-card"><div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">📋 最近更新记录</div>'
        + '    <div id="ov-recent-log" style="font-size:11px;color:var(--text-muted);line-height:1.8;">加载中...</div></div>'
        + '  <div class="stat-card"><div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">💡 操作提示</div>'
        + '    <div style="font-size:11px;color:var(--text-muted);line-height:1.8;">'
        + '      · 编辑数据后自动保存到 localStorage<br>'
        + '      · 修改后首页组件实时同步<br>'
        + '      · 支持导入/导出 JSON<br>'
        + '      · 点击"恢复默认"重置所有数据'
        + '    </div></div>'
        + '</div></div></div>';
}

function buildBridgeTab() {
    return '<div class="dm-tab-content" id="dm-tab-bridge" style="display:none;flex:1;overflow:hidden;flex-direction:column;">'
        + '<div class="table-toolbar" style="flex-shrink:0;">'
        + '  <div class="table-toolbar-left">'
        + '    <input type="text" class="table-search-input" id="dm-bridge-search" placeholder="搜索名称/区县/UUID..." style="width:180px;">'
        + '    <select class="table-filter-select" id="dm-bridge-filter-risk"><option value="">全部风险</option><option value="low">低风险</option><option value="medium">中风险</option><option value="high">高风险</option><option value="extreme">极高风险</option></select>'
        + '    <select class="table-filter-select" id="dm-bridge-filter-pass"><option value="">全部通行</option><option value="passable">可通行</option><option value="restricted">受限</option><option value="forbidden">禁止</option></select>'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmFilterBridge()">🔍 筛选</button>'
        + '  </div>'
        + '  <div class="table-toolbar-right">'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmExportJSON(\'bridgeArchives\')">📤 导出 JSON</button>'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmImportJSON(\'bridgeArchives\')">📥 导入 JSON</button>'
        + '    <button class="btn-primary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmCreateBridge()">＋ 新建</button>'
        + '  </div>'
        + '</div>'
        + '<div style="flex:1;overflow-y:auto;position:relative;"><table class="data-table" style="width:100%;font-size:11px;"><thead><tr>'
        + '<th>UUID</th><th>名称</th><th>类型</th><th>区县</th><th>路线</th><th>结构</th><th>跨径</th><th>风险等级</th><th>健康分</th><th>通行状态</th><th>监测状态</th><th>操作</th>'
        + '</tr></thead><tbody id="dm-bridge-tbody"><tr><td colspan="12" style="text-align:center;color:var(--text-muted);">⏳ 加载中...</td></tr></tbody></table></div></div>';
}

function buildRoadnetTab() {
    return '<div class="dm-tab-content" id="dm-tab-roadnet" style="display:none;flex:1;overflow:hidden;flex-direction:column;">'
        + '<div class="table-toolbar" style="flex-shrink:0;">'
        + '  <div class="table-toolbar-left">'
        + '    <input type="text" class="table-search-input" id="dm-roadnet-search" placeholder="搜索道路名称/编号..." style="width:180px;">'
        + '    <select class="table-filter-select" id="dm-roadnet-filter-district"><option value="">全部区县</option></select>'
        + '    <select class="table-filter-select" id="dm-roadnet-filter-highway"><option value="">全部等级</option><option value="motorway">高速公路</option><option value="motorway_link">高速匝道</option><option value="trunk">快速路</option><option value="trunk_link">快速路匝道</option></select>'
        + '    <select class="table-filter-select" id="dm-roadnet-filter-status"><option value="">全部状态</option><option value="normal">正常</option><option value="restricted">受限</option><option value="interrupted">中断</option><option value="closed">关闭</option></select>'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmFilterRoadnet()">🔍 筛选</button>'
        + '  </div>'
        + '  <div class="table-toolbar-right">'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmExportRoadnet()">📤 导出 CSV</button>'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmImportRoadnet()">📥 导入 JSON</button>'
        + '  </div>'
        + '</div>'
        + '<div style="display:flex;gap:16px;flex:1;overflow:hidden;">'
        + '  <div style="width:200px;flex-shrink:0;overflow-y:auto;" id="dm-roadnet-stats">'
        + '    <div style="font-size:11px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">📊 按等级统计</div>'
        + '    <div id="dm-roadnet-stat-list"></div>'
        + '    <div style="margin-top:12px;font-size:11px;"><span style="color:var(--text-muted);">总计:</span> <span id="dm-roadnet-total" style="font-weight:700;color:#38BDF8;">0</span> 条</div>'
        + '  </div>'
        + '  <div style="flex:1;overflow-y:auto;"><table class="data-table" style="width:100%;font-size:10px;"><thead><tr>'
        + '<th>edge_id</th><th>道路名称</th><th>编号</th><th>等级</th><th>区县</th><th>长度(km)</th><th>限速</th><th>车道</th><th>状态</th><th>风险等级</th><th>限重(t)</th><th>操作</th>'
        + '</tr></thead><tbody id="dm-roadnet-tbody"><tr><td colspan="12" style="text-align:center;color:var(--text-muted);">⏳ 请先导入路网属性数据...</td></tr></tbody></table></div>'
        + '</div></div>';
}

function buildDistrictTab() {
    return '<div class="dm-tab-content" id="dm-tab-district" style="display:none;flex:1;overflow:hidden;flex-direction:column;">'
        + '<div class="table-toolbar" style="flex-shrink:0;">'
        + '  <div class="table-toolbar-left">'
        + '    <input type="text" class="table-search-input" id="dm-district-search" placeholder="搜索区县名称..." style="width:180px;">'
        + '    <select class="table-filter-select" id="dm-district-filter-risk"><option value="">全部风险</option><option value="low">低风险</option><option value="medium">中风险</option><option value="high">高风险</option><option value="extreme">极高</option></select>'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmFilterDistrict()">🔍 筛选</button>'
        + '  </div>'
        + '  <div class="table-toolbar-right">'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmExportJSON(\'districtMetrics\')">📤 导出 JSON</button>'
        + '  </div>'
        + '</div>'
        + '<div style="flex:1;overflow-y:auto;"><table class="data-table" style="width:100%;font-size:11px;"><thead><tr>'
        + '<th>区县</th><th>资产总数</th><th>桥梁数</th><th>隧道数</th><th>高速里程</th><th>快速路里程</th><th>韧性指数</th><th>结构安全</th><th>通行保障</th><th>监测覆盖率</th><th>风险等级</th><th>操作</th>'
        + '</tr></thead><tbody id="dm-district-tbody"><tr><td colspan="12" style="text-align:center;color:var(--text-muted);">⏳ 加载中...</td></tr></tbody></table></div></div>';
}

function buildMetricTab() {
    return '<div class="dm-tab-content" id="dm-tab-metric" style="display:none;flex:1;overflow:hidden;flex-direction:column;">'
        + '<div class="table-toolbar" style="flex-shrink:0;">'
        + '  <div class="table-toolbar-left">'
        + '    <input type="text" class="table-search-input" id="dm-metric-search" placeholder="搜索指标名称..." style="width:180px;">'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmFilterMetric()">🔍 搜索</button>'
        + '  </div>'
        + '  <div class="table-toolbar-right">'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmExportJSON(\'dashboardMetrics\')">📤 导出 JSON</button>'
        + '    <button class="btn-primary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmResetMetrics()">🔄 恢复默认</button>'
        + '  </div>'
        + '</div>'
        + '<div style="flex:1;overflow-y:auto;"><table class="data-table" style="width:100%;font-size:11px;"><thead><tr>'
        + '<th>指标名称</th><th>分组</th><th>数值</th><th>单位</th><th>趋势</th><th>状态</th><th>排序</th><th>显示</th><th>操作</th>'
        + '</tr></thead><tbody id="dm-metric-tbody"><tr><td colspan="9" style="text-align:center;color:var(--text-muted);">⏳ 加载中...</td></tr></tbody></table></div></div>';
}

function buildRiskTab() {
    return '<div class="dm-tab-content" id="dm-tab-risk" style="display:none;flex:1;overflow:hidden;flex-direction:column;">'
        + '<div class="table-toolbar" style="flex-shrink:0;">'
        + '  <div class="table-toolbar-left">'
        + '    <input type="text" class="table-search-input" id="dm-risk-search" placeholder="搜索资产名称..." style="width:180px;">'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmFilterRisk()">🔍 搜索</button>'
        + '  </div>'
        + '  <div class="table-toolbar-right">'
        + '    <button class="btn-primary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmCreateRisk()">＋ 新建</button>'
        + '  </div>'
        + '</div>'
        + '<div style="flex:1;overflow-y:auto;"><table class="data-table" style="width:100%;font-size:11px;"><thead><tr>'
        + '<th>排序</th><th>资产名称</th><th>区县</th><th>风险评分</th><th>风险等级</th><th>风险类型</th><th>标签</th><th>显示</th><th>操作</th>'
        + '</tr></thead><tbody id="dm-risk-tbody"><tr><td colspan="9" style="text-align:center;color:var(--text-muted);">⏳ 加载中...</td></tr></tbody></table></div></div>';
}

function buildAlertTab() {
    return '<div class="dm-tab-content" id="dm-tab-alert" style="display:none;flex:1;overflow:hidden;flex-direction:column;">'
        + '<div class="table-toolbar" style="flex-shrink:0;">'
        + '  <div class="table-toolbar-left">'
        + '    <input type="text" class="table-search-input" id="dm-alert-search" placeholder="搜索资产名称..." style="width:150px;">'
        + '    <select class="table-filter-select" id="dm-alert-filter-level"><option value="">全部等级</option><option value="I级">I级</option><option value="II级">II级</option><option value="III级">III级</option></select>'
        + '    <select class="table-filter-select" id="dm-alert-filter-status"><option value="">全部状态</option><option value="pending">待处置</option><option value="processing">处理中</option><option value="resolved">已处置</option></select>'
        + '    <select class="table-filter-select" id="dm-alert-filter-district"><option value="">全部区县</option></select>'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmFilterAlert()">🔍 筛选</button>'
        + '  </div>'
        + '  <div class="table-toolbar-right">'
        + '    <button class="btn-primary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmCreateAlert()">＋ 新建预警</button>'
        + '  </div>'
        + '</div>'
        + '<div style="flex:1;overflow-y:auto;"><table class="data-table" style="width:100%;font-size:11px;"><thead><tr>'
        + '<th>时间</th><th>等级</th><th>资产名称</th><th>区县</th><th>桥群</th><th>类型</th><th>内容</th><th>状态</th><th>处理人</th><th>操作</th>'
        + '</tr></thead><tbody id="dm-alert-tbody"><tr><td colspan="10" style="text-align:center;color:var(--text-muted);">⏳ 加载中...</td></tr></tbody></table></div></div>';
}

function buildSimTab() {
    return '<div class="dm-tab-content" id="dm-tab-sim" style="display:none;flex:1;overflow:hidden;flex-direction:column;">'
        + '<div class="table-toolbar" style="flex-shrink:0;">'
        + '  <div class="table-toolbar-left">'
        + '    <span style="font-size:12px;color:var(--text-muted);">历史仿真成果归档</span>'
        + '  </div>'
        + '</div>'
        + '<div style="flex:1;overflow-y:auto;"><table class="data-table" style="width:100%;font-size:11px;"><thead><tr>'
        + '<th>仿真 ID</th><th>日期</th><th>类型</th><th>区域</th><th>网络损失</th><th>状态</th><th>操作</th>'
        + '</tr></thead><tbody id="dm-sim-tbody"><tr><td colspan="7" style="text-align:center;color:var(--text-muted);">⏳ 加载中...</td></tr></tbody></table></div></div>';
}

// ============================================================
// 后端连接检测
// ============================================================

async function checkBackendStatus() {
    try {
        // 使用 API 层的缓存检测，避免重复请求
        var online = await checkBackendFast();
        // 同步状态到 API 层，后续调用直接降级
        setBackendAvailable(online);
        return online;
    } catch (e) {
        return false;
    }
}

/**
 * 更新后端状态指示器
 */
function updateBackendBadge(online) {
    var badge = document.getElementById('dm-backend-status');
    if (!badge) return;
    if (online) {
        badge.innerHTML = '🟢 后端已连接';
        badge.style.color = '#4ADE80';
    } else {
        badge.innerHTML = '🟡 离线模式 (本地数据)';
        badge.style.color = '#FBBF24';
    }
}

// ============================================================
// 数据加载函数
// ============================================================

async function loadOverviewTab() {
    try {
        // 通过 API 层获取数据（自动降级到 mock 数据）
        var [bridges, districts, alerts, roadEdges] = await Promise.all([
            api.getBridgeArchives().catch(function () { return []; }),
            api.getDistrictMetrics().catch(function () { return []; }),
            api.getAlertRecords().catch(function () { return []; }),
            api.getRoadnetEdges().catch(function () { return []; })
        ]);

        document.getElementById('ov-bridge-count').textContent = (bridges && bridges.length) || '-';
        document.getElementById('ov-road-count').textContent = (roadEdges && roadEdges.length) || '0';
        document.getElementById('ov-district-count').textContent = (districts && districts.length) || '-';
        document.getElementById('ov-alert-count').textContent = (alerts && alerts.length) || '-';

        document.getElementById('ov-recent-log').innerHTML =
            '🕐 桥隧资产: ' + ((bridges && bridges.length) || 0) + ' 条 | 道路边: ' + ((roadEdges && roadEdges.length) || 11742) + ' 条<br>'
            + '🕐 区县: ' + ((districts && districts.length) || 0) + ' 个 | 预警: ' + ((alerts && alerts.length) || 0) + ' 条<br>'
            + '🕐 数据状态: ' + (getLocalStorageSize());
    } catch (e) {
        console.warn('[DM] 数据总览加载异常:', e);
    }
}

function getLocalStorageSize() {
    try {
        var total = 0;
        for (var key in localStorage) {
            if (key.startsWith('plant_mock_')) {
                total += localStorage.getItem(key).length;
            }
        }
        return (total / 1024).toFixed(1) + ' KB (localStorage)';
    } catch (e) { return '未知'; }
}

// ==================== 桥隧资产 Tab ====================
async function loadBridgeTab() {
    try {
        var data = await api.getBridgeArchives();
        renderBridgeTable(data || []);
    } catch (e) {
        console.warn('[DM] 桥隧资产加载异常:', e);
        renderBridgeTable([]);
    }
}

function renderBridgeTable(data) {
    var tbody = document.getElementById('dm-bridge-tbody');
    if (!tbody) return;
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--text-muted);">暂无数据</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(function (b) {
        var hc = b.health_index || 0;
        var hcColor = hc >= 0.8 ? '#4ADE80' : hc >= 0.6 ? '#FBBF24' : '#F87171';
        var riskColor = getRiskColor(b.risk_level);
        var passText = { passable: '✅ 可通行', restricted: '⚠️ 受限', forbidden: '❌ 禁止' };
        var monText = { online: '🟢 在线', offline: '🔴 离线' };
        return '<tr>'
            + '<td style="font-family:monospace;font-size:10px;color:var(--text-muted);">' + (b.uuid || '-') + '</td>'
            + '<td style="font-weight:500;color:var(--text-primary);">' + (b.name || '-') + '</td>'
            + '<td>' + (b.asset_type === 'bridge' ? '🌉 桥梁' : '🚇 隧道') + '</td>'
            + '<td>' + (b.district_name || '-') + '</td>'
            + '<td style="font-size:10px;">' + (b.route_name || '-') + '</td>'
            + '<td>' + (b.structure_type || '-') + '</td>'
            + '<td>' + (b.span_length || '-') + '</td>'
            + '<td><span style="color:' + riskColor + ';font-weight:600;">' + (b.risk_level || '-') + '</span></td>'
            + '<td><span style="color:' + hcColor + ';">' + hc.toFixed(2) + '</span></td>'
            + '<td>' + (passText[b.truck_pass_status] || '-') + '</td>'
            + '<td>' + (monText[b.monitoring_status] || '-') + '</td>'
            + '<td><button class="action-btn" onclick="window.__dmEditBridge(\'' + b.uuid + '\')">编辑</button>'
            + '<button class="action-btn" onclick="window.__dmLocateBridge(\'' + b.uuid + '\',\'' + (b.longitude || 106.55) + '\',\'' + (b.latitude || 29.56) + '\')" style="color:#38BDF8;">📍 定位</button></td>'
            + '</tr>';
    }).join('');
}

// ==================== 路网 Tab ====================
async function loadRoadnetTab() {
    try {
        var data = await api.getRoadnetEdges();
        data = data || [];

        // 填充区县筛选下拉
        var districtSet = new Set();
        data.forEach(function (d) { if (d.district_name) districtSet.add(d.district_name); });
        var districtSelect = document.getElementById('dm-roadnet-filter-district');
        if (districtSelect) {
            var opts = '<option value="">全部区县</option>';
            Array.from(districtSet).sort().forEach(function (d) { opts += '<option value="' + d + '">' + d + '</option>'; });
            districtSelect.innerHTML = opts;
        }

        renderRoadnetTable(data);
        updateRoadnetStats(data);
    } catch (e) {
        console.warn('[DM] 路网数据加载异常:', e);
        renderRoadnetTable([]);
        updateRoadnetStats([]);
    }
}

function renderRoadnetTable(data) {
    var tbody = document.getElementById('dm-roadnet-tbody');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--text-muted);padding:30px;">'
            + '📂 暂无路网业务属性数据<br><br>'
            + '<button class="btn-primary" style="padding:6px 16px;font-size:12px;" onclick="window.__dmImportRoadnet()">📥 从 GeoJSON 导入</button>'
            + '</td></tr>';
        return;
    }

    var pageSize = 100;
    var totalPages = Math.ceil(data.length / pageSize);
    var currentPage = 1;

    function renderPage(page) {
        var start = (page - 1) * pageSize;
        var end = Math.min(start + pageSize, data.length);
        var pageData = data.slice(start, end);

        var html = pageData.map(function (d) {
            var statusColor = { normal: '#4ADE80', restricted: '#FBBF24', interrupted: '#F87171', closed: '#777' };
            var riskColor = getRiskColor(d.risk_level);
            var len = (d.length || 0) / 1000;
            var edgeId = d.edge_id || (d.u + '_' + d.v + '_' + (d.key || 0));
            return '<tr>'
                + '<td style="font-family:monospace;font-size:9px;color:var(--text-muted);">' + edgeId + '</td>'
                + '<td>' + (d.name || '-') + '</td>'
                + '<td>' + (d.ref || '-') + '</td>'
                + '<td>' + (d.highway || '-') + '</td>'
                + '<td>' + (d.district_name || '-') + '</td>'
                + '<td>' + len.toFixed(2) + '</td>'
                + '<td>' + (d.maxspeed || '-') + '</td>'
                + '<td>' + (d.lanes || '-') + '</td>'
                + '<td><span style="color:' + (statusColor[d.status] || '#4ADE80') + ';font-weight:600;">' + (d.status || 'normal') + '</span></td>'
                + '<td><span style="color:' + riskColor + ';">' + (d.risk_level || '-') + '</span></td>'
                + '<td>' + (d.truck_limit_ton || '-') + '</td>'
                + '<td><button class="action-btn" onclick="window.__dmEditRoadnet(\'' + edgeId + '\')">编辑</button>'
                + '<button class="action-btn" onclick="window.__dmLocateRoad(\'' + edgeId + '\')" style="color:#38BDF8;">📍 定位</button></td>'
                + '</tr>';
        }).join('');

        // 添加分页导航
        var pagination = '<div style="position:sticky;bottom:0;background:var(--bg-primary);padding:6px 8px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.05);font-size:11px;">'
            + '<span style="color:var(--text-muted);">共 ' + data.length + ' 条，每页 ' + pageSize + ' 条</span>'
            + '<div>';
        if (page > 1) pagination += '<button class="btn-secondary" style="padding:2px 8px;font-size:10px;margin-right:4px;" onclick="window.__dmRoadnetPage(' + (page - 1) + ')">◀ 上一页</button>';
        pagination += '<span style="color:var(--text-secondary);padding:0 8px;">' + page + ' / ' + totalPages + '</span>';
        if (page < totalPages) pagination += '<button class="btn-secondary" style="padding:2px 8px;font-size:10px;margin-left:4px;" onclick="window.__dmRoadnetPage(' + (page + 1) + ')">下一页 ▶</button>';
        pagination += '</div></div>';

        tbody.innerHTML = html + pagination;

        // 保存当前页到全局
        window.__dmRoadnetCurrentPage = page;
        window.__dmRoadnetTotalPages = totalPages;
        window.__dmRoadnetData = data;
    }

    renderPage(1);
    window.__dmRoadnetPage = function (p) {
        renderPage(p);
    };
}

function updateRoadnetStats(data) {
    var list = document.getElementById('dm-roadnet-stat-list');
    if (!list) return;
    var total = document.getElementById('dm-roadnet-total');
    if (total) total.textContent = data.length;

    var types = { motorway: 0, motorway_link: 0, trunk: 0, trunk_link: 0, other: 0 };
    var typeLabels = { motorway: '高速公路主线', motorway_link: '高速匝道', trunk: '快速路/高等级干线', trunk_link: '快速路匝道', other: '其他' };
    var typeColors = { motorway: '#e74c3c', motorway_link: '#ff8a80', trunk: '#f39c12', trunk_link: '#f6b26b', other: '#2980b9' };

    data.forEach(function (d) {
        var hw = String(d.highway || '');
        if (hw.includes('motorway_link')) types.motorway_link++;
        else if (hw.includes('motorway')) types.motorway++;
        else if (hw.includes('trunk_link')) types.trunk_link++;
        else if (hw.includes('trunk')) types.trunk++;
        else types.other++;
    });

    var maxCount = Math.max.apply(null, Object.values(types)) || 1;
    list.innerHTML = Object.keys(types).map(function (k) {
        var pct = (types[k] / maxCount) * 100;
        return '<div style="display:flex;align-items:center;gap:4px;margin-bottom:4px;">'
            + '<span style="font-size:10px;color:var(--text-muted);width:80px;">' + typeLabels[k] + '</span>'
            + '<div style="flex:1;height:4px;background:rgba(255,255,255,0.05);border-radius:2px;overflow:hidden;">'
            + '<div style="width:' + pct + '%;height:100%;background:' + typeColors[k] + ';border-radius:2px;"></div></div>'
            + '<span style="font-size:10px;color:' + typeColors[k] + ';width:40px;text-align:right;">' + types[k] + '</span>'
            + '</div>';
    }).join('');
}

// ==================== 区县 Tab ====================
async function loadDistrictTab() {
    try {
        var data = await api.getDistrictMetrics();
        data = data || [];

        // 筛选下拉
        var districtSelect = document.getElementById('dm-alert-filter-district');
        if (districtSelect) {
            var opts = '<option value="">全部区县</option>';
            data.forEach(function (d) { opts += '<option value="' + d.district_name + '">' + d.district_name + '</option>'; });
            districtSelect.innerHTML = opts;
        }

        renderDistrictTable(data);
    } catch (e) {
        console.warn('[DM] 区县数据加载异常:', e);
        renderDistrictTable([]);
    }
}

function renderDistrictTable(data) {
    var tbody = document.getElementById('dm-district-tbody');
    if (!tbody) return;
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:var(--text-muted);">暂无数据</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(function (d) {
        var rs = d.resilience_score || 0;
        var rsColor = rs >= 80 ? '#4ADE80' : rs >= 60 ? '#FBBF24' : '#F87171';
        var riskColor = getRiskColor(d.risk_level);
        var cov = ((d.monitoring_coverage || 0) * 100).toFixed(0);
        return '<tr>'
            + '<td style="font-weight:500;">' + (d.district_name || '-') + '</td>'
            + '<td>' + (d.asset_count || 0) + '</td>'
            + '<td>' + (d.bridge_count || 0) + '</td>'
            + '<td>' + (d.tunnel_count || 0) + '</td>'
            + '<td>' + (d.motorway_length_km || 0) + ' km</td>'
            + '<td>' + (d.trunk_length_km || 0) + ' km</td>'
            + '<td><span style="color:' + rsColor + ';font-weight:600;">' + rs.toFixed(1) + '</span></td>'
            + '<td>' + (d.structure_safety_score || 0) + '</td>'
            + '<td>' + (d.traffic_guarantee_score || 0) + '</td>'
            + '<td>' + cov + '%</td>'
            + '<td><span style="color:' + riskColor + ';">' + (d.risk_level || '-') + '</span></td>'
            + '<td><button class="action-btn" onclick="window.__dmEditDistrict(\'' + d.district_id + '\')">编辑</button></td>'
            + '</tr>';
    }).join('');
}

// ==================== 指标 Tab ====================
async function loadMetricTab() {
    try {
        var data = await api.getDashboardMetrics();
        renderMetricTable(data || []);
    } catch (e) {
        console.warn('[DM] 指标数据加载异常:', e);
        renderMetricTable([]);
    }
}

function renderMetricTable(data) {
    var tbody = document.getElementById('dm-metric-tbody');
    if (!tbody) return;
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">暂无数据</td></tr>';
        return;
    }
    var trendMap = { up: '📈 上升', down: '📉 下降', stable: '➡️ 平稳' };
    var levelMap = { good: '🟢 良好', warning: '🟡 警告', danger: '🔴 危险', info: '🔵 信息' };
    tbody.innerHTML = data.sort(function (a, b) { return (a.display_order || 0) - (b.display_order || 0); }).map(function (m) {
        return '<tr>'
            + '<td style="font-weight:500;">' + (m.metric_name || '-') + '</td>'
            + '<td>' + (m.metric_group || '-') + '</td>'
            + '<td><input type="number" class="dm-inline-edit" value="' + (m.metric_value || 0) + '" data-mid="' + m.metric_id + '" data-field="metric_value" style="width:60px;"></td>'
            + '<td>' + (m.metric_unit || '') + '</td>'
            + '<td>' + (trendMap[m.trend] || '-') + '</td>'
            + '<td>' + (levelMap[m.status_level] || '-') + '</td>'
            + '<td><input type="number" class="dm-inline-edit" value="' + (m.display_order || 0) + '" data-mid="' + m.metric_id + '" data-field="display_order" style="width:40px;"></td>'
            + '<td><input type="checkbox" ' + (m.visible !== false ? 'checked' : '') + ' data-mid="' + m.metric_id + '" data-field="visible" onchange="window.__dmToggleMetric(\'' + m.metric_id + '\',this.checked)"></td>'
            + '<td><button class="action-btn" onclick="window.__dmSaveMetric(\'' + m.metric_id + '\')">💾 保存</button></td>'
            + '</tr>';
    }).join('');
}

// ==================== 风险排序 Tab ====================
async function loadRiskTab() {
    try {
        var data = await api.getRiskRankings();
        renderRiskTable(data || []);
    } catch (e) {
        console.warn('[DM] 风险数据加载异常:', e);
        renderRiskTable([]);
    }
}

function renderRiskTable(data) {
    var tbody = document.getElementById('dm-risk-tbody');
    if (!tbody) return;
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">暂无数据</td></tr>';
        return;
    }
    tbody.innerHTML = data.sort(function (a, b) { return (a.display_order || 999) - (b.display_order || 999); }).map(function (r) {
        var riskColor = getRiskColor(r.risk_level);
        return '<tr>'
            + '<td><input type="number" class="dm-inline-edit" value="' + (r.display_order || 0) + '" style="width:36px;" data-rid="' + r.rank_id + '" data-field="display_order"></td>'
            + '<td style="font-weight:500;">' + (r.asset_name || '-') + '</td>'
            + '<td>' + (r.district_name || '-') + '</td>'
            + '<td><span style="color:' + riskColor + ';font-weight:600;">' + (r.risk_score || 0).toFixed(2) + '</span></td>'
            + '<td><span style="color:' + riskColor + ';">' + (r.risk_level || '-') + '</span></td>'
            + '<td>' + (r.risk_type || '-') + '</td>'
            + '<td style="font-size:10px;color:var(--text-muted);">' + (r.tags || '-') + '</td>'
            + '<td><input type="checkbox" ' + (r.visible !== false ? 'checked' : '') + ' data-rid="' + r.rank_id + '" onchange="window.__dmToggleRisk(\'' + r.rank_id + '\',this.checked)"></td>'
            + '<td><button class="action-btn" onclick="window.__dmSaveRisk(\'' + r.rank_id + '\')">💾 保存</button>'
            + '<button class="action-btn danger" onclick="window.__dmDeleteRisk(\'' + r.rank_id + '\')">🗑️</button></td>'
            + '</tr>';
    }).join('');
}

// ==================== 预警 Tab ====================
async function loadAlertTab() {
    try {
        var data = await api.getAlertRecords();
        renderAlertTable(data || []);
    } catch (e) {
        console.warn('[DM] 预警数据加载异常:', e);
        renderAlertTable([]);
    }
}

function renderAlertTable(data) {
    var tbody = document.getElementById('dm-alert-tbody');
    if (!tbody) return;
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);">暂无数据</td></tr>';
        return;
    }
    var statusMap = { pending: '🟡 待处置', processing: '🔵 处理中', resolved: '🟢 已处置' };
    var levelColor = { 'I级': '#F87171', 'II级': '#FBBF24', 'III级': '#38BDF8' };
    tbody.innerHTML = data.map(function (a) {
        return '<tr>'
            + '<td style="font-size:10px;font-family:monospace;color:var(--text-muted);">' + (a.time || '-') + '</td>'
            + '<td><span style="color:' + (levelColor[a.level] || '#FBBF24') + ';font-weight:600;">' + (a.level || '-') + '</span></td>'
            + '<td>' + (a.asset_name || '-') + '</td>'
            + '<td>' + (a.district_name || '-') + '</td>'
            + '<td style="font-size:10px;color:var(--text-muted);">' + (a.asset_group || '-') + '</td>'
            + '<td>' + (a.alert_type || '-') + '</td>'
            + '<td style="font-size:10px;color:var(--text-secondary);max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + (a.content || '') + '">' + (a.content || '-') + '</td>'
            + '<td>' + (statusMap[a.status] || '-') + '</td>'
            + '<td>' + (a.handler || '-') + '</td>'
            + '<td><button class="action-btn" onclick="window.__dmEditAlert(\'' + a.alert_id + '\')">编辑</button>'
            + '<button class="action-btn danger" onclick="window.__dmDeleteAlert(\'' + a.alert_id + '\')">🗑️</button></td>'
            + '</tr>';
    }).join('');
}

// ==================== 仿真 Tab ====================
async function loadSimTab() {
    try {
        var data = await api.getSimulationArchives();
        var tbody = document.getElementById('dm-sim-tbody');
        if (!tbody) return;
        data = data || [];
        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">暂无数据</td></tr>';
            return;
        }
        tbody.innerHTML = data.map(function (s) {
            var lossColor = s.lossPercent >= 40 ? '#F87171' : s.lossPercent >= 20 ? '#FBBF24' : '#4ADE80';
            var statusHtml = s.status === 'completed'
                ? '<span class="status-badge green">已完成</span>'
                : '<span class="status-badge yellow">运行中</span>';
            return '<tr>'
                + '<td style="font-family:monospace;font-size:10px;color:var(--text-muted);">' + (s.id || '-') + '</td>'
                + '<td>' + (s.date || '-') + '</td>'
                + '<td>' + (s.type || '-') + '</td>'
                + '<td>' + (s.zone || '-') + '</td>'
                + '<td>' + (s.lossPercent !== null ? '<span style="color:' + lossColor + ';font-weight:600;">' + s.lossPercent + '%</span>' : '<span style="color:var(--text-muted);">-</span>') + '</td>'
                + '<td>' + statusHtml + '</td>'
                + '<td><button class="action-btn" onclick="showToast(\'📊 查看仿真报告\',\'info\')">查看</button></td>'
                + '</tr>';
        }).join('');
    } catch (e) {
        console.warn('[DM] 仿真数据加载异常:', e);
        var tbody = document.getElementById('dm-sim-tbody');
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);">暂无数据</td></tr>';
    }
}

// ============================================================
// 通用工具函数
// ============================================================

function getRiskColor(level) {
    var map = { low: '#4ADE80', medium: '#FBBF24', high: '#F87171', extreme: '#ff0033' };
    return map[level] || '#94A3B8';
}

function persistAndNotify(type, action, payload) {
    // 持久化到 localStorage（在 saveMockData 中完成）
    // 派发事件通知首页
    window.dispatchEvent(new CustomEvent('dataAssetUpdated', {
        detail: { type: type, action: action, payload: payload }
    }));
}

// ============================================================
// 编辑弹窗
// ============================================================

function showEditDialog(title, fields, onSave) {
    var overlay = document.getElementById('data-mgmt-overlay');
    var dialog = document.createElement('div');
    dialog.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;z-index:10000;background:rgba(0,0,0,0.5);';
    dialog.id = 'dm-edit-dialog';

    var formHtml = fields.map(function (f) {
        var val = f.value !== undefined && f.value !== null ? f.value : '';
        if (f.type === 'select') {
            var opts = f.options.map(function (o) {
                return '<option value="' + o.value + '" ' + (String(val) === String(o.value) ? 'selected' : '') + '>' + o.label + '</option>';
            }).join('');
            return '<div style="margin-bottom:8px;"><label style="display:block;font-size:11px;color:var(--text-secondary);margin-bottom:2px;">' + f.label + '</label>'
                + '<select class="dm-edit-field" data-key="' + f.key + '" style="width:100%;padding:4px 8px;font-size:11px;border:1px solid rgba(255,255,255,0.1);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);">' + opts + '</select></div>';
        }
        if (f.type === 'number') {
            return '<div style="margin-bottom:8px;"><label style="display:block;font-size:11px;color:var(--text-secondary);margin-bottom:2px;">' + f.label + '</label>'
                + '<input type="number" class="dm-edit-field" data-key="' + f.key + '" value="' + val + '" style="width:100%;padding:4px 8px;font-size:11px;border:1px solid rgba(255,255,255,0.1);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);"></div>';
        }
        return '<div style="margin-bottom:8px;"><label style="display:block;font-size:11px;color:var(--text-secondary);margin-bottom:2px;">' + f.label + '</label>'
            + '<input type="text" class="dm-edit-field" data-key="' + f.key + '" value="' + val.replace(/"/g, '&quot;') + '" style="width:100%;padding:4px 8px;font-size:11px;border:1px solid rgba(255,255,255,0.1);border-radius:4px;background:var(--bg-secondary);color:var(--text-primary);"></div>';
    }).join('');

    dialog.innerHTML = '<div class="glass-panel" style="width:420px;max-height:80vh;overflow-y:auto;padding:20px;border-radius:8px;">'
        + '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:12px;">✏️ ' + title + '</div>'
        + '<div id="dm-edit-form">' + formHtml + '</div>'
        + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'
        + '<button class="btn-secondary" style="padding:4px 16px;font-size:11px;" onclick="document.getElementById(\'dm-edit-dialog\').remove()">取消</button>'
        + '<button class="btn-primary" style="padding:4px 16px;font-size:11px;" id="dm-edit-save-btn">💾 保存</button>'
        + '</div></div>';

    document.body.appendChild(dialog);

    document.getElementById('dm-edit-save-btn').addEventListener('click', function () {
        var result = {};
        document.querySelectorAll('.dm-edit-field').forEach(function (el) {
            var key = el.dataset.key;
            var val = el.type === 'number' ? parseFloat(el.value) : el.value;
            result[key] = val;
        });
        dialog.remove();
        onSave(result);
    });
}

// ============================================================
// 暴露到全局的 CRUD 操作
// ============================================================

// ---------- 桥隧 CRUD ----------
window.__dmEditBridge = function (uuid) {
    var data = window.__mockData?.bridgeArchives || [];
    var item = data.find(function (b) { return b.uuid === uuid; });
    if (!item) return showToast('未找到该桥梁', 'error');

    showEditDialog('编辑桥隧 - ' + item.name, [
        { key: 'name', label: '名称', value: item.name },
        { key: 'district_name', label: '所属区县', value: item.district_name },
        { key: 'longitude', label: '经度', type: 'number', value: item.longitude },
        { key: 'latitude', label: '纬度', type: 'number', value: item.latitude },
        { key: 'risk_level', label: '风险等级', type: 'select', value: item.risk_level, options: [{ value: 'low', label: '低风险' }, { value: 'medium', label: '中风险' }, { value: 'high', label: '高风险' }, { value: 'extreme', label: '极高风险' }] },
        { key: 'truck_pass_status', label: '通行状态', type: 'select', value: item.truck_pass_status, options: [{ value: 'passable', label: '可通行' }, { value: 'restricted', label: '受限' }, { value: 'forbidden', label: '禁止' }] },
        { key: 'current_status', label: '运行状态', type: 'select', value: item.current_status, options: [{ value: 'normal', label: '正常' }, { value: 'warning', label: '预警' }, { value: 'danger', label: '危险' }] },
        { key: 'risk_score', label: '风险评分', type: 'number', value: item.risk_score },
        { key: 'health_index', label: '健康指数', type: 'number', value: item.health_index },
    ], function (result) {
        Object.assign(item, result);
        var list = window.__mockData.bridgeArchives;
        saveMockData('bridgeArchives', list);
        renderBridgeTable(list);
        persistAndNotify('bridge', 'update', item);
        showToast('✅ 已保存: ' + item.name, 'success');
    });
};

window.__dmLocateBridge = function (uuid, lng, lat) {
    if (window.__flyTo) {
        window.__flyTo(parseFloat(lat), parseFloat(lng), 15);
    }
    showToast('📍 已定位到桥梁', 'info');
    // 关闭后台弹窗，方便查看地图
    setTimeout(function () {
        var ov = document.getElementById('data-mgmt-overlay');
        if (ov) ov.remove();
    }, 500);
};

window.__dmCreateBridge = function () {
    showEditDialog('新建桥隧资产', [
        { key: 'name', label: '名称', value: '新建桥梁' },
        { key: 'asset_type', label: '类型', type: 'select', value: 'bridge', options: [{ value: 'bridge', label: '桥梁' }, { value: 'tunnel', label: '隧道' }] },
        { key: 'district_name', label: '所属区县', value: '渝中区' },
        { key: 'longitude', label: '经度', type: 'number', value: 106.55 },
        { key: 'latitude', label: '纬度', type: 'number', value: 29.56 },
        { key: 'risk_level', label: '风险等级', type: 'select', value: 'low', options: [{ value: 'low', label: '低风险' }, { value: 'medium', label: '中风险' }, { value: 'high', label: '高风险' }, { value: 'extreme', label: '极高风险' }] },
    ], function (result) {
        result.uuid = 'BR_' + Date.now();
        var list = window.__mockData.bridgeArchives || [];
        list.push(result);
        saveMockData('bridgeArchives', list);
        renderBridgeTable(list);
        persistAndNotify('bridge', 'create', result);
        showToast('✅ 已新建: ' + result.name, 'success');
    });
};

// ---------- 路网 CRUD ----------
window.__dmEditRoadnet = function (edgeId) {
    var data = window.__mockData?.roadnetBusinessAttributes || [];
    var item = data.find(function (d) { return (d.edge_id || (d.u + '_' + d.v + '_' + (d.key || 0))) === edgeId; });
    if (!item) return showToast('未找到该道路', 'error');

    showEditDialog('编辑道路属性 - ' + (item.name || edgeId), [
        { key: 'name', label: '道路名称', value: item.name || '' },
        { key: 'district_name', label: '所属区县', value: item.district_name || '' },
        { key: 'status', label: '业务状态', type: 'select', value: item.status || 'normal', options: [{ value: 'normal', label: '正常' }, { value: 'restricted', label: '受限(黄色虚线)' }, { value: 'interrupted', label: '中断(红色高亮)' }, { value: 'closed', label: '关闭(灰色)' }] },
        { key: 'risk_level', label: '风险等级', type: 'select', value: item.risk_level || 'low', options: [{ value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }, { value: 'extreme', label: '极高' }] },
        { key: 'maxspeed', label: '限速(km/h)', type: 'number', value: item.maxspeed || 80 },
        { key: 'lanes', label: '车道数', type: 'number', value: item.lanes || 2 },
        { key: 'truck_limit_ton', label: '限重(t)', type: 'number', value: item.truck_limit_ton || 0 },
        { key: 'remark', label: '备注', value: item.remark || '' },
    ], function (result) {
        Object.assign(item, result);
        var list = window.__mockData.roadnetBusinessAttributes;
        saveMockData('roadnetBusinessAttributes', list);
        renderRoadnetTable(list);
        // 高亮并更新地图
        result.edge_id = edgeId;
        result._highlight = true;
        persistAndNotify('roadnet', 'update', result);
        showToast('✅ 已更新道路属性: ' + (item.name || edgeId), 'success');
    });
};

window.__dmLocateRoad = function (edgeId) {
    if (window.__flyToRoadEdge) {
        window.__flyToRoadEdge(edgeId);
    }
    showToast('📍 已定位到道路', 'info');
    // 关闭后台弹窗以便查看地图
    setTimeout(function () {
        var ov = document.getElementById('data-mgmt-overlay');
        if (ov) ov.remove();
    }, 500);
};

window.__dmExportRoadnet = function () {
    var data = window.__mockData?.roadnetBusinessAttributes || [];
    if (data.length === 0) return showToast('没有可导出的路网数据', 'warning');

    // 导出为 CSV
    var headers = ['edge_id', 'name', 'ref', 'highway', 'district_name', 'length', 'maxspeed', 'lanes', 'status', 'risk_level', 'truck_limit_ton'];
    var csv = headers.join(',') + '\n';
    data.forEach(function (d) {
        var row = headers.map(function (h) {
            var val = d[h] !== undefined ? String(d[h]) : '';
            if (val.includes(',') || val.includes('"')) val = '"' + val.replace(/"/g, '""') + '"';
            return val;
        }).join(',');
        csv += row + '\n';
    });

    var blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'roadnet_export_' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('📤 已导出 ' + data.length + ' 条道路数据', 'success');
};

window.__dmImportRoadnet = function () {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
            try {
                var json = JSON.parse(ev.target.result);
                var features = json.features || json;
                if (!Array.isArray(features)) return showToast('无效的 JSON 格式', 'error');

                var attributes = features.map(function (f) {
                    var props = f.properties || f;
                    return {
                        edge_id: props.edge_id || (props.u + '_' + props.v + '_' + (props.key || 0)),
                        u: props.u,
                        v: props.v,
                        key: props.key,
                        osmid: props.osmid,
                        name: props.name || '',
                        ref: props.ref || '',
                        highway: props.highway || '',
                        district_name: props.district_name || '',
                        length: props.length || 0,
                        maxspeed: props.maxspeed || '',
                        lanes: props.lanes || '',
                        oneway: props.oneway || '',
                        bridge: props.bridge || '',
                        tunnel: props.tunnel || '',
                        status: props.status || 'normal',
                        risk_level: props.risk_level || 'low',
                        capacity_ratio: props.capacity_ratio || 1.0,
                        truck_limit_ton: props.truck_limit_ton || 0,
                        remark: props.remark || '',
                    };
                });

                window.__mockData.roadnetBusinessAttributes = attributes;
                saveMockData('roadnetBusinessAttributes', attributes);
                loadRoadnetTab();
                persistAndNotify('roadnet', 'import', { count: attributes.length });
                showToast('✅ 已导入 ' + attributes.length + ' 条道路属性', 'success');

                // 同步更新路网总览
                var overview = window.__mockData.roadnetOverview || {};
                overview.edgeCount = attributes.length;
                var districtSet = new Set();
                attributes.forEach(function (d) { if (d.district_name) districtSet.add(d.district_name); });
                overview.districtCount = districtSet.size;
                saveMockData('roadnetOverview', overview);
                loadOverviewTab();
            } catch (err) {
                showToast('❌ 导入失败: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
    });
    input.click();
};

// ---------- 区县 CRUD ----------
window.__dmEditDistrict = function (districtId) {
    var data = window.__mockData?.districtMetrics || [];
    var item = data.find(function (d) { return d.district_id === districtId; });
    if (!item) return showToast('未找到该区县', 'error');

    showEditDialog('编辑区县指标 - ' + item.district_name, [
        { key: 'resilience_score', label: '韧性指数', type: 'number', value: item.resilience_score },
        { key: 'structure_safety_score', label: '结构安全指数', type: 'number', value: item.structure_safety_score },
        { key: 'traffic_guarantee_score', label: '通行保障指数', type: 'number', value: item.traffic_guarantee_score },
        { key: 'monitoring_coverage', label: '监测覆盖率(0-1)', type: 'number', value: item.monitoring_coverage },
        { key: 'risk_level', label: '风险等级', type: 'select', value: item.risk_level, options: [{ value: 'low', label: '低风险' }, { value: 'medium', label: '中风险' }, { value: 'high', label: '高风险' }, { value: 'extreme', label: '极高风险' }] },
    ], function (result) {
        Object.assign(item, result);
        var list = window.__mockData.districtMetrics;
        saveMockData('districtMetrics', list);
        renderDistrictTable(list);
        persistAndNotify('district', 'update', item);
        showToast('✅ 已更新 ' + item.district_name, 'success');
    });
};

// ---------- 指标 CRUD ----------
window.__dmToggleMetric = function (metricId, checked) {
    var data = window.__mockData?.dashboardMetrics || [];
    var item = data.find(function (m) { return m.metric_id === metricId; });
    if (item) {
        item.visible = checked;
        saveMockData('dashboardMetrics', data);
    }
};

window.__dmSaveMetric = function (metricId) {
    var data = window.__mockData?.dashboardMetrics || [];
    var item = data.find(function (m) { return m.metric_id === metricId; });
    if (!item) return;

    // 从 inline edit 读取值
    document.querySelectorAll('.dm-inline-edit[data-mid="' + metricId + '"]').forEach(function (el) {
        var field = el.dataset.field;
        item[field] = el.type === 'number' ? parseFloat(el.value) : el.value;
    });

    saveMockData('dashboardMetrics', data);
    persistAndNotify('metric', 'update', item);
    showToast('✅ 已保存指标: ' + item.metric_name, 'success');
};

window.__dmResetMetrics = function () {
    // 从 localStorage 移除，重新加载默认值
    localStorage.removeItem('plant_mock_dashboardMetrics');
    window.__mockData.dashboardMetrics = null;
    // 重新导入默认
    import('../data/mockData.js').then(function (mock) {
        window.__mockData.dashboardMetrics = mock.dashboardMetrics;
        saveMockData('dashboardMetrics', mock.dashboardMetrics);
        loadMetricTab();
        persistAndNotify('metric', 'reset', null);
        showToast('🔄 已恢复默认指标', 'success');
    });
};

// ---------- 风险 CRUD ----------
window.__dmSaveRisk = function (rankId) {
    var data = window.__mockData?.riskRankingItems || [];
    var item = data.find(function (r) { return r.rank_id === rankId; });
    if (!item) return;
    // 读取内联编辑
    document.querySelectorAll('.dm-inline-edit[data-rid="' + rankId + '"]').forEach(function (el) {
        var field = el.dataset.field;
        item[field] = parseInt(el.value) || 0;
    });
    saveMockData('riskRankingItems', data);
    renderRiskTable(data);
    persistAndNotify('risk', 'update', item);
    showToast('✅ 已保存风险排序', 'success');
};

window.__dmToggleRisk = function (rankId, checked) {
    var data = window.__mockData?.riskRankingItems || [];
    var item = data.find(function (r) { return r.rank_id === rankId; });
    if (item) {
        item.visible = checked;
        saveMockData('riskRankingItems', data);
    }
};

window.__dmDeleteRisk = function (rankId) {
    var data = window.__mockData?.riskRankingItems || [];
    data = data.filter(function (r) { return r.rank_id !== rankId; });
    window.__mockData.riskRankingItems = data;
    saveMockData('riskRankingItems', data);
    renderRiskTable(data);
    persistAndNotify('risk', 'delete', { rank_id: rankId });
    showToast('🗑️ 已删除风险项', 'success');
};

window.__dmCreateRisk = function () {
    showEditDialog('新建风险排序项', [
        { key: 'asset_name', label: '资产名称', value: '新建风险项' },
        { key: 'district_name', label: '区县', value: '渝中区' },
        { key: 'risk_score', label: '风险评分', type: 'number', value: 0.5 },
        { key: 'risk_level', label: '风险等级', type: 'select', value: 'medium', options: [{ value: 'low', label: '低' }, { value: 'medium', label: '中' }, { value: 'high', label: '高' }, { value: 'extreme', label: '极高' }] },
        { key: 'risk_type', label: '风险类型', value: '常规监测' },
        { key: 'tags', label: '标签', value: '' },
    ], function (result) {
        result.rank_id = 'rr_' + Date.now();
        result.display_order = (window.__mockData?.riskRankingItems?.length || 0) + 1;
        result.visible = true;
        var list = window.__mockData.riskRankingItems || [];
        list.push(result);
        saveMockData('riskRankingItems', list);
        renderRiskTable(list);
        persistAndNotify('risk', 'create', result);
        showToast('✅ 已新建风险项', 'success');
    });
};

// ---------- 预警 CRUD ----------
window.__dmEditAlert = function (alertId) {
    var data = window.__mockData?.alertRecords || [];
    var item = data.find(function (a) { return a.alert_id === alertId; });
    if (!item) return showToast('未找到该预警', 'error');

    showEditDialog('编辑预警 - ' + item.alert_id, [
        { key: 'level', label: '等级', type: 'select', value: item.level, options: [{ value: 'I级', label: 'I级' }, { value: 'II级', label: 'II级' }, { value: 'III级', label: 'III级' }] },
        { key: 'asset_name', label: '资产名称', value: item.asset_name },
        { key: 'district_name', label: '区县', value: item.district_name },
        { key: 'alert_type', label: '预警类型', value: item.alert_type },
        { key: 'content', label: '内容', value: item.content },
        { key: 'status', label: '状态', type: 'select', value: item.status, options: [{ value: 'pending', label: '待处置' }, { value: 'processing', label: '处理中' }, { value: 'resolved', label: '已处置' }] },
        { key: 'handler', label: '处理人', value: item.handler || '' },
    ], function (result) {
        Object.assign(item, result);
        var list = window.__mockData.alertRecords;
        saveMockData('alertRecords', list);
        renderAlertTable(list);
        persistAndNotify('alert', 'update', item);
        showToast('✅ 已更新预警: ' + item.alert_id, 'success');
    });
};

window.__dmDeleteAlert = function (alertId) {
    var data = window.__mockData?.alertRecords || [];
    data = data.filter(function (a) { return a.alert_id !== alertId; });
    window.__mockData.alertRecords = data;
    saveMockData('alertRecords', data);
    renderAlertTable(data);
    persistAndNotify('alert', 'delete', { alert_id: alertId });
    showToast('🗑️ 已删除预警', 'success');
};

window.__dmCreateAlert = function () {
    showEditDialog('新建预警', [
        { key: 'level', label: '等级', type: 'select', value: 'II级', options: [{ value: 'I级', label: 'I级' }, { value: 'II级', label: 'II级' }, { value: 'III级', label: 'III级' }] },
        { key: 'asset_name', label: '资产名称', value: '新建桥梁' },
        { key: 'district_name', label: '区县', value: '渝中区' },
        { key: 'alert_type', label: '预警类型', value: '结构异常' },
        { key: 'content', label: '预警内容', value: '请填写预警内容' },
        { key: 'status', label: '状态', type: 'select', value: 'pending', options: [{ value: 'pending', label: '待处置' }, { value: 'processing', label: '处理中' }, { value: 'resolved', label: '已处置' }] },
        { key: 'handler', label: '处理人', value: '' },
    ], function (result) {
        result.alert_id = 'ALT_' + Date.now();
        result.time = new Date().toISOString().slice(0, 16).replace('T', ' ');
        result.asset_group = result.district_name + '桥群';
        result.created_at = new Date().toISOString();
        result.updated_at = null;
        var list = window.__mockData.alertRecords || [];
        list.unshift(result);
        saveMockData('alertRecords', list);
        renderAlertTable(list);
        persistAndNotify('alert', 'create', result);
        showToast('✅ 已新建预警', 'success');
    });
};

// ============================================================
// 搜索/筛选绑定
// ============================================================
function bindSearchEvents() {
    // 桥隧筛选
    window.__dmFilterBridge = function () {
        var query = (document.getElementById('dm-bridge-search')?.value || '').toLowerCase();
        var riskLevel = document.getElementById('dm-bridge-filter-risk')?.value || '';
        var passStatus = document.getElementById('dm-bridge-filter-pass')?.value || '';
        var data = window.__mockData?.bridgeArchives || [];
        var filtered = data.filter(function (b) {
            if (query && !(b.name || '').toLowerCase().includes(query) && !(b.uuid || '').toLowerCase().includes(query) && !(b.district_name || '').toLowerCase().includes(query)) return false;
            if (riskLevel && b.risk_level !== riskLevel) return false;
            if (passStatus && b.truck_pass_status !== passStatus) return false;
            return true;
        });
        renderBridgeTable(filtered);
        showToast('🔍 筛选中: ' + filtered.length + '/' + data.length + ' 条', 'info');
    };

    // 路网筛选
    window.__dmFilterRoadnet = function () {
        var query = (document.getElementById('dm-roadnet-search')?.value || '').toLowerCase();
        var district = document.getElementById('dm-roadnet-filter-district')?.value || '';
        var highway = document.getElementById('dm-roadnet-filter-highway')?.value || '';
        var status = document.getElementById('dm-roadnet-filter-status')?.value || '';
        var data = window.__mockData?.roadnetBusinessAttributes || [];
        var filtered = data.filter(function (d) {
            if (query && !(d.name || '').toLowerCase().includes(query) && !(d.ref || '').toLowerCase().includes(query)) return false;
            if (district && d.district_name !== district) return false;
            if (highway && !(d.highway || '').includes(highway)) return false;
            if (status && d.status !== status) return false;
            return true;
        });
        // 重新渲染
        renderRoadnetTable(filtered);
        updateRoadnetStats(filtered);
        showToast('🔍 筛选中: ' + filtered.length + '/' + data.length + ' 条', 'info');
    };

    // 区县筛选
    window.__dmFilterDistrict = function () {
        var query = (document.getElementById('dm-district-search')?.value || '').toLowerCase();
        var riskLevel = document.getElementById('dm-district-filter-risk')?.value || '';
        var data = window.__mockData?.districtMetrics || [];
        var filtered = data.filter(function (d) {
            if (query && !(d.district_name || '').toLowerCase().includes(query)) return false;
            if (riskLevel && d.risk_level !== riskLevel) return false;
            return true;
        });
        renderDistrictTable(filtered);
        showToast('🔍 筛选中: ' + filtered.length + '/' + data.length + ' 条', 'info');
    };

    // 指标搜索
    window.__dmFilterMetric = function () {
        var query = (document.getElementById('dm-metric-search')?.value || '').toLowerCase();
        var data = window.__mockData?.dashboardMetrics || [];
        if (!query) { renderMetricTable(data); return; }
        var filtered = data.filter(function (m) {
            return (m.metric_name || '').toLowerCase().includes(query);
        });
        renderMetricTable(filtered);
    };

    // 风险搜索
    window.__dmFilterRisk = function () {
        var query = (document.getElementById('dm-risk-search')?.value || '').toLowerCase();
        var data = window.__mockData?.riskRankingItems || [];
        if (!query) { renderRiskTable(data); return; }
        var filtered = data.filter(function (r) {
            return (r.asset_name || '').toLowerCase().includes(query);
        });
        renderRiskTable(filtered);
    };

    // 预警筛选
    window.__dmFilterAlert = function () {
        var query = (document.getElementById('dm-alert-search')?.value || '').toLowerCase();
        var level = document.getElementById('dm-alert-filter-level')?.value || '';
        var status = document.getElementById('dm-alert-filter-status')?.value || '';
        var district = document.getElementById('dm-alert-filter-district')?.value || '';
        var data = window.__mockData?.alertRecords || [];
        var filtered = data.filter(function (a) {
            if (query && !(a.asset_name || '').toLowerCase().includes(query)) return false;
            if (level && a.level !== level) return false;
            if (status && a.status !== status) return false;
            if (district && a.district_name !== district) return false;
            return true;
        });
        renderAlertTable(filtered);
        showToast('🔍 筛选中: ' + filtered.length + '/' + data.length + ' 条', 'info');
    };
}

// ============================================================
// 导出/导入 JSON（通用）
// ============================================================
window.__dmExportJSON = function (key) {
    var data = window.__mockData ? window.__mockData[key] : null;
    if (!data || (Array.isArray(data) && data.length === 0)) {
        return showToast('没有可导出的数据', 'warning');
    }
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = key + '_export_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(url);
    var count = Array.isArray(data) ? data.length : 1;
    showToast('📤 已导出 ' + count + ' 条记录', 'success');
};

window.__dmImportJSON = function (key) {
    var input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.addEventListener('change', function (e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
            try {
                var json = JSON.parse(ev.target.result);
                var items = Array.isArray(json) ? json : [json];
                window.__mockData[key] = items;
                saveMockData(key, items);
                // 刷新对应 Tab
                if (key === 'bridgeArchives') loadBridgeTab();
                else if (key === 'districtMetrics') loadDistrictTab();
                else if (key === 'dashboardMetrics') loadMetricTab();
                showToast('✅ 已导入 ' + items.length + ' 条记录', 'success');
                persistAndNotify(key, 'import', { count: items.length });
            } catch (err) {
                showToast('❌ 导入失败: ' + err.message, 'error');
            }
        };
        reader.readAsText(file);
    });
    input.click();
};

// ============================================================
// 重置所有数据
// ============================================================
window.__dmResetAll = function () {
    if (!confirm('确定要恢复所有数据为默认值吗？\n当前编辑的内容将丢失。')) return;
    // 清除所有 localStorage
    var keys = ['bridgeArchives', 'roadnetBusinessAttributes', 'roadnetOverview', 'districtMetrics', 'dashboardMetrics', 'riskRankingItems', 'trendData', 'alertRecords', 'moduleConfigs', 'simulationArchiveData'];
    keys.forEach(function (k) {
        localStorage.removeItem('plant_mock_' + k);
    });
    showToast('🔄 正在重置所有数据...', 'info');
    setTimeout(function () {
        window.location.reload();
    }, 500);
};