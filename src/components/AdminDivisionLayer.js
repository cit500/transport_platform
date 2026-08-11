/**
 * AdminDivisionLayer.js
 * ECharts 动态行政区划图层 — 重庆区县
 * 作为独立覆盖层叠加在 Leaflet 地图之上
 *
 * V1.2: 指标数据从 Overview API 获取，不再读取 mockData
 *        Polygon 仍从本地 GeoJSON 加载
 */

import chongqingDistrictsGeoJsonRaw from '../../gaosu/data/chongqing_roadnet/chongqing_districts_county_fixed.geojson?raw';
import api from '../api/index.js';

let chart = null;
let geoJsonCache = null;
let isVisible = false;
let currentMode = 'overlay';
let tooltipCarouselTimer = null;
let tooltipIndex = 0;
let lastHighlightedName = null;

// V1.2: 从 Overview API 获取的指标缓存（divisionKey → data）
let overviewCache = null;

/**
 * 初始化动态行政区划图层
 */
export async function initAdminDivisionLayer() {
    var el = document.getElementById('admin-division-layer');
    if (!el) {
        console.warn('[AdminDivisionLayer] #admin-division-layer not found');
        return;
    }

    var echartsLib = window.echarts;
    if (!echartsLib) {
        console.error('[AdminDivisionLayer] ECharts not loaded');
        window.showToast?.('ECharts 未加载', 'error');
        return;
    }

    chart = echartsLib.init(el, null, { renderer: 'canvas' });

    geoJsonCache = JSON.parse(chongqingDistrictsGeoJsonRaw);

    if (!geoJsonCache || !geoJsonCache.features || !geoJsonCache.features.length) {
        console.error('[AdminDivisionLayer] GeoJSON features empty');
        return;
    }

    geoJsonCache.features.forEach(function(f) {
        if (!f.properties) f.properties = {};
        var n = getRawFeatureName(f);
        var norm = normalizeDistrictName(n);
        f.properties.name = norm;
    });

    echartsLib.registerMap('chongqing_admin', geoJsonCache);
    hideAdminDivisionLayer();
    console.log('[AdminDivisionLayer] initialized');
}

function getRawFeatureName(f) {
    var p = f.properties || {};
    return p.name || p.NAME || p.fullname || p.district_name || p.DIST_NAME || '未知';
}

function getFeatureName(f) {
    var raw = getRawFeatureName(f);
    return normalizeDistrictName(raw);
}

function normalizeDistrictName(raw) {
    if (!raw) return '未知';
    var n = raw.replace(/^重庆市/, '');
    n = n.replace(/土家族苗族自治县$/, '县');
    n = n.replace(/苗族土家族自治县$/, '县');
    n = n.replace(/土家族自治县$/, '县');
    n = n.replace(/苗族自治县$/, '县');
    n = n.replace(/土家族苗族满族自治乡$/, '');
    n = n.replace(/自治县$/, '县');
    n = n.replace(/自治乡$/, '');
    return n;
}

function flatCoords(coords, out) {
    out = out || [];
    if (!coords) return out;
    if (typeof coords[0] === 'number') { out.push(coords); }
    else { coords.forEach(function(c) { flatCoords(c, out); }); }
    return out;
}

function getFeatureCenter(feature) {
    var pts = flatCoords(feature.geometry && feature.geometry.coordinates || []);
    if (!pts.length) return [106.55, 29.56];
    var minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    pts.forEach(function(p) {
        minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
        minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    });
    return [(minX + maxX) / 2, (minY + maxY) / 2];
}
/**
 * V1.2: 从 Overview API 加载指标数据
 * 返回 { displayName → overviewData } 映射
 */
