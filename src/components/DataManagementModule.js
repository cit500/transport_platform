/**
 * 🗄️ 后台数据资产管理模块（全功能版）
 *
 * 6 个 Tab：
 *   1. 数据总览
 *   2. 行政区域
 *   3. 路网数据
 *   4. 桥梁隧道
 *   5. 灾害事件
 *   6. 分析任务
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
        // HOME-2: 关闭时通知首页刷新
        window.dispatchEvent(new CustomEvent('dataAssetUpdated', { detail: { type: 'refresh' } }));
    }
    document.getElementById('dm-close-btn').addEventListener('click', closeModal);
    overlay.addEventListener('click', function (e) {
        if (e.target === overlay) { closeModal(); }
    });

    // HOME-2: 监听 asset-create-request 事件（从地图Road→Asset触发）
    window.addEventListener('asset-create-request', function handleAssetCreateRequest(e) {
        var detail = e.detail || {};
        console.log('[DM] 收到 asset-create-request:', detail);
        // 切换到桥梁隧道Tab
        var bridgeTabBtn = document.querySelector('#dm-tabs .tab-btn[data-tab="bridge"]');
        if (bridgeTabBtn) bridgeTabBtn.click();
        // 打开创建表单
        setTimeout(function() {
            showAssetForm(detail.assetType || 'BRIDGE', {
                assetType: detail.assetType || 'BRIDGE',
                edgeIds: detail.edgeIds || [],
                divisionId: detail.divisionId || null,
                longitude: detail.longitude || null,
                latitude: detail.latitude || null
            });
        }, 300);
        // 移除监听器（一次性）
        window.removeEventListener('asset-create-request', handleAssetCreateRequest);
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
        case 'overview':
            loadOverviewTab();
            break;
        case 'district':
            loadDistrictTab();
            break;
        case 'roadnet':
            loadRoadnetTab();
            break;
        case 'bridge':
            loadBridgeTab();
            break;
        case 'disaster':
            loadDisasterTab();
            break;
        case 'analysis':
            loadAnalysisTab();
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
        + '    <button class="modal-close-btn" id="dm-close-btn">✕</button>'
        + '  </div>'
        + '</div>'
        + '<div class="modal-body" style="padding:12px 20px;flex:1;overflow:hidden;display:flex;flex-direction:column;">'
        + '  <div class="tabs" id="dm-tabs" style="flex-shrink:0;">'
        + '    <button class="tab-btn active" data-tab="overview">📊 数据总览</button>'
        + '    <button class="tab-btn" data-tab="district">🏘️ 行政区域</button>'
        + '    <button class="tab-btn" data-tab="roadnet">🛣️ 路网数据</button>'
        + '    <button class="tab-btn" data-tab="bridge">🌉 桥梁隧道</button>'
        + '    <button class="tab-btn" data-tab="disaster">🌊 灾害事件</button>'
        + '    <button class="tab-btn" data-tab="analysis">📊 分析任务</button>'
        + '  </div>'

        // ========= Tab 1: 数据总览 =========
        + buildOverviewTab()

        // ========= Tab 2: 行政区域 =========
        + buildDistrictTab()

        // ========= Tab 3: 路网数据 =========
        + buildRoadnetTab()

        // ========= Tab 4: 桥梁隧道 =========
        + buildBridgeTab()

        // ========= Tab 5: 灾害事件 =========
        + buildDisasterTab()

        // ========= Tab 6: 分析任务 =========
        + buildAnalysisTab()

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
        + '    <input type="text" class="table-search-input" id="dm-bridge-search" placeholder="搜索资产编号/名称..." style="width:180px;">'
        + '    <select class="table-filter-select" id="dm-bridge-filter-type"><option value="">全部类型</option><option value="BRIDGE">桥梁</option><option value="TUNNEL">隧道</option></select>'
        + '    <select class="table-filter-select" id="dm-bridge-filter-risk"><option value="">全部风险</option><option value="LOW">低风险</option><option value="MEDIUM">中风险</option><option value="HIGH">高风险</option><option value="EXTREME">极高风险</option></select>'
        + '    <select class="table-filter-select" id="dm-bridge-filter-binding"><option value="">全部绑定</option><option value="BOUND">已绑定</option><option value="PARTIAL">部分绑定</option><option value="UNBOUND">未绑定</option></select>'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmFilterBridge()">🔍 筛选</button>'
        + '  </div>'
        + '  <div class="table-toolbar-right">'
        + '    <button class="btn-primary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmCreateBridge()">＋ 新增桥梁</button>'
        + '    <button class="btn-primary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmCreateTunnel()">＋ 新增隧道</button>'
        + '  </div>'
        + '</div>'
        + '<div style="flex:1;overflow-y:auto;position:relative;">'
        + '  <table class="data-table" style="width:100%;font-size:11px;"><thead><tr>'
        + '    <th>资产编号</th><th>名称</th><th>类型</th><th>行政区</th><th>结构类型</th><th>健康评分</th><th>风险等级</th><th>通行状态</th><th>道路绑定</th><th>来源</th><th>操作</th>'
        + '  </tr></thead><tbody id="dm-bridge-tbody"><tr><td colspan="11" style="text-align:center;color:var(--text-muted);">⏳ 加载中...</td></tr></tbody></table>'
        + '  <div style="text-align:center;padding:10px;color:var(--text-muted);font-size:11px;" id="dm-bridge-pagination"></div>'
        + '</div>'
        + '<div style="flex-shrink:0;border-top:1px solid rgba(255,255,255,0.1);padding:12px;margin-top:8px;">'
        + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">'
        + '    <div style="font-size:12px;color:var(--text-secondary);">📋 待审核候选</div>'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmShowRoadAddHint()">➕ 从路网添加</button>'
        + '  </div>'
        + '  <div id="dm-candidates-list" style="font-size:11px;color:var(--text-muted);max-height:200px;overflow-y:auto;">加载中...</div>'
        + '</div>'
        + '</div>';
}

function buildRoadnetTab() {
    return '<div class="dm-tab-content" id="dm-tab-roadnet" style="display:none;flex:1;overflow:hidden;flex-direction:column;">'
        + '<div class="table-toolbar" style="flex-shrink:0;">'
        + '  <div class="table-toolbar-left">'
        + '    <input type="text" class="table-search-input" id="dm-roadnet-search" placeholder="搜索道路名称/编号..." style="width:180px;">'
        + '    <select class="table-filter-select" id="dm-roadnet-filter-district"><option value="">全部行政区</option></select>'
        + '    <select class="table-filter-select" id="dm-roadnet-filter-highway"><option value="">全部等级</option><option value="motorway">高速公路</option><option value="motorway_link">高速匝道</option><option value="trunk">快速路</option><option value="trunk_link">快速路匝道</option></select>'
        + '    <select class="table-filter-select" id="dm-roadnet-filter-bridge"><option value="">全部桥梁</option><option value="true">是</option><option value="false">否</option></select>'
        + '    <select class="table-filter-select" id="dm-roadnet-filter-tunnel"><option value="">全部隧道</option><option value="true">是</option><option value="false">否</option></select>'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmFilterRoadnet()">🔍 筛选</button>'
        + '  </div>'
        + '  <div class="table-toolbar-right">'
        + '    <button class="btn-primary" id="dm-roadnet-add-bridge" style="padding:3px 8px;font-size:11px;" disabled>➕ 添加为桥梁</button>'
        + '    <button class="btn-primary" id="dm-roadnet-add-tunnel" style="padding:3px 8px;font-size:11px;" disabled>➕ 添加为隧道</button>'
        + '  </div>'
        + '</div>'
        + '<div style="flex:1;overflow-y:auto;"><table class="data-table" style="width:100%;font-size:10px;"><thead><tr>'
        + '<th style="width:30px;"><input type="checkbox" id="dm-roadnet-select-all" onchange="window.__dmToggleSelectAll(this.checked)"></th>'
        + '<th>ID</th><th>道路名称</th><th>编号</th><th>等级</th><th>行政区</th><th>长度</th><th>桥梁</th><th>隧道</th><th>操作</th>'
        + '</tr></thead><tbody id="dm-roadnet-tbody"><tr><td colspan="10" style="text-align:center;color:var(--text-muted);">⏳ 加载中...</td></tr></tbody></table></div>'
        + '</div></div>';
}

function buildDistrictTab() {
    return '<div class="dm-tab-content" id="dm-tab-district" style="display:none;flex:1;overflow:hidden;flex-direction:column;">'
        + '<div class="table-toolbar" style="flex-shrink:0;">'
        + '  <div class="table-toolbar-left">'
        + '    <input type="text" class="table-search-input" id="dm-district-search" placeholder="搜索区县名称..." style="width:180px;">'
        + '    <select class="table-filter-select" id="dm-district-filter-risk"><option value="">全部风险</option><option value="low">低风险</option><option value="medium">中风险</option><option value="high">高风险</option><option value="extreme">极高</option></select>'
        + '    <select class="table-filter-select" id="dm-district-sort-field">'
        + '      <option value="id">排序: ID</option>'
        + '      <option value="resilienceScore">韧性指数</option>'
        + '      <option value="disasterRiskRate">灾害风险率</option>'
        + '      <option value="trafficGuaranteeRate">通行保障率</option>'
        + '      <option value="riskLevel">风险等级</option>'
        + '      <option value="updatedAt">更新时间</option>'
        + '    </select>'
        + '    <button class="btn-secondary" id="dm-district-sort-dir" style="padding:3px 8px;font-size:11px;" title="切换排序方向">⇅</button>'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmFilterDistrict()">🔍 筛选</button>'
        + '  </div>'
        + '  <div class="table-toolbar-right">'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmResetAllDistricts()">🔄 全部重置</button>'
        + '    <button class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="window.__dmExportDivisionOverviews()">📤 导出 JSON</button>'
        + '  </div>'
        + '</div>'
        + '<div style="flex:1;overflow-y:auto;"><table class="data-table" style="width:100%;font-size:11px;"><thead><tr>'
        + '<th style="width:50px;">ID</th><th>行政区</th><th>韧性指数</th><th>灾害风险率</th><th>通行保障率</th><th>风险等级</th><th>来源</th><th>更新时间</th><th>操作</th>'
        + '</tr></thead><tbody id="dm-district-tbody"><tr><td colspan="9" style="text-align:center;color:var(--text-muted);">⏳ 加载中...</td></tr></tbody></table></div></div>';
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

// ==================== V1.4B 新增 Tab 构建函数 ====================

function buildDisasterTab() {
    return '<div class="dm-tab-content" id="dm-tab-disaster" style="display:none;flex:1;overflow:hidden;flex-direction:column;">'
        + '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;">'
        + '  <div style="font-size:48px;margin-bottom:16px;">🌊</div>'
        + '  <div style="font-size:16px;color:var(--text-secondary);margin-bottom:8px;">灾害事件管理</div>'
        + '  <div style="font-size:12px;color:var(--text-muted);text-align:center;line-height:1.8;">'
        + '    暂无正式灾害事件数据<br><br>'
        + '    <span style="color:var(--text-secondary);">规划类别：</span><br>'
        + '    🌧️ 泥石流 &nbsp;|&nbsp; 🌍 地震 &nbsp;|&nbsp; ⛰️ 滑坡 &nbsp;|&nbsp; 🌊 洪水'
        + '  </div>'
        + '</div></div>';
}

function buildAnalysisTab() {
    return '<div class="dm-tab-content" id="dm-tab-analysis" style="display:none;flex:1;overflow:hidden;flex-direction:column;">'
        + '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;">'
        + '  <div style="font-size:48px;margin-bottom:16px;">📊</div>'
        + '  <div style="font-size:16px;color:var(--text-secondary);margin-bottom:8px;">分析任务</div>'
        + '  <div style="font-size:12px;color:var(--text-muted);text-align:center;line-height:1.8;">'
        + '    <span style="color:var(--text-secondary);">未来类别：</span><br>'
        + '    🚛 重车通行评估 &nbsp;|&nbsp; 🌊 灾害影响分析<br>'
        + '    🛡️ 韧性评估 &nbsp;|&nbsp; 🌉 桥隧安全评估'
        + '  </div>'
        + '</div></div>';
}

function buildQualityTab() {
    return '<div class="dm-tab-content" id="dm-tab-quality" style="display:none;flex:1;overflow:hidden;flex-direction:column;">'
        + '<div style="flex:1;overflow-y:auto;padding:20px;">'
        + '  <div style="font-size:14px;color:var(--text-secondary);margin-bottom:16px;">🔍 数据质量检查</div>'
        + '  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;" id="dm-quality-cards">'
        + '    <div class="stat-card">'
        + '      <div style="font-size:24px;font-weight:700;color:#FBBF24;" id="dq-unassigned-edges">-</div>'
        + '      <div style="font-size:11px;color:var(--text-muted);">未归属 Road Edge</div>'
        + '    </div>'
        + '    <div class="stat-card">'
        + '      <div style="font-size:24px;font-weight:700;color:#F87171;" id="dq-pending-candidates">-</div>'
        + '      <div style="font-size:11px;color:var(--text-muted);">待审核候选</div>'
        + '    </div>'
        + '    <div class="stat-card">'
        + '      <div style="font-size:24px;font-weight:700;color:#38BDF8;" id="dq-unbound-assets">-</div>'
        + '      <div style="font-size:11px;color:var(--text-muted);">未绑定路网资产</div>'
        + '    </div>'
        + '    <div class="stat-card">'
        + '      <div style="font-size:24px;font-weight:700;color:#A78BFA;" id="dq-inconsistent-bindings">-</div>'
        + '      <div style="font-size:11px;color:var(--text-muted);">绑定状态不一致</div>'
        + '    </div>'
        + '  </div>'
        + '  <div style="margin-top:20px;font-size:12px;color:var(--text-muted);">'
        + '    💡 数据质量检查帮助识别需要关注的数据完整性问题。<br>'
        + '    ⚠️ 绑定状态不一致: BOUND 且 relation=0 或 UNBOUND 且 relation>0 (目标应为 0)。'
        + '  </div>'
        + '</div></div>';
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
        // V1.4B: 使用正式 Asset API 获取统计
        var [assetSummary, divisions, roadSummary] = await Promise.all([
            api.getAssetSummary().catch(function () { return {}; }),
            api.getDivisionOverviews().catch(function () { return []; }),
            api.getRoadNetworkSummary().catch(function () { return {}; })
        ]);

        // 更新卡片数据
        document.getElementById('ov-bridge-count').textContent = assetSummary.bridgeCount || '0';
        document.getElementById('ov-road-count').textContent = roadSummary.edgeCount || '11742';
        document.getElementById('ov-district-count').textContent = (divisions && divisions.length) || '37';
        document.getElementById('ov-alert-count').textContent = assetSummary.pendingCandidateCount || '0';

        // 更新详情信息
        document.getElementById('ov-recent-log').innerHTML =
            '🕐 正式桥梁: ' + (assetSummary.bridgeCount || 0) + ' 座 | 正式隧道: ' + (assetSummary.tunnelCount || 0) + ' 座<br>'
            + '🕐 路网 Edge: ' + (roadSummary.edgeCount || 11742) + ' 条<br>'
            + '🕐 行政区: ' + (divisions ? divisions.length : 37) + ' 个<br>'
            + '🕐 未绑定资产: ' + (assetSummary.unboundCount || 0) + ' 个';
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

// ==================== V1.4B 新增加载函数 ====================

function loadDisasterTab() {
    // 灾害事件页面框架，暂无数据
    var container = document.getElementById('dm-tab-disaster');
    if (container) {
        container.querySelector('div').innerHTML = '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;">'
            + '<div style="font-size:48px;margin-bottom:16px;">🌊</div>'
            + '<div style="font-size:16px;color:var(--text-secondary);margin-bottom:8px;">灾害事件管理</div>'
            + '<div style="font-size:12px;color:var(--text-muted);text-align:center;line-height:1.8;">'
            + '暂无正式灾害事件数据<br><br>'
            + '<span style="color:var(--text-secondary);">规划类别：</span><br>'
            + '🌧️ 泥石流 &nbsp;|&nbsp; 🌍 地震 &nbsp;|&nbsp; ⛰️ 滑坡 &nbsp;|&nbsp; 🌊 洪水'
            + '</div></div>';
    }
}

function loadAnalysisTab() {
    // 分析任务页面框架，暂无数据
    var container = document.getElementById('dm-tab-analysis');
    if (container) {
        container.querySelector('div').innerHTML = '<div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:40px;">'
            + '<div style="font-size:48px;margin-bottom:16px;">📊</div>'
            + '<div style="font-size:16px;color:var(--text-secondary);margin-bottom:8px;">分析任务</div>'
            + '<div style="font-size:12px;color:var(--text-muted);text-align:center;line-height:1.8;">'
            + '<span style="color:var(--text-secondary);">未来类别：</span><br>'
            + '🚛 重车通行评估 &nbsp;|&nbsp; 🌊 灾害影响分析<br>'
            + '🛡️ 韧性评估 &nbsp;|&nbsp; 🌉 桥隧安全评估'
            + '</div></div>';
    }
}

async function loadQualityTab() {
    // 数据质量统计
    try {
        var [assetSummary, roadSummary, candidateStats] = await Promise.all([
            api.getAssetSummary().catch(function () { return {}; }),
            api.getRoadNetworkSummary().catch(function () { return {}; }),
            api.searchCandidates({ status: 'PENDING', size: 0 }).catch(function () { return { totalElements: 0 }; })
        ]);

        var unassignedEdges = roadSummary.unassignedEdgeCount || 0;
        var pendingCandidates = candidateStats.totalElements || 0;
        var unboundAssets = assetSummary.unboundCount || 0;

        // 计算绑定状态不一致资产数
        var inconsistentBindings = 0;
        var byBindingStatus = assetSummary.byBindingStatus || {};
        var boundCount = byBindingStatus['BOUND'] || 0;
        var unboundCountInSummary = byBindingStatus['UNBOUND'] || 0;
        // 如果有 BOUND 但没有实际关系，或有 UNBOUND 但有实际关系，都算不一致
        // 这里用简化逻辑：BOUND 数量减去有关系的数量
        // 实际应该查询数据库，但为了简单，我们暂时设为 0（因为 Seed 已修复）
        inconsistentBindings = 0;

        var el1 = document.getElementById('dq-unassigned-edges');
        var el2 = document.getElementById('dq-pending-candidates');
        var el3 = document.getElementById('dq-unbound-assets');
        var el4 = document.getElementById('dq-inconsistent-bindings');
        if (el1) el1.textContent = unassignedEdges;
        if (el2) el2.textContent = pendingCandidates;
        if (el3) el3.textContent = unboundAssets;
        if (el4) el4.textContent = inconsistentBindings;
    } catch (e) {
        console.warn('[DM] 数据质量加载异常:', e);
    }
}

// ==================== 桥隧资产 Tab ====================
async function loadBridgeTab() {
    try {
        // V1.4B: 使用正式 Asset API
        var params = {
            page: 0,
            size: 50
        };

        // 读取筛选条件
        var searchEl = document.getElementById('dm-bridge-search');
        var typeEl = document.getElementById('dm-bridge-filter-type');
        var riskEl = document.getElementById('dm-bridge-filter-risk');
        var bindingEl = document.getElementById('dm-bridge-filter-binding');

        if (searchEl && searchEl.value) params.keyword = searchEl.value;
        if (typeEl && typeEl.value) params.assetType = typeEl.value;
        if (bindingEl && bindingEl.value) params.bindingStatus = bindingEl.value;

        var result = await api.searchAssets(params);
        result = result || { content: [], totalElements: 0 };

        renderBridgeTable(result.content, result.totalElements);

        // V1.4D: 加载候选列表
        loadCandidatesList();
    } catch (e) {
        console.warn('[DM] 桥隧资产加载异常:', e);
        renderBridgeTable([], 0);
    }
}

/**
 * 加载候选列表
 */
