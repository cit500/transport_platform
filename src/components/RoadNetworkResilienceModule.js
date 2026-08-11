/**
 * 🛣️ 路网韧性评估模块
 *
 * 布局：页面内路由切换，替换原有大屏内容
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 顶部标题栏：路网韧性评估 + 返回首页/保存/导出                  │
 * ├──────────────┬──────────────────────────────┬────────────────┤
 * │ 左侧面板      │      中间 Bigemap GIS 地图    │  右侧面板      │
 * │ (2个卡片)     │      (支持图层切换)           │  (2个卡片)     │
 * │ 1.单道路韧性  │                              │  1.路网韧性    │
 * │ 2.评估结果    │                              │  2.算法设置    │
 * └──────────────┴──────────────────────────────┴────────────────┘
 *
 * 功能：单道路韧性评估、路网韧性评估、冗余度计算
 */

import api from '../api/index.js';
import {
  getMap, toggleBaseMap, addHVFacilityMarker, clearHVFacilityMarkers,
  updateHVFacilityMarkerStatus, clearHVAssessmentHighlights,
  addHVAssessmentHighlights, flyToHVFacility, fitHVFacilities,
  clearHVLayers, clearRoutes, clearMarkers, addAllBridgeMarkers
} from '../utils/mapUtils.js';

// ============================================================
// 状态管理
// ============================================================

var isActive = false;
var resilienceState = {
  // 单道路评估
  selectedRoad: null,
  roadProperties: {
    roadId: '',
    roadName: '',
    roadType: 'highway',
    length: 0,
    lanes: 2,
    designSpeed: 60,
    condition: 'good'
  },
  disasterParams: {
    disasterType: 'earthquake',
    intensity: 6.0,
    duration: 30,
    startTime: '',
    affectedRadius: 5
  },
  singleRoadResult: null,
  // 路网评估
  networkMode: 'area', // 'area' | 'polygon'
  selectedArea: '',
  polygonPoints: [],
  networkRoads: [],
  networkResult: null,
  redundancyValue: null,
  // 任务状态
  taskStatus: 'idle',
  // 地图拾取模式
  mapPickMode: false,
  mapPolygonMode: false
};

// 保存原始DOM结构
var originalAppContent = null;
var originalTitle = null;

// ============================================================
// 导出接口
// ============================================================

export function isRoadNetworkResilienceActive() {
  return isActive;
}

export function openRoadNetworkResilienceModule() {
  if (isActive) return;
  isActive = true;

  document.body.classList.add('resilience-assessment-active');

  var app = document.getElementById('app');
  if (app) {
    originalAppContent = app.innerHTML;
  }
  originalTitle = document.title;
  document.title = '路网韧性评估 - 交通网络安全韧性评估及可视化决策平台';

  resilienceState.selectedRoad = null;
  resilienceState.singleRoadResult = null;
  resilienceState.networkRoads = [];
  resilienceState.networkResult = null;
  resilienceState.redundancyValue = null;
  resilienceState.taskStatus = 'idle';
  resilienceState.mapPickMode = false;
  resilienceState.mapPolygonMode = false;
  resilienceState.polygonPoints = [];

  buildResilienceLayout();
  bindResilienceEvents();

  setTimeout(function() {
    initResilienceMap();
    showHomePageLayerControl();
    renderLeftPanel();
    renderRightPanel();
  }, 100);

  showToast('🛣️ 已进入路网韧性评估任务', 'info');
}

export function closeRoadNetworkResilienceModule() {
  if (!isActive) return;
  isActive = false;

  document.body.classList.remove('resilience-assessment-active');

  var layerDrawer = document.getElementById('layer-drawer');
  if (layerDrawer) {
    layerDrawer.classList.remove('open');
  }

  if (resilienceMap) {
    try {
      resilienceMap.remove();
    } catch(e) {}
    resilienceMap = null;
  }

  var app = document.getElementById('app');
  if (app && originalAppContent) {
    app.innerHTML = originalAppContent;
  }
  if (originalTitle) {
    document.title = originalTitle;
  }
  originalAppContent = null;

  setTimeout(function() {
    window.location.reload();
  }, 100);

  showToast('已返回首页', 'info');
}

// ============================================================
// 构建布局
// ============================================================

