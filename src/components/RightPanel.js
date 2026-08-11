/**
 * 右侧面板 - HOME-2 重构
 * 核心功能模块 / 区域灾害韧性概况 / 桥隧状态监控
 *
 * 数据来源：通过 API 层获取，后端不可用时自动降级到 --
 */
import api from '../api/index.js';
import { openHeavyVehicleModule, isHeavyVehicleActive, closeHeavyVehicleModule } from './HeavyVehicleModule.js';
import { openHeavyVehicleAssessmentModule, isHeavyVehicleAssessmentActive, closeHeavyVehicleAssessmentModule } from './HeavyVehicleAssessmentModule.js';
import { openDebrisResilienceModule, isDebrisResilienceActive, closeDebrisResilienceModule } from './DebrisResilienceModule.js';
import { openDisasterRiskAssessmentModule, isDisasterRiskAssessmentActive, closeDisasterRiskAssessmentModule } from './DisasterRiskAssessmentModule.js';
import { openRoadNetworkResilienceModule, isRoadNetworkResilienceActive, closeRoadNetworkResilienceModule } from './RoadNetworkResilienceModule.js';
import { openDataManagement } from './DataManagementModule.js';

// 当前选中的Asset ID
var currentSelectedAssetId = null;
var assetMonitorInitialized = false;

export function initRightPanel() {
    initModuleButtons();
    initCountyResilience();
    initAssetMonitor();
}

/**
 * 刷新右侧面板所有数据（供外部调用）
 */
export function refreshRightPanel() {
    initCountyResilience();
    // 如果有选中的Asset，刷新其详情
    if (currentSelectedAssetId) {
        refreshAssetMonitor(currentSelectedAssetId);
    }
}

/**
 * 更新桥隧状态监控面板
 */
function refreshAssetMonitor(assetId) {
    if (!assetId) return;
    currentSelectedAssetId = assetId;
    loadAssetMonitorData(assetId);
}

// ============================================================
// 面板一：核心功能模块 (HOME-2: 2×2大型按钮)
// ============================================================
function initModuleButtons() {
    var c = document.getElementById('module-buttons');
    if (!c) return;

    var modules = [
        { name: '重车通行评估', icon: '🚚', description: '重车路径规划与限载校核', action: 'heavy-vehicle' },
        { name: '灾害风险评估', icon: '🌋', description: '泥石流灾害概率预测与路网韧性评估', action: 'disaster' },
        { name: '路网韧性评估', icon: '🛡️', description: '路网整体韧性评估与优化', action: 'resilience' },
        { name: '后台数据管理', icon: '🗄️', description: '桥隧资产与区县指标数据管理', action: 'data-management' }
    ];

    c.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:4px 0;';

    modules.forEach(function(m) {
        var btn = document.createElement('div');
        btn.style.cssText = 'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:12px 8px;background:rgba(20,46,102,0.2);border:1px solid rgba(20,46,102,0.4);border-radius:8px;cursor:pointer;transition:all 0.2s;min-height:70px;';
        btn.title = m.description;
        btn.innerHTML =
            '<span style="font-size:28px;line-height:1;">' + m.icon + '</span>' +
            '<span style="font-size:13px;color:var(--text-primary);font-weight:600;text-align:center;line-height:1;">' + m.name + '</span>';

        btn.addEventListener('mouseenter', function() {
            btn.style.borderColor = 'rgba(56,189,248,0.5)';
            btn.style.background = 'rgba(20,46,102,0.35)';
        });
        btn.addEventListener('mouseleave', function() {
            btn.style.borderColor = 'rgba(20,46,102,0.4)';
            btn.style.background = 'rgba(20,46,102,0.2)';
        });
        btn.addEventListener('click', function() {
            // 先关闭所有其他模块
            if (isHeavyVehicleActive()) closeHeavyVehicleModule();
            if (isHeavyVehicleAssessmentActive()) closeHeavyVehicleAssessmentModule();
            if (isDebrisResilienceActive()) closeDebrisResilienceModule();
            if (isDisasterRiskAssessmentActive()) closeDisasterRiskAssessmentModule();
            if (isRoadNetworkResilienceActive()) closeRoadNetworkResilienceModule();
            var dmOv = document.getElementById('data-mgmt-overlay');
            if (dmOv) { dmOv.remove(); document.body.classList.remove('dm-modal-open'); }

            // 打开对应模块
            if (m.action === 'heavy-vehicle') {
                openHeavyVehicleAssessmentModule();
            } else if (m.action === 'disaster') {
                openDisasterRiskAssessmentModule();
            } else if (m.action === 'resilience') {
                openRoadNetworkResilienceModule();
            } else if (m.action === 'data-management') {
                openDataManagement();
            }
        });
        c.appendChild(btn);
    });
}