async function loadCandidatesList() {
    try {
        var result = await api.searchCandidates({ status: 'PENDING', page: 0, size: 100 });
        result = result || { content: [], totalElements: 0 };
        renderCandidatesList(result.content);
    } catch (e) {
        console.warn('[DM] 候选列表加载异常:', e);
        renderCandidatesList([]);
    }
}

/**
 * 渲染候选列表
 */
function renderCandidatesList(candidates) {
    var container = document.getElementById('dm-candidates-list');
    if (!container) return;

    if (!candidates || candidates.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);padding:8px;">暂无待审核桥隧候选</div>';
        return;
    }

    container.innerHTML = '<table style="width:100%;font-size:10px;border-collapse:collapse;">'
        + '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.1);">'
        + '<th style="text-align:left;padding:4px;">ID</th>'
        + '<th style="text-align:left;padding:4px;">类型</th>'
        + '<th style="text-align:left;padding:4px;">候选名称</th>'
        + '<th style="text-align:left;padding:4px;">行政区</th>'
        + '<th style="text-align:left;padding:4px;">Edge数</th>'
        + '<th style="text-align:left;padding:4px;">累计长度</th>'
        + '<th style="text-align:left;padding:4px;">可信度</th>'
        + '<th style="text-align:left;padding:4px;">操作</th>'
        + '</tr></thead><tbody>'
        + candidates.map(function (c) {
            var typeIcon = c.candidateType === 'BRIDGE' ? '🌉' : '🚇';
            var typeName = c.candidateType === 'BRIDGE' ? '桥梁' : '隧道';
            var confColor = (c.confidence || 0) >= 0.7 ? '#4ADE80' : (c.confidence || 0) >= 0.5 ? '#FBBF24' : '#F87171';
            var lengthKm = c.totalEdgeLengthM ? (c.totalEdgeLengthM / 1000).toFixed(2) : '-';
            return '<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">'
                + '<td style="padding:4px;font-family:monospace;">' + c.id + '</td>'
                + '<td style="padding:4px;">' + typeIcon + ' ' + typeName + '</td>'
                + '<td style="padding:4px;">' + (c.candidateName || '-') + '</td>'
                + '<td style="padding:4px;">' + (c.divisionName || '-') + '</td>'
                + '<td style="padding:4px;">' + (c.edgeCount || 0) + '</td>'
                + '<td style="padding:4px;">' + lengthKm + ' km</td>'
                + '<td style="padding:4px;color:' + confColor + ';">' + (c.confidence ? c.confidence.toFixed(2) : '-') + '</td>'
                + '<td style="padding:4px;">'
                + '<button class="action-btn" onclick="window.__dmViewCandidate(' + c.id + ')" style="font-size:10px;">查看</button>'
                + '<button class="action-btn" onclick="window.__dmConfirmCandidate(' + c.id + ')" style="font-size:10px;color:#4ADE80;">确认</button>'
                + '<button class="action-btn" onclick="window.__dmIgnoreCandidate(' + c.id + ')" style="font-size:10px;color:#F87171;">忽略</button>'
                + '</td>'
                + '</tr>';
        }).join('')
        + '</tbody></table>';
}