async function loadOverviewData() {
    if (overviewCache) return overviewCache;
    try {
        var overviews = await api.getDivisionOverviews();
        if (!overviews || !overviews.length) {
            console.warn('[AdminDivisionLayer] Overview API 返回空数据');
            overviewCache = {};
            return overviewCache;
        }
        var map = {};
        overviews.forEach(function(o) {
            if (o.displayName) map[o.displayName] = o;
            if (o.canonicalName && o.canonicalName !== o.displayName) {
                map[o.canonicalName] = o;
            }
        });
        overviewCache = map;
        return overviewCache;
    } catch (e) {
        console.error('[AdminDivisionLayer] Overview API 调用失败:', e);
        overviewCache = {};
        return overviewCache;
    }
}

/**
 * V1.2: 同步获取已缓存的指标数据（renderChart 调用时使用）
 * 不再直接读取 window.__mockData
 */
function getDistrictMetricsMap() {
    return overviewCache || {};
}
function buildData(geoJson) {
    var features = geoJson.features || [];
    var metricsMap = getDistrictMetricsMap();
    var mapData = features.map(function(f, i) {
        var name = getFeatureName(f);
        var m = metricsMap[name];
        // V1.2: 指标数据从 Overview API 获取，不再生成随机 fallback
        var resilience = null;
        var disasterRisk = null;
        var trafficGuarantee = null;
        var riskLevel = null;
        var totalAssetCount = 0;
        if (m) {
            resilience = m.resilienceScore;
            disasterRisk = m.disasterRiskRate;
            trafficGuarantee = m.trafficGuaranteeRate;
            riskLevel = m.riskLevel;
            // HOME-2: 获取桥隧总数
            if (m.assetSummary) {
                totalAssetCount = m.assetSummary.totalAssetCount || 0;
            }
        }
        return {
            name: name,
            value: resilience,
            divisionId: m ? m.divisionId : null,
            divisionKey: m ? m.divisionKey : null,
            disasterRisk: disasterRisk,
            trafficGuarantee: trafficGuarantee,
            riskLevel: riskLevel,
            totalAssetCount: totalAssetCount,
            sourceType: m ? m.sourceType : null,
            center: getFeatureCenter(f)
        };
    });
    return { mapData: mapData };
}