function buildResilienceLayout() {
  var app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = ''
    + '<header id="hv-assess-header">'
    + '  <div class="hv-assess-header-left">'
    + '    <button class="hv-assess-back-btn" id="resilience-btn-back">← 返回首页</button>'
    + '    <span class="hv-assess-header-title">🛣️ 路网韧性评估</span>'
    + '    <span class="hv-assess-status-badge" id="resilience-status-badge">未开始</span>'
    + '  </div>'
    + '  <div class="hv-assess-header-right">'
    + '    <button class="hv-assess-header-btn" id="resilience-btn-save">💾 保存任务</button>'
    + '    <button class="hv-assess-header-btn" id="resilience-btn-export">📄 导出报告</button>'
    + '  </div>'
    + '</header>'
    + '<div id="hv-assess-body">'
    + '  <div id="hv-assess-left-panel">'
    + '    <div class="hv-assess-card" id="resilience-card-single">'
    + '      <div class="hv-assess-card-header">'
    + '        <span>🛤️ 单道路韧性评估</span>'
    + '      </div>'
    + '      <div class="hv-assess-card-body" id="resilience-single-body"></div>'
    + '    </div>'
    + '    <div class="hv-assess-card" id="resilience-card-result">'
    + '      <div class="hv-assess-card-header">'
    + '        <span>📊 评估结果</span>'
    + '      </div>'
    + '      <div class="hv-assess-card-body" id="resilience-result-body"></div>'
    + '    </div>'
    + '  </div>'
    + '  <div id="hv-assess-map-container">'
    + '    <div id="map"></div>'
    + '    <div id="resilience-map-pick-hint" style="display:none;">🖱️ 请在地图上点击选择道路</div>'
    + '    <div id="resilience-map-polygon-hint" style="display:none;">🖱️ 请在地图上点击绘制区域（双击完成）</div>'
    + '    <div id="hv-assess-map-controls">'
    + '      <button class="hv-map-ctrl-btn" id="resilience-btn-zoom-in" title="放大">＋</button>'
    + '      <button class="hv-map-ctrl-btn" id="resilience-btn-zoom-out" title="缩小">−</button>'
    + '      <div class="hv-map-ctrl-divider"></div>'
    + '      <button class="hv-map-ctrl-btn" id="resilience-btn-layer-control" title="图层控制中枢">🗺️</button>'
    + '    </div>'
    + '  </div>'
    + '  <div id="hv-assess-right-panel">'
    + '    <div class="hv-assess-card" id="resilience-card-network">'
    + '      <div class="hv-assess-card-header">'
    + '        <span>🌐 路网韧性评估</span>'
    + '      </div>'
    + '      <div class="hv-assess-card-body" id="resilience-network-body"></div>'
    + '    </div>'
    + '    <div class="hv-assess-card" id="resilience-card-algorithm">'
    + '      <div class="hv-assess-card-header">'
    + '        <span>⚙️ 韧性评估算法</span>'
    + '      </div>'
    + '      <div class="hv-assess-card-body" id="resilience-algorithm-body"></div>'
    + '    </div>'
    + '  </div>'
    + '</div>';
}

// ============================================================
// 事件绑定
// ============================================================

function bindResilienceEvents() {
  document.getElementById('resilience-btn-back')?.addEventListener('click', closeRoadNetworkResilienceModule);
  document.getElementById('resilience-btn-save')?.addEventListener('click', saveResilienceTask);
  document.getElementById('resilience-btn-export')?.addEventListener('click', exportResilienceReport);

  document.getElementById('resilience-btn-zoom-in')?.addEventListener('click', function() {
    if (resilienceMap) resilienceMap.zoomIn();
  });

  document.getElementById('resilience-btn-zoom-out')?.addEventListener('click', function() {
    if (resilienceMap) resilienceMap.zoomOut();
  });

  var layerBtn = document.getElementById('resilience-btn-layer-control');
  var drawer = document.getElementById('layer-drawer');

  if (layerBtn && drawer) {
    layerBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var isOpen = drawer.classList.contains('open');
      if (isOpen) {
        drawer.classList.remove('open');
        layerBtn.classList.remove('active');
      } else {
        drawer.classList.add('open');
        layerBtn.classList.add('active');
      }
    });

    document.addEventListener('click', function(e) {
      if (drawer.classList.contains('open') && !drawer.contains(e.target) && e.target !== layerBtn) {
        drawer.classList.remove('open');
        layerBtn.classList.remove('active');
      }
    });
  }
}

// ============================================================
// 地图初始化
// ============================================================

var resilienceMap = null;
var resilienceBaseLayer = null;

var BIGEMAP_SERVER_URL = 'http://127.0.0.1:9000';
var BIGEMAP_ACCESS_TOKEN = 'pk.eyJ1IjoiY3VzXzB2eTFlYXA5IiwiYSI6ImVnNWdxbGtkbjNhY24wbGFybmZlY25qbGkifQ.ZAg23qtH2mD4eClfKElqaQ';
var BIGEMAP_LAYER_IDS = {
  electronic: 'bigemap.7i2bexkr',
  satellite: 'bigemap.5grpf9us'
};