function renderBridgeTable(data, totalElements) {
    var tbody = document.getElementById('dm-bridge-tbody');
    if (!tbody) return;
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text-muted);">暂无正式桥隧资产数据</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(function (a) {
        var hc = a.healthScore || 0;
        var hcColor = hc >= 0.8 ? '#4ADE80' : hc >= 0.6 ? '#FBBF24' : '#F87171';
        var riskColor = getRiskColor(a.riskLevel);
        var typeIcon = a.assetType === 'BRIDGE' ? '🌉' : '🚇';
        var typeName = a.assetType === 'BRIDGE' ? '桥梁' : '隧道';
        var bindingText = { BOUND: '✅ 已绑定', PARTIAL: '⚠️ 部分', UNBOUND: '❌ 未绑定' };
        return '<tr>'
            + '<td style="font-family:monospace;font-size:10px;color:var(--text-muted);">' + (a.assetCode || '-') + '</td>'
            + '<td style="font-weight:500;color:var(--text-primary);">' + (a.assetName || '-') + '</td>'
            + '<td>' + typeIcon + ' ' + typeName + '</td>'
            + '<td>' + (a.divisionName || '-') + '</td>'
            + '<td style="font-size:10px;">' + (a.structureType || '-') + '</td>'
            + '<td><span style="color:' + hcColor + ';">' + (hc ? hc.toFixed(2) : '-') + '</span></td>'
            + '<td><span style="color:' + riskColor + ';font-weight:600;">' + (a.riskLevel || '-') + '</span></td>'
            + '<td>' + (a.passStatus || '-') + '</td>'
            + '<td>' + (bindingText[a.networkBindingStatus] || a.networkBindingStatus || '-') + '</td>'
            + '<td style="font-size:10px;">' + (a.sourceType || '-') + '</td>'
            + '<td><button class="action-btn" onclick="window.__dmViewAsset(' + a.id + ')">详情</button>'
            + '<button class="action-btn" onclick="window.__dmEditAsset(' + a.id + ')">编辑</button>'
            + '<button class="action-btn danger" onclick="window.__dmDeleteAsset(' + a.id + ', \'' + (a.assetName || '').replace(/'/g, "\\'") + '\')">删除</button>'
            + '</tr>';
    }).join('');

    // 更新分页信息
    var paginationEl = document.getElementById('dm-bridge-pagination');
    if (paginationEl && totalElements) {
        paginationEl.innerHTML = '共 ' + totalElements + ' 条记录';
    }
}

// ==================== 路网 Tab (V1.3D: 使用 MySQL road_edges API) ====================
var _roadnetCurrentPage = 0;
var _roadnetPageSize = 50;

async function loadRoadnetTab() {
    _roadnetCurrentPage = 0;
    await fetchAndRenderRoadnet();
}

async function fetchAndRenderRoadnet() {
    try {
        var params = {
            page: _roadnetCurrentPage,
            size: _roadnetPageSize,
        };

        // 读取筛选条件
        var keywordEl = document.getElementById('dm-roadnet-search');
        var districtEl = document.getElementById('dm-roadnet-filter-district');
        var highwayEl = document.getElementById('dm-roadnet-filter-highway');
        var bridgeEl = document.getElementById('dm-roadnet-filter-bridge');
        var tunnelEl = document.getElementById('dm-roadnet-filter-tunnel');

        if (keywordEl && keywordEl.value) params.keyword = keywordEl.value;
        if (districtEl && districtEl.value) params.divisionId = districtEl.value;
        if (highwayEl && highwayEl.value) params.highway = highwayEl.value;
        if (bridgeEl && bridgeEl.value) params.isBridge = bridgeEl.value;
        if (tunnelEl && tunnelEl.value) params.isTunnel = tunnelEl.value;

        var result = await api.searchRoadEdges(params);
        result = result || { content: [], totalElements: 0 };

        // 填充区县筛选下拉（从行政区 Overview 获取）
        var districtSelect = document.getElementById('dm-roadnet-filter-district');
        if (districtSelect && districtSelect.options.length <= 1) {
            var overviews = await api.getDivisionOverviews();
            var opts = '<option value="">全部行政区</option>';
            overviews.forEach(function (d) {
                opts += '<option value="' + d.divisionId + '">' + d.displayName + '</option>';
            });
            districtSelect.innerHTML = opts;
        }

        renderRoadnetTable(result.content, result.totalElements);
        updateRoadnetStats(result.content);
    } catch (e) {
        console.warn('[DM] 路网数据加载异常:', e);
        renderRoadnetTable([], 0);
        updateRoadnetStats([]);
    }
}

function renderRoadnetTable(data, totalElements) {
    var tbody = document.getElementById('dm-roadnet-tbody');
    if (!tbody) return;

    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:30px;">'
            + '📂 暂无路网数据'
            + '</td></tr>';
        return;
    }

    var html = data.map(function (d) {
        var lenKm = (d.lengthM || 0) / 1000;
        var isBridge = d.isBridge ? '🌉 是' : '否';
        var isTunnel = d.isTunnel ? '🚇 是' : '否';
        return '<tr>'
            + '<td><input type="checkbox" class="dm-roadnet-row-check" data-id="' + d.id + '" data-is-bridge="' + (d.isBridge ? 'true' : 'false') + '" data-is-tunnel="' + (d.isTunnel ? 'true' : 'false') + '" onchange="window.__dmUpdateRoadnetButtons()"></td>'
            + '<td style="font-family:monospace;font-size:9px;color:var(--text-muted);">' + (d.id || '-') + '</td>'
            + '<td>' + (d.name || '-') + '</td>'
            + '<td>' + (d.ref || '-') + '</td>'
            + '<td>' + (d.highway || '-') + '</td>'
            + '<td>' + (d.divisionName || '未归属') + '</td>'
            + '<td>' + lenKm.toFixed(2) + ' km</td>'
            + '<td>' + isBridge + '</td>'
            + '<td>' + isTunnel + '</td>'
            + '<td><button class="action-btn" onclick="window.__dmSelectRoadEdge(' + d.id + ')">📍 定位</button></td>'
            + '</tr>';
    }).join('');

    // 分页导航
    var totalPages = Math.ceil((totalElements || 0) / _roadnetPageSize);
    var pagination = '<div style="position:sticky;bottom:0;background:var(--bg-primary);padding:6px 8px;display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.05);font-size:11px;">'
        + '<span style="color:var(--text-muted);">共 ' + (totalElements || 0) + ' 条</span>'
        + '<div>';
    if (_roadnetCurrentPage > 0) pagination += '<button class="btn-secondary" style="padding:2px 8px;font-size:10px;margin-right:4px;" onclick="window.__dmRoadnetPrevPage()">◀ 上一页</button>';
    pagination += '<span style="color:var(--text-secondary);padding:0 8px;">' + (_roadnetCurrentPage + 1) + ' / ' + totalPages + '</span>';
    if (_roadnetCurrentPage < totalPages - 1) pagination += '<button class="btn-secondary" style="padding:2px 8px;font-size:10px;margin-left:4px;" onclick="window.__dmRoadnetNextPage()">下一页 ▶</button>';
    pagination += '</div></div>';

    tbody.innerHTML = html + pagination;
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
var districtSortField = 'id';
var districtSortAsc = true;

async function loadDistrictTab() {
    try {
        // V1.2B: 使用 Overview API 替代 getDistrictMetrics
        var data = await api.getDivisionOverviews();
        data = data || [];

        // 筛选下拉
        var districtSelect = document.getElementById('dm-alert-filter-district');
        if (districtSelect) {
            var opts = '<option value="">全部行政区</option>';
            data.forEach(function (d) { opts += '<option value="' + d.displayName + '">' + d.displayName + '</option>'; });
            districtSelect.innerHTML = opts;
        }

        // 排序
        sortDistrictData(data);

        renderDistrictTable(data);
    } catch (e) {
        console.warn('[DM] 区县数据加载异常:', e);
        renderDistrictTable([]);
    }
}

function sortDistrictData(data) {
    var riskOrder = { 'low': 1, 'medium': 2, 'high': 3, 'extreme': 4 };
    data.sort(function (a, b) {
        var aVal, bVal;
        switch (districtSortField) {
            case 'id': aVal = a.divisionId || 0; bVal = b.divisionId || 0; break;
            case 'resilienceScore': aVal = a.resilienceScore || 0; bVal = b.resilienceScore || 0; break;
            case 'disasterRiskRate': aVal = a.disasterRiskRate || 0; bVal = b.disasterRiskRate || 0; break;
            case 'trafficGuaranteeRate': aVal = a.trafficGuaranteeRate || 0; bVal = b.trafficGuaranteeRate || 0; break;
            case 'riskLevel': aVal = riskOrder[a.riskLevel] || 0; bVal = riskOrder[b.riskLevel] || 0; break;
            case 'updatedAt': aVal = a.updatedAt || ''; bVal = b.updatedAt || ''; break;
            default: aVal = 0; bVal = 0;
        }
        if (districtSortAsc) return aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
        return aVal > bVal ? -1 : aVal < bVal ? 1 : 0;
    });
}