// ============================================================
// 面板二：区域灾害韧性概况 (HOME-2: 37区表格)
// ============================================================
function initCountyResilience() {
    var list = document.getElementById('county-resilience-list');
    if (!list) return;
    list.innerHTML = '<div style="text-align:center;font-size:11px;color:var(--text-muted);padding:8px;">加载中...</div>';

    api.getDivisionOverviews().then(function(data) {
        if (!data || !data.length) {
            list.innerHTML = '<div style="text-align:center;font-size:11px;color:var(--text-muted);padding:8px;">暂无数据</div>';
            return;
        }
        // 按灾害风险率降序排序
        data.sort(function(a, b) {
            return (b.disasterRiskRate || 0) - (a.disasterRiskRate || 0);
        });

        // 表头
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 6px;margin-bottom:2px;font-size:11px;color:var(--text-muted);font-weight:600;border-bottom:1px solid rgba(20,46,102,0.3);';
        header.innerHTML =
            '<span style="flex:2.5;text-align:left;">行政区</span>' +
            '<span style="flex:1;text-align:center;">风险率</span>' +
            '<span style="flex:1;text-align:center;">韧性评分</span>' +
            '<span style="flex:1;text-align:center;">通行保障率</span>';
        list.appendChild(header);

        data.forEach(function(d) {
            var disasterRiskRate = d.disasterRiskRate != null ? d.disasterRiskRate : 0;
            var resilienceScore = d.resilienceScore != null ? d.resilienceScore : 0;
            var trafficGuaranteeRate = d.trafficGuaranteeRate != null ? d.trafficGuaranteeRate : 0;
            var displayName = d.displayName || d.canonicalName;

            var el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 6px;margin-bottom:1px;height:22px;border-radius:2px;cursor:pointer;font-size:11px;';
            el.innerHTML =
                '<span style="flex:2.5;text-align:left;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + displayName + '</span>' +
                '<span style="flex:1;text-align:center;color:#F87171;font-weight:500;">' + disasterRiskRate.toFixed(1) + '%</span>' +
                '<span style="flex:1;text-align:center;color:#4ADE80;font-weight:500;">' + resilienceScore.toFixed(1) + '</span>' +
                '<span style="flex:1;text-align:center;color:#38BDF8;font-weight:500;">' + trafficGuaranteeRate.toFixed(1) + '%</span>';

            el.addEventListener('click', function() {
                window.showToast('📍 已选择: ' + displayName, 'info');
                window.dispatchEvent(new CustomEvent('district-selected', {
                    detail: {
                        divisionId: d.divisionId,
                        divisionKey: d.divisionKey,
                        displayName: displayName,
                        source: 'rightPanel'
                    }
                }));
            });

            list.appendChild(el);
        });
    }).catch(function(e) {
        console.warn('[RightPanel] 灾害韧性概况加载失败:', e);
        list.innerHTML = '<div style="text-align:center;font-size:11px;color:var(--text-muted);padding:8px;">加载失败</div>';
    });
}

