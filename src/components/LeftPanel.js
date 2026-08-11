/**
 * 左侧面板 - HOME-2 重构
 * 区域总览 / 区域风险概况 / 重车通行概况
 *
 * 数据来源：通过 API 层获取，后端不可用时自动降级到 --
 */
const html = String.raw;
import { flyTo } from '../utils/mapUtils.js';
import api from '../api/index.js';

export function initLeftPanel() {
    initRegionOverview();
    initRiskOverviewChart();
    initTruckPassageOverview();
}

/**
 * 刷新左侧面板所有数据（供外部调用）
 */
export function refreshLeftPanel() {
    initRegionOverview();
    initRiskOverviewChart();
    initTruckPassageOverview();
}

// ============================================================
// 面板一：区域总览 (HOME-2: 2×2核心指标)
// ============================================================
function initRegionOverview() {
    var grid = document.getElementById('asset-grid');
    if (!grid) return;

    grid.innerHTML = '<div style="text-align:center;font-size:11px;color:var(--text-muted);padding:8px;">加载中...</div>';

    // 并行获取 Road Summary、Asset Summary、行政区列表
    Promise.all([
        api.getRoadNetworkSummary(),
        api.getAssetSummary(),
        api.getDivisionOverviews()
    ]).then(function([roadSummary, assetSummary, overviews]) {
        // 行政区数量
        var adminCount = (overviews && overviews.length) || 0;
        // 路网里程：edgeLengthKm
        var edgeLengthKm = roadSummary.edgeLengthKm || 0;
        // 路网边数：edgeCount
        var edgeCount = roadSummary.edgeCount || 0;
        // 桥梁数量
        var bridgeCount = assetSummary.bridgeCount || 0;
        // 隧道数量
        var tunnelCount = assetSummary.tunnelCount || 0;

        var displayAdmin = adminCount > 0 ? adminCount : '--';
        var displayKm = edgeLengthKm > 0 ? edgeLengthKm.toFixed(1) : '--';
        var displayEdgeCount = edgeCount > 0 ? edgeCount : '--';
        var displayBridge = bridgeCount > 0 ? bridgeCount : '--';
        var displayTunnel = tunnelCount > 0 ? tunnelCount : '--';

        grid.innerHTML =
            '<div style="display:flex;gap:4px;height:100%;width:100%;">' +
            // 左侧：行政区（上下排布，占满高度）
            '<div style="flex:0 0 30%;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(20,46,102,0.25);border:1px solid rgba(20,46,102,0.5);border-radius:6px;padding:4px 6px;">' +
            '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;white-space:nowrap;">行政区</div>' +
            '<div style="font-size:clamp(24px, 3vw, 32px);font-weight:800;color:#22D3EE;line-height:1;">' + displayAdmin + '</div>' +
            '<div style="font-size:11px;color:var(--text-muted);margin-top:4px;white-space:nowrap;">个区县</div>' +
            '</div>' +
            // 右侧：2×2 信息框（占满高度，平铺满宽度）
            '<div style="flex:1;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:4px;">' +
            '<div style="background:rgba(20,46,102,0.25);border:1px solid rgba(20,46,102,0.5);border-radius:6px;padding:4px 6px;text-align:center;display:flex;flex-direction:column;justify-content:center;">' +
            '<div style="font-size:clamp(16px, 2vw, 22px);font-weight:800;color:#38BDF8;line-height:1.2;">' + displayKm + '</div>' +
            '<div style="font-size:10px;color:var(--text-muted);margin-top:3px;white-space:nowrap;">路网里程(km)</div></div>' +
            '<div style="background:rgba(20,46,102,0.25);border:1px solid rgba(20,46,102,0.5);border-radius:6px;padding:4px 6px;text-align:center;display:flex;flex-direction:column;justify-content:center;">' +
            '<div style="font-size:clamp(16px, 2vw, 22px);font-weight:800;color:#22D3EE;line-height:1.2;">' + displayEdgeCount + '</div>' +
            '<div style="font-size:10px;color:var(--text-muted);margin-top:3px;white-space:nowrap;">路网边数</div></div>' +
            '<div style="background:rgba(20,46,102,0.25);border:1px solid rgba(20,46,102,0.5);border-radius:6px;padding:4px 6px;text-align:center;display:flex;flex-direction:column;justify-content:center;">' +
            '<div style="font-size:clamp(16px, 2vw, 22px);font-weight:800;color:#4ADE80;line-height:1.2;">' + displayBridge + '</div>' +
            '<div style="font-size:10px;color:var(--text-muted);margin-top:3px;white-space:nowrap;">桥梁数量</div></div>' +
            '<div style="background:rgba(20,46,102,0.25);border:1px solid rgba(20,46,102,0.5);border-radius:6px;padding:4px 6px;text-align:center;display:flex;flex-direction:column;justify-content:center;">' +
            '<div style="font-size:clamp(16px, 2vw, 22px);font-weight:800;color:#FBBF24;line-height:1.2;">' + displayTunnel + '</div>' +
            '<div style="font-size:10px;color:var(--text-muted);margin-top:3px;white-space:nowrap;">隧道数量</div></div>' +
            '</div>' +
            '</div>';
    }).catch(function(e) {
        console.warn('[LeftPanel] 区域总览加载失败:', e);
        grid.innerHTML = '<div style="text-align:center;font-size:11px;color:var(--text-muted);padding:8px;">数据服务不可用</div>';
    });
}