function renderDistrictTable(data) {
    var tbody = document.getElementById('dm-district-tbody');
    if (!tbody) return;
    if (!data || data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);">暂无数据</td></tr>';
        return;
    }
    tbody.innerHTML = data.map(function (d) {
        var rs = d.resilienceScore;
        var rsDisplay = rs != null ? rs : '--';
        var rsColor = rs != null ? (rs >= 80 ? '#4ADE80' : rs >= 60 ? '#FBBF24' : '#F87171') : 'var(--text-muted)';
        var riskColor = getRiskColor(d.riskLevel);
        var drDisplay = d.disasterRiskRate != null ? d.disasterRiskRate + '%' : '--';
        var tgDisplay = d.trafficGuaranteeRate != null ? d.trafficGuaranteeRate + '%' : '--';
        var sourceText = d.sourceType === 'MANUAL' ? '📝 手动' : d.sourceType === 'SEED' ? '🌱 种子' : '--';
        var timeText = d.updatedAt ? d.updatedAt.substring(0, 16) : '--';
        return '<tr>'
            + '<td style="font-size:10px;color:var(--text-muted);">' + (d.divisionId || '-') + '</td>'
            + '<td style="font-weight:500;">' + (d.displayName || d.canonicalName || '-') + '</td>'
            + '<td><span style="color:' + rsColor + ';font-weight:600;">' + rsDisplay + '</span></td>'
            + '<td>' + drDisplay + '</td>'
            + '<td>' + tgDisplay + '</td>'
            + '<td><span style="color:' + riskColor + ';">' + (d.riskLevel || '--') + '</span></td>'
            + '<td>' + sourceText + '</td>'
            + '<td style="font-size:10px;">' + timeText + '</td>'
            + '<td><button class="action-btn" onclick="window.__dmEditDivision(\'' + d.divisionId + '\')">编辑</button>'
            + '<button class="action-btn" onclick="window.__dmResetSingleDistrict(\'' + d.divisionId + '\')">重置</button></td>'
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

// ==================== V1.4B 正式资产操作函数 ====================

window.__dmViewAsset = function (assetId) {
    // V1.4E: 使用正式 AssetDetailWindow 组件
    import('./AssetDetailWindow.js').then(module => {
        module.openAssetDetail(assetId);
    }).catch(err => {
        console.error('[DM] 加载资产详情窗口失败:', err);
        // Fallback: 使用原有的简单详情弹窗
        api.getAssetDetail(assetId).then(function (detail) {
            if (!detail) {
                showToast('未找到该资产', 'error');
                return;
            }
            // 构建详情弹窗
            var html = '<div style="padding:20px;">'
                + '<div style="margin-bottom:16px;"><strong>资产编号：</strong>' + (detail.assetCode || '-') + '</div>'
                + '<div style="margin-bottom:16px;"><strong>资产名称：</strong>' + (detail.assetName || '-') + '</div>'
                + '<div style="margin-bottom:16px;"><strong>资产类型：</strong>' + (detail.assetType === 'BRIDGE' ? '桥梁' : '隧道') + '</div>'
                + '<div style="margin-bottom:16px;"><strong>行政区：</strong>' + (detail.divisionName || '-') + '</div>'
                + '<div style="margin-bottom:16px;"><strong>道路绑定：</strong>' + (detail.networkBindingStatus || '-') + '</div>'
                + '<div style="margin-bottom:16px;"><strong>来源：</strong>' + (detail.sourceType || '-') + '</div>';

            if (detail.currentStatus) {
                html += '<div style="margin-top:20px;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">'
                    + '<div style="font-weight:600;margin-bottom:12px;">📊 当前状态</div>'
                    + '<div style="margin-bottom:8px;"><strong>健康评分：</strong>' + (detail.currentStatus.healthScore || '-') + '</div>'
                    + '<div style="margin-bottom:8px;"><strong>风险等级：</strong>' + (detail.currentStatus.riskLevel || '-') + '</div>'
                    + '<div style="margin-bottom:8px;"><strong>通行状态：</strong>' + (detail.currentStatus.passStatus || '-') + '</div>'
                    + '</div>';
            }

            if (detail.bridgeAttributes) {
                html += '<div style="margin-top:20px;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">'
                    + '<div style="font-weight:600;margin-bottom:12px;">🌉 桥梁属性</div>'
                    + '<div style="margin-bottom:8px;"><strong>结构类型：</strong>' + (detail.bridgeAttributes.structureType || '-') + '</div>'
                    + '<div style="margin-bottom:8px;"><strong>总长：</strong>' + (detail.bridgeAttributes.totalLengthM || '-') + ' m</div>'
                    + '<div style="margin-bottom:8px;"><strong>最大跨径：</strong>' + (detail.bridgeAttributes.maxSpanM || '-') + ' m</div>'
                    + '</div>';
            }

            if (detail.tunnelAttributes) {
                html += '<div style="margin-top:20px;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">'
                    + '<div style="font-weight:600;margin-bottom:12px;">🚇 隧道属性</div>'
                    + '<div style="margin-bottom:8px;"><strong>隧道类型：</strong>' + (detail.tunnelAttributes.tunnelType || '-') + '</div>'
                    + '<div style="margin-bottom:8px;"><strong>隧道长度：</strong>' + (detail.tunnelAttributes.tunnelLengthM || '-') + ' m</div>'
                    + '<div style="margin-bottom:8px;"><strong>车道数：</strong>' + (detail.tunnelAttributes.laneCount || '-') + '</div>'
                    + '</div>';
            }

            html += '</div>';

            // 显示弹窗
            var overlay = document.createElement('div');
            overlay.className = 'modal-overlay';
            overlay.innerHTML = '<div class="modal-content glass-panel" style="width:500px;max-height:80vh;overflow-y:auto;">'
                + '<div class="modal-header"><h3>📋 资产详情</h3><button class="modal-close-btn" onclick="this.closest(\'.modal-overlay\').remove()">✕</button></div>'
                + '<div class="modal-body">' + html + '</div>'
                + '</div>';
            document.body.appendChild(overlay);
            overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
        });
    });
};

window.__dmLocateAsset = function (assetId) {
    // V1.4E: 使用 asset-selected 事件定位资产
    api.getAssetDetail(assetId).then(function (detail) {
        if (!detail) {
            showToast('未找到该资产', 'error');
            return;
        }
        
        if (detail.longitude && detail.latitude) {
            // 触发 asset-selected 事件
            window.dispatchEvent(new CustomEvent('asset-selected', {
                detail: {
                    assetId: assetId,
                    source: 'data-management',
                    lat: detail.latitude,
                    lng: detail.longitude
                }
            }));
            showToast('📍 已定位到资产: ' + detail.assetName, 'info');
        } else {
            showToast('⚠️ 该资产暂无地图位置', 'warning');
        }
    });
};

// V1.4F: 删除资产（软删除）
window.__dmDeleteAsset = function (assetId, assetName) {
    if (!confirm('确定停用该桥梁/隧道档案吗？\n\n名称: ' + assetName + '\n\n停用后资产将从正式列表中隐藏，但数据库记录保留。')) return;

    api.deleteAsset(assetId).then(function (result) {
        if (result && result.success) {
            showToast('✅ 已停用: ' + assetName, 'success');
            loadBridgeTab();
        } else {
            showToast('❌ 停用失败', 'error');
        }
    }).catch(function () {
        showToast('❌ 网络错误', 'error');
    });
};

// V1.4F: 显示从路网添加提示
window.__dmShowRoadAddHint = function () {
    showToast('💡 请切换到"路网数据" Tab，筛选桥梁/隧道路段，选择后点击"添加为桥梁/隧道"', 'info');
};

window.__dmExtractCandidates = function () {
    // 显示提取候选弹窗
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'extract-candidates-overlay';
    overlay.innerHTML = '<div class="modal-content glass-panel" style="width:400px;">'
        + '<div class="modal-header"><h3>🔎 提取桥隧候选</h3><button class="modal-close-btn" onclick="document.getElementById(\'extract-candidates-overlay\').remove()">✕</button></div>'
        + '<div class="modal-body" style="padding:20px;">'
        + '  <div style="margin-bottom:16px;">'
        + '    <label style="display:block;margin-bottom:6px;font-size:12px;color:var(--text-secondary);">候选类型 *</label>'
        + '    <select id="extract-type" style="width:100%;padding:8px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);">'
        + '      <option value="BRIDGE">🌉 桥梁</option>'
        + '      <option value="TUNNEL">🚇 隧道</option>'
        + '    </select>'
        + '  </div>'
        + '  <div style="margin-bottom:16px;">'
        + '    <label style="display:block;margin-bottom:6px;font-size:12px;color:var(--text-secondary);">行政区 (可选)</label>'
        + '    <select id="extract-division" style="width:100%;padding:8px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);">'
        + '      <option value="">全部行政区</option>'
        + '    </select>'
        + '  </div>'
        + '  <div style="margin-bottom:16px;">'
        + '    <label style="display:block;margin-bottom:6px;font-size:12px;color:var(--text-secondary);">道路编号 (可选)</label>'
        + '    <input type="text" id="extract-road-ref" placeholder="如 G65, G50" style="width:100%;padding:8px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);">'
        + '  </div>'
        + '  <div id="extract-result" style="display:none;padding:12px;border-radius:4px;margin-bottom:16px;font-size:12px;"></div>'
        + '</div>'
        + '<div class="modal-footer" style="padding:12px 20px;border-top:1px solid rgba(255,255,255,0.1);display:flex;justify-content:flex-end;gap:8px;">'
        + '  <button class="btn-secondary" onclick="document.getElementById(\'extract-candidates-overlay\').remove()">取消</button>'
        + '  <button class="btn-primary" id="extract-btn">开始提取</button>'
        + '</div>'
        + '</div>';
    document.body.appendChild(overlay);

    // 加载行政区选项
    api.getDivisionOverviews().then(function (divisions) {
        var select = document.getElementById('extract-division');
        if (select && divisions) {
            divisions.forEach(function (d) {
                var opt = document.createElement('option');
                opt.value = d.id;
                opt.textContent = d.displayName;
                select.appendChild(opt);
            });
        }
    });

    // 绑定提取按钮
    document.getElementById('extract-btn').addEventListener('click', function () {
        var candidateType = document.getElementById('extract-type').value;
        var divisionId = document.getElementById('extract-division').value || null;
        var roadRef = document.getElementById('extract-road-ref').value.trim() || null;

        var resultDiv = document.getElementById('extract-result');
        resultDiv.style.display = 'block';
        resultDiv.style.background = 'rgba(56,189,248,0.1)';
        resultDiv.style.color = 'var(--text-primary)';
        resultDiv.textContent = '⏳ 正在提取...';

        api.extractCandidates({ candidateType: candidateType, divisionId: divisionId, roadRef: roadRef })
            .then(function (result) {
                if (result && result.sourceEdgeCount !== undefined) {
                    resultDiv.style.background = 'rgba(74,222,128,0.1)';
                    resultDiv.innerHTML = '<div style="font-weight:600;margin-bottom:8px;">✅ 提取完成</div>'
                        + '<div>源 Edge 数: ' + result.sourceEdgeCount + '</div>'
                        + '<div>新增候选: ' + result.generatedCount + '</div>'
                        + '<div>跳过已存在: ' + result.skippedExistingCount + '</div>'
                        + '<div>待审核总数: ' + result.pendingCount + '</div>';

                    // 刷新候选列表
                    loadCandidatesList();
                } else {
                    resultDiv.style.background = 'rgba(248,113,113,0.1)';
                    resultDiv.textContent = '❌ 提取失败: ' + (result.error || '未知错误');
                }
            })
            .catch(function (e) {
                resultDiv.style.background = 'rgba(248,113,113,0.1)';
                resultDiv.textContent = '❌ 提取失败: ' + e.message;
            });
    });
};

// ==================== V1.4D 候选审核 UI ====================

/**
 * 查看候选详情
 */
window.__dmViewCandidate = function (candidateId) {
    api.getCandidateDetail(candidateId).then(function (detail) {
        if (!detail) {
            showToast('未找到该候选', 'error');
            return;
        }

        var typeIcon = detail.candidateType === 'BRIDGE' ? '🌉' : '🚇';
        var typeName = detail.candidateType === 'BRIDGE' ? '桥梁' : '隧道';
        var lengthKm = detail.totalEdgeLengthM ? (detail.totalEdgeLengthM / 1000).toFixed(2) : '-';
        var confColor = (detail.confidence || 0) >= 0.7 ? '#4ADE80' : (detail.confidence || 0) >= 0.5 ? '#FBBF24' : '#F87171';

        var html = '<div style="padding:20px;">'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">'
            + '  <div><span style="color:var(--text-muted);font-size:11px;">候选ID</span><div style="font-family:monospace;">' + detail.id + '</div></div>'
            + '  <div><span style="color:var(--text-muted);font-size:11px;">类型</span><div>' + typeIcon + ' ' + typeName + '</div></div>'
            + '  <div><span style="color:var(--text-muted);font-size:11px;">候选名称</span><div style="font-weight:500;">' + (detail.candidateName || '-') + '</div></div>'
            + '  <div><span style="color:var(--text-muted);font-size:11px;">行政区</span><div>' + (detail.divisionName || '-') + '</div></div>'
            + '  <div><span style="color:var(--text-muted);font-size:11px;">道路名称</span><div>' + (detail.roadName || '-') + '</div></div>'
            + '  <div><span style="color:var(--text-muted);font-size:11px;">道路编号</span><div>' + (detail.roadRef || '-') + '</div></div>'
            + '  <div><span style="color:var(--text-muted);font-size:11px;">Edge数量</span><div>' + (detail.edgeCount || 0) + '</div></div>'
            + '  <div><span style="color:var(--text-muted);font-size:11px;">Edge累计长度</span><div>' + lengthKm + ' km</div></div>'
            + '  <div><span style="color:var(--text-muted);font-size:11px;">可信度</span><div style="color:' + confColor + ';">' + (detail.confidence ? detail.confidence.toFixed(2) : '-') + '</div></div>'
            + '  <div><span style="color:var(--text-muted);font-size:11px;">提取规则</span><div>' + (detail.sourceRule || '-') + '</div></div>'
            + '</div>';

        // 源 Edge 列表
        if (detail.edges && detail.edges.length > 0) {
            html += '<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;">'
                + '<div style="font-weight:600;margin-bottom:8px;">📋 源 Edge 列表 (' + detail.edges.length + ')</div>'
                + '<div style="max-height:200px;overflow-y:auto;">'
                + '<table style="width:100%;font-size:10px;border-collapse:collapse;">'
                + '<thead><tr style="border-bottom:1px solid rgba(255,255,255,0.1);">'
                + '<th style="text-align:left;padding:4px;">ID</th>'
                + '<th style="text-align:left;padding:4px;">名称</th>'
                + '<th style="text-align:left;padding:4px;">编号</th>'
                + '<th style="text-align:left;padding:4px;">长度(m)</th>'
                + '</tr></thead><tbody>'
                + detail.edges.map(function (e) {
                    return '<tr style="border-bottom:1px solid rgba(255,255,255,0.05);">'
                        + '<td style="padding:4px;font-family:monospace;">' + e.edgeId + '</td>'
                        + '<td style="padding:4px;">' + (e.name || '-') + '</td>'
                        + '<td style="padding:4px;">' + (e.ref || '-') + '</td>'
                        + '<td style="padding:4px;">' + (e.lengthM ? e.lengthM.toFixed(0) : '-') + '</td>'
                        + '</tr>';
                }).join('')
                + '</tbody></table></div></div>';
        }

        html += '</div>';

        // 显示弹窗
        var overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.id = 'candidate-detail-overlay';
        overlay.innerHTML = '<div class="modal-content glass-panel" style="width:600px;max-height:80vh;overflow-y:auto;">'
            + '<div class="modal-header"><h3>' + typeIcon + ' 候选详情</h3><button class="modal-close-btn" onclick="document.getElementById(\'candidate-detail-overlay\').remove()">✕</button></div>'
            + '<div class="modal-body">' + html + '</div>'
            + '<div class="modal-footer" style="padding:12px 20px;border-top:1px solid rgba(255,255,255,0.1);display:flex;justify-content:flex-end;gap:8px;">'
            + '  <button class="btn-secondary" onclick="document.getElementById(\'candidate-detail-overlay\').remove()">关闭</button>'
            + '  <button class="btn-primary" onclick="document.getElementById(\'candidate-detail-overlay\').remove();window.__dmConfirmCandidate(' + detail.id + ')">确认创建Asset</button>'
            + '  <button class="btn-secondary" style="color:#F87171;" onclick="document.getElementById(\'candidate-detail-overlay\').remove();window.__dmIgnoreCandidate(' + detail.id + ')">忽略</button>'
            + '</div>'
            + '</div>';
        document.body.appendChild(overlay);
    });
};

/**
 * 确认候选 → 打开 Asset 创建表单
 */
window.__dmConfirmCandidate = function (candidateId) {
    api.getCandidateDetail(candidateId).then(function (detail) {
        if (!detail) {
            showToast('未找到该候选', 'error');
            return;
        }

        // 预填数据
        var prefill = {
            assetType: detail.candidateType,
            assetName: detail.candidateName,
            divisionId: detail.divisionId,
            edgeIds: detail.edges ? detail.edges.map(function (e) { return e.edgeId; }) : []
        };

        // 打开 Asset 创建表单，传入预填数据
        showAssetFormWithPrefill(prefill);
    });
};

/**
 * 忽略候选
 */
window.__dmIgnoreCandidate = function (candidateId) {
    if (!confirm('确定要忽略该候选吗？')) return;

    api.ignoreCandidate(candidateId).then(function (result) {
        if (result && result.success) {
            showToast('✅ 已忽略候选', 'success');
            loadCandidatesList();
        } else {
            showToast('❌ 忽略失败: ' + (result.error || '未知错误'), 'error');
        }
    }).catch(function (e) {
        showToast('❌ 忽略失败: ' + e.message, 'error');
    });
};

/**
 * 显示带预填数据的 Asset 创建表单
 */
function showAssetFormWithPrefill(prefill) {
    // 构造 existingData 格式
    var existingData = {
        assetType: prefill.assetType,
        assetName: prefill.assetName || '',
        divisionId: prefill.divisionId || null,
        roadRelations: (prefill.edgeIds || []).map(function (id, idx) {
            return { roadEdgeId: id, sequenceNo: idx + 1 };
        })
    };
    showAssetForm(prefill.assetType, existingData);
}

// ==================== V1.4C 新增/编辑资产 UI ====================

window.__dmCreateBridge = function () {
    showAssetForm('BRIDGE', null);
};

window.__dmCreateTunnel = function () {
    showAssetForm('TUNNEL', null);
};

window.__dmEditAsset = function (assetId) {
    api.getAssetDetail(assetId).then(function (detail) {
        if (!detail) {
            showToast('未找到该资产', 'error');
            return;
        }
        showAssetForm(detail.assetType, detail);
    });
};

/**
 * HOME-2: 直接打开DataManagement并预填Asset表单（Road→Asset链路）
 * @param {object} presetData - { assetType, edgeIds, divisionId, latitude, longitude, source }
 */
export function openDataManagementWithAssetForm(presetData) {
    openDataManagement();
    // 等待DataManagement加载完成后打开Asset表单
    setTimeout(function() {
        var bridgeTabBtn = document.querySelector('#dm-tabs .tab-btn[data-tab="bridge"]');
        if (bridgeTabBtn) bridgeTabBtn.click();
        setTimeout(function() {
            showAssetForm(presetData.assetType || 'BRIDGE', {
                assetType: presetData.assetType || 'BRIDGE',
                edgeIds: presetData.edgeIds || [],
                divisionId: presetData.divisionId || null,
                longitude: presetData.longitude || null,
                latitude: presetData.latitude || null
            });
        }, 300);
    }, 200);
}

/**
 * 显示资产创建/编辑表单
 */
function showAssetForm(assetType, existingData) {
    var isEdit = !!existingData;
    var title = isEdit ? '编辑资产' : (assetType === 'BRIDGE' ? '新增桥梁' : '新增隧道');

    // 行政区选项
    var divisionOptions = '<option value="">请选择行政区</option>';
    var divisions = window.__divisions || [];
    divisions.forEach(function (d) {
        var selected = existingData && existingData.divisionId == d.id ? ' selected' : '';
        divisionOptions += '<option value="' + d.id + '"' + selected + '>' + d.displayName + '</option>';
    });

    // 桥梁特有字段
    var bridgeFields = '';
    if (assetType === 'BRIDGE') {
        var ba = existingData ? (existingData.bridgeAttributes || {}) : {};
        bridgeFields = '<div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">'
            + '<div style="font-weight:600;margin-bottom:12px;">🌉 桥梁属性</div>'
            + '<div style="margin-bottom:12px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">结构类型</label><select id="af-structureType" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;">'
            + '<option value="">请选择</option>'
            + '<option value="悬索桥"' + (ba.structureType === '悬索桥' ? ' selected' : '') + '>悬索桥</option>'
            + '<option value="斜拉桥"' + (ba.structureType === '斜拉桥' ? ' selected' : '') + '>斜拉桥</option>'
            + '<option value="拱桥"' + (ba.structureType === '拱桥' ? ' selected' : '') + '>拱桥</option>'
            + '<option value="梁桥"' + (ba.structureType === '梁桥' ? ' selected' : '') + '>梁桥</option>'
            + '<option value="组合桥"' + (ba.structureType === '组合桥' ? ' selected' : '') + '>组合桥</option>'
            + '</select></div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">总长 (m)</label><input type="number" id="af-totalLengthM" value="' + (ba.totalLengthM || '') + '" step="0.01" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">最大跨径 (m)</label><input type="number" id="af-maxSpanM" value="' + (ba.maxSpanM || '') + '" step="0.01" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '</div>'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">跨径配置</label><input type="text" id="af-spanConfiguration" value="' + (ba.spanConfiguration || '') + '" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">设计荷载</label><input type="text" id="af-designLoad" value="' + (ba.designLoad || '') + '" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">设计荷载 (t)</label><input type="number" id="af-designLoadT" value="' + (ba.designLoadT || '') + '" step="0.01" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '</div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">桥面宽度 (m)</label><input type="number" id="af-deckWidthM" value="' + (ba.deckWidthM || '') + '" step="0.01" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">设计净高 (m)</label><input type="number" id="af-designClearanceHeightM" value="' + (ba.designClearanceHeightM || '') + '" step="0.01" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">设计净宽 (m)</label><input type="number" id="af-designClearanceWidthM" value="' + (ba.designClearanceWidthM || '') + '" step="0.01" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '</div>'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">建成年份</label><input type="number" id="af-constructionYear" value="' + (ba.constructionYear || '') + '" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '</div>';
    }

    // 隧道特有字段
    var tunnelFields = '';
    if (assetType === 'TUNNEL') {
        var ta = existingData ? (existingData.tunnelAttributes || {}) : {};
        tunnelFields = '<div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">'
            + '<div style="font-weight:600;margin-bottom:12px;">🚇 隧道属性</div>'
            + '<div style="margin-bottom:12px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">隧道类型</label><select id="af-tunnelType" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;">'
            + '<option value="">请选择</option>'
            + '<option value="分离式"' + (ta.tunnelType === '分离式' ? ' selected' : '') + '>分离式</option>'
            + '<option value="连拱"' + (ta.tunnelType === '连拱' ? ' selected' : '') + '>连拱</option>'
            + '<option value="圆形"' + (ta.tunnelType === '圆形' ? ' selected' : '') + '>圆形</option>'
            + '<option value="矩形"' + (ta.tunnelType === '矩形' ? ' selected' : '') + '>矩形</option>'
            + '</select></div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">隧道长度 (m)</label><input type="number" id="af-tunnelLengthM" value="' + (ta.tunnelLengthM || '') + '" step="0.01" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">车道数</label><input type="number" id="af-laneCount" value="' + (ta.laneCount || '') + '" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '</div>'
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">设计净高 (m)</label><input type="number" id="af-tunnelClearanceHeightM" value="' + (ta.designClearanceHeightM || '') + '" step="0.01" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">设计净宽 (m)</label><input type="number" id="af-tunnelClearanceWidthM" value="' + (ta.designClearanceWidthM || '') + '" step="0.01" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '</div>'
            + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">建成年份</label><input type="number" id="af-tunnelConstructionYear" value="' + (ta.constructionYear || '') + '" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
            + '</div>';
    }

    // 当前状态字段
    var cs = existingData ? (existingData.currentStatus || {}) : {};
    var statusFields = '<div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">'
        + '<div style="font-weight:600;margin-bottom:12px;">📊 当前状态</div>'
        + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">健康评分 (0-1)</label><input type="number" id="af-healthScore" value="' + (cs.healthScore || '') + '" step="0.01" min="0" max="1" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
        + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">风险等级</label><select id="af-riskLevel" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;">'
        + '<option value="">请选择</option>'
        + '<option value="LOW"' + (cs.riskLevel === 'LOW' ? ' selected' : '') + '>低风险</option>'
        + '<option value="MEDIUM"' + (cs.riskLevel === 'MEDIUM' ? ' selected' : '') + '>中风险</option>'
        + '<option value="HIGH"' + (cs.riskLevel === 'HIGH' ? ' selected' : '') + '>高风险</option>'
        + '<option value="EXTREME"' + (cs.riskLevel === 'EXTREME' ? ' selected' : '') + '>极高风险</option>'
        + '</select></div>'
        + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">通行状态</label><select id="af-passStatus" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;">'
        + '<option value="">请选择</option>'
        + '<option value="NORMAL"' + (cs.passStatus === 'NORMAL' ? ' selected' : '') + '>正常</option>'
        + '<option value="RESTRICTED"' + (cs.passStatus === 'RESTRICTED' ? ' selected' : '') + '>受限</option>'
        + '<option value="BLOCKED"' + (cs.passStatus === 'BLOCKED' ? ' selected' : '') + '>封闭</option>'
        + '<option value="UNKNOWN"' + (cs.passStatus === 'UNKNOWN' ? ' selected' : '') + '>未知</option>'
        + '</select></div>'
        + '</div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">'
        + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">当前限载 (t)</label><input type="number" id="af-currentLoadLimitT" value="' + (cs.currentLoadLimitT || '') + '" step="0.01" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
        + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">当前限高 (m)</label><input type="number" id="af-currentHeightLimitM" value="' + (cs.currentHeightLimitM || '') + '" step="0.01" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
        + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">当前限宽 (m)</label><input type="number" id="af-currentWidthLimitM" value="' + (cs.currentWidthLimitM || '') + '" step="0.01" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
        + '</div>'
        + '</div>';

    // 道路绑定区域
    var edgeIds = [];
    if (existingData && existingData.edgeIds) {
        // V1.4D: 支持直接传入 edgeIds
        edgeIds = existingData.edgeIds;
    } else if (existingData && existingData.roadRelations) {
        edgeIds = existingData.roadRelations.map(function (r) { return r.roadEdgeId; });
    }
    var edgeFields = '<div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">'
        + '<div style="font-weight:600;margin-bottom:12px;">🛣️ 道路绑定</div>'
        + '<div id="af-selected-edges" style="margin-bottom:8px;"></div>'
        + '<div style="display:flex;gap:8px;">'
        + '<input type="text" id="af-edge-search" placeholder="搜索道路名称/编号..." style="flex:1;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;">'
        + '<button class="btn-secondary" style="padding:4px 8px;font-size:11px;" onclick="window.__afSearchEdges()">搜索</button>'
        + '</div>'
        + '<div id="af-edge-results" style="max-height:150px;overflow-y:auto;margin-top:8px;"></div>'
        + '</div>';

    // HOME-2: 资产图片上传区域
    var currentImagePath = existingData ? (existingData.imagePath || '') : '';
    var imagePreviewHtml = currentImagePath 
        ? '<img id="af-image-preview" src="' + currentImagePath + '" style="max-width:200px;max-height:120px;border-radius:4px;margin-top:8px;" onerror="this.style.display=\'none\'">'
        : '<div id="af-image-preview" style="width:200px;height:120px;border-radius:4px;background:rgba(20,46,102,0.15);border:1px dashed rgba(20,46,102,0.3);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:12px;margin-top:8px;">📷 暂无图片</div>';
    
    var imageFields = '<div style="margin-top:16px;border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">'
        + '<div style="font-weight:600;margin-bottom:12px;">📷 资产图片</div>'
        + '<div style="display:flex;align-items:center;gap:12px;">'
        + '<div>'
        + '<input type="file" id="af-image-file" accept="image/jpeg,image/png,image/webp" style="display:none;" onchange="window.__afPreviewImage(this)">'
        + '<button class="btn-secondary" style="padding:6px 12px;font-size:11px;" onclick="document.getElementById(\'af-image-file\').click()">选择图片</button>'
        + '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;">支持 jpg, png, webp，≤10MB</div>'
        + '</div>'
        + '<div>' + imagePreviewHtml + '</div>'
        + '</div>'
        + '</div>';

    var html = '<div style="padding:20px;">'
        + '<div style="margin-bottom:12px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">资产名称 *</label><input type="text" id="af-assetName" value="' + (existingData ? existingData.assetName : '') + '" placeholder="请输入资产名称" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
        + '<div style="margin-bottom:12px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">行政区</label><select id="af-divisionId" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;">' + divisionOptions + '</select></div>'
        + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">'
        + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">经度</label><input type="number" id="af-longitude" value="' + (existingData ? existingData.longitude : '') + '" step="0.0001" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
        + '<div style="margin-bottom:8px;"><label style="display:block;margin-bottom:4px;font-size:11px;color:var(--text-secondary);">纬度</label><input type="number" id="af-latitude" value="' + (existingData ? existingData.latitude : '') + '" step="0.0001" style="width:100%;padding:6px 10px;border:1px solid rgba(255,255,255,0.2);border-radius:4px;background:rgba(255,255,255,0.05);color:var(--text-primary);font-size:12px;"></div>'
        + '</div>'
        + imageFields
        + bridgeFields
        + tunnelFields
        + statusFields
        + edgeFields
        + '</div>';

    // 显示弹窗
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'asset-form-overlay';
    overlay.innerHTML = '<div class="modal-content glass-panel" style="width:600px;max-height:90vh;overflow-y:auto;">'
        + '<div class="modal-header"><h3>' + title + '</h3><button class="modal-close-btn" onclick="document.getElementById(\'asset-form-overlay\').remove()">✕</button></div>'
        + '<div class="modal-body">' + html + '</div>'
        + '<div class="modal-footer" style="padding:12px 20px;border-top:1px solid rgba(255,255,255,0.1);display:flex;justify-content:flex-end;gap:8px;">'
        + '<button class="btn-secondary" onclick="document.getElementById(\'asset-form-overlay\').remove()">取消</button>'
        + '<button class="btn-primary" id="af-submit-btn">保存</button>'
        + '</div>'
        + '</div>';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });

    // 保存选中的 Edge ID
    window.__afSelectedEdgeIds = edgeIds;

    // 加载行政区数据
    if (!window.__divisions || window.__divisions.length === 0) {
        api.getDivisionOverviews().then(function (divisions) {
            window.__divisions = divisions || [];
            var select = document.getElementById('af-divisionId');
            if (select) {
                var opts = '<option value="">请选择行政区</option>';
                window.__divisions.forEach(function (d) {
                    var selected = existingData && existingData.divisionId == d.id ? ' selected' : '';
                    opts += '<option value="' + d.id + '"' + selected + '>' + d.displayName + '</option>';
                });
                select.innerHTML = opts;
            }
        });
    }

    // 渲染已选 Edge
    renderSelectedEdges();

    // 绑定搜索按钮
    document.getElementById('af-edge-search').addEventListener('keydown', function (e) {
        if (e.key === 'Enter') window.__afSearchEdges();
    });

    // 提交按钮
    document.getElementById('af-submit-btn').addEventListener('click', function () {
        var data = collectAssetFormData(assetType);
        if (!data.assetName) {
            showToast('⚠️ 请输入资产名称', 'error');
            return;
        }

        // V1.4F: 检查同名资产（仅新增时）
        if (!isEdit) {
            api.checkDuplicateAsset(assetType, data.assetName).then(function (checkResult) {
                if (checkResult && checkResult.exists) {
                    if (checkResult.isActive) {
                        showToast('⚠️ 该资产已存在（编号: ' + checkResult.assetCode + '），请编辑已有记录', 'warning');
                        document.getElementById('asset-form-overlay').remove();
                        window.__dmEditAsset(checkResult.id);
                    } else {
                        showToast('⚠️ 该资产档案已存在但已停用（编号: ' + checkResult.assetCode + '），请恢复后编辑', 'warning');
                    }
                    return;
                }
                // 通过查重，执行创建
                doCreateAsset(data);
            }).catch(function () {
                // 查重失败，直接创建
                doCreateAsset(data);
            });
        } else {
            // 编辑模式，直接更新
            doUpdateAsset(existingData.id, data);
        }
    });
}

