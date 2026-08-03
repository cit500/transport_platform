/**
 * Leaflet 地图工具函数
 */

import chongqingRoadnetGeoJsonRaw from '../../gaosu/data/chongqing_roadnet/chongqing_expressway_edges_district_fixed.geojson?raw';
const chongqingRoadnetGeoJson = JSON.parse(chongqingRoadnetGeoJsonRaw);

let map = null;
let currentLayer = null;
let markersLayer = null;
let routeLayer = null;
let heatLayer = null;
let highlightLayer = null;

// 重庆高速/快速路网缓存
let chongqingRoadnetLayer = null;
let chongqingRoadnetLoading = false;

// BIGEMAP 底图配置
const BIGEMAP_SERVER_URL = 'http://127.0.0.1:9000';
const BIGEMAP_ACCESS_TOKEN = 'pk.eyJ1IjoiY3VzXzB2eTFlYXA5IiwiYSI6ImVnNWdxbGtkbjNhY24wbGFybmZlY25qbGkifQ.ZAg23qtH2mD4eClfKElqaQ';
const BIGEMAP_LAYER_IDS = {
    electronic: 'bigemap.7i2bexkr',
    satellite: 'bigemap.5grpf9us'
};
const CHONGQING_BOUNDS = [
    [28.163658142089844, 105.28640747070312],
    [32.20344161987305, 110.19485473632812]
];
const CHONGQING_CENTER = [30.183549880981445, 107.74063110351562];
let currentBaseMapType = 'dark';
let bigemapElectronicLayer = null;
let bigemapSatelliteLayer = null;
let bigemapReady = false;
let bigemapInitError = null;

// 地图样式定义
const mapStyles = {
    dark: {
        name: '暗色底图',
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        attribution: '© OpenStreetMap contributors, © CARTO'
    },
    satellite: {
        name: '卫星影像',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: '© Esri, Maxar, Earthstar Geographics'
    },
    light: {
        name: '亮色底图',
        url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        attribution: '© OpenStreetMap contributors, © CARTO'
    },
    satellite: {
        name: '卫星影像',
        url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        attribution: 'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
    },
    terrain: {
        name: '地形图',
        url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        attribution: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap'
    }
};

let currentBaseLayer = null;

// 覆盖层管理
let overlays = {};

// 覆盖层控制
let layerControl = null;