async function renderChart() {
    if (!chart || !geoJsonCache) return;
    await loadOverviewData();
    var d = buildData(geoJsonCache);

    console.log('[AdminDivisionLayer] 注册的 GeoJSON 名称列表:');
    geoJsonCache.features.forEach(function(f, i) {
        console.log('  [' + i + '] properties.name:', JSON.stringify(f.properties.name), '原始 district_name:', f.properties.district_name);
    });
    console.log('[AdminDivisionLayer] Series data.name 列表:');
    d.mapData.forEach(function(x, i) {
        console.log('  [' + i + '] name:', JSON.stringify(x.name), 'value:', x.value, 'center:', x.center);
    });

    var echartsLib = window.echarts;
    var registeredMapInfo = echartsLib && echartsLib.getMap && echartsLib.getMap('chongqing_admin');
    console.log('[AdminDivisionLayer] echarts.getMap("chongqing_admin"):', registeredMapInfo ? 'OK, features=' + (registeredMapInfo.geoJson ? registeredMapInfo.geoJson.features.length : 0) : 'null');
    if (registeredMapInfo && registeredMapInfo.geoJson) {
        console.log('[AdminDivisionLayer] 已注册地图的前3个 feature.name:', registeredMapInfo.geoJson.features.slice(0, 3).map(function(f){return f.properties && f.properties.name;}));
    }

    var option = {
        backgroundColor: 'transparent',
        tooltip: {
            trigger: 'item',
            backgroundColor: 'rgba(5,20,38,0.92)',
            borderColor: 'rgba(34,211,238,0.42)',
            borderWidth: 1,
            textStyle: { color: '#e2e8f0' },
            formatter: function(params) {
                var data = params.data || {};
                var fmt = function(v) { return v != null ? v : '--'; };
                var riskColor = { low: '#4ADE80', medium: '#FBBF24', high: '#FB923C', extreme: '#F87171' };
                var riskText = data.riskLevel ? (data.riskLevel === 'low' ? '低' : data.riskLevel === 'medium' ? '中' : data.riskLevel === 'high' ? '高' : '极高') : '--';
                // HOME-2: 增加桥隧总数显示
                var assetCount = data.totalAssetCount != null ? data.totalAssetCount : 0;
                return '<b style="font-size:13px;">' + params.name + '</b><br/>' +
                    '桥隧总数：<span style="color:#FBBF24;">' + assetCount + '</span><br/>' +
                    '灾害风险率：<span style="color:#FBBF24;">' + fmt(data.disasterRisk) + '%</span><br/>' +
                    '韧性评分：<span style="color:#4ADE80;">' + fmt(data.value) + '</span><br/>' +
                    '通行保障率：<span style="color:#38BDF8;">' + fmt(data.trafficGuarantee) + '%</span><br/>' +
                    '风险等级：<span style="color:' + (riskColor[data.riskLevel] || '#94A3B8') + ';">' + riskText + '</span>';
            }
        },
        visualMap: { show: false, min: 60, max: 100, inRange: { color: ['rgba(16,40,75,0.30)','rgba(20,80,140,0.35)','rgba(30,140,200,0.40)','rgba(40,200,240,0.45)'] } },
        series: [
            {
                name: '行政区划韧性态势',
                type: 'map',
                map: 'chongqing_admin',
                roam: true,
                zoom: 0.7,
                aspectScale: 1,
                layoutCenter: ['50%', '50%'],
                layoutSize: '100%',
                center: [107.55, 29.56],
                data: d.mapData,
                label: {
                    show: true,
                    color: 'rgba(255, 255, 255, 0.9)',
                    fontSize: 12,
                    backgroundColor: 'transparent',
                    fontWeight: 'normal'
                },
                itemStyle: {
                    areaColor: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(25,100,170,0.30)' }, { offset: 1, color: 'rgba(10,50,90,0.38)' }] },
                    borderColor: '#00FFFF',
                    borderWidth: 2,
                    shadowColor: 'rgba(0,255,255,0.60)',
                    shadowBlur: 15
                },
                emphasis: {
                    label: { show: true, color: '#ffffff', fontWeight: 'bold', fontSize: 12 },
                    itemStyle: { areaColor: 'rgba(251,191,36,0.65)', borderColor: '#00FFFF', borderWidth: 2, shadowColor: 'rgba(251,191,36,0.55)', shadowBlur: 20 }
                }
            }
        ]
    };

    chart.setOption(option, true);
    chart.off('click');
    chart.on('click', function(params) {
        if (!params.name) return;
        var data = params.data || {};
        // V1.2: 统一 district-selected 事件结构
        window.dispatchEvent(new CustomEvent('district-selected', {
            detail: {
                divisionId: data.divisionId || null,
                divisionKey: data.divisionKey || null,
                displayName: params.name,
                source: 'map'
            }
        }));
        window.showToast?.('已选中行政区：' + params.name, 'info');
    });
}

export function showAdminDivisionLayer(mode) {
    mode = mode || 'overlay';
    var el = document.getElementById('admin-division-layer');
    if (!el || !chart) return;
    isVisible = true;
    currentMode = mode;
    el.classList.remove('is-overlay', 'is-exclusive');
    document.body.classList.remove('admin-division-overlay', 'admin-division-exclusive');
    if (mode === 'exclusive') {
        el.classList.add('is-exclusive');
        document.body.classList.add('admin-division-exclusive');
    } else {
        el.classList.add('is-overlay');
        document.body.classList.add('admin-division-overlay');
    }
    // 强制重排后按视口全屏尺寸重置图表
    void el.offsetHeight;
    chart.resize({ width: window.innerWidth, height: window.innerHeight });
    // 注册 resize 监听
    window.addEventListener('resize', resizeLayer);
    resizeLayer();

    // V1.2: renderChart 是异步的（需要加载 Overview 数据），等待完成后启动轮播
    renderChart().then(function() {
        startTooltipCarousel();
    });

    // 鼠标干预暂停机制：滑入暂停，滑出恢复
    if (!chart.__mouseListenersAttached) {
        var chartDom = chart.getDom();
        chartDom.addEventListener('mouseenter', carouselPauseHandler);
        chartDom.addEventListener('mouseleave', carouselResumeHandler);
        chart.__mouseListenersAttached = true;
    }
}