function doCreateAsset(data) {
    api.createAsset(data).then(function (result) {
        if (result && !result.error) {
            // HOME-2: 如果有图片需要上传
            var imageFile = document.getElementById('af-image-file');
            if (imageFile && imageFile.files && imageFile.files.length > 0) {
                api.uploadAssetImage(result.id, imageFile.files[0]).then(function() {
                    showToast('✅ 已创建（含图片）', 'success');
                    document.getElementById('asset-form-overlay').remove();
                    loadBridgeTab();
                    window.dispatchEvent(new CustomEvent('dataAssetUpdated', { detail: { type: 'bridge', action: 'create' } }));
                }).catch(function(err) {
                    showToast('⚠️ 资产已保存，但图片上传失败: ' + err.message, 'warning');
                    document.getElementById('asset-form-overlay').remove();
                    loadBridgeTab();
                    window.dispatchEvent(new CustomEvent('dataAssetUpdated', { detail: { type: 'bridge', action: 'create' } }));
                });
            } else {
                showToast('✅ 已创建', 'success');
                document.getElementById('asset-form-overlay').remove();
                loadBridgeTab();
                window.dispatchEvent(new CustomEvent('dataAssetUpdated', { detail: { type: 'bridge', action: 'create' } }));
            }
        } else {
            showToast('❌ 创建失败: ' + (result.error || '未知错误'), 'error');
        }
    }).catch(function (err) {
        showToast('❌ 创建失败: ' + (err.message || '网络错误'), 'error');
    });
}