// ============================================================
// 面板二：区域风险概况 (HOME-2: ECharts竖向柱状图)
// ============================================================
function initRiskOverviewChart() {
    var chartContainer = document.getElementById('risk-overview-chart');
    if (!chartContainer) return;

    var echartsLib = window.echarts;
    if (!echartsLib) {
        console.warn('[LeftPanel] ECharts not loaded');
        return;
    }

    chartContainer.innerHTML = '';

    api.getDivisionOverviews().then(function(overviews) {
        if (!overviews || !overviews.length) {
            chartContainer.innerHTML = '<div style="text-align:center;font-size:11px;color:var(--text-muted);padding:20px;">暂无数据</div>';
            return;
        }

        // 统计风险等级
        var riskCounts = { LOW: 0, MEDIUM: 0, HIGH: 0, EXTREME: 0 };
        overviews.forEach(function(d) {
            var level = (d.riskLevel || '').toUpperCase();
            if (riskCounts.hasOwnProperty(level)) {
                riskCounts[level]++;
            }
        });

        var chart = echartsLib.init(chartContainer, null, { renderer: 'canvas' });

        var option = {
            backgroundColor: 'transparent',
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function(params) {
                    var p = params[0];
                    var total = overviews.length;
                    var pct = total > 0 ? ((p.value / total) * 100).toFixed(1) : 0;
                    return p.name + '<br/>行政区数量: ' + p.value + '<br/>占比: ' + pct + '%';
                },
                textStyle: { color: '#E2E8F0', fontSize: 12 },
                backgroundColor: 'rgba(6,11,24,0.9)',
                borderColor: 'rgba(20,46,102,0.5)'
            },
            grid: {
                left: '8%',
                right: '8%',
                top: '12%',
                bottom: '15%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: ['低风险', '中风险', '高风险', '极高风险'],
                axisLine: { lineStyle: { color: 'rgba(148,163,184,0.3)' } },
                axisLabel: { color: '#94A3B8', fontSize: 11 },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                name: '行政区数量',
                nameTextStyle: { color: '#64748B', fontSize: 10 },
                axisLine: { show: false },
                axisLabel: { color: '#64748B', fontSize: 10 },
                splitLine: { lineStyle: { color: 'rgba(148,163,184,0.1)' } }
            },
            series: [{
                type: 'bar',
                data: [
                    { value: riskCounts.LOW, itemStyle: { color: '#4ADE80' } },
                    { value: riskCounts.MEDIUM, itemStyle: { color: '#FBBF24' } },
                    { value: riskCounts.HIGH, itemStyle: { color: '#FB923C' } },
                    { value: riskCounts.EXTREME, itemStyle: { color: '#F87171' } }
                ],
                barWidth: '50%',
                label: {
                    show: true,
                    position: 'top',
                    color: '#E2E8F0',
                    fontSize: 12,
                    fontWeight: 'bold'
                }
            }]
        };

        chart.setOption(option);

        // 延迟resize确保容器尺寸已确定
        setTimeout(function() { chart.resize(); }, 100);

        // 窗口大小变化时重新调整
        window.addEventListener('resize', function() {
            chart.resize();
        });
    }).catch(function(e) {
        console.warn('[LeftPanel] 风险概况加载失败:', e);
        chartContainer.innerHTML = '<div style="text-align:center;font-size:11px;color:var(--text-muted);padding:20px;">加载失败</div>';
    });
}