function initResilienceMap() {
  var mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  var existingMap = getMap();
  if (existingMap) {
    try {
      existingMap.remove();
    } catch(e) {}
  }

  resilienceMap = L.map('map', {
    center: [30.18, 107.74],
    zoom: 12,
    zoomControl: false,
    attributionControl: false,
    fadeAnimation: true,
    zoomAnimation: true
  });

  var satelliteUrl = BIGEMAP_SERVER_URL + '/' + BIGEMAP_LAYER_IDS.satellite + '/tiles/{z}/{x}/{y}.png?access_token=' + BIGEMAP_ACCESS_TOKEN;
  resilienceBaseLayer = L.tileLayer(satelliteUrl, {
    maxZoom: 12,
    minZoom: 6,
    attribution: '',
    subdomains: []
  }).addTo(resilienceMap);

  resilienceMap.on('click', handleResilienceMapClick);

  requestAnimationFrame(function() {
    resilienceMap.invalidateSize();
    setTimeout(function() {
      resilienceMap.invalidateSize();
    }, 300);
  });
}

function showHomePageLayerControl() {
  var layerDrawer = document.getElementById('layer-drawer');
  if (layerDrawer) {
    layerDrawer.classList.add('open');
  }
}

function handleResilienceMapClick(e) {
  if (resilienceState.mapPolygonMode) {
    resilienceState.polygonPoints.push([e.latlng.lat, e.latlng.lng]);
    drawPolygonPreview();
    return;
  }

  if (!resilienceState.mapPickMode) return;

  resilienceState.mapPickMode = false;
  document.getElementById('resilience-map-pick-hint').style.display = 'none';
  document.body.style.cursor = '';

  var lat = e.latlng.lat;
  var lng = e.latlng.lng;

  var mockRoad = {
    roadId: 'R' + Math.floor(Math.random() * 1000),
    roadName: '模拟道路' + Math.floor(Math.random() * 100),
    roadType: 'highway',
    length: (Math.random() * 20 + 5).toFixed(1),
    lanes: Math.floor(Math.random() * 4 + 2),
    designSpeed: Math.floor(Math.random() * 40 + 60),
    condition: ['good', 'fair', 'poor'][Math.floor(Math.random() * 3)],
    latitude: lat,
    longitude: lng
  };

  resilienceState.selectedRoad = mockRoad;
  resilienceState.roadProperties = {
    roadId: mockRoad.roadId,
    roadName: mockRoad.roadName,
    roadType: mockRoad.roadType,
    length: mockRoad.length,
    lanes: mockRoad.lanes,
    designSpeed: mockRoad.designSpeed,
    condition: mockRoad.condition
  };

  renderLeftPanel();
  showToast('✅ 已选择道路: ' + mockRoad.roadName, 'success');
  addRoadMarker(lat, lng);
}

var roadMarker = null;

function addRoadMarker(lat, lng) {
  if (!resilienceMap) return;

  if (roadMarker) {
    try {
      resilienceMap.removeLayer(roadMarker);
    } catch(e) {}
  }

  roadMarker = L.circleMarker([lat, lng], {
    radius: 10,
    fillColor: '#38BDF8',
    color: '#38BDF8',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.6
  }).addTo(resilienceMap);

  roadMarker.bindPopup(''
    + '<div style="font-size:12px;">'
    + '  <div style="font-weight:600;margin-bottom:4px;">🛤️ 道路位置</div>'
    + '  <div>纬度: ' + lat.toFixed(4) + '</div>'
    + '  <div>经度: ' + lng.toFixed(4) + '</div>'
    + '</div>'
  );
}

var polygonPreviewLayer = null;

function drawPolygonPreview() {
  if (!resilienceMap || resilienceState.polygonPoints.length < 2) return;

  if (polygonPreviewLayer) {
    try {
      resilienceMap.removeLayer(polygonPreviewLayer);
    } catch(e) {}
  }

  polygonPreviewLayer = L.polygon(resilienceState.polygonPoints, {
    color: '#38BDF8',
    weight: 2,
    fillColor: '#38BDF8',
    fillOpacity: 0.2
  }).addTo(resilienceMap);
}

// ============================================================
// 左侧面板渲染
// ============================================================

function renderLeftPanel() {
  renderSingleRoadCard();
  renderResultCard();
}