// 自动轮播 — 按韧性指数轮播展示区县详情，鼠标介入时暂停
function startTooltipCarousel() {
    stopTooltipCarousel();
    if (!chart || !geoJsonCache) return;

    var d = buildData(geoJsonCache);
    var topRegions = d.mapData.slice().sort(function(a, b) { return b.value - a.value; }).slice(0, 5);
    if (topRegions.length === 0) return;

    tooltipIndex = 0;
    lastHighlightedName = null;

    // 首次展示第一个区县
    setTimeout(function() {
        if (!chart) return;
        var name = topRegions[0].name;
        if (lastHighlightedName) {
            chart.dispatchAction({ type: 'downplay', seriesIndex: 0, name: lastHighlightedName });
        }
        chart.dispatchAction({ type: 'highlight', seriesIndex: 0, name: name });
        chart.dispatchAction({ type: 'showTip', seriesIndex: 0, name: name });
        lastHighlightedName = name;
    }, 600);

    // 每 3.5 秒轮播到下一位
    tooltipCarouselTimer = setInterval(function() {
        if (!chart || !isVisible) {
            stopTooltipCarousel();
            return;
        }
        var prevName = topRegions[tooltipIndex].name;
        tooltipIndex = (tooltipIndex + 1) % topRegions.length;
        var name = topRegions[tooltipIndex].name;

        if (lastHighlightedName) {
            chart.dispatchAction({ type: 'downplay', seriesIndex: 0, name: lastHighlightedName });
        }
        chart.dispatchAction({ type: 'highlight', seriesIndex: 0, name: name });
        chart.dispatchAction({ type: 'showTip', seriesIndex: 0, name: name });
        lastHighlightedName = name;
    }, 3500);
}

function stopTooltipCarousel() {
    if (tooltipCarouselTimer) {
        clearInterval(tooltipCarouselTimer);
        tooltipCarouselTimer = null;
    }
    // 清除当前高亮区域
    if (chart && lastHighlightedName) {
        chart.dispatchAction({ type: 'downplay', seriesIndex: 0, name: lastHighlightedName });
        lastHighlightedName = null;
    }
    if (chart) {
        chart.dispatchAction({ type: 'hideTip' });
    }
}

// 鼠标干预暂停机制
function carouselPauseHandler() {
    stopTooltipCarousel();
}
function carouselResumeHandler() {
    startTooltipCarousel();
}

export function hideAdminDivisionLayer() {
    var el = document.getElementById('admin-division-layer');
    if (!el) return;
    isVisible = false;
    // 停止轮播
    stopTooltipCarousel();
    // 隐藏 tooltip
    if (chart) {
        chart.dispatchAction({ type: 'hideTip' });
    }
    el.classList.remove('is-overlay', 'is-exclusive');
    document.body.classList.remove('admin-division-overlay', 'admin-division-exclusive');
}

export function toggleAdminDivisionLayer(visible, mode) {
    mode = mode || 'overlay';
    if (visible) {
        showAdminDivisionLayer(mode);
    } else {
        hideAdminDivisionLayer();
    }
}

export function resizeAdminDivisionLayer() {
    if (chart) { chart.resize(); }
}

function resizeLayer() {
    if (chart) {
        chart.resize({ width: window.innerWidth, height: window.innerHeight });
    }
}

export function isAdminDivisionVisible() {
    return isVisible;
}