// ============================================================
// 面板三：桥隧状态监控 (HOME-2: 选中Asset详情)
// ============================================================
function initAssetMonitor() {
    var panel = document.getElementById('asset-monitor-panel');
    if (!panel) return;

    // 只注册一次事件监听
    if (assetMonitorInitialized) return;
    assetMonitorInitialized = true;

    // 监听 asset-selected 事件
    window.addEventListener('asset-selected', function(e) {
        var detail = e.detail;
        if (detail && detail.assetId) {
            currentSelectedAssetId = detail.assetId;
            loadAssetMonitorData(detail.assetId);
        }
    });

    // 监听从DataManagement返回时的刷新事件
    window.addEventListener('dataAssetUpdated', function() {
        if (currentSelectedAssetId) {
            loadAssetMonitorData(currentSelectedAssetId);
        }
    });

    // 默认加载重庆朝天门长江大桥
    loadDefaultBridge();
}

// 加载默认桥梁（重庆朝天门长江大桥）
function loadDefaultBridge() {
    // 先尝试通过关键词查找
    api.searchAssets({ page: 0, size: 50, keyword: '朝天门长江大桥', assetType: 'BRIDGE' }).then(function(result) {
        var assets = result && result.content ? result.content : [];
        if (assets && assets.length > 0) {
            var targetBridge = assets.find(function(a) {
                return a.assetName && a.assetName.includes('朝天门长江大桥');
            });
            if (targetBridge && targetBridge.id) {
                currentSelectedAssetId = targetBridge.id;
                loadAssetMonitorData(targetBridge.id);
                return;
            }
        }
        // 如果没找到，显示默认提示
        showDefaultBridgePlaceholder();
    }).catch(function(e) {
        console.warn('[RightPanel] 加载默认桥梁失败:', e);
        showDefaultBridgePlaceholder();
    });
}

// 显示默认桥梁占位符
function showDefaultBridgePlaceholder() {
    var panel = document.getElementById('asset-monitor-panel');
    if (!panel) return;

    panel.innerHTML =
        '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">'
        + '<div style="font-size:14px;margin-bottom:8px;">🌉 重庆朝天门长江大桥</div>'
        + '<div style="font-size:11px;">请在地图中选择桥梁查看详情</div>'
        + '</div>';
}