function renderSingleRoadCard() {
  var body = document.getElementById('resilience-single-body');
  if (!body) return;

  var road = resilienceState.selectedRoad;

  var html = ''
    + '<div class="hv-assess-form-group">'
    + '  <label class="hv-assess-label">道路选择</label>'
    + '  <div style="display:flex;gap:4px;">'
    + '    <input class="hv-assess-input" id="resilience-road-search" value="' + (road ? road.roadName : '') + '" placeholder="道路编号/名称搜索" />'
    + '    <button class="hv-assess-btn-sm" id="resilience-road-search-btn">搜索</button>'
    + '  </div>'
    + '  <button class="hv-assess-btn-sm" id="resilience-road-map-pick" style="margin-top:4px;width:100%;">🗺️ 从地图中选择</button>'
    + '</div>';

  if (road) {
    html += ''
      + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:8px;">'
      + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">📋 道路属性</div>'
      + '  <div class="hv-assess-form-row">'
      + '    <div class="hv-assess-form-group" style="flex:1;">'
      + '      <label class="hv-assess-label">道路编号</label>'
      + '      <input class="hv-assess-input" id="res-road-id" value="' + road.roadId + '" />'
      + '    </div>'
      + '    <div class="hv-assess-form-group" style="flex:1;">'
      + '      <label class="hv-assess-label">道路名称</label>'
      + '      <input class="hv-assess-input" id="res-road-name" value="' + road.roadName + '" />'
      + '    </div>'
      + '  </div>'
      + '  <div class="hv-assess-form-row">'
      + '    <div class="hv-assess-form-group" style="flex:1;">'
      + '      <label class="hv-assess-label">道路类型</label>'
      + '      <select class="hv-assess-select" id="res-road-type">'
      + '        <option value="highway"' + (road.roadType === 'highway' ? ' selected' : '') + '>高速公路</option>'
      + '        <option value="expressway"' + (road.roadType === 'expressway' ? ' selected' : '') + '>快速路</option>'
      + '        <option value="arterial"' + (road.roadType === 'arterial' ? ' selected' : '') + '>主干道</option>'
      + '        <option value="secondary"' + (road.roadType === 'secondary' ? ' selected' : '') + '>次干道</option>'
      + '      </select>'
      + '    </div>'
      + '    <div class="hv-assess-form-group" style="flex:1;">'
      + '      <label class="hv-assess-label">长度 (km)</label>'
      + '      <input class="hv-assess-input" id="res-road-length" type="number" value="' + road.length + '" step="0.1" />'
      + '    </div>'
      + '  </div>'
      + '  <div class="hv-assess-form-row">'
      + '    <div class="hv-assess-form-group" style="flex:1;">'
      + '      <label class="hv-assess-label">车道数</label>'
      + '      <input class="hv-assess-input" id="res-road-lanes" type="number" value="' + road.lanes + '" />'
      + '    </div>'
      + '    <div class="hv-assess-form-group" style="flex:1;">'
      + '      <label class="hv-assess-label">设计速度 (km/h)</label>'
      + '      <input class="hv-assess-input" id="res-road-speed" type="number" value="' + road.designSpeed + '" />'
      + '    </div>'
      + '  </div>'
      + '  <div class="hv-assess-form-row">'
      + '    <div class="hv-assess-form-group" style="flex:1;">'
      + '      <label class="hv-assess-label">路况</label>'
      + '      <select class="hv-assess-select" id="res-road-condition">'
      + '        <option value="good"' + (road.condition === 'good' ? ' selected' : '') + '>良好</option>'
      + '        <option value="fair"' + (road.condition === 'fair' ? ' selected' : '') + '>一般</option>'
      + '        <option value="poor"' + (road.condition === 'poor' ? ' selected' : '') + '>较差</option>'
      + '      </select>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  }

  html += ''
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">🌋 灾害参数</div>'
    + '  <div class="hv-assess-form-row">'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">灾害类型</label>'
    + '      <select class="hv-assess-select" id="res-disaster-type">'
    + '        <option value="earthquake">地震</option>'
    + '        <option value="flood">洪水</option>'
    + '        <option value="landslide">滑坡</option>'
    + '        <option value="debris_flow">泥石流</option>'
    + '      </select>'
    + '    </div>'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">灾害强度</label>'
    + '      <input class="hv-assess-input" id="res-disaster-intensity" type="number" value="6.0" step="0.1" />'
    + '    </div>'
    + '  </div>'
    + '  <div class="hv-assess-form-row">'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">持续时间 (s)</label>'
    + '      <input class="hv-assess-input" id="res-disaster-duration" type="number" value="30" />'
    + '    </div>'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">影响半径 (km)</label>'
    + '      <input class="hv-assess-input" id="res-disaster-radius" type="number" value="5" />'
    + '    </div>'
    + '  </div>'
    + '</div>'
    + '<div style="margin-top:12px;">'
    + '  <button class="hv-assess-btn-primary" id="resilience-calculate-btn" style="width:100%;">🚀 韧性评估计算</button>'
    + '</div>';

  body.innerHTML = html;

  document.getElementById('resilience-road-map-pick')?.addEventListener('click', function() {
    resilienceState.mapPickMode = true;
    document.getElementById('resilience-map-pick-hint').style.display = 'block';
    document.body.style.cursor = 'crosshair';
    showToast('🗺️ 请在地图上点击选择道路', 'info');
  });

  document.getElementById('resilience-road-search-btn')?.addEventListener('click', function() {
    var query = document.getElementById('resilience-road-search').value;
    if (query) {
      var mockRoad = {
        roadId: 'R' + Math.floor(Math.random() * 1000),
        roadName: query,
        roadType: 'highway',
        length: (Math.random() * 20 + 5).toFixed(1),
        lanes: Math.floor(Math.random() * 4 + 2),
        designSpeed: Math.floor(Math.random() * 40 + 60),
        condition: ['good', 'fair', 'poor'][Math.floor(Math.random() * 3)],
        latitude: 30.18 + Math.random() * 0.1,
        longitude: 107.74 + Math.random() * 0.1
      };
      resilienceState.selectedRoad = mockRoad;
      resilienceState.roadProperties = {
        roadId: mockRoad.roadId,
        roadName: mockRoad.roadName,
        roadType: mockRoad.roadType,
        length: mockRoad.length,
        lanes: mockRoad.lanes,
        designSpeed: mockRoad.designSpeed,
        condition: mockRoad.condition
      };
      renderLeftPanel();
      showToast('✅ 已找到道路: ' + mockRoad.roadName, 'success');
      addRoadMarker(mockRoad.latitude, mockRoad.longitude);
    }
  });

  document.getElementById('resilience-calculate-btn')?.addEventListener('click', function() {
    startSingleRoadCalculation();
  });
}

function renderResultCard() {
  var body = document.getElementById('resilience-result-body');
  if (!body) return;

  var result = resilienceState.singleRoadResult;

  if (!result) {
    body.innerHTML = ''
      + '<div class="hv-assess-empty">'
      + '  <div style="font-size:24px;margin-bottom:4px;">📊</div>'
      + '  <div>请先进行韧性评估计算</div>'
      + '</div>';
    return;
  }

  var html = ''
    + '<div style="margin-bottom:12px;">'
    + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">评估结论</div>'
    + '  <div style="font-size:14px;font-weight:700;color:' + (result.resilienceLevel === 'high' ? '#4ADE80' : result.resilienceLevel === 'medium' ? '#FBBF24' : '#F87171') + ';">'
    + '    ' + (result.resilienceLevel === 'high' ? '✅ 高韧性' : result.resilienceLevel === 'medium' ? '⚡ 中韧性' : '⚠️ 低韧性')
    + '  </div>'
    + '</div>'
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">抵抗力指标</div>'
    + '  <div class="hv-assess-result-row">'
    + '    <span class="hv-assess-result-label">初始抵抗力</span>'
    + '    <span class="hv-assess-result-value">' + (result.initialResistance * 100).toFixed(1) + '%</span>'
    + '  </div>'
    + '  <div class="hv-assess-result-row">'
    + '    <span class="hv-assess-result-label">最低抵抗力</span>'
    + '    <span class="hv-assess-result-value" style="color:#F87171;">' + (result.minResistance * 100).toFixed(1) + '%</span>'
    + '  </div>'
    + '  <div class="hv-assess-result-row">'
    + '    <span class="hv-assess-result-label">恢复后抵抗力</span>'
    + '    <span class="hv-assess-result-value">' + (result.recoveredResistance * 100).toFixed(1) + '%</span>'
    + '  </div>'
    + '</div>'
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">恢复力指标</div>'
    + '  <div class="hv-assess-result-row">'
    + '    <span class="hv-assess-result-label">恢复速度</span>'
    + '    <span class="hv-assess-result-value">' + result.recoveryRate.toFixed(2) + '/天</span>'
    + '  </div>'
    + '  <div class="hv-assess-result-row">'
    + '    <span class="hv-assess-result-label">完全恢复时间</span>'
    + '    <span class="hv-assess-result-value">' + result.fullRecoveryTime + ' 天</span>'
    + '  </div>'
    + '</div>'
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">抵抗力变化曲线</div>'
    + '  <div id="resistance-chart" style="width:100%;height:150px;"></div>'
    + '</div>'
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">恢复力变化曲线</div>'
    + '  <div id="recovery-chart" style="width:100%;height:150px;"></div>'
    + '</div>';

  body.innerHTML = html;

  setTimeout(function() {
    renderResistanceChart(result.resistanceData);
    renderRecoveryChart(result.recoveryData);
  }, 100);
}

function renderResistanceChart(data) {
  var container = document.getElementById('resistance-chart');
  if (!container || !window.Chart) return;

  var ctx = container.getContext ? container : null;
  if (!ctx) {
    var canvas = document.createElement('canvas');
    canvas.id = 'resistance-chart-canvas';
    canvas.width = 300;
    canvas.height = 150;
    container.appendChild(canvas);
    ctx = canvas.getContext('2d');
  }

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [{
        label: '抵抗力',
        data: data.values,
        borderColor: '#38BDF8',
        backgroundColor: 'rgba(56, 189, 248, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: '#94A3B8', font: { size: 9 } },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        },
        y: {
          ticks: { color: '#94A3B8', font: { size: 9 } },
          grid: { color: 'rgba(148, 163, 184, 0.1)' },
          min: 0,
          max: 1
        }
      }
    }
  });
}