// 桥梁图标映射
const iconMap = {
    normal: L.divIcon({
        className: 'custom-marker',
        html: '<div style="width:14px;height:14px;border-radius:50%;background:#4ADE80;border:2px solid rgba(74,222,128,0.5);box-shadow:0 0 8px rgba(74,222,128,0.4);"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    }),
    warning: L.divIcon({
        className: 'custom-marker',
        html: '<div style="width:14px;height:14px;border-radius:50%;background:#FBBF24;border:2px solid rgba(251,191,36,0.5);box-shadow:0 0 8px rgba(251,191,36,0.4);"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    }),
    danger: L.divIcon({
        className: 'custom-marker',
        html: '<div style="width:14px;height:14px;border-radius:50%;background:#F87171;border:2px solid rgba(248,113,113,0.5);box-shadow:0 0 8px rgba(248,113,113,0.4);"></div>',
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    }),
    blocked: L.divIcon({
        className: 'custom-marker',
        html: '<div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;font-size:16px;background:rgba(248,113,113,0.2);border-radius:50%;border:2px solid rgba(248,113,113,0.5);">❌</div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    }),
    bridgeDetail: L.divIcon({
        className: 'custom-marker',
        html: '<div style="width:20px;height:20px;border-radius:50%;background:#38BDF8;border:2px solid rgba(56,189,248,0.6);box-shadow:0 0 12px rgba(56,189,248,0.5);cursor:pointer;"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10]
    }),
    flash: L.divIcon({
        className: 'custom-marker',
        html: '<div style="width:24px;height:24px;border-radius:50%;background:#FBBF24;border:2px solid rgba(251,191,36,0.8);box-shadow:0 0 20px rgba(251,191,36,0.8);animation:glow-pulse 1s ease-in-out infinite;cursor:pointer;"></div>',
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    })
};

/**
 * 初始化地图
 */
export function initMap(containerId, center, zoom) {
    // 默认重庆市中心
    center = center || CHONGQING_CENTER;
    zoom = zoom || 12;
    map = L.map(containerId, {
        center,
        zoom,
        zoomControl: false,
        attributionControl: false,
        fadeAnimation: true,
        zoomAnimation: true,
        maxBounds: CHONGQING_BOUNDS,
        maxBoundsViscosity: 0.8
    });

    if (!map.getPane('roadPane')) {
        map.createPane('roadPane');
        map.getPane('roadPane').style.zIndex = 450;
    }

    initializeBigemapSupport();

    // 默认加载暗色底图
    currentBaseLayer = L.tileLayer(mapStyles.dark.url, {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: mapStyles.dark.attribution
    }).addTo(map);
    currentBaseMapType = 'dark';

    // 初始化图层组
    markersLayer = L.layerGroup().addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    heatLayer = L.layerGroup().addTo(map);
    highlightLayer = L.layerGroup().addTo(map);

    // 创建覆盖层对象
    overlays = {
        '桥梁': markersLayer,
        '路网': routeLayer,
        '热力图': heatLayer,
        '高亮': highlightLayer
    };

    return map;
}

function initializeBigemapSupport() {
    try {
        const buildTileUrl = (layerId) => `${BIGEMAP_SERVER_URL}/${layerId}/tiles/{z}/{x}/{y}.png?access_token=${BIGEMAP_ACCESS_TOKEN}`;

        bigemapElectronicLayer = L.tileLayer(buildTileUrl(BIGEMAP_LAYER_IDS.electronic), {
            maxZoom: 12,
            minZoom: 6,
            attribution: '',
            subdomains: []
        });
        bigemapSatelliteLayer = L.tileLayer(buildTileUrl(BIGEMAP_LAYER_IDS.satellite), {
            maxZoom: 12,
            minZoom: 6,
            attribution: '',
            subdomains: []
        });

        bigemapReady = true;
        bigemapInitError = null;
        console.log('[BIGEMAP] 底图图层已使用瓦片 URL 初始化');
    } catch (error) {
        bigemapReady = false;
        bigemapInitError = error && error.message ? error.message : 'BIGEMAP 初始化失败';
        console.error('[BIGEMAP] 初始化失败:', bigemapInitError);
    }
}

/**
 * 获取基础图层
 */
function getBaseLayers() {
    const baseLayers = {};
    for (const [key, style] of Object.entries(mapStyles)) {
        baseLayers[style.name] = L.tileLayer(style.url, {
            maxZoom: 19,
            subdomains: 'abcd',
            attribution: style.attribution
        });
    }
    return baseLayers;
}

/**
 * 底图真实切换逻辑 (dark <-> satellite + label overlay + BIGEMAP)
 */
export function switchBaseMap(type) {
    return toggleBaseMap(type);
}

export function toggleBaseMap(type) {
    if (!map) return;

    const normalizedType = type === 'base' ? 'dark' : type || 'dark';

    if (currentBaseLayer && map.hasLayer(currentBaseLayer)) {
        try {
            map.removeLayer(currentBaseLayer);
        } catch (error) {
            console.warn('[BaseMap] 移除当前底图失败:', error);
        }
    }

    let nextLayer = null;
    let message = '';

    if (normalizedType === 'satellite') {
        nextLayer = L.layerGroup([
            L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 19,
                attribution: '© Esri, Maxar, Earthstar Geographics'
            }),
            L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_only_labels/{z}/{x}/{y}.png', {
                maxZoom: 19,
                subdomains: 'abcd'
            })
        ]);
        message = '底图已切换: 卫星影像 + 标注叠加';
    } else if (normalizedType === 'bigemap-electronic') {
        if (!bigemapReady || !bigemapElectronicLayer) {
            console.error('[BIGEMAP] 电子地图底图不可用:', bigemapInitError || '未知错误');
            window.showToast?.('BIGEMAP电子地图服务未启动，请检查本地9000端口', 'warning');
            return;
        }
        nextLayer = bigemapElectronicLayer;
        message = '底图已切换: 电子地图';
    } else if (normalizedType === 'bigemap-satellite') {
        if (!bigemapReady || !bigemapSatelliteLayer) {
            console.error('[BIGEMAP] 卫星地图底图不可用:', bigemapInitError || '未知错误');
            window.showToast?.('BIGEMAP卫星地图服务未启动，请检查本地9000端口', 'warning');
            return;
        }
        nextLayer = bigemapSatelliteLayer;
        message = '底图已切换: 卫星地图';
    } else {
        nextLayer = L.tileLayer(mapStyles.dark.url, {
            maxZoom: 19,
            subdomains: 'abcd',
            attribution: mapStyles.dark.attribution
        });
        message = '底图已切换: 暗色矢量';
    }

    if (!nextLayer) {
        return;
    }

    try {
        nextLayer.addTo(map);
        currentBaseLayer = nextLayer;
        currentBaseMapType = normalizedType;

        if (chongqingRoadnetLayer && map.hasLayer(chongqingRoadnetLayer)) {
            try {
                chongqingRoadnetLayer.bringToFront();
            } catch (error) {
                console.warn('[BaseMap] 路网图层置顶失败:', error);
            }
        }

        window.showToast?.(message, normalizedType === 'satellite' ? 'success' : 'info');
    } catch (error) {
        console.error('[BaseMap] 添加底图失败:', error);
        window.showToast?.('底图切换失败，请检查底图服务', 'error');
    }
}

/**
 * 控制业务覆盖层显隐 (路网/桥隧/云图)
 */
export function toggleOverlayByName(name, visible) {
    if (!map) return;

    // 路网图层切换到真实重庆高速/快速路网
    if (name === 'road') {
        toggleChongqingRoadnetLayer(map, visible);
        return;
    }

    var layerMap = { bridge: markersLayer, heat: heatLayer };
    var layer = layerMap[name];
    if (!layer) return;
    if (visible && !map.hasLayer(layer)) {
        map.addLayer(layer);
    } else if (!visible && map.hasLayer(layer)) {
        map.removeLayer(layer);
    }
}

// ============================================================
// 重庆高速/快速路网图层
// ============================================================

/**
 * 根据 highway 字段获取道路样式
 */
function getRoadStyle(feature) {
    var highway = String(feature.properties?.highway || '');

    if (highway.includes('motorway_link')) {
        return { color: '#ff8a80', weight: 2.0, opacity: 0.85 };
    }

    if (highway.includes('motorway')) {
        return { color: '#e74c3c', weight: 3.2, opacity: 0.9 };
    }

    if (highway.includes('trunk_link')) {
        return { color: '#f6b26b', weight: 1.8, opacity: 0.8 };
    }

    if (highway.includes('trunk')) {
        return { color: '#f39c12', weight: 2.6, opacity: 0.85 };
    }

    return { color: '#2980b9', weight: 1.5, opacity: 0.7 };
}

/**
 * 格式化道路弹窗 HTML
 */
function formatRoadPopup(properties) {
    properties = properties || {};
    var length = Number(properties.length || 0);

    return '<div class="road-popup">' +
        '<div class="road-popup-title">' + (properties.name || properties.ref || '未命名道路') + '</div>' +
        '<div>道路编号：' + (properties.ref || '-') + '</div>' +
        '<div>道路等级：' + (properties.highway || '-') + '</div>' +
        '<div>所属区县：' + (properties.district_name || '-') + '</div>' +
        '<div>长度：' + (length ? length.toFixed(1) + ' m' : '-') + '</div>' +
        '<div>限速：' + (properties.maxspeed || '-') + '</div>' +
        '<div>车道数：' + (properties.lanes || '-') + '</div>' +
        '<div>桥梁属性：' + (properties.bridge || '-') + '</div>' +
        '<div>隧道属性：' + (properties.tunnel || '-') + '</div>' +
        '</div>';
}

/**
 * 加载重庆高速/快速路网图层（懒加载）
 * 只在第一次调用时 fetch，之后返回缓存
 */
export async function loadChongqingRoadnetLayer(map) {
    if (chongqingRoadnetLayer) {
        if (!map.hasLayer(chongqingRoadnetLayer)) {
            chongqingRoadnetLayer.addTo(map);
        }
        return chongqingRoadnetLayer;
    }

    if (chongqingRoadnetLoading) {
        return null;
    }

    chongqingRoadnetLoading = true;

    try {
        var geojson = chongqingRoadnetGeoJson;

        if (!geojson || !geojson.features) {
            throw new Error('路网 GeoJSON 数据为空');
        }

        chongqingRoadnetLayer = L.geoJSON(geojson, {
            pane: 'roadPane',
            style: getRoadStyleWithStatus,
            onEachFeature: function (feature, layer) {
                var properties = feature.properties || {};
                // 自动生成 edge_id
                if (!properties.edge_id) {
                    properties.edge_id = (properties.u || '') + '_' + (properties.v || '') + '_' + (properties.key || 0);
                }
                layer.bindPopup(formatRoadPopup(properties));
            }
        });

        chongqingRoadnetLayer.addTo(map);
        chongqingRoadnetLayer.bringToFront();
        console.log('[Roadnet] 重庆高速/快速路网加载完成，共 ' + (geojson.features ? geojson.features.length : 0) + ' 条道路');
        return chongqingRoadnetLayer;
    } catch (error) {
        console.error('[Roadnet] 重庆高速/快速路网加载失败：', error);
        return null;
    } finally {
        chongqingRoadnetLoading = false;
    }
}

/**
 * 移除重庆高速/快速路网图层（不清除缓存）
 */
export function removeChongqingRoadnetLayer(map) {
    if (chongqingRoadnetLayer && map.hasLayer(chongqingRoadnetLayer)) {
        map.removeLayer(chongqingRoadnetLayer);
    }
}

/**
 * 切换重庆高速/快速路网图层显隐
 * visible=true 时懒加载；visible=false 时移除但保留缓存
 */
export function toggleChongqingRoadnetLayer(map, visible) {
    if (visible) {
        return loadChongqingRoadnetLayer(map);
    }

    removeChongqingRoadnetLayer(map);
    return null;
}

/**
 * 切换地图样式
 */
export function changeMapStyle(styleName) {
    if (!map || !mapStyles[styleName]) return;

    if (currentBaseLayer) {
        map.removeLayer(currentBaseLayer);
    }

    currentBaseLayer = L.tileLayer(mapStyles[styleName].url, {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: mapStyles[styleName].attribution
    }).addTo(map);

    showToast('地图样式已切换为: ' + mapStyles[styleName].name, 'info');
}

/**
 * 获取可用的地图样式
 */
export function getAvailableMapStyles() {
    return Object.keys(mapStyles).map(function (key) {
        return { key: key, name: mapStyles[key].name };
    });
}

/**
 * 获取地图实例
 */
export function getMap() {
    return map;
}

/**
 * 飞行到指定位置
 */
export function flyTo(lat, lng, zoom = 12) {
    if (map) {
        map.flyTo([lat, lng], zoom, { duration: 1.5 });
    }
}
// 全局暴露，供后台管理模块使用
window.__flyTo = flyTo;

/**
 * 添加桥梁标记
 */
export function addBridgeMarker(bridge, onClick) {
    // 兼容两种字段命名：latitude/longitude 和 lat/lng
    var lat = bridge.lat != null ? bridge.lat : bridge.latitude;
    var lng = bridge.lng != null ? bridge.lng : bridge.longitude;
    if (lat == null || lng == null) return;
    var icon = iconMap[bridge.status] || iconMap.normal;
    var marker = L.marker([lat, lng], { icon }).addTo(markersLayer);

    const statusText = {
        normal: '<span style="color:#4ADE80;">● 常态运行</span>',
        warning: '<span style="color:#FBBF24;">● 预警状态</span>',
        danger: '<span style="color:#F87171;">● 严重受损</span>'
    };

    // 兼容两种字段命名
    var typeName = bridge.type || bridge.structure_type || '--';
    var spanVal = bridge.span || bridge.span_length || '--';
    var healthVal = bridge.healthScore != null ? bridge.healthScore : (bridge.health_index != null ? bridge.health_index : '--');
    var loadLimitVal = bridge.loadLimit != null ? bridge.loadLimit : '';

    marker.bindPopup(`
    <div style="font-family:'Segoe UI','PingFang SC',sans-serif;min-width:200px;">
      <div style="font-size:14px;font-weight:600;color:#38BDF8;margin-bottom:6px;">${bridge.name}</div>
      <div style="font-size:12px;color:#94A3B8;margin-bottom:4px;">UUID: ${bridge.uuid}</div>
      <div style="font-size:12px;color:#94A3B8;margin-bottom:4px;">类型: ${typeName} | 跨径: ${spanVal}</div>
      <div style="font-size:12px;margin-bottom:4px;">
        ${statusText[bridge.status] || ''}
        ${loadLimitVal ? ` | 限载: ${loadLimitVal}t` : ''}
      </div>
      <div style="font-size:12px;color:#94A3B8;">健康分: ${healthVal}</div>
      <button onclick="window.openBridgeDetail('${bridge.uuid}')" style="margin-top:8px;padding:4px 12px;background:rgba(56,189,248,0.15);border:1px solid rgba(56,189,248,0.3);border-radius:4px;color:#38BDF8;cursor:pointer;font-size:12px;">查看详情 →</button>
    </div>
  `, { minWidth: 200, maxWidth: 300 });

    if (onClick) {
        marker.on('click', () => onClick(bridge));
    }

    return marker;
}

/**
 * 批量添加桥梁标记
 */
export function addAllBridgeMarkers(bridges, onClick) {
    clearMarkers();
    bridges.forEach(b => addBridgeMarker(b, onClick));
}

/**
 * 添加路网线
 */
export function addRoads(roads) {
    clearRoutes();
    roads.forEach(road => {
        const color = {
            normal: '#4ADE80',
            warning: '#FBBF24',
            danger: '#F87171'
        }[road.status] || '#4ADE80';

        // 兼容 API 返回的 JSON 字符串和 mock 数据的原生数组
        let coords = road.coords;
        if (typeof coords === 'string') {
            try { coords = JSON.parse(coords); } catch (e) { coords = []; }
        }
        if (!coords || !Array.isArray(coords) || coords.length === 0) return;

       
        const polyline = L.polyline(coords, {
            color,
            weight: 3,
            opacity: 0.8,
            dashArray: road.status === 'warning' ? '8, 6' : undefined,
        }).addTo(routeLayer);

        polyline.bindPopup(`
      <div style="font-family:'Segoe UI','PingFang SC',sans-serif;">
        <div style="font-size:13px;font-weight:600;color:#38BDF8;">${road.name}</div>
        <div style="font-size:11px;color:#94A3B8;">ID: ${road.id}</div>
      </div>
    `);
    });
}

/**
 * 添加阻断标记
 */
export function addBlockedMarkers(points) {
    points.forEach(p => {
        L.marker([p.lat, p.lng], { icon: iconMap.blocked })
            .addTo(markersLayer)
            .bindPopup(`
        <div style="font-family:'Segoe UI','PingFang SC',sans-serif;">
          <div style="font-size:13px;font-weight:600;color:#F87171;">❌ ${p.name}</div>
          <div style="font-size:12px;color:#FBBF24;">${p.issue}</div>
        </div>
      `);
    });
}

/**
 * 绘制路径
 */
export function drawRoute(coords, color = '#38BDF8', dashed = false) {
    const polyline = L.polyline(coords, {
        color,
        weight: 4,
        opacity: 0.9,
        dashArray: dashed ? '10, 8' : undefined,
    }).addTo(routeLayer);

    // 起点终点标记
    if (coords.length > 0) {
        L.circleMarker(coords[0], {
            radius: 8,
            color: '#4ADE80',
            fillColor: '#4ADE80',
            fillOpacity: 0.8,
        }).addTo(routeLayer).bindTooltip('起点', { permanent: true, direction: 'top' });
        L.circleMarker(coords[coords.length - 1], {
            radius: 8,
            color: '#F87171',
            fillColor: '#F87171',
            fillOpacity: 0.8,
        }).addTo(routeLayer).bindTooltip('终点', { permanent: true, direction: 'top' });
    }

    return polyline;
}

/**
 * 清空路线
 */
export function clearRoutes() {
    routeLayer.clearLayers();
}

/**
 * 清空标记
 */
export function clearMarkers() {
    markersLayer.clearLayers();
}

/**
 * 清空热力图层
 */
export function clearHeatLayer() {
    heatLayer.clearLayers();
}

/**
 * 添加热力圈
 */
export function addHeatCircle(lat, lng, radius, color, label) {
    const circle = L.circle([lat, lng], {
        radius,
        color: color || 'rgba(248,113,113,0.4)',
        fillColor: color || 'rgba(248,113,113,0.15)',
        fillOpacity: 0.2,
        weight: 2,
    }).addTo(heatLayer);

    if (label) {
        circle.bindTooltip(label, { permanent: true, direction: 'center', className: 'heat-tooltip' });
    }

    return circle;
}

/**
 * 高亮桥梁
 */
export function flashBridge(uuid) {
    // 查找桥梁位置并闪烁定位
    // 由外部实现
}

/**
 * 清除高亮
 */
export function clearHighlight() {
    highlightLayer.clearLayers();
}

/**
 * 高亮事件影响范围
 */
export function highlightEventArea(lat, lng, radius = 3000) {
    clearHighlight();
    L.circle([lat, lng], {
        radius,
        color: 'rgba(251,191,36,0.5)',
        fillColor: 'rgba(251,191,36,0.1)',
        fillOpacity: 0.2,
        weight: 2,
        dashArray: '5, 5',
    }).addTo(highlightLayer);
}

/**
 * 重置地图视图
 */
export function resetView() {
    if (map) {
        map.setView([30.00, 102.68], 11);
    }
}

/**
 * 缩放至适应所有要素
 */
export function fitAllBounds() {
    if (!map) return;
    try {
        var allLayers = [];
        var groups = [markersLayer, routeLayer, heatLayer, highlightLayer];
        groups.forEach(function (g) {
            if (g && g.getLayers().length > 0) {
                allLayers = allLayers.concat(g.getLayers());
            }
        });
        if (allLayers.length === 0) return;
        var group = L.featureGroup(allLayers);
        var bounds = group.getBounds();
        if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
    } catch (e) {
        console.warn('fitAllBounds error, using default view:', e.message);
        map.setView([30.00, 102.68], 11);
    }
}
/**
 * 切换底图
 */
export function switchBaseLayer(layerName) {
    if (!map || !mapStyles[layerName]) return;

    // 移除当前底图
    if (currentBaseLayer) {
        map.removeLayer(currentBaseLayer);
    }

    // 添加新底图
    currentBaseLayer = L.tileLayer(mapStyles[layerName].url, {
        maxZoom: 19,
        subdomains: 'abcd',
        attribution: mapStyles[layerName].attribution
    }).addTo(map);

    showToast(`底图已切换为: ${mapStyles[layerName].name}`, 'info');
}

/**
 * 获取可用的底图样式
 */
export function getAvailableBaseLayers() {
    return Object.keys(mapStyles).map(key => ({
        key: key,
        name: mapStyles[key].name
    }));
}

// ============================================================
// 路网高亮与地图联动
// ============================================================

// 道路高亮图层
let roadHighlightLayer = null;
let roadHighlightedEdgeId = null;

/**
 * 获取道路样式（含业务状态）
 */
export function getRoadStyleWithStatus(feature) {
    var props = feature.properties || {};
    var status = props.status || 'normal';
    var highway = String(props.highway || '');

    // 根据业务状态优先级覆盖样式
    if (status === 'closed') {
        return { color: '#777', weight: 2, opacity: 0.35, dashArray: null };
    }
    if (status === 'interrupted') {
        return { color: '#ff0033', weight: 5, opacity: 0.95, dashArray: null };
    }
    if (status === 'restricted') {
        return { color: '#f1c40f', weight: 4, opacity: 0.9, dashArray: '6, 4' };
    }

    // 默认按道路等级设置样式
    if (highway.includes('motorway_link')) {
        return { color: '#ff8a80', weight: 2.0, opacity: 0.85 };
    }
    if (highway.includes('motorway')) {
        return { color: '#e74c3c', weight: 3.2, opacity: 0.9 };
    }
    if (highway.includes('trunk_link')) {
        return { color: '#f6b26b', weight: 1.8, opacity: 0.8 };
    }
    if (highway.includes('trunk')) {
        return { color: '#f39c12', weight: 2.6, opacity: 0.85 };
    }
    return { color: '#2980b9', weight: 1.5, opacity: 0.7 };
}

/**
 * 高亮某条道路边
 * @param {string} edgeId - 边的唯一标识 (u_v_key)
 */
export function highlightRoadEdge(edgeId) {
    if (!map) return;
    clearRoadHighlight();

    if (!roadHighlightLayer) {
        roadHighlightLayer = L.layerGroup().addTo(map);
    }

    // 遍历路网图层查找匹配的边
    if (chongqingRoadnetLayer) {
        chongqingRoadnetLayer.eachLayer(function(layer) {
            if (layer.feature && layer.feature.properties) {
                var props = layer.feature.properties;
                var id = props.edge_id || (props.u + '_' + props.v + '_' + (props.key || 0));
                if (id === edgeId) {
                    // 复制几何并高亮
                    var coords = layer.getLatLngs();
                    if (coords && coords.length > 0) {
                        var highlightLine = L.polyline(coords, {
                            color: '#00e5ff',
                            weight: 6,
                            opacity: 1.0,
                            dashArray: '8, 4',
                        }).addTo(roadHighlightLayer);

                        // 自动缩放
                        map.fitBounds(highlightLine.getBounds(), { padding: [50, 50], maxZoom: 15 });

                        // 打开弹窗
                        if (layer.getPopup) {
                            var popup = layer.getPopup();
                            if (popup) {
                                highlightLine.bindPopup(popup.getContent());
                                highlightLine.openPopup();
                            }
                        }
                    }
                    roadHighlightedEdgeId = edgeId;
                }
            }
        });
    }
}

// 全局暴露，供后台管理模块使用
window.__highlightRoadEdge = highlightRoadEdge;
window.__flyToRoadEdge = flyToRoadEdge;
window.__refreshRoadnetLayer = refreshRoadnetLayer;
window.__updateRoadnetFeatureProperties = updateRoadnetFeatureProperties;

/**
 * 清除道路高亮
 */
export function clearRoadHighlight() {
    if (roadHighlightLayer) {
        roadHighlightLayer.clearLayers();
    }
    roadHighlightedEdgeId = null;
}

/**
 * 飞行到某条道路边
 * @param {string} edgeId - 边的唯一标识
 */
export function flyToRoadEdge(edgeId) {
    if (!map || !chongqingRoadnetLayer) return;

    chongqingRoadnetLayer.eachLayer(function(layer) {
        if (layer.feature && layer.feature.properties) {
            var props = layer.feature.properties;
            var id = props.edge_id || (props.u + '_' + props.v + '_' + (props.key || 0));
            if (id === edgeId) {
                var bounds = layer.getBounds();
                if (bounds && bounds.isValid()) {
                    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
                }
                // 打开弹窗
                if (layer.getPopup) {
                    layer.openPopup();
                }
            }
        }
    });
}

/**
 * 刷新路网图层（重新加载样式）
 */
export function refreshRoadnetLayer() {
    if (!map || !chongqingRoadnetLayer) return;
    chongqingRoadnetLayer.eachLayer(function(layer) {
        if (layer.feature && layer.feature.properties) {
            layer.setStyle(getRoadStyleWithStatus(layer.feature));
        }
    });
}

/**
 * 更新路网中某条边的业务属性
 * @param {string} edgeId - 边的唯一标识
 * @param {object} properties - 要更新的属性
 */
export function updateRoadnetFeatureProperties(edgeId, properties) {
    if (!chongqingRoadnetLayer) return;

    chongqingRoadnetLayer.eachLayer(function(layer) {
        if (layer.feature && layer.feature.properties) {
            var props = layer.feature.properties;
            var id = props.edge_id || (props.u + '_' + props.v + '_' + (props.key || 0));
            if (id === edgeId) {
                Object.assign(props, properties);
                layer.setStyle(getRoadStyleWithStatus(layer.feature));
                // 更新弹窗
                if (layer.getPopup()) {
                    var popup = layer.getPopup();
                    if (popup) {
                        layer.unbindPopup();
                        layer.bindPopup(formatRoadPopup(props));
                    }
                }
            }
        }
    });
}

// ============================================================
// 重车评估 - 地图工具函数
// ============================================================

// 重车评估图层管理
var hvFacilityLayer = null;
var hvAssessmentLayer = null;
var hvHighlightLayer = null;

function ensureHVLayers() {
    if (!map) return;
    if (!hvFacilityLayer) {
        hvFacilityLayer = L.layerGroup().addTo(map);
    }
    if (!hvAssessmentLayer) {
        hvAssessmentLayer = L.layerGroup().addTo(map);
    }
    if (!hvHighlightLayer) {
        hvHighlightLayer = L.layerGroup().addTo(map);
    }
}

/**
 * 确保路网图层可见
 */
export function ensureRoadnetLayerVisible() {
    if (!map) return;
    if (chongqingRoadnetLayer && !map.hasLayer(chongqingRoadnetLayer)) {
        chongqingRoadnetLayer.addTo(map);
    }
}

/**
 * 添加重车评估设施标记
 */
export function addHVFacilityMarker(facility, onClick) {
    ensureHVLayers();
    if (!facility || !facility.longitude || !facility.latitude) return null;

    var type = facility.facilityType || 'bridge';
    var iconHtml = type === 'bridge'
        ? '<div style="width:16px;height:16px;border-radius:2px;background:#38BDF8;border:2px solid rgba(56,189,248,0.6);box-shadow:0 0 8px rgba(56,189,248,0.4);display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;">桥</div>'
        : '<div style="width:16px;height:16px;border-radius:50%;background:#A78BFA;border:2px solid rgba(167,139,250,0.6);box-shadow:0 0 8px rgba(167,139,250,0.4);display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;">隧</div>';

    var icon = L.divIcon({
        className: 'hv-marker',
        html: iconHtml,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
    });

    var marker = L.marker([facility.latitude, facility.longitude], { icon: icon });
    marker.facilityId = facility.facilityId;
    marker.bindPopup(formatHVFacilityPopup(facility));

    if (onClick) {
        marker.on('click', onClick);
    }

    hvFacilityLayer.addLayer(marker);
    return marker;
}

function formatHVFacilityPopup(facility) {
    var typeLabel = facility.facilityType === 'bridge' ? '桥梁' : '隧道';
    var statusLabel = facility.assessmentStatus || '待评估';
    var statusColor = statusLabel === 'pass' ? '#4ADE80' : statusLabel === 'restricted' ? '#FBBF24' : statusLabel === 'forbidden' ? '#F87171' : '#94A3B8';
    var statusText = statusLabel === 'pass' ? '可通行' : statusLabel === 'restricted' ? '限制通行' : statusLabel === 'forbidden' ? '不可通行' : '待评估';

    return '<div class="hv-popup">' +
        '<div class="hv-popup-title">' + (facility.name || '未命名') + '</div>' +
        '<div>类型：' + typeLabel + '</div>' +
        '<div>道路编号：' + (facility.roadRef || '-') + '</div>' +
        '<div>所属区县：' + (facility.districtName || '-') + '</div>' +
        '<div>长度：' + (facility.lengthM ? facility.lengthM.toFixed(1) + ' m' : '-') + '</div>' +
        '<div>限重：' + (facility.limitWeightT ? facility.limitWeightT + ' t' : '-') + '</div>' +
        '<div>限高：' + (facility.limitHeightM ? facility.limitHeightM + ' m' : '-') + '</div>' +
        '<div>限宽：' + (facility.limitWidthM ? facility.limitWidthM + ' m' : '-') + '</div>' +
        '<div style="margin-top:4px;color:' + statusColor + ';font-weight:600;">通行状态：' + statusText + '</div>' +
        (facility.reason ? '<div style="color:#F87171;font-size:11px;margin-top:2px;">原因：' + facility.reason + '</div>' : '') +
        '</div>';
}

/**
 * 清除重车评估设施标记
 */
export function clearHVFacilityMarkers() {
    if (hvFacilityLayer) {
        hvFacilityLayer.clearLayers();
    }
}

/**
 * 更新设施标记状态（评估后变色）
 */
export function updateHVFacilityMarkerStatus(facilityId, status) {
    if (!hvFacilityLayer) return;
    hvFacilityLayer.eachLayer(function(layer) {
        if (layer.facilityId === facilityId) {
            var color = status === 'pass' ? '#4ADE80' : status === 'restricted' ? '#FBBF24' : status === 'forbidden' ? '#F87171' : '#94A3B8';
            layer.setIcon(L.divIcon({
                className: 'hv-marker',
                html: '<div style="width:16px;height:16px;border-radius:50%;background:' + color + ';border:2px solid ' + color.replace(')', ',0.5)').replace('rgb', 'rgba') + ';box-shadow:0 0 12px ' + color + ';display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff;">' + (status === 'pass' ? '✓' : status === 'forbidden' ? '✗' : '!') + '</div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
            }));
        }
    });
}

/**
 * 添加评估结果高亮（路段着色）
 */
export function addHVAssessmentHighlights(results) {
    ensureHVLayers();
    hvAssessmentLayer.clearLayers();

    if (!results || !results.length) return;

    results.forEach(function(r) {
        var color = r.assessmentStatus === 'pass' ? '#4ADE80' : r.assessmentStatus === 'restricted' ? '#FBBF24' : r.assessmentStatus === 'forbidden' ? '#F87171' : '#94A3B8';
        var circle = L.circleMarker([r.latitude, r.longitude], {
            radius: 14,
            color: color,
            fillColor: color,
            fillOpacity: 0.25,
            weight: 2,
            opacity: 0.6
        });
        circle.bindPopup(formatHVFacilityPopup(r));
        hvAssessmentLayer.addLayer(circle);
    });
}

/**
 * 清除评估结果高亮
 */
export function clearHVAssessmentHighlights() {
    if (hvAssessmentLayer) {
        hvAssessmentLayer.clearLayers();
    }
}

/**
 * 飞行到指定设施
 */
export function flyToHVFacility(facilityId) {
    if (!hvFacilityLayer) return;
    hvFacilityLayer.eachLayer(function(layer) {
        if (layer.facilityId === facilityId) {
            var latlng = layer.getLatLng();
            map.flyTo(latlng, 14, { duration: 1 });
            layer.openPopup();
            // 高亮闪烁
            layer.setIcon(L.divIcon({
                className: 'hv-marker',
                html: '<div style="width:20px;height:20px;border-radius:50%;background:#FBBF24;border:2px solid rgba(251,191,36,0.8);box-shadow:0 0 20px rgba(251,191,36,0.8);animation:glow-pulse 1s ease-in-out infinite;"></div>',
                iconSize: [20, 20],
                iconAnchor: [10, 10]
            }));
            setTimeout(function() {
                updateHVFacilityMarkerStatus(facilityId, layer._status || 'unknown');
            }, 2000);
        }
    });
}

/**
 * 自适应缩放至所有设施
 */
export function fitHVFacilities(facilities) {
    if (!map || !facilities || !facilities.length) return;
    var bounds = [];
    facilities.forEach(function(f) {
        if (f.longitude && f.latitude) {
            bounds.push([f.latitude, f.longitude]);
        }
    });
    if (bounds.length > 0) {
        map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });
    }
}