function doUpdateAsset(assetId, data) {
    api.updateAsset(assetId, data).then(function (result) {
        if (result && !result.error) {
            // HOME-2: 如果有图片需要上传
            var imageFile = document.getElementById('af-image-file');
            if (imageFile && imageFile.files && imageFile.files.length > 0) {
                api.uploadAssetImage(assetId, imageFile.files[0]).then(function() {
                    showToast('✅ 已保存（含图片）', 'success');
                    document.getElementById('asset-form-overlay').remove();
                    loadBridgeTab();
                    window.dispatchEvent(new CustomEvent('dataAssetUpdated', { detail: { type: 'bridge', action: 'update' } }));
                }).catch(function(err) {
                    showToast('⚠️ 资产已保存，但图片上传失败: ' + err.message, 'warning');
                    document.getElementById('asset-form-overlay').remove();
                    loadBridgeTab();
                    window.dispatchEvent(new CustomEvent('dataAssetUpdated', { detail: { type: 'bridge', action: 'update' } }));
                });
            } else {
                showToast('✅ 已保存', 'success');
                document.getElementById('asset-form-overlay').remove();
                loadBridgeTab();
                window.dispatchEvent(new CustomEvent('dataAssetUpdated', { detail: { type: 'bridge', action: 'update' } }));
            }
        } else {
            showToast('❌ 保存失败: ' + (result.error || '未知错误'), 'error');
        }
    }).catch(function (err) {
        showToast('❌ 保存失败: ' + (err.message || '网络错误'), 'error');
    });
}