function renderRecoveryChart(data) {
  var container = document.getElementById('recovery-chart');
  if (!container || !window.Chart) return;

  var canvas = document.createElement('canvas');
  canvas.id = 'recovery-chart-canvas';
  canvas.width = 300;
  canvas.height = 150;
  container.appendChild(canvas);

  new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: data.labels,
      datasets: [{
        label: '恢复力',
        data: data.values,
        borderColor: '#4ADE80',
        backgroundColor: 'rgba(74, 222, 128, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: '#94A3B8', font: { size: 9 } },
          grid: { color: 'rgba(148, 163, 184, 0.1)' }
        },
        y: {
          ticks: { color: '#94A3B8', font: { size: 9 } },
          grid: { color: 'rgba(148, 163, 184, 0.1)' },
          min: 0,
          max: 1
        }
      }
    }
  });
}

// ============================================================
// 右侧面板渲染
// ============================================================

function renderRightPanel() {
  renderNetworkCard();
  renderAlgorithmCard();
}

function renderNetworkCard() {
  var body = document.getElementById('resilience-network-body');
  if (!body) return;

  var html = ''
    + '<div class="hv-assess-form-group">'
    + '  <label class="hv-assess-label">评估模式</label>'
    + '  <div style="display:flex;gap:8px;">'
    + '    <label class="hv-assess-radio-label">'
    + '      <input type="radio" name="network-mode" value="area"' + (resilienceState.networkMode === 'area' ? ' checked' : '') + ' /> 行政区域'
    + '    </label>'
    + '    <label class="hv-assess-radio-label">'
    + '      <input type="radio" name="network-mode" value="polygon"' + (resilienceState.networkMode === 'polygon' ? ' checked' : '') + ' /> 地图绘制'
    + '    </label>'
    + '  </div>'
    + '</div>';

  if (resilienceState.networkMode === 'area') {
    html += ''
      + '<div class="hv-assess-form-group">'
      + '  <label class="hv-assess-label">选择行政区域</label>'
      + '  <select class="hv-assess-select" id="res-network-area">'
      + '    <option value="">-- 请选择 --</option>'
      + '    <option value="district_a">A区</option>'
      + '    <option value="district_b">B区</option>'
      + '    <option value="district_c">C区</option>'
      + '    <option value="district_d">D区</option>'
      + '  </select>'
      + '</div>';
  } else {
    html += ''
      + '<div style="margin-bottom:8px;">'
      + '  <button class="hv-assess-btn-sm" id="res-network-polygon-btn" style="width:100%;">🗺️ 在地图上绘制区域</button>'
      + '  <button class="hv-assess-btn-sm" id="res-network-polygon-finish" style="width:100%;margin-top:4px;display:none;">✅ 完成绘制</button>'
      + '</div>';
  }

  html += ''
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:8px;">'
    + '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
    + '    <div style="font-size:11px;color:var(--text-secondary);">📋 路网道路列表</div>'
    + '    <button class="hv-assess-btn-sm" id="res-network-import-btn">📥 导入</button>'
    + '  </div>'
    + '  <div id="res-network-road-list" style="max-height:150px;overflow-y:auto;font-size:11px;">';

  if (resilienceState.networkRoads.length > 0) {
    resilienceState.networkRoads.forEach(function(road) {
      html += ''
        + '    <div style="padding:4px 0;border-bottom:1px solid rgba(56,189,248,0.05);display:flex;justify-content:space-between;">'
        + '      <span>' + road.roadId + ' - ' + road.roadName + '</span>'
        + '      <span style="color:' + (road.status === 'passable' ? '#4ADE80' : '#F87171') + ';">' + (road.status === 'passable' ? '通行' : '中断') + '</span>'
        + '    </div>';
    });
  } else {
    html += '    <div style="color:var(--text-muted);text-align:center;padding:12px;">暂无道路数据</div>';
  }

  html += ''
    + '  </div>'
    + '</div>'
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">📊 道路通行情况</div>'
    + '  <div id="res-network-road-status" style="max-height:120px;overflow-y:auto;font-size:11px;">';

  if (resilienceState.networkRoads.length > 0) {
    resilienceState.networkRoads.forEach(function(road) {
      html += ''
        + '    <div style="padding:4px 0;border-bottom:1px solid rgba(56,189,248,0.05);">'
        + '      <div style="display:flex;justify-content:space-between;">'
        + '        <span>' + road.roadId + '</span>'
        + '        <span>抵抗力: ' + (road.resistance * 100).toFixed(0) + '%</span>'
        + '      </div>'
        + '      <div style="display:flex;justify-content:space-between;color:var(--text-muted);">'
        + '        <span>恢复力: ' + (road.recovery * 100).toFixed(0) + '%</span>'
        + '        <span>状态: ' + (road.status === 'passable' ? '通行' : '中断') + '</span>'
        + '      </div>'
        + '    </div>';
    });
  } else {
    html += '    <div style="color:var(--text-muted);text-align:center;padding:12px;">等待评估结果</div>';
  }

  html += ''
    + '  </div>'
    + '</div>';

  body.innerHTML = html;

  body.querySelectorAll('input[name="network-mode"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      resilienceState.networkMode = this.value;
      renderRightPanel();
    });
  });

  document.getElementById('res-network-polygon-btn')?.addEventListener('click', function() {
    resilienceState.mapPolygonMode = true;
    resilienceState.polygonPoints = [];
    document.getElementById('resilience-map-polygon-hint').style.display = 'block';
    document.getElementById('res-network-polygon-finish').style.display = 'block';
    document.body.style.cursor = 'crosshair';
    showToast('🗺️ 请在地图上点击绘制区域，双击完成', 'info');
  });

  document.getElementById('res-network-polygon-finish')?.addEventListener('click', function() {
    resilienceState.mapPolygonMode = false;
    document.getElementById('resilience-map-polygon-hint').style.display = 'none';
    document.getElementById('res-network-polygon-finish').style.display = 'none';
    document.body.style.cursor = '';

    if (resilienceState.polygonPoints.length >= 3) {
      generateNetworkRoads();
      renderRightPanel();
      showToast('✅ 已生成路网数据', 'success');
    }
  });

  document.getElementById('res-network-import-btn')?.addEventListener('click', function() {
    var mockRoads = [
      { roadId: 'R001', roadName: '道路1', status: 'passable', resistance: 0.85, recovery: 0.9 },
      { roadId: 'R002', roadName: '道路2', status: 'passable', resistance: 0.78, recovery: 0.82 },
      { roadId: 'R003', roadName: '道路3', status: 'blocked', resistance: 0.35, recovery: 0.45 }
    ];
    resilienceState.networkRoads = mockRoads;
    renderRightPanel();
    showToast('📥 已导入路网数据', 'success');
  });

  document.getElementById('res-network-area')?.addEventListener('change', function() {
    if (this.value) {
      generateNetworkRoads();
      renderRightPanel();
      showToast('✅ 已加载区域路网', 'success');
    }
  });
}

