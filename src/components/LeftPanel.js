/**
 * 左侧面板 - 区域总览 / 重车通行状态 / 关键风险对象 / 区县概况
 *
 * 数据来源：通过 API 层获取，后端不可用时自动降级到 mockData
 */
const html = String.raw;
import { flyTo } from '../utils/mapUtils.js';
import api from '../api/index.js';

export function initLeftPanel() {
    initRegionOverview();
    initTruckStatus();
    initRiskRanking();
    initCountyOverview();
}

// ============================================================
// 面板一：区域总览
// ============================================================
function initRegionOverview() {
    var grid = document.getElementById('asset-grid');
    if (!grid) return;

    // 从 districtMetrics 统计数据
    api.getDistrictMetrics().then(function(metrics) {
        var districtCount = metrics.length; // 区县数量
        var totalRoadEdges = 0, totalBridgeTunnel = 0, totalControlNodes = 0, totalRoadKm = 0;
        metrics.forEach(function(d) {
            totalRoadEdges += (d.road_edge_count || 0);
            totalBridgeTunnel += (d.bridge_tunnel_count || (d.bridge_count + d.tunnel_count));
            totalControlNodes += (d.control_node_count || 0);
            totalRoadKm += (d.road_length_km || 0);
        });

        grid.innerHTML =
            '<div style="display:flex;flex-direction:column;align-items:center;margin-top:4px;">' +
            '<div style="font-size:40px;font-weight:800;color:#4ADE80;line-height:1;">' + districtCount + '</div>' +
            '<div style="font-size:14px;color:var(--text-muted);margin-top:6px;">统计区县</div></div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-top:4px;">' +
            '<div style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.18);border-radius:4px;padding:3px 2px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#38BDF8;">' + formatNum(totalRoadEdges) + '</div><div style="font-size:10px;color:var(--text-muted);">路网边数</div></div>' +
            '<div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.18);border-radius:4px;padding:3px 2px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#FBBF24;">' + totalBridgeTunnel + '</div><div style="font-size:10px;color:var(--text-muted);">桥隧资产</div></div>' +
            '<div style="background:rgba(168,85,247,0.08);border:1px solid rgba(168,85,247,0.18);border-radius:4px;padding:3px 2px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#A855F7;">' + totalControlNodes + '</div><div style="font-size:10px;color:var(--text-muted);">控制节点</div></div>' +
            '<div style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.18);border-radius:4px;padding:3px 2px;text-align:center;"><div style="font-size:14px;font-weight:700;color:#4ADE80;">' + formatNum(Math.round(totalRoadKm)) + ' km</div><div style="font-size:10px;color:var(--text-muted);">路网里程</div></div></div>';
    });
}

// ============================================================
// 面板二：重车通行状态
// ============================================================
function initTruckStatus() {
    var c = document.getElementById('truck-overview');
    if (!c) return;
    c.innerHTML = '';

    // 从桥隧资产数据统计通行状态
    api.getBridges().then(function(bridges) {
        var passable = 0, restricted = 0, forbidden = 0, unknown = 0;
        bridges.forEach(function(b) {
            var status = (b.truck_pass_status || 'unknown').toLowerCase();
            if (status === 'passable') passable++;
            else if (status === 'restricted') restricted++;
            else if (status === 'forbidden') forbidden++;
            else unknown++;
        });
        // 同时也统计隧道资产
        api.getTunnels().then(function(tunnels) {
            tunnels.forEach(function(t) {
                var status = (t.truck_pass_status || 'unknown').toLowerCase();
                if (status === 'passable') passable++;
                else if (status === 'restricted') restricted++;
                else if (status === 'forbidden') forbidden++;
                else unknown++;
            });

            c.style.cssText = 'display:flex;flex-direction:column;gap:4px;';
            var items = [
                { label: '可通行桥隧', count: passable, color: '#4ADE80' },
                { label: '限制通行桥隧', count: restricted, color: '#FBBF24' },
                { label: '禁止通行桥隧', count: forbidden, color: '#F87171' },
                { label: '信息不足', count: unknown, color: '#94A3B8' }
            ];
            var maxCount = Math.max(passable, restricted, forbidden, unknown, 1);
            items.forEach(function(d) {
                var pct = (d.count / maxCount) * 100;
                var el = document.createElement('div');
                el.style.cssText = 'display:flex;align-items:center;gap:8px;';
                el.innerHTML = '<span style="font-size:11px;color:var(--text-secondary);width:70px;flex-shrink:0;">' + d.label + '</span>' +
                    '<div style="flex:1;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;max-width:60%;"><div style="width:' + pct + '%;height:100%;background:' + d.color + ';border-radius:3px;transition:width 0.6s;"></div></div>' +
                    '<span style="font-size:11px;font-weight:600;color:' + d.color + ';width:24px;text-align:right;flex-shrink:0;">' + d.count + '</span>';
                c.appendChild(el);
            });
        });
    });
}