// ============================================================
// 面板三：重车通行概况 (HOME-2: 桥梁+隧道双环形图)
// ============================================================
function initTruckPassageOverview() {
    var container = document.getElementById('truck-overview');
    if (!container) return;

    var echartsLib = window.echarts;
    if (!echartsLib) {
        console.warn('[LeftPanel] ECharts not loaded');
        return;
    }

    container.innerHTML = '';

    api.getAssetSummary().then(function(summary) {
        // 桥梁状态统计
        var bridgeNormal = summary.bridgeNormalCount || 0;
        var bridgeRestricted = summary.bridgeRestrictedCount || 0;
        var bridgeBlocked = summary.bridgeBlockedCount || 0;
        var bridgeUnknown = summary.bridgeUnknownCount || 0;

        // 隧道状态统计
        var tunnelNormal = summary.tunnelNormalCount || 0;
        var tunnelRestricted = summary.tunnelRestrictedCount || 0;
        var tunnelBlocked = summary.tunnelBlockedCount || 0;
        var tunnelUnknown = summary.tunnelUnknownCount || 0;

        // 创建两个容器
        var bridgeDiv = document.createElement('div');
        bridgeDiv.style.cssText = 'flex:1;position:relative;min-height:0;';
        container.appendChild(bridgeDiv);

        var tunnelDiv = document.createElement('div');
        tunnelDiv.style.cssText = 'flex:1;position:relative;min-height:0;';
        container.appendChild(tunnelDiv);

        // 桥梁环形图
        createDonutChart(bridgeDiv, '桥梁', bridgeNormal, bridgeRestricted, bridgeBlocked, bridgeUnknown);
        // 隧道环形图
        createDonutChart(tunnelDiv, '隧道', tunnelNormal, tunnelRestricted, tunnelBlocked, tunnelUnknown);

    }).catch(function(e) {
        console.warn('[LeftPanel] 通行概况加载失败:', e);
        container.innerHTML = '<div style="text-align:center;font-size:11px;color:var(--text-muted);padding:8px;">加载失败</div>';
    });
}

function createDonutChart(container, title, normal, restricted, blocked, unknown) {
    var echartsLib = window.echarts;
    var chart = echartsLib.init(container, null, { renderer: 'canvas' });

    var total = normal + restricted + blocked;
    var data = [
        { value: normal, name: '可通行', itemStyle: { color: '#4ADE80' } },
        { value: restricted, name: '受限', itemStyle: { color: '#FBBF24' } },
        { value: blocked, name: '不可通行', itemStyle: { color: '#F87171' } }
    ].filter(function(d) { return d.value > 0; });

    var option = {
        backgroundColor: 'transparent',
        title: {
            text: title,
            left: 'center',
            top: 4,
            textStyle: { color: '#E2E8F0', fontSize: 12, fontWeight: 'bold' }
        },
        tooltip: {
            trigger: 'item',
            formatter: function(params) {
                return params.name + ': ' + params.value + ' 座';
            },
            textStyle: { color: '#E2E8F0', fontSize: 11 },
            backgroundColor: 'rgba(6,11,24,0.9)',
            borderColor: 'rgba(20,46,102,0.5)'
        },
        legend: {
            orient: 'horizontal',
            top: 22,
            left: 'center',
            textStyle: {
                color: '#94A3B8',
                fontSize: 9
            },
            itemWidth: 8,
            itemHeight: 8,
            itemGap: 8
        },
        graphic: [{
            type: 'text',
            left: 'center',
            top: '48%',
            style: {
                text: total,
                textAlign: 'center',
                fill: '#E2E8F0',
                fontSize: 18,
                fontWeight: 'bold'
            }
        }, {
            type: 'text',
            left: 'center',
            top: '60%',
            style: {
                text: title,
                textAlign: 'center',
                fill: '#64748B',
                fontSize: 10
            }
        }],
        series: [{
            type: 'pie',
            radius: ['45%', '68%'],
            center: ['50%', '58%'],
            avoidLabelOverlap: false,
            label: { show: false },
            data: data.length > 0 ? data : [{ value: 1, name: '无数据', itemStyle: { color: 'rgba(148,163,184,0.2)' } }]
        }]
    };

    chart.setOption(option);

    // 延迟resize确保容器尺寸已确定
    setTimeout(function() { chart.resize(); }, 100);

    window.addEventListener('resize', function() {
        chart.resize();
    });

    // 添加UNKNOWN提示
    if (unknown > 0) {
        var unknownEl = document.createElement('div');
        unknownEl.style.cssText = 'text-align:center;font-size:10px;color:var(--text-muted);padding:2px 0;';
        unknownEl.textContent = '状态未知: ' + unknown;
        container.appendChild(unknownEl);
    }
}