function generateNetworkRoads() {
  var count = Math.floor(Math.random() * 5 + 5);
  var roads = [];
  for (var i = 0; i < count; i++) {
    roads.push({
      roadId: 'R' + String(i + 1).padStart(3, '0'),
      roadName: '道路' + (i + 1),
      status: Math.random() > 0.3 ? 'passable' : 'blocked',
      resistance: Math.random() * 0.5 + 0.5,
      recovery: Math.random() * 0.4 + 0.6
    });
  }
  resilienceState.networkRoads = roads;
}

function renderAlgorithmCard() {
  var body = document.getElementById('resilience-algorithm-body');
  if (!body) return;

  var html = ''
    + '<div class="hv-assess-form-group">'
    + '  <label class="hv-assess-label">评估算法</label>'
    + '  <select class="hv-assess-select" id="res-algorithm-select">'
    + '    <option value="default">默认韧性评估算法</option>'
    + '    <option value="advanced">高级韧性评估算法</option>'
    + '    <option value="custom">自定义算法</option>'
    + '  </select>'
    + '</div>'
    + '<div style="margin-top:8px;">'
    + '  <button class="hv-assess-btn-secondary" id="res-algorithm-detail-btn" style="width:100%;">📖 算法详细介绍</button>'
    + '</div>'
    + '<div style="margin-top:8px;">'
    + '  <button class="hv-assess-btn-primary" id="res-algorithm-calculate-btn" style="width:100%;">🚀 计算区域冗余度</button>'
    + '</div>'
    + '<div id="res-algorithm-progress" style="display:none;margin-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">计算进度</div>'
    + '  <div class="hv-assess-progress-bar">'
    + '    <div class="hv-assess-progress-fill" id="res-progress-fill" style="width:0%;"></div>'
    + '  </div>'
    + '  <div style="font-size:10px;color:var(--text-muted);margin-top:2px;" id="res-progress-text">0%</div>'
    + '</div>';

  if (resilienceState.redundancyValue !== null) {
    html += ''
      + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:12px;">'
      + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">区域冗余度</div>'
      + '  <div style="font-size:24px;font-weight:700;color:' + (resilienceState.redundancyValue > 0.7 ? '#4ADE80' : resilienceState.redundancyValue > 0.4 ? '#FBBF24' : '#F87171') + ';">'
      + '    ' + resilienceState.redundancyValue.toFixed(3)
      + '  </div>'
      + '  <div style="font-size:10px;color:var(--text-muted);margin-top:4px;">'
      + '    ' + (resilienceState.redundancyValue > 0.7 ? '高冗余度，路网连通性良好' : resilienceState.redundancyValue > 0.4 ? '中等冗余度，部分路段存在风险' : '低冗余度，路网脆弱')
      + '  </div>'
      + '</div>';
  }

  body.innerHTML = html;

  document.getElementById('res-algorithm-detail-btn')?.addEventListener('click', function() {
    showToast('📖 算法详细介绍功能开发中', 'info');
  });

  document.getElementById('res-algorithm-calculate-btn')?.addEventListener('click', function() {
    startRedundancyCalculation();
  });
}