/**
 * 清除所有重车评估图层
 */
export function clearHVLayers() {
    if (hvFacilityLayer) { hvFacilityLayer.clearLayers(); }
    if (hvAssessmentLayer) { hvAssessmentLayer.clearLayers(); }
    if (hvHighlightLayer) { hvHighlightLayer.clearLayers(); }
}

/**
 * 绑定道路点击添加评估事件
 */
export function bindAddToHvAssessmentAction(layer) {
    if (!layer) return;
    layer.on('dblclick', function(e) {
        var feature = e.target.feature;
        if (!feature) return;
        var props = feature.properties || {};
        var isBridge = props.bridge === 'yes';
        var isTunnel = props.tunnel === 'yes';
        if (!isBridge && !isTunnel) return;

        var type = isBridge ? 'bridge' : 'tunnel';
        var coords = e.latlng || (feature.geometry && feature.geometry.type === 'LineString' ? getLineCenter(feature.geometry.coordinates) : null);

        // 触发自定义事件，让 HeavyVehicleModule 处理
        var event = new CustomEvent('hv-add-facility', {
            detail: {
                source: 'map_click',
                sourceEdgeId: props.edge_id || (props.u + '_' + props.v + '_' + (props.key || 0)),
                facilityType: type,
                name: props.name || props.ref || '未命名道路段',
                roadName: props.name || '',
                roadRef: props.ref || '',
                districtName: props.district_name || '',
                longitude: coords ? coords.lng : (props.longitude || 0),
                latitude: coords ? coords.lat : (props.latitude || 0),
                lengthM: props.length || 0,
                maxspeed: props.maxspeed || null,
                lanes: props.lanes || null,
                bridge: props.bridge || null,
                tunnel: props.tunnel || null
            }
        });
        window.dispatchEvent(event);
        showToast('✅ 已添加「' + (props.name || props.ref || '未命名') + '」到评估清单', 'success');
    });
}