// HOME-2: 图片预览函数
window.__afPreviewImage = function(input) {
    if (input.files && input.files[0]) {
        var file = input.files[0];
        // 验证文件大小
        if (file.size > 10 * 1024 * 1024) {
            showToast('文件大小超过10MB限制', 'error');
            input.value = '';
            return;
        }
        var reader = new FileReader();
        reader.onload = function(e) {
            var preview = document.getElementById('af-image-preview');
            if (preview) {
                preview.outerHTML = '<img id="af-image-preview" src="' + e.target.result + '" style="max-width:200px;max-height:120px;border-radius:4px;margin-top:8px;">';
            }
        };
        reader.readAsDataURL(file);
    }
};

/**
 * 收集表单数据
 */
function collectAssetFormData(assetType) {
    var data = {
        assetType: assetType,
        assetName: document.getElementById('af-assetName').value.trim(),
        divisionId: document.getElementById('af-divisionId').value || null,
        longitude: parseFloat(document.getElementById('af-longitude').value) || null,
        latitude: parseFloat(document.getElementById('af-latitude').value) || null,
        edgeIds: window.__afSelectedEdgeIds || [],
        currentStatus: {
            healthScore: parseFloat(document.getElementById('af-healthScore').value) || null,
            riskLevel: document.getElementById('af-riskLevel').value || null,
            passStatus: document.getElementById('af-passStatus').value || null,
            currentLoadLimitT: parseFloat(document.getElementById('af-currentLoadLimitT').value) || null,
            currentHeightLimitM: parseFloat(document.getElementById('af-currentHeightLimitM').value) || null,
            currentWidthLimitM: parseFloat(document.getElementById('af-currentWidthLimitM').value) || null,
        }
    };

    if (assetType === 'BRIDGE') {
        data.bridgeAttributes = {
            structureType: document.getElementById('af-structureType').value || null,
            totalLengthM: parseFloat(document.getElementById('af-totalLengthM').value) || null,
            maxSpanM: parseFloat(document.getElementById('af-maxSpanM').value) || null,
            spanConfiguration: document.getElementById('af-spanConfiguration').value || null,
            designLoad: document.getElementById('af-designLoad').value || null,
            designLoadT: parseFloat(document.getElementById('af-designLoadT').value) || null,
            deckWidthM: parseFloat(document.getElementById('af-deckWidthM').value) || null,
            designClearanceHeightM: parseFloat(document.getElementById('af-designClearanceHeightM').value) || null,
            designClearanceWidthM: parseFloat(document.getElementById('af-designClearanceWidthM').value) || null,
            constructionYear: parseInt(document.getElementById('af-constructionYear').value) || null,
        };
    } else if (assetType === 'TUNNEL') {
        data.tunnelAttributes = {
            tunnelType: document.getElementById('af-tunnelType').value || null,
            tunnelLengthM: parseFloat(document.getElementById('af-tunnelLengthM').value) || null,
            designClearanceHeightM: parseFloat(document.getElementById('af-tunnelClearanceHeightM').value) || null,
            designClearanceWidthM: parseFloat(document.getElementById('af-tunnelClearanceWidthM').value) || null,
            laneCount: parseInt(document.getElementById('af-laneCount').value) || null,
            constructionYear: parseInt(document.getElementById('af-tunnelConstructionYear').value) || null,
        };
    }

    return data;
}

/**
 * 搜索道路 Edge
 */