// ============================================================
// 计算逻辑
// ============================================================

function startSingleRoadCalculation() {
  if (!resilienceState.selectedRoad) {
    showToast('⚠️ 请先选择道路', 'warning');
    return;
  }

  resilienceState.taskStatus = 'calculating';
  updateStatusBadge('计算中...');

  setTimeout(function() {
    var road = resilienceState.selectedRoad;
    var initialResistance = 0.8 + Math.random() * 0.15;
    var minResistance = initialResistance * (0.3 + Math.random() * 0.3);
    var recoveredResistance = initialResistance * (0.85 + Math.random() * 0.15);
    var recoveryRate = 0.05 + Math.random() * 0.1;
    var fullRecoveryTime = Math.round((1 - recoveredResistance) / recoveryRate);

    var resistanceData = {
      labels: ['0h', '2h', '4h', '6h', '8h', '12h', '24h', '48h', '72h'],
      values: [
        initialResistance,
        initialResistance * 0.9,
        minResistance,
        minResistance * 1.1,
        minResistance * 1.3,
        recoveredResistance * 0.7,
        recoveredResistance * 0.85,
        recoveredResistance * 0.95,
        recoveredResistance
      ]
    };

    var recoveryData = {
      labels: ['0h', '2h', '4h', '6h', '8h', '12h', '24h', '48h', '72h'],
      values: [
        0,
        0.1,
        0.2,
        0.35,
        0.5,
        0.65,
        0.8,
        0.92,
        1.0
      ]
    };

    resilienceState.singleRoadResult = {
      roadId: road.roadId,
      resilienceLevel: recoveredResistance > 0.7 ? 'high' : recoveredResistance > 0.4 ? 'medium' : 'low',
      initialResistance: initialResistance,
      minResistance: minResistance,
      recoveredResistance: recoveredResistance,
      recoveryRate: recoveryRate,
      fullRecoveryTime: fullRecoveryTime,
      resistanceData: resistanceData,
      recoveryData: recoveryData
    };

    resilienceState.taskStatus = 'completed';
    updateStatusBadge('已完成');
    renderResultCard();
    showToast('✅ 单道路韧性评估完成', 'success');
  }, 1500);
}