function loadAssetMonitorData(assetId) {
    var panel = document.getElementById('asset-monitor-panel');
    if (!panel) return;

    panel.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:20px;">加载中...</div>';

    api.getAssetDetail(assetId).then(function(detail) {
        if (!detail) {
            panel.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px;">未找到该资产</div>';
            return;
        }

        var typeIcon = detail.assetType === 'BRIDGE' ? '🌉' : '🚇';
        var typeName = detail.assetType === 'BRIDGE' ? '桥梁' : '隧道';

        // 状态颜色
        var riskColors = { LOW: '#4ADE80', MEDIUM: '#FBBF24', HIGH: '#F87171', EXTREME: '#EF4444' };
        var passColors = { NORMAL: '#4ADE80', RESTRICTED: '#FBBF24', BLOCKED: '#F87171', UNKNOWN: '#94A3B8' };
        var riskLabels = { LOW: '低', MEDIUM: '中', HIGH: '高', EXTREME: '极高' };
        var passLabels = { NORMAL: '可通行', RESTRICTED: '受限', BLOCKED: '不可通行', UNKNOWN: '未知' };

        var riskColor = riskColors[detail.currentStatus?.riskLevel] || '#94A3B8';
        var riskLabel = riskLabels[detail.currentStatus?.riskLevel] || '未知';
        var passColor = passColors[detail.currentStatus?.passStatus] || '#94A3B8';
        var passLabel = passLabels[detail.currentStatus?.passStatus] || '未知';
        var healthScore = detail.currentStatus?.healthScore != null ? detail.currentStatus.healthScore : '--';

        // 图片区域
        var imageHtml = '';
        if (detail.imagePath) {
            imageHtml = '<div style="width:100%;height:120px;border-radius:6px;overflow:hidden;margin-bottom:8px;">'
                + '<img src="' + detail.imagePath + '" style="width:100%;height:100%;object-fit:cover;" data-asset-img="1">'
                + '</div>';
        } else {
            imageHtml = '<div style="width:100%;height:120px;border-radius:6px;background:rgba(20,46,102,0.15);border:1px dashed rgba(20,46,102,0.3);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:12px;margin-bottom:8px;">'
                + '\u{1F4F7}' + ' 请上传图片</div>';
        }

        panel.innerHTML =
            imageHtml +
            '<div style="font-size:14px;font-weight:600;color:var(--text-primary);margin-bottom:4px;">' + typeIcon + ' ' + detail.assetName + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;font-family:monospace;">' + detail.assetCode + '</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;font-size:11px;margin-bottom:8px;">' +
            '<div><span style="color:var(--text-muted);">类型:</span> <span style="color:var(--text-secondary);">' + typeName + '</span></div>' +
            '<div><span style="color:var(--text-muted);">行政区:</span> <span style="color:var(--text-secondary);">' + (detail.divisionName || '--') + '</span></div>' +
            '<div><span style="color:var(--text-muted);">道路:</span> <span style="color:var(--text-secondary);">' + (detail.roadName || '--') + '</span></div>' +
            '<div><span style="color:var(--text-muted);">来源:</span> <span style="color:var(--text-secondary);">' + (detail.sourceType || '--') + '</span></div>' +
            '</div>' +
            '<div style="border-top:1px solid rgba(20,46,102,0.3);padding-top:8px;">' +
            '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">' +
            '<span style="font-size:11px;color:var(--text-muted);width:60px;">健康评分</span>' +
            '<div style="flex:1;height:6px;background:rgba(255,255,255,0.1);border-radius:3px;overflow:hidden;">' +
            '<div style="width:' + (healthScore !== '--' ? (healthScore * 100) : 0) + '%;height:100%;background:' + riskColor + ';border-radius:3px;"></div></div>' +
            '<span style="font-size:12px;font-weight:600;color:' + riskColor + ';">' + (healthScore !== '--' ? (healthScore * 100).toFixed(0) + '%' : '--') + '</span></div>' +
            '<div style="display:flex;gap:6px;margin-bottom:4px;">' +
            '<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:' + riskColor + '15;color:' + riskColor + ';border:1px solid ' + riskColor + '30;">风险: ' + riskLabel + '</span>' +
            '<span style="font-size:11px;padding:2px 8px;border-radius:4px;background:' + passColor + '15;color:' + passColor + ';border:1px solid ' + passColor + '30;">通行: ' + passLabel + '</span>' +
            '</div>' +
            '</div>' +
            '<div style="margin-top:8px;">' +
            '<button id="asset-monitor-detail-btn" style="width:100%;padding:6px;background:rgba(20,46,102,0.3);border:1px solid rgba(20,46,102,0.5);border-radius:4px;color:var(--text-secondary);font-size:11px;cursor:pointer;">查看详细档案</button>' +
            '</div>';

        // 绑定查看详情按钮
        var detailBtn = document.getElementById('asset-monitor-detail-btn');
        if (detailBtn) {
            detailBtn.addEventListener('click', function() {
                import('./AssetDetailWindow.js').then(function(mod) {
                    mod.openAssetDetail(assetId);
                });
            });
        }

        // 图片加载失败处理
        var assetImg = panel.querySelector('[data-asset-img]');
        if (assetImg) {
            assetImg.addEventListener('error', function() {
                this.parentElement.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12px;padding:30px;">图片加载失败</div>';
            });
        }
    }).catch(function(e) {
        console.warn('[RightPanel] 桥隧状态监控加载失败:', e);
        panel.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px;">加载失败</div>';
    });
}