// ============================================================
// 面板三：关键风险对象
// ============================================================
function initRiskRanking() {
    var list = document.getElementById('weakness-list');
    if (!list) return;
    list.innerHTML = '';

    api.getRiskRankings().then(function(data) {
        data.forEach(function(d, i) {
            var riskColor = '#94A3B8';
            var riskLabel = '正常';
            if (d.risk_level === 'extreme') { riskColor = '#F87171'; riskLabel = '高度风险'; }
            else if (d.risk_level === 'high') { riskColor = '#FB923C'; riskLabel = '高度风险'; }
            else if (d.risk_level === 'medium') { riskColor = '#FBBF24'; riskLabel = '中度风险'; }
            else if (d.risk_level === 'low') { riskColor = '#4ADE80'; riskLabel = '轻度关注'; }

            var healthScore = d.health_score != null ? d.health_score : Math.round((1 - (d.risk_score || 0)) * 100);
            var assetType = d.asset_type || 'bridge';
            var assetTypeLabel = assetType === 'tunnel' ? '隧道' : '桥梁';
            var districtName = d.district_name || '';
            var assetName = d.asset_name || '';
            var shortName = assetName.length > 12 ? assetName.substring(0, 12) + '…' : assetName;
            var riskReason = d.risk_reason || d.risk_type || '';
            var eventType = d.event_type || '结构风险';

            var el = document.createElement('div');
            el.style.cssText = 'display:flex;flex-direction:column;gap:1px;padding:4px 6px;margin-bottom:2px;background:rgba(255,255,255,0.02);border-radius:3px;cursor:pointer;border-left:2px solid ' + riskColor + ';';
            el.title = assetName + ' / ' + riskReason + ' 风险：' + riskLabel;

            el.innerHTML =
                '<div style="display:flex;align-items:center;gap:4px;">' +
                '<span style="font-size:9px;font-weight:700;color:' + riskColor + ';width:16px;flex-shrink:0;">#' + (i + 1) + '</span>' +
                '<span style="flex:1;font-size:11px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + shortName + '</span>' +
                '<span style="font-size:9px;padding:0 4px;border-radius:2px;color:' + riskColor + ';background:' + riskColor + '15;flex-shrink:0;">' + riskLabel + '</span>' +
                '</div>' +
                '<div style="display:flex;align-items:center;gap:4px;padding-left:20px;">' +
                '<span style="font-size:10px;color:var(--text-muted);">' + districtName + ' / ' + assetTypeLabel + ' / 健康分 ' + healthScore + '</span>' +
                '<span style="font-size:9px;padding:0 6px;border-radius:2px;color:#38BDF8;background:rgba(56,189,248,0.1);cursor:pointer;flex-shrink:0;" class="btn-locate" data-name="' + assetName + '" data-district="' + districtName + '">[定位]</span>' +
                '</div>';

            // 点击行定位
            el.addEventListener('click', function(e) {
                if (e.target.classList.contains('btn-locate')) return;
                window.showToast('📍 定位至: ' + shortName, 'info');
                api.getBridges().then(function(bridges) {
                    var found = bridges.find(function(b) { return b.name && assetName.indexOf(b.name) >= 0 || b.uuid === d.asset_uuid; });
                    if (found) flyTo(found.latitude || found.lat, found.longitude || found.lng, 14);
                    else flyTo(29.56, 106.55, 11);
                });
            });
            var locateBtn = el.querySelector('.btn-locate');
            if (locateBtn) {
                locateBtn.addEventListener('click', function(e) {
                    e.stopPropagation();
                    window.showToast('📍 定位至: ' + shortName, 'info');
                    api.getBridges().then(function(bridges) {
                        var found = bridges.find(function(b) { return b.name && assetName.indexOf(b.name) >= 0 || b.uuid === d.asset_uuid; });
                        if (found) flyTo(found.latitude || found.lat, found.longitude || found.lng, 14);
                        else flyTo(29.56, 106.55, 11);
                    });
                });
            }
            list.appendChild(el);
        });
    });
}

// ============================================================
// 面板四：区县概况
// ============================================================
function initCountyOverview() {
    var list = document.getElementById('county-bridge-list');
    if (!list) return;
    list.innerHTML = '';

    api.getDistrictMetrics().then(function(data) {
        // 表头
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 6px;margin-bottom:2px;font-size:12px;color:var(--text-muted);font-weight:600;border-bottom:1px solid rgba(56,189,248,0.1);';
        header.innerHTML =
            '<span style="flex:3;text-align:left;">区县</span>' +
            '<span style="flex:1;text-align:center;">桥隧</span>' +
            '<span style="flex:1;text-align:center;">路网</span>' +
            '<span style="flex:1;text-align:center;">风险</span>';
        list.appendChild(header);

        data.forEach(function(d) {
            var total = d.bridge_tunnel_count || (d.bridge_count + d.tunnel_count) || 0;
            var roadKm = d.road_length_km || 0;
            var riskCount = d.high_risk_asset_count || 0;
            var riskColor = '#38BDF8';
            if (riskCount >= 5) riskColor = '#F87171';
            else if (riskCount >= 3) riskColor = '#FBBF24';

            var el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;gap:4px;padding:2px 6px;margin-bottom:1px;height:22px;border-radius:2px;cursor:pointer;font-size:11px;';
            el.innerHTML =
                '<span style="flex:3;text-align:left;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + d.district_name + '</span>' +
                '<span style="flex:1;text-align:center;color:#38BDF8;font-weight:600;">' + total + '</span>' +
                '<span style="flex:1;text-align:center;color:#FBBF24;">' + (roadKm >= 1000 ? (roadKm / 1000).toFixed(1) + 'k' : roadKm) + '</span>' +
                '<span style="flex:1;text-align:center;color:' + riskColor + ';font-weight:600;">' + riskCount + '</span>';

            el.addEventListener('click', function() {
                window.showToast('📍 已选择: ' + d.district_name, 'info');
                window.__selectedDistrict = d;
                var evt = new CustomEvent('district-selected', { detail: d });
                window.dispatchEvent(evt);
            });

            list.appendChild(el);
        });
    });
}

// ============================================================
// 工具函数
// ============================================================
function formatNum(n) {
    if (n >= 10000) return (n / 10000).toFixed(1) + '万';
    return n;
}