function startRedundancyCalculation() {
  if (resilienceState.networkRoads.length === 0) {
    showToast('⚠️ 请先加载路网数据', 'warning');
    return;
  }

  var progressContainer = document.getElementById('res-algorithm-progress');
  var progressFill = document.getElementById('res-progress-fill');
  var progressText = document.getElementById('res-progress-text');
  if (progressContainer) {
    progressContainer.style.display = 'block';
  }

  var progress = 0;
  var interval = setInterval(function() {
    progress += Math.random() * 15;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);

      setTimeout(function() {
        resilienceState.redundancyValue = 0.5 + Math.random() * 0.4;
        renderAlgorithmCard();
        showToast('✅ 区域冗余度计算完成', 'success');
      }, 500);
    }

    if (progressFill) {
      progressFill.style.width = progress + '%';
    }
    if (progressText) {
      progressText.textContent = Math.round(progress) + '%';
    }
  }, 300);
}

// ============================================================
// 辅助函数
// ============================================================

function updateStatusBadge(text) {
  var badge = document.getElementById('resilience-status-badge');
  if (badge) {
    badge.textContent = text;
  }
}

function saveResilienceTask() {
  showToast('💾 任务保存功能开发中', 'info');
}

function exportResilienceReport() {
  if (!resilienceState.singleRoadResult && resilienceState.networkRoads.length === 0) {
    showToast('⚠️ 请先进行韧性评估计算', 'warning');
    return;
  }

  var data = {
    singleRoadResult: resilienceState.singleRoadResult,
    networkRoads: resilienceState.networkRoads,
    redundancyValue: resilienceState.redundancyValue,
    timestamp: new Date().toISOString()
  };

  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'resilience_assessment_' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);

  showToast('📄 报告已导出', 'success');
}

function showToast(message, type) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  } else {
    console.log('[' + type + '] ' + message);
  }
}