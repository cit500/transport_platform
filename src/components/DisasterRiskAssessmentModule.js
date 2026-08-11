/**
 * 🌋 灾害风险评估模块
 *
 * 布局：页面内路由切换，替换原有大屏内容
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 顶部标题栏：灾害风险评估 + 返回首页/保存/导出                  │
 * ├──────────────┬──────────────────────────────┬────────────────┤
 * │ 左侧面板      │      中间 Bigemap GIS 地图    │  右侧面板      │
 * │ (2个卡片)     │      (支持图层切换)           │  (2个卡片)     │
 * │ 1.灾害模拟    │                              │  1.评估结果    │
 * │ 2.算法模型    │                              │  2.影响分析    │
 * └──────────────┴──────────────────────────────┴────────────────┘
 *
 * 功能：泥石流/地震模拟、灾害参数设置、评估计算、结果展示
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
var disasterState = {
  // 灾害类型: 'debris_flow' | 'earthquake'
  disasterType: 'debris_flow',
  // 灾害发生位置
  disasterLocation: null,
  // 泥石流参数
  debrisFlowParams: {
    volume: 50000, // 泥石流体积 (m³)
    density: 1.8, // 密度 (t/m³)
    velocity: 8, // 流速 (m/s)
    rainfall: 150, // 降雨量 (mm)
    slope: 25, // 坡度 (°)
    probabilityThreshold: 0.6 // 概率阈值
  },
  // 地震参数
  earthquakeParams: {
    magnitude: 6.5, // 震级
    depth: 10, // 震源深度 (km)
    epicenterDistance: 5, // 震中距 (km)
    peakAcceleration: 0.3, // 峰值加速度 (g)
    duration: 30 // 持续时间 (s)
  },
  // 评估算法模型
  selectedModel: 'default',
  // 评估结果
  assessmentResult: null,
  // 任务状态: 'idle' | 'calculating' | 'completed' | 'error'
  taskStatus: 'idle',
  // 地图拾取模式
  mapPickMode: false
};

// 保存原始DOM结构，用于返回首页时恢复
var originalAppContent = null;
var originalTitle = null;

// ============================================================
// 导出接口
// ============================================================

export function isDisasterRiskAssessmentActive() {
  return isActive;
}

export function openDisasterRiskAssessmentModule() {
  if (isActive) return;
  isActive = true;

  // 添加body类，用于调整图层抽屉位置
  document.body.classList.add('disaster-assessment-active');

  // 保存原始内容
  var app = document.getElementById('app');
  if (app) {
    originalAppContent = app.innerHTML;
  }
  originalTitle = document.title;
  document.title = '灾害风险评估 - 交通网络安全韧性评估及可视化决策平台';

  // 初始化状态
  disasterState.disasterType = 'debris_flow';
  disasterState.disasterLocation = null;
  disasterState.assessmentResult = null;
  disasterState.taskStatus = 'idle';
  disasterState.mapPickMode = false;

  // 构建新布局
  buildDisasterLayout();

  // 绑定事件
  bindDisasterEvents();

  // 延迟初始化和渲染，确保DOM完全渲染
  setTimeout(function() {
    // 初始化地图
    initDisasterMap();

    // 显示首页图层控制面板
    showHomePageLayerControl();

    // 渲染左侧面板
    renderLeftPanel();

    // 渲染右侧面板
    renderRightPanel();
  }, 100);

  showToast('🌋 已进入灾害风险评估任务', 'info');
}

export function closeDisasterRiskAssessmentModule() {
  if (!isActive) return;
  isActive = false;

  // 移除body类
  document.body.classList.remove('disaster-assessment-active');

  // 隐藏首页图层控制抽屉
  var layerDrawer = document.getElementById('layer-drawer');
  if (layerDrawer) {
    layerDrawer.classList.remove('open');
  }

  // 清理地图实例
  if (disasterMap) {
    try {
      disasterMap.remove();
    } catch(e) {}
    disasterMap = null;
  }

  // 恢复原始内容
  var app = document.getElementById('app');
  if (app && originalAppContent) {
    app.innerHTML = originalAppContent;
  }
  if (originalTitle) {
    document.title = originalTitle;
  }
  originalAppContent = null;

  // 重新初始化首页地图
  setTimeout(function() {
    window.location.reload();
  }, 100);

  showToast('已返回首页', 'info');
}

// ============================================================
// 构建灾害评估模块布局
// ============================================================

function buildDisasterLayout() {
  var app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = ''
    // === 顶部标题栏 ===
    + '<header id="hv-assess-header">'
    + '  <div class="hv-assess-header-left">'
    + '    <button class="hv-assess-back-btn" id="disaster-btn-back">← 返回首页</button>'
    + '    <span class="hv-assess-header-title">🌋 灾害风险评估</span>'
    + '    <span class="hv-assess-status-badge" id="disaster-status-badge">未开始</span>'
    + '  </div>'
    + '  <div class="hv-assess-header-right">'
    + '    <button class="hv-assess-header-btn" id="disaster-btn-save">💾 保存任务</button>'
    + '    <button class="hv-assess-header-btn" id="disaster-btn-export">📄 导出报告</button>'
    + '  </div>'
    + '</header>'
    // === 主体区域 ===
    + '<div id="hv-assess-body">'
    // 左侧面板
    + '  <div id="hv-assess-left-panel">'
    + '    <div class="hv-assess-card" id="disaster-card-simulation">'
    + '      <div class="hv-assess-card-header">'
    + '        <span>🌊 灾害模拟设置</span>'
    + '      </div>'
    + '      <div class="hv-assess-card-body" id="disaster-simulation-body"></div>'
    + '    </div>'
    + '    <div class="hv-assess-card" id="disaster-card-model">'
    + '      <div class="hv-assess-card-header">'
    + '        <span>⚙️ 评估算法模型设置</span>'
    + '      </div>'
    + '      <div class="hv-assess-card-body" id="disaster-model-body"></div>'
    + '    </div>'
    + '  </div>'
    // 中间地图
    + '  <div id="hv-assess-map-container">'
    + '    <div id="map"></div>'
    + '    <div id="disaster-map-pick-hint" style="display:none;">🖱️ 请在地图上点选灾害发生位置</div>'
    // 地图控制按钮（复用样式）
    + '    <div id="hv-assess-map-controls">'
    + '      <button class="hv-map-ctrl-btn" id="disaster-btn-zoom-in" title="放大">＋</button>'
    + '      <button class="hv-map-ctrl-btn" id="disaster-btn-zoom-out" title="缩小">−</button>'
    + '      <div class="hv-map-ctrl-divider"></div>'
    + '      <button class="hv-map-ctrl-btn" id="disaster-btn-layer-control" title="图层控制中枢">🗺️</button>'
    + '    </div>'
    + '  </div>'
    // 右侧面板
    + '  <div id="hv-assess-right-panel">'
    + '    <div class="hv-assess-card" id="disaster-card-result">'
    + '      <div class="hv-assess-card-header">'
    + '        <span>📊 灾害评估结果</span>'
    + '      </div>'
    + '      <div class="hv-assess-card-body" id="disaster-result-body"></div>'
    + '    </div>'
    + '    <div class="hv-assess-card" id="disaster-card-impact">'
    + '      <div class="hv-assess-card-header">'
    + '        <span>🎯 影响区域分析</span>'
    + '      </div>'
    + '      <div class="hv-assess-card-body" id="disaster-impact-body"></div>'
    + '    </div>'
    + '  </div>'
    + '</div>';
}

// ============================================================
// 事件绑定
// ============================================================

function bindDisasterEvents() {
  // 返回首页
  document.getElementById('disaster-btn-back')?.addEventListener('click', closeDisasterRiskAssessmentModule);

  // 保存任务
  document.getElementById('disaster-btn-save')?.addEventListener('click', saveDisasterTask);

  // 导出报告
  document.getElementById('disaster-btn-export')?.addEventListener('click', exportDisasterReport);

  // 地图控制按钮
  document.getElementById('disaster-btn-zoom-in')?.addEventListener('click', function() {
    if (disasterMap) disasterMap.zoomIn();
  });

  document.getElementById('disaster-btn-zoom-out')?.addEventListener('click', function() {
    if (disasterMap) disasterMap.zoomOut();
  });

  // 图层控制按钮
  var layerBtn = document.getElementById('disaster-btn-layer-control');
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

    // 点击其他地方关闭抽屉
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

var disasterMap = null;
var disasterBaseLayer = null;

// Bigemap 配置（与首页一致）
var BIGEMAP_SERVER_URL = 'http://127.0.0.1:9000';
var BIGEMAP_ACCESS_TOKEN = 'pk.eyJ1IjoiY3VzXzB2eTFlYXA5IiwiYSI6ImVnNWdxbGtkbjNhY24wbGFybmZlY25qbGkifQ.ZAg23qtH2mD4eClfKElqaQ';
var BIGEMAP_LAYER_IDS = {
  electronic: 'bigemap.7i2bexkr',
  satellite: 'bigemap.5grpf9us'
};

function initDisasterMap() {
  var mapContainer = document.getElementById('map');
  if (!mapContainer) return;

  // 获取已有地图实例并移除
  var existingMap = getMap();
  if (existingMap) {
    try {
      existingMap.remove();
    } catch(e) {}
  }

  // 创建新地图实例
  disasterMap = L.map('map', {
    center: [30.18, 107.74],
    zoom: 12,
    zoomControl: false,
    attributionControl: false,
    fadeAnimation: true,
    zoomAnimation: true
  });

  // 加载Bigemap卫星底图（与首页一致的方式）
  var satelliteUrl = BIGEMAP_SERVER_URL + '/' + BIGEMAP_LAYER_IDS.satellite + '/tiles/{z}/{x}/{y}.png?access_token=' + BIGEMAP_ACCESS_TOKEN;
  disasterBaseLayer = L.tileLayer(satelliteUrl, {
    maxZoom: 12,
    minZoom: 6,
    attribution: '',
    subdomains: []
  }).addTo(disasterMap);

  // 绑定地图点击事件（灾害位置拾取）
  disasterMap.on('click', handleDisasterMapClick);

  // 刷新地图尺寸
  requestAnimationFrame(function() {
    disasterMap.invalidateSize();
    setTimeout(function() {
      disasterMap.invalidateSize();
    }, 300);
  });
}

// 显示首页图层控制面板
function showHomePageLayerControl() {
  // 查找首页的图层控制抽屉
  var layerDrawer = document.getElementById('layer-drawer');
  if (layerDrawer) {
    layerDrawer.classList.add('open');
  }
}

function handleDisasterMapClick(e) {
  if (!disasterState.mapPickMode) return;

  var lat = e.latlng.lat;
  var lng = e.latlng.lng;

  // 退出拾取模式
  disasterState.mapPickMode = false;
  document.getElementById('disaster-map-pick-hint').style.display = 'none';
  document.body.style.cursor = '';

  // 设置灾害位置
  disasterState.disasterLocation = {
    latitude: lat,
    longitude: lng
  };

  renderLeftPanel();
  showToast('✅ 已设置灾害位置: ' + lat.toFixed(4) + ', ' + lng.toFixed(4), 'success');

  // 添加位置标记
  addDisasterLocationMarker(lat, lng);
}

var disasterLocationMarker = null;

function addDisasterLocationMarker(lat, lng) {
  if (!disasterMap) return;

  // 清除旧标记
  if (disasterLocationMarker) {
    try {
      disasterMap.removeLayer(disasterLocationMarker);
    } catch(e) {}
  }

  // 添加新标记
  disasterLocationMarker = L.circleMarker([lat, lng], {
    radius: 12,
    fillColor: '#F87171',
    color: '#F87171',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.6
  }).addTo(disasterMap);

  disasterLocationMarker.bindPopup(''
    + '<div style="font-size:12px;">'
    + '  <div style="font-weight:600;margin-bottom:4px;">🌋 灾害发生位置</div>'
    + '  <div>纬度: ' + lat.toFixed(4) + '</div>'
    + '  <div>经度: ' + lng.toFixed(4) + '</div>'
    + '</div>'
  );
}

// ============================================================
// 左侧面板渲染
// ============================================================

function renderLeftPanel() {
  renderSimulationCard();
  renderModelCard();
}

// --- 卡片1: 灾害模拟设置 ---
function renderSimulationCard() {
  var body = document.getElementById('disaster-simulation-body');
  if (!body) return;

  var isDebrisFlow = disasterState.disasterType === 'debris_flow';
  var loc = disasterState.disasterLocation;

  var html = ''
    // 灾害类型切换
    + '<div class="hv-assess-form-row">'
    + '  <label class="hv-assess-radio-label">'
    + '    <input type="radio" name="disaster-type" value="debris_flow"' + (isDebrisFlow ? ' checked' : '') + ' /> 泥石流模拟'
    + '  </label>'
    + '  <label class="hv-assess-radio-label">'
    + '    <input type="radio" name="disaster-type" value="earthquake"' + (!isDebrisFlow ? ' checked' : '') + ' /> 地震模拟'
    + '  </label>'
    + '</div>'
    // 位置选择
    + '<div class="hv-assess-form-group">'
    + '  <label class="hv-assess-label">灾害发生位置</label>'
    + '  <div style="display:flex;gap:4px;">'
    + '    <input class="hv-assess-input" id="disaster-lat" value="' + (loc ? loc.latitude.toFixed(4) : '') + '" placeholder="纬度" />'
    + '    <input class="hv-assess-input" id="disaster-lng" value="' + (loc ? loc.longitude.toFixed(4) : '') + '" placeholder="经度" />'
    + '  </div>'
    + '  <button class="hv-assess-btn-sm" id="disaster-map-pick-btn" style="margin-top:4px;width:100%;">🗺️ 从地图中选择</button>'
    + '</div>';

  // 灾害参数表单
  if (isDebrisFlow) {
    html += buildDebrisFlowParams();
  } else {
    html += buildEarthquakeParams();
  }

  body.innerHTML = html;

  // 绑定灾害类型切换事件
  body.querySelectorAll('input[name="disaster-type"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      disasterState.disasterType = this.value;
      renderLeftPanel();
    });
  });

  // 绑定地图拾取按钮
  document.getElementById('disaster-map-pick-btn')?.addEventListener('click', function() {
    disasterState.mapPickMode = true;
    document.getElementById('disaster-map-pick-hint').style.display = 'block';
    document.body.style.cursor = 'crosshair';
    showToast('🗺️ 请在地图上点击选择灾害发生位置', 'info');
  });

  // 绑定经纬度输入事件
  var latInput = document.getElementById('disaster-lat');
  var lngInput = document.getElementById('disaster-lng');
  if (latInput && lngInput) {
    latInput.addEventListener('change', function() {
      var lat = parseFloat(this.value);
      var lng = parseFloat(lngInput.value);
      if (!isNaN(lat) && !isNaN(lng)) {
        disasterState.disasterLocation = { latitude: lat, longitude: lng };
        addDisasterLocationMarker(lat, lng);
      }
    });
    lngInput.addEventListener('change', function() {
      var lat = parseFloat(latInput.value);
      var lng = parseFloat(this.value);
      if (!isNaN(lat) && !isNaN(lng)) {
        disasterState.disasterLocation = { latitude: lat, longitude: lng };
        addDisasterLocationMarker(lat, lng);
      }
    });
  }
}

// 泥石流参数
function buildDebrisFlowParams() {
  var p = disasterState.debrisFlowParams;

  return ''
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">📋 泥石流模拟参数</div>'
    + '  <div class="hv-assess-form-row">'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">泥石流体积 (m³)</label>'
    + '      <input class="hv-assess-input" id="df-volume" type="number" value="' + p.volume + '" />'
    + '    </div>'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">密度 (t/m³)</label>'
    + '      <input class="hv-assess-input" id="df-density" type="number" value="' + p.density + '" step="0.1" />'
    + '    </div>'
    + '  </div>'
    + '  <div class="hv-assess-form-row">'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">流速 (m/s)</label>'
    + '      <input class="hv-assess-input" id="df-velocity" type="number" value="' + p.velocity + '" step="0.5" />'
    + '    </div>'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">降雨量 (mm)</label>'
    + '      <input class="hv-assess-input" id="df-rainfall" type="number" value="' + p.rainfall + '" />'
    + '    </div>'
    + '  </div>'
    + '  <div class="hv-assess-form-row">'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">坡度 (°)</label>'
    + '      <input class="hv-assess-input" id="df-slope" type="number" value="' + p.slope + '" />'
    + '    </div>'
    + '  </div>'
    // 预测泥石流灾害发生概率开关
    + '  <div style="margin-top:12px;padding:12px;background:rgba(248,113,113,0.1);border:1px solid rgba(248,113,113,0.3);border-radius:6px;">'
    + '    <div style="display:flex;align-items:center;justify-content:space-between;">'
    + '      <div>'
    + '        <div style="font-size:12px;font-weight:600;color:#F87171;">⚠️ 预测泥石流灾害发生概率</div>'
    + '        <div style="font-size:10px;color:var(--text-muted);margin-top:2px;">基于历史数据和实时监测</div>'
    + '      </div>'
    + '      <label class="hv-assess-switch">'
    + '        <input type="checkbox" id="df-probability-switch" />'
    + '        <span class="hv-assess-switch-slider"></span>'
    + '      </label>'
    + '    </div>'
    + '    <div id="df-probability-result" style="display:none;margin-top:8px;padding:8px;background:rgba(3,16,30,0.6);border-radius:4px;">'
    + '      <div style="font-size:11px;color:var(--text-muted);">预测概率</div>'
    + '      <div style="font-size:18px;font-weight:700;color:#F87171;" id="df-probability-value">--</div>'
    + '    </div>'
    + '  </div>'
    + '</div>';
}

// 地震参数
function buildEarthquakeParams() {
  var p = disasterState.earthquakeParams;

  return ''
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">📋 地震模拟参数</div>'
    + '  <div class="hv-assess-form-row">'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">震级</label>'
    + '      <input class="hv-assess-input" id="eq-magnitude" type="number" value="' + p.magnitude + '" step="0.1" min="1" max="10" />'
    + '    </div>'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">震源深度 (km)</label>'
    + '      <input class="hv-assess-input" id="eq-depth" type="number" value="' + p.depth + '" />'
    + '    </div>'
    + '  </div>'
    + '  <div class="hv-assess-form-row">'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">震中距 (km)</label>'
    + '      <input class="hv-assess-input" id="eq-distance" type="number" value="' + p.epicenterDistance + '" />'
    + '    </div>'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">峰值加速度 (g)</label>'
    + '      <input class="hv-assess-input" id="eq-pga" type="number" value="' + p.peakAcceleration + '" step="0.01" />'
    + '    </div>'
    + '  </div>'
    + '  <div class="hv-assess-form-row">'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">持续时间 (s)</label>'
    + '      <input class="hv-assess-input" id="eq-duration" type="number" value="' + p.duration + '" />'
    + '    </div>'
    + '  </div>'
    + '</div>';
}

// --- 卡片2: 评估算法模型设置 ---
function renderModelCard() {
  var body = document.getElementById('disaster-model-body');
  if (!body) return;

  body.innerHTML = ''
    + '<div class="hv-assess-form-group">'
    + '  <label class="hv-assess-label">评估模型</label>'
    + '  <select class="hv-assess-select" id="disaster-model-select">'
    + '    <option value="default"' + (disasterState.selectedModel === 'default' ? ' selected' : '') + '>默认评估模型</option>'
    + '    <option value="advanced"' + (disasterState.selectedModel === 'advanced' ? ' selected' : '') + '>高级评估模型</option>'
    + '    <option value="custom"' + (disasterState.selectedModel === 'custom' ? ' selected' : '') + '>自定义模型</option>'
    + '  </select>'
    + '</div>'
    + '<div style="margin-top:8px;">'
    + '  <button class="hv-assess-btn-secondary" id="disaster-model-detail-btn" style="width:100%;">📖 模型详细介绍</button>'
    + '</div>'
    + '<div style="margin-top:8px;">'
    + '  <button class="hv-assess-btn-primary" id="disaster-calculate-btn" style="width:100%;">🚀 开始模拟计算</button>'
    + '</div>'
    + '<div id="disaster-calculate-progress" style="display:none;margin-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">计算进度</div>'
    + '  <div class="hv-assess-progress-bar">'
    + '    <div class="hv-assess-progress-fill" id="disaster-progress-fill" style="width:0%;"></div>'
    + '  </div>'
    + '  <div style="font-size:10px;color:var(--text-muted);margin-top:2px;" id="disaster-progress-text">0%</div>'
    + '</div>';

  // 绑定模型选择事件
  document.getElementById('disaster-model-select')?.addEventListener('change', function() {
    disasterState.selectedModel = this.value;
  });

  // 绑定模型详情按钮
  document.getElementById('disaster-model-detail-btn')?.addEventListener('click', function() {
    showToast('📖 模型详细介绍功能开发中', 'info');
  });

  // 绑定模拟计算按钮
  document.getElementById('disaster-calculate-btn')?.addEventListener('click', function() {
    startDisasterCalculation();
  });
}

// ============================================================
// 右侧面板渲染
// ============================================================

function renderRightPanel() {
  renderResultCard();
  renderImpactCard();
}

// --- 卡片1: 灾害评估结果 ---
function renderResultCard() {
  var body = document.getElementById('disaster-result-body');
  if (!body) return;

  var result = disasterState.assessmentResult;

  if (!result) {
    body.innerHTML = ''
      + '<div class="hv-assess-empty">'
      + '  <div style="font-size:24px;margin-bottom:4px;">📊</div>'
      + '  <div>请先进行灾害模拟计算</div>'
      + '</div>';
    return;
  }

  var isDebrisFlow = disasterState.disasterType === 'debris_flow';

  var html = ''
    + '<div style="margin-bottom:12px;">'
    + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">总体评估结论</div>'
    + '  <div style="font-size:16px;font-weight:700;color:' + (result.riskLevel === 'high' ? '#F87171' : result.riskLevel === 'medium' ? '#FBBF24' : '#4ADE80') + ';">'
    + '    ' + (result.riskLevel === 'high' ? '⚠️ 高风险' : result.riskLevel === 'medium' ? '⚡ 中风险' : '✅ 低风险')
    + '  </div>'
    + '</div>'
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">灾害参数</div>';

  if (isDebrisFlow) {
    html += ''
      + '  <div class="hv-assess-result-row">'
      + '    <span class="hv-assess-result-label">泥石流体积</span>'
      + '    <span class="hv-assess-result-value">' + result.volume + ' m³</span>'
      + '  </div>'
      + '  <div class="hv-assess-result-row">'
      + '    <span class="hv-assess-result-label">影响范围</span>'
      + '    <span class="hv-assess-result-value">' + result.impactArea + ' km²</span>'
      + '  </div>'
      + '  <div class="hv-assess-result-row">'
      + '    <span class="hv-assess-result-label">预计到达时间</span>'
      + '    <span class="hv-assess-result-value">' + result.arrivalTime + ' 分钟</span>'
      + '  </div>';
  } else {
    html += ''
      + '  <div class="hv-assess-result-row">'
      + '    <span class="hv-assess-result-label">震级</span>'
      + '    <span class="hv-assess-result-value">' + result.magnitude + '</span>'
      + '  </div>'
      + '  <div class="hv-assess-result-row">'
      + '    <span class="hv-assess-result-label">烈度</span>'
      + '    <span class="hv-assess-result-value">' + result.intensity + ' 度</span>'
      + '  </div>'
      + '  <div class="hv-assess-result-row">'
      + '    <span class="hv-assess-result-label">影响半径</span>'
      + '    <span class="hv-assess-result-value">' + result.impactRadius + ' km</span>'
      + '  </div>';
  }

  html += ''
    + '</div>'
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">风险指标</div>'
    + '  <div class="hv-assess-result-row">'
    + '    <span class="hv-assess-result-label">人员伤亡风险</span>'
    + '    <span class="hv-assess-result-value" style="color:' + (result.casualtyRisk > 0.7 ? '#F87171' : '#FBBF24') + ';">' + (result.casualtyRisk * 100).toFixed(1) + '%</span>'
    + '  </div>'
    + '  <div class="hv-assess-result-row">'
    + '    <span class="hv-assess-result-label">基础设施损毁</span>'
    + '    <span class="hv-assess-result-value" style="color:' + (result.infrastructureDamage > 0.7 ? '#F87171' : '#FBBF24') + ';">' + (result.infrastructureDamage * 100).toFixed(1) + '%</span>'
    + '  </div>'
    + '</div>';

  body.innerHTML = html;
}

// --- 卡片2: 影响区域分析 ---
function renderImpactCard() {
  var body = document.getElementById('disaster-impact-body');
  if (!body) return;

  var result = disasterState.assessmentResult;

  if (!result) {
    body.innerHTML = ''
      + '<div class="hv-assess-empty">'
      + '  <div style="font-size:24px;margin-bottom:4px;">🎯</div>'
      + '  <div>等待评估结果生成</div>'
      + '</div>';
    return;
  }

  var html = ''
    + '<div style="margin-bottom:12px;">'
    + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">影响区域统计</div>'
    + '  <div class="hv-assess-result-row">'
    + '    <span class="hv-assess-result-label">影响面积</span>'
    + '    <span class="hv-assess-result-value">' + result.impactArea + ' km²</span>'
    + '  </div>'
    + '  <div class="hv-assess-result-row">'
    + '    <span class="hv-assess-result-label">受影响人口</span>'
    + '    <span class="hv-assess-result-value">' + result.affectedPopulation + ' 人</span>'
    + '  </div>'
    + '  <div class="hv-assess-result-row">'
    + '    <span class="hv-assess-result-label">受影响道路</span>'
    + '    <span class="hv-assess-result-value">' + result.affectedRoads + ' 条</span>'
    + '  </div>'
    + '  <div class="hv-assess-result-row">'
    + '    <span class="hv-assess-result-label">受影响桥梁</span>'
    + '    <span class="hv-assess-result-value">' + result.affectedBridges + ' 座</span>'
    + '  </div>'
    + '</div>'
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">应急建议</div>'
    + '  <div style="font-size:11px;color:var(--text-secondary);line-height:1.6;">'
    + '    ' + result.emergencyAdvice + ''
    + '  </div>'
    + '</div>';

  body.innerHTML = html;
}

// ============================================================
// 模拟计算
// ============================================================

function startDisasterCalculation() {
  if (!disasterState.disasterLocation) {
    showToast('⚠️ 请先设置灾害发生位置', 'warning');
    return;
  }

  // 更新任务状态
  disasterState.taskStatus = 'calculating';
  updateStatusBadge('计算中...');

  // 显示进度条
  var progressContainer = document.getElementById('disaster-calculate-progress');
  var progressFill = document.getElementById('disaster-progress-fill');
  var progressText = document.getElementById('disaster-progress-text');
  if (progressContainer) {
    progressContainer.style.display = 'block';
  }

  // 模拟计算进度
  var progress = 0;
  var interval = setInterval(function() {
    progress += Math.random() * 15;
    if (progress >= 100) {
      progress = 100;
      clearInterval(interval);

      // 计算完成
      setTimeout(function() {
        disasterState.taskStatus = 'completed';
        updateStatusBadge('已完成');
        generateDisasterResult();
        showToast('✅ 灾害评估计算完成', 'success');
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

function generateDisasterResult() {
  var isDebrisFlow = disasterState.disasterType === 'debris_flow';
  var loc = disasterState.disasterLocation;

  var result;

  if (isDebrisFlow) {
    var p = disasterState.debrisFlowParams;
    result = {
      disasterType: 'debris_flow',
      location: loc,
      volume: p.volume,
      impactArea: (p.volume / 10000 * 2.5).toFixed(2),
      arrivalTime: Math.round(p.volume / 10000 * 15),
      casualtyRisk: Math.min(0.95, p.density * p.velocity / 20),
      infrastructureDamage: Math.min(0.9, p.volume / 100000 * 0.8),
      affectedPopulation: Math.round(p.volume / 10000 * 500),
      affectedRoads: Math.round(p.volume / 100000 * 5),
      affectedBridges: Math.round(p.volume / 100000 * 2),
      riskLevel: p.volume > 80000 ? 'high' : p.volume > 40000 ? 'medium' : 'low',
      emergencyAdvice: '建议立即启动泥石流应急预案，疏散影响区域内人员，封闭相关道路和桥梁，设置警戒线。'
    };
  } else {
    var p = disasterState.earthquakeParams;
    result = {
      disasterType: 'earthquake',
      location: loc,
      magnitude: p.magnitude,
      intensity: Math.round(p.magnitude * 1.5),
      impactRadius: p.magnitude * 10,
      casualtyRisk: Math.min(0.95, p.magnitude / 10 * p.peakAcceleration * 2),
      infrastructureDamage: Math.min(0.9, p.magnitude / 10 * 0.8),
      affectedPopulation: Math.round(p.magnitude * 10000),
      affectedRoads: Math.round(p.magnitude * 3),
      affectedBridges: Math.round(p.magnitude * 1.5),
      riskLevel: p.magnitude > 7 ? 'high' : p.magnitude > 5 ? 'medium' : 'low',
      emergencyAdvice: '建议立即启动地震应急预案，检查桥梁和道路结构安全，疏散危险区域人员，准备救援物资。'
    };
  }

  disasterState.assessmentResult = result;

  // 渲染右侧面板
  renderRightPanel();

  // 在地图上添加影响区域
  addDisasterImpactArea(result);
}

var disasterImpactArea = null;

function addDisasterImpactArea(result) {
  if (!disasterMap || !result.location) return;

  // 清除旧的影响区域
  if (disasterImpactArea) {
    try {
      disasterMap.removeLayer(disasterImpactArea);
    } catch(e) {}
  }

  var radius = result.disasterType === 'debris_flow'
    ? parseFloat(result.impactArea) * 500
    : result.impactRadius * 1000;

  var color = result.riskLevel === 'high' ? '#F87171' : result.riskLevel === 'medium' ? '#FBBF24' : '#4ADE80';

  disasterImpactArea = L.circle([result.location.latitude, result.location.longitude], {
    radius: radius,
    fillColor: color,
    color: color,
    weight: 2,
    opacity: 0.8,
    fillOpacity: 0.2
  }).addTo(disasterMap);

  disasterImpactArea.bindPopup(''
    + '<div style="font-size:12px;">'
    + '  <div style="font-weight:600;margin-bottom:4px;">🌋 灾害影响区域</div>'
    + '  <div>影响面积: ' + result.impactArea + ' km²</div>'
    + '  <div>风险等级: ' + (result.riskLevel === 'high' ? '高风险' : result.riskLevel === 'medium' ? '中风险' : '低风险') + '</div>'
    + '</div>'
  );
}

// ============================================================
// 辅助函数
// ============================================================

function updateStatusBadge(text) {
  var badge = document.getElementById('disaster-status-badge');
  if (badge) {
    badge.textContent = text;
  }
}

function saveDisasterTask() {
  showToast('💾 任务保存功能开发中', 'info');
}

function exportDisasterReport() {
  if (!disasterState.assessmentResult) {
    showToast('⚠️ 请先进行灾害评估计算', 'warning');
    return;
  }

  var data = {
    disasterType: disasterState.disasterType,
    location: disasterState.disasterLocation,
    params: disasterState.disasterType === 'debris_flow'
      ? disasterState.debrisFlowParams
      : disasterState.earthquakeParams,
    result: disasterState.assessmentResult,
    timestamp: new Date().toISOString()
  };

  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = 'disaster_assessment_' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);

  showToast('📄 报告已导出', 'success');
}

// Toast 提示函数（如果未定义则使用简单实现）
function showToast(message, type) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  } else {
    console.log('[' + type + '] ' + message);
  }
}