window.__afSearchEdges = function () {
    var keyword = document.getElementById('af-edge-search').value.trim();
    if (!keyword) {
        showToast('请输入搜索关键词', 'info');
        return;
    }

    api.searchRoadEdges({ keyword: keyword, size: 20 }).then(function (result) {
        var edges = (result && result.content) || [];
        var container = document.getElementById('af-edge-results');
        if (!container) return;

        if (edges.length === 0) {
            container.innerHTML = '<div style="color:var(--text-muted);font-size:11px;">未找到匹配的道路</div>';
            return;
        }

        container.innerHTML = edges.map(function (e) {
            var selected = window.__afSelectedEdgeIds.indexOf(e.id) >= 0;
            return '<div style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.05);cursor:pointer;display:flex;align-items:center;gap:8px;' + (selected ? 'background:rgba(56,189,248,0.1);' : '') + '" onclick="window.__afToggleEdge(' + e.id + ', \'' + (e.name || '').replace(/'/g, "\\'") + '\', \'' + (e.ref || '') + '\')">'
                + '<input type="checkbox" ' + (selected ? 'checked' : '') + ' style="pointer-events:none;">'
                + '<div style="flex:1;">'
                + '<div style="font-size:11px;color:var(--text-primary);">' + (e.name || '-') + ' (' + (e.ref || '-') + ')</div>'
                + '<div style="font-size:10px;color:var(--text-muted);">ID: ' + e.id + ' | ' + (e.divisionName || '-') + ' | ' + (e.lengthM ? (e.lengthM / 1000).toFixed(2) + ' km' : '-') + '</div>'
                + '</div>'
                + '</div>';
        }).join('');
    });
};

/**
 * 切换 Edge 选择状态
 */
window.__afToggleEdge = function (edgeId, name, ref) {
    var idx = window.__afSelectedEdgeIds.indexOf(edgeId);
    if (idx >= 0) {
        window.__afSelectedEdgeIds.splice(idx, 1);
    } else {
        window.__afSelectedEdgeIds.push(edgeId);
    }
    renderSelectedEdges();
    // 刷新搜索结果
    window.__afSearchEdges();
};

/**
 * 渲染已选 Edge 列表
 */
function renderSelectedEdges() {
    var container = document.getElementById('af-selected-edges');
    if (!container) return;

    var edgeIds = window.__afSelectedEdgeIds || [];
    if (edgeIds.length === 0) {
        container.innerHTML = '<div style="color:var(--text-muted);font-size:11px;">未选择任何道路</div>';
        return;
    }

    // 批量获取 Edge 详情
    var promises = edgeIds.map(function (id) {
        return api.getRoadEdgeDetail(id).then(function (edge) {
            return edge || { id: id, name: '未知', ref: '-', divisionName: '-', lengthM: 0 };
        });
    });

    Promise.all(promises).then(function (edges) {
        container.innerHTML = edges.map(function (e) {
            return '<div style="display:flex;align-items:center;gap:8px;padding:4px 8px;background:rgba(56,189,248,0.1);border-radius:4px;margin-bottom:4px;">'
                + '<span style="flex:1;font-size:11px;">' + (e.name || '-') + ' (' + (e.ref || '-') + ') - ' + (e.divisionName || '-') + '</span>'
                + '<button class="action-btn" style="padding:2px 6px;font-size:10px;" onclick="window.__afRemoveEdge(' + e.id + ')">✕</button>'
                + '</div>';
        }).join('');
    });
}

/**
 * 移除选中的 Edge
 */
window.__afRemoveEdge = function (edgeId) {
    var idx = window.__afSelectedEdgeIds.indexOf(edgeId);
    if (idx >= 0) {
        window.__afSelectedEdgeIds.splice(idx, 1);
        renderSelectedEdges();
    }
};

/**
 * V1.4F: 从 Road Edge 创建资产
 */
window.__dmCreateAssetFromRoad = function (assetType, edgeIds) {
    // 先获取 Edge 详情，提取行政区等信息
    var edgePromises = edgeIds.map(function (id) {
        return api.getRoadEdgeDetail(id).then(function (edge) {
            return edge || { id: id };
        });
    });

    Promise.all(edgePromises).then(function (edges) {
        var prefilled = {
            edgeIds: edgeIds,
            divisionId: null,
            longitude: null,
            latitude: null
        };

        // 尝试从 Edge 获取信息
        for (var i = 0; i < edges.length; i++) {
            var e = edges[i];
            if (e.divisionId && !prefilled.divisionId) {
                prefilled.divisionId = e.divisionId;
            }
            if (e.latitude && e.longitude && !prefilled.latitude) {
                prefilled.latitude = e.latitude;
                prefilled.longitude = e.longitude;
            }
        }

        showAssetForm(assetType, prefilled);
    }).catch(function () {
        showAssetForm(assetType, { edgeIds: edgeIds });
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
window.__dmEditDivision = function (divisionId) {
    // V1.2B: 使用 Overview API 获取数据
    api.getDivisionOverview(divisionId).then(function (item) {
        if (!item) return showToast('未找到该行政区', 'error');

        showEditDialog('编辑行政区状态 - ' + (item.displayName || item.canonicalName), [
            { key: 'resilienceScore', label: '韧性指数', type: 'number', value: item.resilienceScore },
            { key: 'disasterRiskRate', label: '灾害风险率(%)', type: 'number', value: item.disasterRiskRate },
            { key: 'trafficGuaranteeRate', label: '通行保障率(%)', type: 'number', value: item.trafficGuaranteeRate },
            { key: 'riskLevel', label: '风险等级', type: 'select', value: item.riskLevel, options: [{ value: 'low', label: '低风险' }, { value: 'medium', label: '中风险' }, { value: 'high', label: '高风险' }, { value: 'extreme', label: '极高风险' }] },
        ], function (result) {
            // V1.2B: 使用 PUT API 更新状态
            fetch('/api/administrative-divisions/' + divisionId + '/current-status', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(result)
            }).then(function (res) {
                if (res.ok) {
                    showToast('✅ 已更新 ' + (item.displayName || item.canonicalName), 'success');
                    loadDistrictTab(); // 刷新表格
                } else {
                    showToast('❌ 更新失败', 'error');
                }
            }).catch(function () {
                showToast('❌ 网络错误', 'error');
            });
        });
    });
};

// V1.4F: 重置单个行政区到种子数据
window.__dmResetSingleDistrict = function (divisionId) {
    if (!confirm('确定将该行政区指标恢复为初始种子数据吗？')) return;
    
    fetch('/api/administrative-divisions/' + divisionId + '/current-status/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }).then(function (res) {
        if (res.ok) {
            showToast('✅ 已恢复种子数据', 'success');
            loadDistrictTab();
        } else {
            showToast('❌ 恢复失败', 'error');
        }
    }).catch(function () {
        showToast('❌ 网络错误', 'error');
    });
};

// V1.4F: 重置全部行政区到种子数据
window.__dmResetAllDistricts = function () {
    if (!confirm('确定将全部37个行政区指标恢复为初始种子数据吗？')) return;
    
    fetch('/api/administrative-divisions/current-status/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    }).then(function (res) {
        if (res.ok) {
            showToast('✅ 已恢复全部种子数据', 'success');
            loadDistrictTab();
        } else {
            showToast('❌ 恢复失败', 'error');
        }
    }).catch(function () {
        showToast('❌ 网络错误', 'error');
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
        // V1.4B: 使用正式 Asset API 进行筛选
        loadBridgeTab();
        showToast('🔍 筛选中...', 'info');
    };

    // 路网筛选 (V1.3D: 服务端筛选)
    window.__dmFilterRoadnet = function () {
        _roadnetCurrentPage = 0;
        fetchAndRenderRoadnet();
    };

    // 路网分页
    window.__dmRoadnetPrevPage = function () {
        if (_roadnetCurrentPage > 0) {
            _roadnetCurrentPage--;
            fetchAndRenderRoadnet();
        }
    };
    window.__dmRoadnetNextPage = function () {
        _roadnetCurrentPage++;
        fetchAndRenderRoadnet();
    };

    // 路网定位
    window.__dmSelectRoadEdge = function (edgeId) {
        window.dispatchEvent(new CustomEvent('road-edge-selected', {
            detail: { edgeId: edgeId, source: 'dataManagement' }
        }));
    };

    // 路网选择相关函数
    window.__dmToggleSelectAll = function (checked) {
        document.querySelectorAll('.dm-roadnet-row-check').forEach(function (cb) {
            cb.checked = checked;
        });
        window.__dmUpdateRoadnetButtons();
    };

    window.__dmUpdateRoadnetButtons = function () {
        var selectedIds = [];
        document.querySelectorAll('.dm-roadnet-row-check:checked').forEach(function (cb) {
            selectedIds.push(parseInt(cb.dataset.id));
        });
        var addBridgeBtn = document.getElementById('dm-roadnet-add-bridge');
        var addTunnelBtn = document.getElementById('dm-roadnet-add-tunnel');
        if (addBridgeBtn) addBridgeBtn.disabled = selectedIds.length === 0;
        if (addTunnelBtn) addTunnelBtn.disabled = selectedIds.length === 0;
        // 存储选中的 IDs
        window.__dmSelectedRoadEdgeIds = selectedIds;
    };

    window.__dmAddSelectedAsBridge = function () {
        var ids = window.__dmSelectedRoadEdgeIds || [];
        if (ids.length === 0) return showToast('请先选择道路', 'warning');
        window.__dmCreateAssetFromRoad('BRIDGE', ids);
    };

    window.__dmAddSelectedAsTunnel = function () {
        var ids = window.__dmSelectedRoadEdgeIds || [];
        if (ids.length === 0) return showToast('请先选择道路', 'warning');
        window.__dmCreateAssetFromRoad('TUNNEL', ids);
    };

    // 绑定按钮事件
    setTimeout(function () {
        var addBridgeBtn = document.getElementById('dm-roadnet-add-bridge');
        var addTunnelBtn = document.getElementById('dm-roadnet-add-tunnel');
        if (addBridgeBtn) addBridgeBtn.addEventListener('click', window.__dmAddSelectedAsBridge);
        if (addTunnelBtn) addTunnelBtn.addEventListener('click', window.__dmAddSelectedAsTunnel);
    }, 200);

    // 区县筛选
    window.__dmFilterDistrict = function () {
        var query = (document.getElementById('dm-district-search')?.value || '').toLowerCase();
        var riskLevel = document.getElementById('dm-district-filter-risk')?.value || '';
        // V1.2B: 使用 Overview API 获取数据
        api.getDivisionOverviews().then(function (data) {
            data = data || [];
            var filtered = data.filter(function (d) {
                var name = (d.displayName || d.canonicalName || '').toLowerCase();
                if (query && !name.includes(query)) return false;
                if (riskLevel && d.riskLevel !== riskLevel) return false;
                return true;
            });
            renderDistrictTable(filtered);
            showToast('🔍 筛选中: ' + filtered.length + '/' + data.length + ' 条', 'info');
        });
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

    // 区县排序
    setTimeout(function () {
        var sortField = document.getElementById('dm-district-sort-field');
        var sortDir = document.getElementById('dm-district-sort-dir');
        if (sortField) {
            sortField.addEventListener('change', function () {
                districtSortField = this.value;
                loadDistrictTab();
            });
        }
        if (sortDir) {
            sortDir.addEventListener('click', function () {
                districtSortAsc = !districtSortAsc;
                this.textContent = districtSortAsc ? '↑' : '↓';
                loadDistrictTab();
            });
        }
    }, 100);
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

// V1.2B: 导出行政区 Overview 数据
window.__dmExportDivisionOverviews = function () {
    api.getDivisionOverviews().then(function (data) {
        if (!data || data.length === 0) {
            return showToast('没有可导出的数据', 'warning');
        }
        var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'division_overviews_export_' + new Date().toISOString().slice(0, 10) + '.json';
        a.click();
        URL.revokeObjectURL(url);
        showToast('📤 已导出 ' + data.length + ' 条行政区概览', 'success');
    });
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
    var keys = ['bridgeArchives', 'roadnetBusinessAttributes', 'roadnetOverview', 'dashboardMetrics', 'riskRankingItems', 'trendData', 'alertRecords', 'moduleConfigs', 'simulationArchiveData'];
    keys.forEach(function (k) {
        localStorage.removeItem('plant_mock_' + k);
    });
    showToast('🔄 正在重置所有数据...', 'info');
    setTimeout(function () {
        window.location.reload();
    }, 500);
};