function getLineCenter(coords) {
    if (!coords || coords.length === 0) return null;
    var mid = Math.floor(coords.length / 2);
    return { lng: coords[mid][0], lat: coords[mid][1] };
}

// ============================================================
// 泥石流灾害韧性评估 - 地图工具函数
// ============================================================

var debrisRiskLayer = null;
var debrisImpactLayer = null;
var debrisRoadDamageLayer = null;

function ensureDebrisLayers() {
    if (!map) return;
    if (!debrisRiskLayer) debrisRiskLayer = L.layerGroup().addTo(map);
    if (!debrisImpactLayer) debrisImpactLayer = L.layerGroup().addTo(map);
    if (!debrisRoadDamageLayer) debrisRoadDamageLayer = L.layerGroup().addTo(map);
}

/**
 * 清空所有泥石流灾害图层
 */
export function clearAllDebrisLayers() {
    if (debrisRiskLayer) debrisRiskLayer.clearLayers();
    if (debrisImpactLayer) debrisImpactLayer.clearLayers();
    if (debrisRoadDamageLayer) debrisRoadDamageLayer.clearLayers();
}

/**
 * 添加泥石流风险分区图层
 * @param {object} hazardResult - 泥石流危险性计算结果
 */
export function addDebrisRiskLayer(hazardResult) {
    ensureDebrisLayers();
    if (!debrisRiskLayer) return;

    // 模拟风险分区 - 在重庆周边随机生成多边形
    var centers = [
        { lat: 29.20, lng: 106.20, level: 'high', label: '高风险区' },
        { lat: 29.60, lng: 106.50, level: 'medium', label: '中风险区' },
        { lat: 29.80, lng: 106.80, level: 'low', label: '低风险区' },
        { lat: 30.00, lng: 106.30, level: 'extreme', label: '极高风险区' },
    ];

    var levelColors = {
        low: { color: '#4ADE80', fill: 'rgba(74, 222, 128, 0.1)' },
        medium: { color: '#FBBF24', fill: 'rgba(251, 191, 36, 0.1)' },
        high: { color: '#F87171', fill: 'rgba(248, 113, 113, 0.15)' },
        extreme: { color: '#DC2626', fill: 'rgba(220, 38, 38, 0.2)' },
    };

    centers.forEach(function(c) {
        var radius = c.level === 'low' ? 15000 : c.level === 'medium' ? 10000 : c.level === 'high' ? 8000 : 5000;
        var colors = levelColors[c.level] || levelColors.medium;

        var circle = L.circle([c.lat, c.lng], {
            radius: radius,
            color: colors.color,
            fillColor: colors.fill,
            fillOpacity: 0.25,
            weight: 2,
            opacity: 0.7,
            dashArray: '6, 4',
        });

        circle.bindTooltip(c.label, { permanent: true, direction: 'center', className: 'debris-tooltip' });
        circle.bindPopup(
            '<div class="debris-popup">' +
            '<div class="debris-popup-title">' + c.label + '</div>' +
            '<div>泥石流发生概率: ' + ((hazardResult?.occurrenceProbability || 0.5) * 100).toFixed(1) + '%</div>' +
            '<div>桥梁破坏概率: ' + ((hazardResult?.bridgeFailureProbability || 0.4) * 100).toFixed(1) + '%</div>' +
            '</div>'
        );

        debrisRiskLayer.addLayer(circle);
    });

    // 如果有桥位风险点，添加高亮
    if (hazardResult?.atRiskBridges) {
        var bridgePositions = [
            { lat: 29.35, lng: 106.35, name: '桥梁 #1' },
            { lat: 29.55, lng: 106.65, name: '桥梁 #2' },
            { lat: 29.70, lng: 106.40, name: '桥梁 #3' },
        ];
        bridgePositions.forEach(function(b) {
            var marker = L.circleMarker([b.lat, b.lng], {
                radius: 12,
                color: '#F87171',
                fillColor: '#F87171',
                fillOpacity: 0.5,
                weight: 3,
                pulsating: true,
            });
            marker.bindPopup('<div style="font-weight:600;color:#F87171;">⚠ ' + b.name + '</div><div>高损毁风险</div>');
            debrisRiskLayer.addLayer(marker);
        });
    }
}

/**
 * 添加泥石流影响范围模拟图层
 */
export function addDebrisImpactLayer(impactData) {
    ensureDebrisLayers();
    if (!debrisImpactLayer) return;

    // 模拟泥石流运动影响范围
    var simulatedAreas = [
        { lat: 29.40, lng: 106.30, radius: 2000, depth: 2.5 },
        { lat: 29.50, lng: 106.45, radius: 1500, depth: 1.8 },
        { lat: 29.65, lng: 106.60, radius: 3000, depth: 3.2 },
    ];

    simulatedAreas.forEach(function(a) {
        var circle = L.circle([a.lat, a.lng], {
            radius: a.radius,
            color: 'rgba(248, 113, 113, 0.6)',
            fillColor: 'rgba(248, 113, 113, 0.2)',
            fillOpacity: 0.3,
            weight: 2,
        });
        circle.bindTooltip('堆积深度: ' + a.depth + 'm', { direction: 'center' });
        debrisImpactLayer.addLayer(circle);
    });
}

/**
 * 添加路网受损分区图层
 */
export function addRoadDamageLayer(resilienceResult) {
    ensureDebrisLayers();
    if (!debrisRoadDamageLayer) return;

    // 模拟受损路段着色
    var damageSegments = [
        { lat1: 29.30, lng1: 106.25, lat2: 29.35, lng2: 106.30, status: 'interrupted', label: '中断' },
        { lat1: 29.45, lng1: 106.40, lat2: 29.50, lng2: 106.35, status: 'restricted', label: '限制通行' },
        { lat1: 29.55, lng1: 106.55, lat2: 29.60, lng2: 106.60, status: 'interrupted', label: '中断' },
        { lat1: 29.70, lng1: 106.45, lat2: 29.75, lng2: 106.50, status: 'restricted', label: '限制通行' },
    ];

    var statusStyles = {
        interrupted: { color: '#F87171', weight: 5, opacity: 0.95, dashArray: '8, 4' },
        restricted: { color: '#FBBF24', weight: 4, opacity: 0.85, dashArray: '6, 3' },
        normal: { color: '#4ADE80', weight: 3, opacity: 0.7 },
    };

    damageSegments.forEach(function(seg) {
        var style = statusStyles[seg.status] || statusStyles.normal;
        var line = L.polyline([
            [seg.lat1, seg.lng1],
            [seg.lat2, seg.lng2]
        ], style);

        line.bindTooltip(seg.label, { permanent: true, direction: 'top' });
        debrisRoadDamageLayer.addLayer(line);
    });

    // 模拟应急盲区
    var blindZones = [
        { lat: 29.25, lng: 106.15, radius: 8000 },
        { lat: 29.75, lng: 106.70, radius: 6000 },
    ];

    blindZones.forEach(function(zone) {
        var circle = L.circle([zone.lat, zone.lng], {
            radius: zone.radius,
            color: 'rgba(220, 38, 38, 0.4)',
            fillColor: 'rgba(220, 38, 38, 0.1)',
            fillOpacity: 0.2,
            weight: 1,
            dashArray: '4, 4',
        });
        circle.bindTooltip('应急盲区', { permanent: true, direction: 'center' });
        debrisRoadDamageLayer.addLayer(circle);
    });
}

/**
 * 飞行到泥石流相关要素
 */
export function flyToDebrisFeature(featureName) {
    if (!map) return;
    // 根据特征名称定位
    var targets = {
        '流域': [29.50, 106.45],
        '桥梁': [29.55, 106.55],
    };

    var target = targets[featureName?.charAt(0) === '流' ? '流域' : '桥梁'] || [29.56, 106.55];
    map.flyTo(target, 13, { duration: 1.2 });
}

/**
 * 自适应缩放至所有灾害图层
 */
export function fitDebrisBounds() {
    if (!map) return;
    var allLayers = [];
    [debrisRiskLayer, debrisImpactLayer, debrisRoadDamageLayer].forEach(function(layer) {
        if (layer && layer.getLayers().length > 0) {
            allLayers = allLayers.concat(layer.getLayers());
        }
    });
    if (allLayers.length === 0) return;
    var group = L.featureGroup(allLayers);
    var bounds = group.getBounds();
    if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [40, 40] });
    }
}