/**
 * 🚚 重车通行评估模块（新版）
 *
 * 布局：页面内路由切换，替换原有大屏内容
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 顶部标题栏：重车通行评估任务 + 返回首页/保存/导出              │
 * ├──────────────┬──────────────────────────────┬────────────────┤
 * │ 左侧面板      │      中间 Bigemap GIS 地图    │  右侧面板      │
 * │ (3个卡片)     │      (支持图层切换)           │  (2个卡片)     │
 * │ 1.桥隧选择    │                              │  1.评估结果    │
 * │ 2.车辆设置    │                              │  2.路径规划    │
 * │ 3.算法模型    │                              │                │
 * └──────────────┴──────────────────────────────┴────────────────┘
 *
 * 功能：桥隧选择、车辆参数、评估计算、结果展示、路径规划
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
var hvState = {
  // 评估对象类型: 'bridge' | 'tunnel'
  assessType: 'bridge',
  // 当前选中的桥隧对象
  selectedFacility: null,
  // 车辆参数
  vehicle: null,
  // 评估算法模型
  selectedModel: 'default',
  // 评估结果
  assessmentResult: null,
  // 路径规划
  routePlan: null,
  // 任务状态: 'idle' | 'calculating' | 'completed' | 'error'
  taskStatus: 'idle',
  // 地图拾取模式
  mapPickMode: false,
  // 起点/终点
  routeStart: null,
  routeEnd: null,
  // 路径规划约束
  routeConstraints: {
    avoidForbidden: true,
    maxWeight: null,
    maxHeight: null,
    maxWidth: null,
    preferHighway: false
  }
};

// 保存原始DOM结构，用于返回首页时恢复
var originalAppContent = null;
var originalTitle = null;

// ============================================================
// 导出接口
// ============================================================

export function isHeavyVehicleAssessmentActive() {
  return isActive;
}

export function openHeavyVehicleAssessmentModule() {
  if (isActive) return;
  isActive = true;

  // 添加body类，用于调整图层抽屉位置
  document.body.classList.add('hv-assessment-active');

  // 保存原始内容
  var app = document.getElementById('app');
  if (app) {
    originalAppContent = app.innerHTML;
  }
  originalTitle = document.title;
  document.title = '重车通行评估任务 - 交通网络安全韧性评估及可视化决策平台';

  // 初始化默认车辆
  hvState.vehicle = getDefaultVehicle();
  hvState.assessType = 'bridge';
  hvState.selectedFacility = null;
  hvState.assessmentResult = null;
  hvState.routePlan = null;
  hvState.taskStatus = 'idle';
  hvState.mapPickMode = false;
  hvState.routeStart = null;
  hvState.routeEnd = null;

  // 构建新布局
  buildAssessmentLayout();

  // 绑定事件
  bindAssessmentEvents();

  // 延迟初始化和渲染，确保DOM完全渲染
  setTimeout(function() {
    // 初始化地图
    initAssessmentMap();

    // 显示首页图层控制面板
    showHomePageLayerControl();

    // 渲染左侧面板
    renderLeftPanel();

    // 渲染右侧面板
    renderRightPanel();
  }, 100);

  showToast('🚚 已进入重车通行评估任务', 'info');
}

export function closeHeavyVehicleAssessmentModule() {
  if (!isActive) return;
  isActive = false;

  // 移除body类
  document.body.classList.remove('hv-assessment-active');

  // 隐藏首页图层控制抽屉
  var layerDrawer = document.getElementById('layer-drawer');
  if (layerDrawer) {
    layerDrawer.classList.remove('open');
    // 移除重车评估结果图层选项
    var hvOption = layerDrawer.querySelector('.hv-assessment-layer-option');
    if (hvOption) {
      hvOption.remove();
    }
  }

  // 清理评估结果标记
  clearAssessmentResultMarkers();

  // 清理地图实例
  if (assessmentMap) {
    try {
      assessmentMap.remove();
    } catch(e) {}
    assessmentMap = null;
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
// 构建评估模块布局
// ============================================================

function buildAssessmentLayout() {
  var app = document.getElementById('app');
  if (!app) return;

  app.innerHTML = ''
    // === 顶部标题栏 ===
    + '<header id="hv-assess-header">'
    + '  <div class="hv-assess-header-left">'
    + '    <button class="hv-assess-back-btn" id="hv-assess-btn-back">← 返回首页</button>'
    + '    <span class="hv-assess-header-title">🚚 重车通行评估任务</span>'
    + '    <span class="hv-assess-status-badge" id="hv-assess-status-badge">未开始</span>'
    + '  </div>'
    + '  <div class="hv-assess-header-right">'
    + '    <button class="hv-assess-header-btn" id="hv-assess-btn-save">💾 保存任务</button>'
    + '    <button class="hv-assess-header-btn" id="hv-assess-btn-export">📄 导出报告</button>'
    + '  </div>'
    + '</header>'
    // === 主体区域 ===
    + '<div id="hv-assess-body">'
    // 左侧面板
    + '  <div id="hv-assess-left-panel">'
    + '    <div class="hv-assess-card" id="hv-card-facility">'
    + '      <div class="hv-assess-card-header">'
    + '        <span>🌉 桥隧选择与基础参数</span>'
    + '      </div>'
    + '      <div class="hv-assess-card-body" id="hv-facility-body"></div>'
    + '    </div>'
    + '    <div class="hv-assess-card" id="hv-card-vehicle">'
    + '      <div class="hv-assess-card-header">'
    + '        <span>🚛 重载车辆设置</span>'
    + '      </div>'
    + '      <div class="hv-assess-card-body" id="hv-vehicle-body"></div>'
    + '    </div>'
    + '    <div class="hv-assess-card" id="hv-card-model">'
    + '      <div class="hv-assess-card-header">'
    + '        <span>⚙️ 评估算法模型设置</span>'
    + '      </div>'
    + '      <div class="hv-assess-card-body" id="hv-model-body"></div>'
    + '    </div>'
    + '  </div>'
    // 中间地图
    + '  <div id="hv-assess-map-container">'
    + '    <div id="map"></div>'
    + '    <div id="hv-assess-map-pick-hint" style="display:none;">🖱️ 请在地图上点选桥隧位置</div>'
    // 地图控制按钮（复用首页样式）
    + '    <div id="hv-assess-map-controls">'
    + '      <button class="hv-map-ctrl-btn" id="hv-btn-zoom-in" title="放大">＋</button>'
    + '      <button class="hv-map-ctrl-btn" id="hv-btn-zoom-out" title="缩小">−</button>'
    + '      <div class="hv-map-ctrl-divider"></div>'
    + '      <button class="hv-map-ctrl-btn" id="hv-btn-layer-control" title="图层控制中枢">🗺️</button>'
    + '    </div>'
    + '  </div>'
    // 右侧面板
    + '  <div id="hv-assess-right-panel">'
    + '    <div class="hv-assess-card" id="hv-card-result">'
    + '      <div class="hv-assess-card-header">'
    + '        <span>📊 桥隧评估结果</span>'
    + '      </div>'
    + '      <div class="hv-assess-card-body" id="hv-result-body"></div>'
    + '    </div>'
    + '    <div class="hv-assess-card" id="hv-card-route">'
    + '      <div class="hv-assess-card-header">'
    + '        <span>🛤️ 保通路径规划设置</span>'
    + '      </div>'
    + '      <div class="hv-assess-card-body" id="hv-route-body"></div>'
    + '    </div>'
    + '  </div>'
    + '</div>';
}

// ============================================================
// 事件绑定
// ============================================================

function bindAssessmentEvents() {
  // 返回首页
  document.getElementById('hv-assess-btn-back')?.addEventListener('click', closeHeavyVehicleAssessmentModule);

  // 保存任务
  document.getElementById('hv-assess-btn-save')?.addEventListener('click', saveAssessmentTask);

  // 导出报告
  document.getElementById('hv-assess-btn-export')?.addEventListener('click', exportAssessmentReport);

  // 地图控制按钮
  document.getElementById('hv-btn-zoom-in')?.addEventListener('click', function() {
    if (assessmentMap) assessmentMap.zoomIn();
  });

  document.getElementById('hv-btn-zoom-out')?.addEventListener('click', function() {
    if (assessmentMap) assessmentMap.zoomOut();
  });

  // 图层控制按钮
  var layerBtn = document.getElementById('hv-btn-layer-control');
  var drawer = document.getElementById('layer-drawer');

  console.log('图层按钮:', layerBtn);
  console.log('图层抽屉:', drawer);

  if (layerBtn && drawer) {
    layerBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      console.log('点击图层按钮');
      var isOpen = drawer.classList.contains('open');
      console.log('当前状态:', isOpen ? '打开' : '关闭');
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
  } else {
    console.warn('图层按钮或抽屉未找到');
  }
}

// ============================================================
// 地图初始化
// ============================================================

var assessmentMap = null;
var assessmentBaseLayer = null;

// Bigemap 配置（与首页一致）
var BIGEMAP_SERVER_URL = 'http://127.0.0.1:9000';
var BIGEMAP_ACCESS_TOKEN = 'pk.eyJ1IjoiY3VzXzB2eTFlYXA5IiwiYSI6ImVnNWdxbGtkbjNhY24wbGFybmZlY25qbGkifQ.ZAg23qtH2mD4eClfKElqaQ';
var BIGEMAP_LAYER_IDS = {
  electronic: 'bigemap.7i2bexkr',
  satellite: 'bigemap.5grpf9us'
};

function initAssessmentMap() {
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
  assessmentMap = L.map('map', {
    center: [30.18, 107.74],
    zoom: 12,
    zoomControl: false,
    attributionControl: false,
    fadeAnimation: true,
    zoomAnimation: true
  });

  // 加载Bigemap卫星底图（与首页一致的方式）
  var satelliteUrl = BIGEMAP_SERVER_URL + '/' + BIGEMAP_LAYER_IDS.satellite + '/tiles/{z}/{x}/{y}.png?access_token=' + BIGEMAP_ACCESS_TOKEN;
  assessmentBaseLayer = L.tileLayer(satelliteUrl, {
    maxZoom: 12,
    minZoom: 6,
    attribution: '',
    subdomains: []
  }).addTo(assessmentMap);

  // 绑定地图点击事件（桥隧拾取）
  assessmentMap.on('click', handleMapClick);

  // 刷新地图尺寸
  requestAnimationFrame(function() {
    assessmentMap.invalidateSize();
    setTimeout(function() {
      assessmentMap.invalidateSize();
    }, 300);
  });
}

// 显示首页图层控制面板
function showHomePageLayerControl() {
  // 查找首页的图层控制抽屉
  var layerDrawer = document.getElementById('layer-drawer');
  if (layerDrawer) {
    layerDrawer.classList.add('open');
    // 添加重车评估结果图层选项
    addHVAssessmentLayerOption(layerDrawer);
  }
}

// 添加重车评估结果图层选项
function addHVAssessmentLayerOption(drawer) {
  // 检查是否已添加
  if (drawer.querySelector('.hv-assessment-layer-option')) return;

  var option = document.createElement('div');
  option.className = 'layer-item hv-assessment-layer-option';
  option.setAttribute('data-layer', 'hv-assessment');
  option.innerHTML = ''
    + '<span class="layer-toggle"></span>'
    + '<span class="layer-dot" style="background:#38BDF8;"></span>'
    + '<span>重车评估结果</span>';
  drawer.appendChild(option);

  // 绑定事件
  option.addEventListener('click', function() {
    var toggle = option.querySelector('.layer-toggle');
    toggle.classList.toggle('active');
    var active = toggle.classList.contains('active');
    toggleHVAssessmentResultLayer(active);
  });
}

// 切换重车评估结果图层
var hvAssessmentMarkers = [];

function toggleHVAssessmentResultLayer(visible) {
  if (!assessmentMap) return;

  if (visible) {
    // 显示评估结果标记
    if (hvState.assessmentResult && hvState.selectedFacility) {
      addAssessmentResultMarker();
    }
  } else {
    // 清除评估结果标记
    clearAssessmentResultMarkers();
  }
}

function addAssessmentResultMarker() {
  if (!assessmentMap || !hvState.selectedFacility) return;

  var facility = hvState.selectedFacility;
  var result = hvState.assessmentResult;

  // 根据评估结果选择颜色
  var color = result && result.canPass ? '#4ADE80' : '#F87171';
  var marker = L.circleMarker([facility.latitude, facility.longitude], {
    radius: 12,
    fillColor: color,
    color: color,
    weight: 2,
    opacity: 1,
    fillOpacity: 0.6
  }).addTo(assessmentMap);

  marker.bindPopup(''
    + '<div style="font-size:12px;">'
    + '  <div style="font-weight:600;margin-bottom:4px;">' + facility.name + '</div>'
    + '  <div>评估结果: ' + (result && result.canPass ? '✅ 可通行' : '❌ 不可通行') + '</div>'
    + '  <div>总重: ' + (hvState.vehicle.totalWeightT || '-') + 't</div>'
    + '</div>'
  );

  hvAssessmentMarkers.push(marker);
}

function clearAssessmentResultMarkers() {
  hvAssessmentMarkers.forEach(function(marker) {
    try {
      assessmentMap.removeLayer(marker);
    } catch(e) {}
  });
  hvAssessmentMarkers = [];
}

function handleMapClick(e) {
  if (!hvState.mapPickMode) return;

  var lat = e.latlng.lat;
  var lng = e.latlng.lng;

  // 退出拾取模式
  hvState.mapPickMode = false;
  document.getElementById('hv-assess-map-pick-hint').style.display = 'none';
  document.body.style.cursor = '';

  // 创建临时桥隧对象
  var facility = {
    facilityId: 'FAC_' + Date.now(),
    facilityType: hvState.assessType,
    name: '地图点选-' + (hvState.assessType === 'bridge' ? '桥梁' : '隧道'),
    longitude: lng,
    latitude: lat,
    limitWeightT: null,
    limitHeightM: null,
    limitWidthM: null,
    structureType: '',
    designLoad: '',
    lanes: null,
    lengthM: null
  };

  hvState.selectedFacility = facility;
  renderLeftPanel();
  showToast('✅ 已从地图选取位置: ' + lat.toFixed(4) + ', ' + lng.toFixed(4), 'success');

  // 添加临时标记
  addHVFacilityMarker(facility);
}

// ============================================================
// 左侧面板渲染
// ============================================================

function renderLeftPanel() {
  renderFacilityCard();
  renderVehicleCard();
  renderModelCard();
}

// --- 卡片1: 桥隧选择与基础参数 ---
function renderFacilityCard() {
  var body = document.getElementById('hv-facility-body');
  if (!body) return;

  var isBridge = hvState.assessType === 'bridge';
  var f = hvState.selectedFacility;

  var html = ''
    // 评估对象切换
    + '<div class="hv-assess-form-row">'
    + '  <label class="hv-assess-radio-label">'
    + '    <input type="radio" name="assess-type" value="bridge"' + (isBridge ? ' checked' : '') + ' /> 桥梁评估'
    + '  </label>'
    + '  <label class="hv-assess-radio-label">'
    + '    <input type="radio" name="assess-type" value="tunnel"' + (!isBridge ? ' checked' : '') + ' /> 隧道评估'
    + '  </label>'
    + '</div>'
    // 选择方式
    + '<div class="hv-assess-form-group">'
    + '  <label class="hv-assess-label">选择方式</label>'
    + '  <select class="hv-assess-select" id="hv-facility-select">'
    + '    <option value="">-- 请选择 --</option>'
    + '    <option value="search">🔍 名称检索</option>'
    + '    <option value="map">🗺️ 地图点选</option>'
    + '    <option value="db">🗄️ 从数据库导入</option>'
    + '  </select>'
    + '</div>';

  // 名称检索输入框（动态显示）
  html += '<div class="hv-assess-form-group" id="hv-facility-search-group" style="display:none;">'
    + '  <label class="hv-assess-label">桥隧名称</label>'
    + '  <div style="display:flex;gap:4px;">'
    + '    <input class="hv-assess-input" id="hv-facility-search-input" placeholder="输入名称模糊检索..." />'
    + '    <button class="hv-assess-btn-sm" id="hv-facility-search-btn">🔍</button>'
    + '  </div>'
    + '  <div id="hv-facility-search-results" style="margin-top:4px;"></div>'
    + '</div>';

  // 已选对象信息
  if (f) {
    html += '<div class="hv-assess-facility-info">'
      + '  <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">已选对象</div>'
      + '  <div style="font-size:13px;font-weight:600;color:var(--accent-cyan);">' + (f.name || '未命名') + '</div>'
      + '  <div style="font-size:10px;color:var(--text-muted);">' + (f.roadRef || '-') + ' / ' + (f.districtName || '-') + '</div>'
      + '</div>';

    // 桥隧参数表单
    html += '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:8px;">'
      + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">📋 基础参数</div>';

    if (isBridge) {
      html += buildBridgeForm(f);
    } else {
      html += buildTunnelForm(f);
    }

    html += '</div>';
  } else {
    html += '<div class="hv-assess-empty">'
      + '  <div style="font-size:24px;margin-bottom:4px;">🌉</div>'
      + '  <div>请选择评估对象</div>'
      + '</div>';
  }

  body.innerHTML = html;

  // 绑定评估对象切换事件
  body.querySelectorAll('input[name="assess-type"]').forEach(function(radio) {
    radio.addEventListener('change', function() {
      hvState.assessType = this.value;
      hvState.selectedFacility = null;
      hvState.assessmentResult = null;
      renderLeftPanel();
      renderRightPanel();
    });
  });

  // 绑定选择方式事件
  var selectEl = document.getElementById('hv-facility-select');
  if (selectEl) {
    selectEl.addEventListener('change', function() {
      var mode = this.value;
      var searchGroup = document.getElementById('hv-facility-search-group');
      if (mode === 'search') {
        searchGroup.style.display = 'block';
      } else {
        searchGroup.style.display = 'none';
      }
      if (mode === 'map') {
        activateMapPickMode();
      }
      if (mode === 'db') {
        loadFacilityFromDatabase();
      }
    });
  }

  // 绑定搜索事件
  var searchBtn = document.getElementById('hv-facility-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', searchFacilityByName);
  }
  var searchInput = document.getElementById('hv-facility-search-input');
  if (searchInput) {
    searchInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') searchFacilityByName();
    });
  }

  // 绑定表单输入事件（实时更新selectedFacility）
  bindFacilityFormEvents();
}

function buildBridgeForm(f) {
  return ''
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">跨径 (m)</label>'
    + '    <input class="hv-assess-input" id="hv-bridge-span" type="number" value="' + (f.spanM || '') + '" placeholder="跨径" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">结构形式</label>'
    + '    <select class="hv-assess-select" id="hv-bridge-structure">'
    + '      <option value="">-- 请选择 --</option>'
    + '      <option value="beam"' + (f.structureType === 'beam' ? ' selected' : '') + '>梁桥</option>'
    + '      <option value="arch"' + (f.structureType === 'arch' ? ' selected' : '') + '>拱桥</option>'
    + '      <option value="suspension"' + (f.structureType === 'suspension' ? ' selected' : '') + '>悬索桥</option>'
    + '      <option value="cable-stayed"' + (f.structureType === 'cable-stayed' ? ' selected' : '') + '>斜拉桥</option>'
    + '      <option value="truss"' + (f.structureType === 'truss' ? ' selected' : '') + '>桁架桥</option>'
    + '    </select>'
    + '  </div>'
    + '</div>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">设计荷载</label>'
    + '    <input class="hv-assess-input" id="hv-bridge-design-load" value="' + (f.designLoad || '') + '" placeholder="如：公路-I级" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">通车年限</label>'
    + '    <input class="hv-assess-input" id="hv-bridge-age" type="number" value="' + (f.serviceYears || '') + '" placeholder="年" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">健康评分</label>'
    + '    <input class="hv-assess-input" id="hv-bridge-health" type="number" min="0" max="100" value="' + (f.healthScore || '') + '" placeholder="0-100" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">车道数</label>'
    + '    <input class="hv-assess-input" id="hv-bridge-lanes" type="number" value="' + (f.lanes || '') + '" placeholder="车道数" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">限重 (t)</label>'
    + '    <input class="hv-assess-input" id="hv-bridge-limit-weight" type="number" value="' + (f.limitWeightT || '') + '" placeholder="吨" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">净宽 (m)</label>'
    + '    <input class="hv-assess-input" id="hv-bridge-width" type="number" value="' + (f.limitWidthM || '') + '" placeholder="米" />'
    + '  </div>'
    + '</div>';
}

function buildTunnelForm(f) {
  return ''
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">隧道类型</label>'
    + '    <select class="hv-assess-select" id="hv-tunnel-type">'
    + '      <option value="">-- 请选择 --</option>'
    + '      <option value="mountain"' + (f.tunnelType === 'mountain' ? ' selected' : '') + '>山岭隧道</option>'
    + '      <option value="urban"' + (f.tunnelType === 'urban' ? ' selected' : '') + '>城市隧道</option>'
    + '      <option value="underwater"' + (f.tunnelType === 'underwater' ? ' selected' : '') + '>水下隧道</option>'
    + '    </select>'
    + '  </div>'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">设计荷载</label>'
    + '    <input class="hv-assess-input" id="hv-tunnel-design-load" value="' + (f.designLoad || '') + '" placeholder="如：公路-I级" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">限高 (m)</label>'
    + '    <input class="hv-assess-input" id="hv-tunnel-limit-height" type="number" value="' + (f.limitHeightM || '') + '" placeholder="米" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">限宽 (m)</label>'
    + '    <input class="hv-assess-input" id="hv-tunnel-limit-width" type="number" value="' + (f.limitWidthM || '') + '" placeholder="米" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">净空 (m)</label>'
    + '    <input class="hv-assess-input" id="hv-tunnel-clearance" type="number" value="' + (f.clearanceM || '') + '" placeholder="米" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group" style="flex:1;">'
    + '    <label class="hv-assess-label">衬砌状态</label>'
    + '    <select class="hv-assess-select" id="hv-tunnel-lining">'
    + '      <option value="">-- 请选择 --</option>'
    + '      <option value="good"' + (f.liningStatus === 'good' ? ' selected' : '') + '>良好</option>'
    + '      <option value="fair"' + (f.liningStatus === 'fair' ? ' selected' : '') + '>一般</option>'
    + '      <option value="poor"' + (f.liningStatus === 'poor' ? ' selected' : '') + '>较差</option>'
    + '      <option value="bad"' + (f.liningStatus === 'bad' ? ' selected' : '') + '>严重</option>'
    + '    </select>'
    + '  </div>'
    + '</div>';
}

function bindFacilityFormEvents() {
  var f = hvState.selectedFacility;
  if (!f) return;

  var inputs = document.querySelectorAll('#hv-facility-body input, #hv-facility-body select');
  inputs.forEach(function(input) {
    input.addEventListener('change', function() {
      updateFacilityFromForm();
    });
  });
}

function updateFacilityFromForm() {
  var f = hvState.selectedFacility;
  if (!f) return;

  if (hvState.assessType === 'bridge') {
    f.spanM = parseFloat(document.getElementById('hv-bridge-span')?.value) || null;
    f.structureType = document.getElementById('hv-bridge-structure')?.value || '';
    f.designLoad = document.getElementById('hv-bridge-design-load')?.value || '';
    f.serviceYears = parseInt(document.getElementById('hv-bridge-age')?.value) || null;
    f.healthScore = parseFloat(document.getElementById('hv-bridge-health')?.value) || null;
    f.lanes = parseInt(document.getElementById('hv-bridge-lanes')?.value) || null;
    f.limitWeightT = parseFloat(document.getElementById('hv-bridge-limit-weight')?.value) || null;
    f.limitWidthM = parseFloat(document.getElementById('hv-bridge-width')?.value) || null;
  } else {
    f.tunnelType = document.getElementById('hv-tunnel-type')?.value || '';
    f.designLoad = document.getElementById('hv-tunnel-design-load')?.value || '';
    f.limitHeightM = parseFloat(document.getElementById('hv-tunnel-limit-height')?.value) || null;
    f.limitWidthM = parseFloat(document.getElementById('hv-tunnel-limit-width')?.value) || null;
    f.clearanceM = parseFloat(document.getElementById('hv-tunnel-clearance')?.value) || null;
    f.liningStatus = document.getElementById('hv-tunnel-lining')?.value || '';
  }
}

function activateMapPickMode() {
  hvState.mapPickMode = true;
  document.getElementById('hv-assess-map-pick-hint').style.display = 'block';
  document.body.style.cursor = 'crosshair';
  showToast('🖱️ 请点击地图上的桥隧位置', 'info');
}

function loadFacilityFromDatabase() {
  showToast('🗄️ 正在从数据库加载桥隧列表...', 'info');
  // 模拟加载数据
  setTimeout(function() {
    var mockFacilities = [
      { facilityId: 'B001', facilityType: 'bridge', name: '万州长江大桥', roadRef: 'G42', districtName: '万州区', longitude: 108.4, latitude: 30.8, limitWeightT: 55, limitHeightM: null, limitWidthM: null, structureType: 'suspension', designLoad: '公路-I级', serviceYears: 15, healthScore: 85, lanes: 4 },
      { facilityId: 'B002', facilityType: 'bridge', name: '涪陵乌江大桥', roadRef: 'G319', districtName: '涪陵区', longitude: 107.4, latitude: 29.7, limitWeightT: 40, limitHeightM: null, limitWidthM: null, structureType: 'arch', designLoad: '公路-II级', serviceYears: 25, healthScore: 72, lanes: 2 },
      { facilityId: 'T001', facilityType: 'tunnel', name: '铁峰山隧道', roadRef: 'G42', districtName: '万州区', longitude: 108.2, latitude: 30.7, limitWeightT: null, limitHeightM: 5.0, limitWidthM: 9.5, tunnelType: 'mountain', designLoad: '公路-I级', clearanceM: 5.2, liningStatus: 'good' }
    ];

    var resultsDiv = document.getElementById('hv-facility-search-results');
    if (resultsDiv) {
      var html = '<div style="max-height:120px;overflow-y:auto;border:1px solid rgba(56,189,248,0.1);border-radius:4px;margin-top:4px;">';
      mockFacilities.forEach(function(item) {
        html += '<div class="hv-assess-search-item" data-id="' + item.facilityId + '" style="padding:6px 8px;cursor:pointer;border-bottom:1px solid rgba(56,189,248,0.05);font-size:11px;">'
          + '<div style="font-weight:500;">' + item.name + '</div>'
          + '<div style="color:var(--text-muted);font-size:10px;">' + (item.roadRef || '-') + ' / ' + (item.districtName || '-') + '</div>'
          + '</div>';
      });
      html += '</div>';
      resultsDiv.innerHTML = html;

      // 绑定点击选择事件
      resultsDiv.querySelectorAll('.hv-assess-search-item').forEach(function(item) {
        item.addEventListener('click', function() {
          var id = this.dataset.id;
          var selected = mockFacilities.find(function(f) { return f.facilityId === id; });
          if (selected) {
            hvState.selectedFacility = selected;
            hvState.assessType = selected.facilityType;
            renderLeftPanel();
            showToast('✅ 已选择: ' + selected.name, 'success');
          }
        });
      });
    }
  }, 500);
}

function searchFacilityByName() {
  var keyword = document.getElementById('hv-facility-search-input')?.value?.trim();
  if (!keyword) {
    showToast('请输入桥隧名称', 'warning');
    return;
  }
  loadFacilityFromDatabase();
}

// --- 卡片2: 重载车辆设置 ---
function renderVehicleCard() {
  var body = document.getElementById('hv-vehicle-body');
  if (!body) return;

  var v = hvState.vehicle;

  body.innerHTML = ''
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group" style="flex:2;">'
    + '    <label class="hv-assess-label">车辆名称</label>'
    + '    <input class="hv-assess-input" id="hv-v-name" value="' + (v.vehicleName || '') + '" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">类型</label>'
    + '    <select class="hv-assess-select" id="hv-v-type">'
    + '      <option value="heavy_truck"' + (v.vehicleType === 'heavy_truck' ? ' selected' : '') + '>重载货车</option>'
    + '      <option value="heavy_cargo"' + (v.vehicleType === 'heavy_cargo' ? ' selected' : '') + '>大件运输车</option>'
    + '      <option value="special"' + (v.vehicleType === 'special' ? ' selected' : '') + '>特种运输车</option>'
    + '    </select>'
    + '  </div>'
    + '</div>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">总重 (t) <span style="color:#F87171;">*</span></label>'
    + '    <input class="hv-assess-input" type="number" id="hv-v-weight" value="' + v.totalWeightT + '" step="0.5" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">轴数</label>'
    + '    <input class="hv-assess-input" type="number" id="hv-v-axles" value="' + v.axleCount + '" min="2" max="12" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">车牌号</label>'
    + '    <input class="hv-assess-input" id="hv-v-plate" value="' + (v.plateNumber || '') + '" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">车长 (m)</label>'
    + '    <input class="hv-assess-input" type="number" id="hv-v-length" value="' + v.lengthM + '" step="0.1" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">车宽 (m)</label>'
    + '    <input class="hv-assess-input" type="number" id="hv-v-width" value="' + v.widthM + '" step="0.01" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">车高 (m)</label>'
    + '    <input class="hv-assess-input" type="number" id="hv-v-height" value="' + v.heightM + '" step="0.01" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">转弯半径 (m)</label>'
    + '    <input class="hv-assess-input" type="number" id="hv-v-radius" value="' + (v.turningRadiusM || 15) + '" step="0.5" />'
    + '  </div>'
    + '</div>'
    + '<div style="margin-top:8px;">'
    + '  <button class="hv-assess-btn-secondary" id="hv-v-detail-btn" style="width:100%;">📋 详细参数设置</button>'
    + '</div>';

  // 绑定车辆参数事件
  bindVehicleFormEvents();
}

function bindVehicleFormEvents() {
  var inputs = ['hv-v-name', 'hv-v-type', 'hv-v-weight', 'hv-v-axles', 'hv-v-plate', 'hv-v-length', 'hv-v-width', 'hv-v-height', 'hv-v-radius'];
  inputs.forEach(function(id) {
    var el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', updateVehicleFromForm);
    }
  });

  // 详细参数弹窗
  var detailBtn = document.getElementById('hv-v-detail-btn');
  if (detailBtn) {
    detailBtn.addEventListener('click', openVehicleDetailDialog);
  }
}

function updateVehicleFromForm() {
  var v = hvState.vehicle;
  v.vehicleName = document.getElementById('hv-v-name')?.value || v.vehicleName;
  v.vehicleType = document.getElementById('hv-v-type')?.value || v.vehicleType;
  v.totalWeightT = parseFloat(document.getElementById('hv-v-weight')?.value) || v.totalWeightT;
  v.axleCount = parseInt(document.getElementById('hv-v-axles')?.value) || v.axleCount;
  v.plateNumber = document.getElementById('hv-v-plate')?.value || '';
  v.lengthM = parseFloat(document.getElementById('hv-v-length')?.value) || v.lengthM;
  v.widthM = parseFloat(document.getElementById('hv-v-width')?.value) || v.widthM;
  v.heightM = parseFloat(document.getElementById('hv-v-height')?.value) || v.heightM;
  v.turningRadiusM = parseFloat(document.getElementById('hv-v-radius')?.value) || v.turningRadiusM;
}

function openVehicleDetailDialog() {
  var v = hvState.vehicle;
  var overlay = document.createElement('div');
  overlay.className = 'hv-assess-modal-overlay';
  overlay.id = 'hv-vehicle-modal';

  var dialog = document.createElement('div');
  dialog.className = 'hv-assess-modal-dialog';
  dialog.style.width = '480px';
  dialog.innerHTML = ''
    + '<h3 style="margin:0 0 12px 0;font-size:14px;color:var(--accent-cyan);">🚛 车辆详细参数</h3>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group" style="flex:2;">'
    + '    <label class="hv-assess-label">车辆名称</label>'
    + '    <input class="hv-assess-input" id="hv-vd-name" value="' + (v.vehicleName || '') + '" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">类型</label>'
    + '    <select class="hv-assess-select" id="hv-vd-type">'
    + '      <option value="heavy_truck"' + (v.vehicleType === 'heavy_truck' ? ' selected' : '') + '>重载货车</option>'
    + '      <option value="heavy_cargo"' + (v.vehicleType === 'heavy_cargo' ? ' selected' : '') + '>大件运输车</option>'
    + '      <option value="special"' + (v.vehicleType === 'special' ? ' selected' : '') + '>特种运输车</option>'
    + '    </select>'
    + '  </div>'
    + '</div>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">车牌号</label>'
    + '    <input class="hv-assess-input" id="hv-vd-plate" value="' + (v.plateNumber || '') + '" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">总重 (t) <span style="color:#F87171;">*</span></label>'
    + '    <input class="hv-assess-input" type="number" id="hv-vd-weight" value="' + v.totalWeightT + '" step="0.5" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">轴数</label>'
    + '    <input class="hv-assess-input" type="number" id="hv-vd-axles" value="' + v.axleCount + '" min="2" max="12" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">车长 (m)</label>'
    + '    <input class="hv-assess-input" type="number" id="hv-vd-length" value="' + v.lengthM + '" step="0.1" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">车宽 (m)</label>'
    + '    <input class="hv-assess-input" type="number" id="hv-vd-width" value="' + v.widthM + '" step="0.01" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">车高 (m)</label>'
    + '    <input class="hv-assess-input" type="number" id="hv-vd-height" value="' + v.heightM + '" step="0.01" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-assess-form-row">'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">转弯半径 (m)</label>'
    + '    <input class="hv-assess-input" type="number" id="hv-vd-radius" value="' + (v.turningRadiusM || 15) + '" step="0.5" />'
    + '  </div>'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">货物类型</label>'
    + '    <input class="hv-assess-input" id="hv-vd-cargo" value="' + (v.cargoType || '') + '" />'
    + '  </div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;">'
    + '  <button class="hv-assess-btn-secondary" id="hv-vd-cancel">取消</button>'
    + '  <button class="hv-assess-btn-primary" id="hv-vd-save">保存</button>'
    + '</div>';

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  document.getElementById('hv-vd-cancel').addEventListener('click', closeVehicleDialog);
  document.getElementById('hv-vd-save').addEventListener('click', function() {
    v.vehicleName = document.getElementById('hv-vd-name').value || v.vehicleName;
    v.vehicleType = document.getElementById('hv-vd-type').value;
    v.plateNumber = document.getElementById('hv-vd-plate').value || '';
    v.totalWeightT = parseFloat(document.getElementById('hv-vd-weight').value) || v.totalWeightT;
    v.axleCount = parseInt(document.getElementById('hv-vd-axles').value) || v.axleCount;
    v.lengthM = parseFloat(document.getElementById('hv-vd-length').value) || v.lengthM;
    v.widthM = parseFloat(document.getElementById('hv-vd-width').value) || v.widthM;
    v.heightM = parseFloat(document.getElementById('hv-vd-height').value) || v.heightM;
    v.turningRadiusM = parseFloat(document.getElementById('hv-vd-radius').value) || v.turningRadiusM;
    v.cargoType = document.getElementById('hv-vd-cargo').value || '';

    renderVehicleCard();
    closeVehicleDialog();
    showToast('✅ 车辆参数已更新', 'success');
  });

  function closeVehicleDialog() {
    var ov = document.getElementById('hv-vehicle-modal');
    if (ov) ov.remove();
    if (dialog.parentNode) dialog.remove();
  }
}

// --- 卡片3: 评估算法模型设置 ---
function renderModelCard() {
  var body = document.getElementById('hv-model-body');
  if (!body) return;

  var canCalculate = canRunAssessment();

  body.innerHTML = ''
    + '<div class="hv-assess-form-group">'
    + '  <label class="hv-assess-label">评估模型</label>'
    + '  <select class="hv-assess-select" id="hv-model-select">'
    + '    <option value="default"' + (hvState.selectedModel === 'default' ? ' selected' : '') + '>默认综合评估模型</option>'
    + '    <option value="load-capacity"' + (hvState.selectedModel === 'load-capacity' ? ' selected' : '') + '>承载能力评估模型</option>'
    + '    <option value="dimension-check"' + (hvState.selectedModel === 'dimension-check' ? ' selected' : '') + '>尺寸限界检查模型</option>'
    + '    <option value="health-based"' + (hvState.selectedModel === 'health-based' ? ' selected' : '') + '>健康状态评估模型</option>'
    + '  </select>'
    + '</div>'
    + '<div style="margin-top:6px;">'
    + '  <button class="hv-assess-btn-sm" id="hv-model-detail-btn" style="width:100%;">📖 查看模型详细介绍</button>'
    + '</div>'
    + '<div style="margin-top:12px;border-top:1px solid rgba(56,189,248,0.1);padding-top:12px;">'
    + '  <button class="hv-assess-btn-calculate" id="hv-calculate-btn"' + (canCalculate ? '' : ' disabled') + '>'
    + '    ⚡ 模拟计算'
    + '  </button>'
    + '  <div id="hv-calculate-progress" style="display:none;margin-top:8px;">'
    + '    <div class="hv-assess-progress-bar">'
    + '      <div class="hv-assess-progress-fill" id="hv-progress-fill"></div>'
    + '    </div>'
    + '    <div class="hv-assess-progress-text" id="hv-progress-text">准备中...</div>'
    + '  </div>'
    + '</div>';

  // 绑定模型选择事件
  var modelSelect = document.getElementById('hv-model-select');
  if (modelSelect) {
    modelSelect.addEventListener('change', function() {
      hvState.selectedModel = this.value;
    });
  }

  // 模型详细介绍
  var detailBtn = document.getElementById('hv-model-detail-btn');
  if (detailBtn) {
    detailBtn.addEventListener('click', showModelDetail);
  }

  // 模拟计算
  var calcBtn = document.getElementById('hv-calculate-btn');
  if (calcBtn) {
    calcBtn.addEventListener('click', runAssessmentCalculation);
  }
}

function showModelDetail() {
  var modelDesc = {
    'default': '综合评估模型：结合承载能力、尺寸限界、健康状态等多维度指标，对桥隧通行安全性进行综合评分。适用于一般性评估场景。',
    'load-capacity': '承载能力评估模型：基于桥梁结构力学分析和隧道衬砌状态，重点评估重车荷载对结构安全的影响。适用于超重车辆专项评估。',
    'dimension-check': '尺寸限界检查模型：对比车辆尺寸（高、宽、长）与桥隧限界参数，判断是否存在碰撞风险。适用于大件运输车评估。',
    'health-based': '健康状态评估模型：基于桥隧定期检测数据和健康评分，动态调整限载建议。适用于老旧桥隧或状态较差设施。'
  };

  var desc = modelDesc[hvState.selectedModel] || '暂无介绍';

  var overlay = document.createElement('div');
  overlay.className = 'hv-assess-modal-overlay';
  overlay.id = 'hv-model-modal';

  var dialog = document.createElement('div');
  dialog.className = 'hv-assess-modal-dialog';
  dialog.style.width = '420px';
  dialog.innerHTML = ''
    + '<h3 style="margin:0 0 12px 0;font-size:14px;color:var(--accent-cyan);">📖 模型介绍</h3>'
    + '<div style="font-size:12px;line-height:1.6;color:var(--text-secondary);">' + desc + '</div>'
    + '<div style="display:flex;justify-content:flex-end;margin-top:16px;">'
    + '  <button class="hv-assess-btn-primary" id="hv-model-ok">确定</button>'
    + '</div>';

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  document.getElementById('hv-model-ok').addEventListener('click', function() {
    var ov = document.getElementById('hv-model-modal');
    if (ov) ov.remove();
    if (dialog.parentNode) dialog.remove();
  });
}

// ============================================================
// 评估计算
// ============================================================

function canRunAssessment() {
  var f = hvState.selectedFacility;
  var v = hvState.vehicle;
  if (!f || !v) return false;
  if (!v.totalWeightT || v.totalWeightT <= 0) return false;
  return true;
}

function runAssessmentCalculation() {
  if (!canRunAssessment()) {
    showToast('⚠️ 请先完善桥隧和车辆参数', 'warning');
    return;
  }

  hvState.taskStatus = 'calculating';
  updateStatusBadge();

  var progressDiv = document.getElementById('hv-calculate-progress');
  var fillDiv = document.getElementById('hv-progress-fill');
  var textDiv = document.getElementById('hv-progress-text');
  var calcBtn = document.getElementById('hv-calculate-btn');

  if (progressDiv) progressDiv.style.display = 'block';
  if (calcBtn) calcBtn.disabled = true;

  var steps = [
    { pct: 15, text: '任务提交...', delay: 300 },
    { pct: 40, text: '参数校验...', delay: 600 },
    { pct: 70, text: '模型运算...', delay: 900 },
    { pct: 90, text: '结果生成...', delay: 400 },
    { pct: 100, text: '评估完成', delay: 200 }
  ];

  var currentStep = 0;
  function runStep() {
    if (currentStep >= steps.length) {
      // 计算完成
      var result = performAssessment();
      hvState.assessmentResult = result;
      hvState.taskStatus = 'completed';
      updateStatusBadge();
      renderRightPanel();

      // 地图标记
      if (result.facility) {
        updateHVFacilityMarkerStatus(result.facility.facilityId, result.assessmentStatus);
        addHVAssessmentHighlights([{
          facilityId: result.facility.facilityId,
          name: result.facility.name,
          longitude: result.facility.longitude,
          latitude: result.facility.latitude,
          assessmentStatus: result.assessmentStatus
        }]);
      }

      if (calcBtn) calcBtn.disabled = false;
      showToast('✅ 评估计算完成', 'success');
      return;
    }

    var step = steps[currentStep];
    if (fillDiv) fillDiv.style.width = step.pct + '%';
    if (textDiv) textDiv.textContent = step.text;

    currentStep++;
    setTimeout(runStep, step.delay);
  }

  runStep();
}

function performAssessment() {
  var f = hvState.selectedFacility;
  var v = hvState.vehicle;
  var model = hvState.selectedModel;

  var result = {
    facility: f,
    vehicle: v,
    model: model,
    assessmentStatus: 'unknown',
    assessmentScore: 0,
    conclusion: '',
    exceedItems: [],
    thresholdValues: {},
    vehicleValues: {}
  };

  // 提取阈值
  if (f.facilityType === 'bridge') {
    result.thresholdValues = {
      maxWeight: f.limitWeightT,
      designLoad: f.designLoad,
      lanes: f.lanes,
      width: f.limitWidthM
    };
  } else {
    result.thresholdValues = {
      maxHeight: f.limitHeightM,
      maxWidth: f.limitWidthM,
      clearance: f.clearanceM
    };
  }

  result.vehicleValues = {
    weight: v.totalWeightT,
    height: v.heightM,
    width: v.widthM,
    length: v.lengthM,
    turningRadius: v.turningRadiusM
  };

  // 评估逻辑
  if (f.facilityType === 'bridge') {
    // 桥梁评估
    var limitW = f.limitWeightT;
    if (!limitW || limitW <= 0) {
      result.assessmentStatus = 'unknown';
      result.conclusion = '暂无桥梁限重数据，无法评估';
      result.assessmentScore = 0;
    } else if (v.totalWeightT <= limitW) {
      result.assessmentStatus = 'pass';
      result.conclusion = '车辆总重 ' + v.totalWeightT + 't 未超过桥梁限重 ' + limitW + 't，允许通行';
      result.assessmentScore = 100 - (v.totalWeightT / limitW) * 30;
    } else if (v.totalWeightT <= limitW * 1.1) {
      result.assessmentStatus = 'restricted';
      result.exceedItems.push({
        item: '车辆总重',
        vehicleValue: v.totalWeightT + 't',
        thresholdValue: limitW + 't',
        exceedPercent: ((v.totalWeightT / limitW - 1) * 100).toFixed(1) + '%'
      });
      result.conclusion = '车辆总重 ' + v.totalWeightT + 't 接近桥梁限重 ' + limitW + 't，建议限载通行';
      result.assessmentScore = Math.max(30, 70 - ((v.totalWeightT / limitW - 1) * 100));
    } else {
      result.assessmentStatus = 'forbidden';
      result.exceedItems.push({
        item: '车辆总重',
        vehicleValue: v.totalWeightT + 't',
        thresholdValue: limitW + 't',
        exceedPercent: ((v.totalWeightT / limitW - 1) * 100).toFixed(1) + '%'
      });
      result.conclusion = '车辆总重 ' + v.totalWeightT + 't 超过桥梁限重 ' + limitW + 't，禁止通行';
      result.assessmentScore = Math.max(10, 30 - ((v.totalWeightT / limitW - 1) * 20));
    }

    // 宽度检查
    if (f.limitWidthM && v.widthM > f.limitWidthM) {
      result.exceedItems.push({
        item: '车辆宽度',
        vehicleValue: v.widthM + 'm',
        thresholdValue: f.limitWidthM + 'm',
        exceedPercent: ((v.widthM / f.limitWidthM - 1) * 100).toFixed(1) + '%'
      });
      if (result.assessmentStatus === 'pass') {
        result.assessmentStatus = 'restricted';
        result.conclusion += '；车宽超过限宽';
        result.assessmentScore = 60;
      }
    }
  } else {
    // 隧道评估
    var limitH = f.limitHeightM;
    var limitW = f.limitWidthM;

    if ((!limitH || limitH <= 0) && (!limitW || limitW <= 0)) {
      result.assessmentStatus = 'unknown';
      result.conclusion = '暂无隧道限高/限宽数据，无法评估';
      result.assessmentScore = 0;
    } else {
      var heightOk = true;
      var widthOk = true;
      var issues = [];

      if (limitH && limitH > 0) {
        if (v.heightM > limitH) {
          heightOk = false;
          issues.push('车高 ' + v.heightM + 'm 超过限高 ' + limitH + 'm');
          result.exceedItems.push({
            item: '车辆高度',
            vehicleValue: v.heightM + 'm',
            thresholdValue: limitH + 'm',
            exceedPercent: ((v.heightM / limitH - 1) * 100).toFixed(1) + '%'
          });
        }
      }

      if (limitW && limitW > 0) {
        if (v.widthM > limitW) {
          widthOk = false;
          issues.push('车宽 ' + v.widthM + 'm 超过限宽 ' + limitW + 'm');
          result.exceedItems.push({
            item: '车辆宽度',
            vehicleValue: v.widthM + 'm',
            thresholdValue: limitW + 'm',
            exceedPercent: ((v.widthM / limitW - 1) * 100).toFixed(1) + '%'
          });
        }
      }

      if (!heightOk || !widthOk) {
        result.assessmentStatus = 'forbidden';
        result.conclusion = issues.join('；') + '，禁止通行';
        result.assessmentScore = 15;
      } else {
        result.assessmentStatus = 'pass';
        result.conclusion = '车辆尺寸满足隧道限界要求，允许通行';
        result.assessmentScore = 95;
      }
    }
  }

  return result;
}

// ============================================================
// 右侧面板渲染
// ============================================================

function renderRightPanel() {
  renderResultCard();
  renderRouteCard();
}

// --- 卡片1: 桥隧评估结果 ---
function renderResultCard() {
  var body = document.getElementById('hv-result-body');
  if (!body) return;

  var result = hvState.assessmentResult;

  if (!result) {
    body.innerHTML = ''
      + '<div class="hv-assess-empty">'
      + '  <div style="font-size:28px;margin-bottom:6px;">📊</div>'
      + '  <div style="font-size:13px;margin-bottom:4px;">请先执行模拟计算</div>'
      + '  <div style="font-size:11px;color:var(--text-muted);">完善左侧桥隧和车辆参数后点击「模拟计算」</div>'
      + '</div>';
    return;
  }

  var statusConfig = {
    pass: { icon: '✅', text: '允许通行', color: '#4ADE80', bgColor: 'rgba(74,222,128,0.08)', borderColor: 'rgba(74,222,128,0.2)' },
    restricted: { icon: '⚠️', text: '条件限制通行', color: '#FBBF24', bgColor: 'rgba(251,191,36,0.08)', borderColor: 'rgba(251,191,36,0.2)' },
    forbidden: { icon: '❌', text: '禁止通行', color: '#F87171', bgColor: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.2)' },
    unknown: { icon: '❓', text: '信息不足', color: '#94A3B8', bgColor: 'rgba(148,163,184,0.08)', borderColor: 'rgba(148,163,184,0.2)' }
  };

  var cfg = statusConfig[result.assessmentStatus] || statusConfig.unknown;

  var html = ''
    // 总体结论
    + '<div style="padding:10px;border-radius:6px;border:1px solid ' + cfg.borderColor + ';background:' + cfg.bgColor + ';text-align:center;margin-bottom:10px;">'
    + '  <div style="font-size:22px;margin-bottom:4px;">' + cfg.icon + '</div>'
    + '  <div style="font-size:15px;font-weight:700;color:' + cfg.color + ';">' + cfg.text + '</div>'
    + '  <div style="font-size:11px;color:var(--text-muted);margin-top:2px;">评估得分: ' + result.assessmentScore.toFixed(0) + '/100</div>'
    + '</div>'
    // 基础信息
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-bottom:10px;">'
    + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">📋 评估对象信息</div>'
    + '  <div class="hv-assess-info-row"><span>对象名称</span><span>' + (result.facility.name || '-') + '</span></div>'
    + '  <div class="hv-assess-info-row"><span>对象类型</span><span>' + (result.facility.facilityType === 'bridge' ? '桥梁' : '隧道') + '</span></div>'
    + '  <div class="hv-assess-info-row"><span>车辆总重</span><span>' + result.vehicle.totalWeightT + ' t</span></div>'
    + '  <div class="hv-assess-info-row"><span>车辆尺寸</span><span>' + result.vehicle.lengthM + '×' + result.vehicle.widthM + '×' + result.vehicle.heightM + ' m</span></div>'
    + '</div>'
    // 通行标准
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-bottom:10px;">'
    + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">📏 设计通行阈值</div>';

  if (result.facility.facilityType === 'bridge') {
    html += '  <div class="hv-assess-info-row"><span>允许最大总重</span><span>' + (result.thresholdValues.maxWeight ? result.thresholdValues.maxWeight + ' t' : '未设置') + '</span></div>'
      + '  <div class="hv-assess-info-row"><span>设计荷载</span><span>' + (result.thresholdValues.designLoad || '-') + '</span></div>'
      + '  <div class="hv-assess-info-row"><span>车道数</span><span>' + (result.thresholdValues.lanes || '-') + '</span></div>';
  } else {
    html += '  <div class="hv-assess-info-row"><span>限高</span><span>' + (result.thresholdValues.maxHeight ? result.thresholdValues.maxHeight + ' m' : '未设置') + '</span></div>'
      + '  <div class="hv-assess-info-row"><span>限宽</span><span>' + (result.thresholdValues.maxWidth ? result.thresholdValues.maxWidth + ' m' : '未设置') + '</span></div>'
      + '  <div class="hv-assess-info-row"><span>净空</span><span>' + (result.thresholdValues.clearance ? result.thresholdValues.clearance + ' m' : '-') + '</span></div>';
  }

  html += '</div>';

  // 超限原因明细
  if (result.exceedItems.length > 0) {
    html += '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-bottom:10px;">'
      + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">⚠️ 超限指标明细</div>';
    result.exceedItems.forEach(function(item) {
      html += '  <div class="hv-assess-info-row hv-assess-exceed-row">'
        + '    <span style="color:#F87171;">' + item.item + '</span>'
        + '    <span style="color:#F87171;">' + item.vehicleValue + ' > ' + item.thresholdValue + ' (超限' + item.exceedPercent + ')</span>'
        + '  </div>';
    });
    html += '</div>';
  } else {
    html += '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-bottom:10px;">'
      + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">✅ 通行指标检查</div>'
      + '  <div class="hv-assess-info-row"><span>检查结果</span><span style="color:#4ADE80;">全部指标符合通行条件</span></div>'
      + '</div>';
  }

  // 评估结论
  html += '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">📝 总体通行评估结论</div>'
    + '  <div style="font-size:12px;color:var(--text-primary);line-height:1.5;padding:6px 8px;background:rgba(56,189,248,0.03);border-radius:4px;">' + result.conclusion + '</div>'
    + '</div>'
    + '<div style="margin-top:10px;">'
    + '  <button class="hv-assess-btn-secondary" id="hv-export-result-btn" style="width:100%;">📄 导出评估单</button>'
    + '</div>';

  body.innerHTML = html;

  var exportBtn = document.getElementById('hv-export-result-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportSingleResult);
  }
}

function exportSingleResult() {
  var result = hvState.assessmentResult;
  if (!result) return;

  var report = {
    title: '桥隧通行评估报告',
    facility: result.facility,
    vehicle: result.vehicle,
    assessmentStatus: result.assessmentStatus,
    conclusion: result.conclusion,
    exceedItems: result.exceedItems,
    exportTime: new Date().toLocaleString()
  };

  var json = JSON.stringify(report, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '评估报告_' + result.facility.name + '_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);

  showToast('📄 评估报告已导出', 'success');
}

// --- 卡片2: 保通路径规划设置 ---
function renderRouteCard() {
  var body = document.getElementById('hv-route-body');
  if (!body) return;

  var html = ''
    + '<div style="margin-bottom:10px;">'
    + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">📍 起点/终点设置</div>'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">起点</label>'
    + '    <div style="display:flex;gap:4px;">'
    + '      <input class="hv-assess-input" id="hv-route-start" value="' + (hvState.routeStart ? hvState.routeStart.name : '') + '" placeholder="输入起点名称或编号" />'
    + '      <button class="hv-assess-btn-sm" id="hv-route-start-map">🗺️</button>'
    + '    </div>'
    + '  </div>'
    + '  <div class="hv-assess-form-group">'
    + '    <label class="hv-assess-label">终点</label>'
    + '    <div style="display:flex;gap:4px;">'
    + '      <input class="hv-assess-input" id="hv-route-end" value="' + (hvState.routeEnd ? hvState.routeEnd.name : '') + '" placeholder="输入终点名称或编号" />'
    + '      <button class="hv-assess-btn-sm" id="hv-route-end-map">🗺️</button>'
    + '    </div>'
    + '  </div>'
    + '</div>'
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-bottom:10px;">'
    + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">⚙️ 路径规划约束</div>'
    + '  <label class="hv-assess-checkbox">'
    + '    <input type="checkbox" id="hv-route-avoid-forbidden"' + (hvState.routeConstraints.avoidForbidden ? ' checked' : '') + ' /> 规避禁止通行桥隧'
    + '  </label>'
    + '  <label class="hv-assess-checkbox">'
    + '    <input type="checkbox" id="hv-route-prefer-highway"' + (hvState.routeConstraints.preferHighway ? ' checked' : '') + ' /> 优先高速路网'
    + '  </label>'
    + '  <div class="hv-assess-form-row" style="margin-top:6px;">'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">最大允许车重 (t)</label>'
    + '      <input class="hv-assess-input" type="number" id="hv-route-max-weight" value="' + (hvState.routeConstraints.maxWeight || '') + '" placeholder="可选" />'
    + '    </div>'
    + '    <div class="hv-assess-form-group" style="flex:1;">'
    + '      <label class="hv-assess-label">最大允许车高 (m)</label>'
    + '      <input class="hv-assess-input" type="number" id="hv-route-max-height" value="' + (hvState.routeConstraints.maxHeight || '') + '" placeholder="可选" />'
    + '    </div>'
    + '  </div>'
    + '</div>'
    + '<button class="hv-assess-btn-primary" id="hv-route-plan-btn" style="width:100%;">🛤️ 开始规划</button>';

  if (hvState.routePlan) {
    html += '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:10px;">'
      + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:6px;">📊 规划结果</div>'
      + '  <div class="hv-assess-info-row"><span>路线总里程</span><span>' + hvState.routePlan.totalDistance + ' km</span></div>'
      + '  <div class="hv-assess-info-row"><span>预计通行时间</span><span>' + hvState.routePlan.estimatedTime + '</span></div>'
      + '  <div class="hv-assess-info-row"><span>途经桥隧</span><span>' + hvState.routePlan.facilityCount + ' 个</span></div>'
      + '  <div class="hv-assess-info-row"><span>风险点</span><span style="color:' + (hvState.routePlan.riskCount > 0 ? '#F87171' : '#4ADE80') + ';">' + hvState.routePlan.riskCount + ' 个</span></div>'
      + '</div>';

    if (hvState.routePlan.facilities && hvState.routePlan.facilities.length > 0) {
      html += '<div style="margin-top:8px;max-height:120px;overflow-y:auto;">'
        + '  <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px;">途经桥隧清单</div>';
      hvState.routePlan.facilities.forEach(function(f) {
        var riskColor = f.riskLevel === 'high' ? '#F87171' : f.riskLevel === 'medium' ? '#FBBF24' : '#4ADE80';
        html += '  <div class="hv-assess-info-row" style="cursor:pointer;" data-facility-id="' + f.facilityId + '">'
          + '    <span>' + f.name + '</span>'
          + '    <span style="color:' + riskColor + ';">' + (f.passable ? '可通行' : '不可通行') + '</span>'
          + '  </div>';
      });
      html += '</div>';
    }
  }

  body.innerHTML = html;
  bindRouteEvents();
}

function bindRouteEvents() {
  var startMapBtn = document.getElementById('hv-route-start-map');
  if (startMapBtn) {
    startMapBtn.addEventListener('click', function() {
      showToast('🗺️ 请在地图上点击选择起点', 'info');
      hvState.routePickMode = 'start';
      document.body.style.cursor = 'crosshair';
    });
  }

  var endMapBtn = document.getElementById('hv-route-end-map');
  if (endMapBtn) {
    endMapBtn.addEventListener('click', function() {
      showToast('🗺️ 请在地图上点击选择终点', 'info');
      hvState.routePickMode = 'end';
      document.body.style.cursor = 'crosshair';
    });
  }

  var planBtn = document.getElementById('hv-route-plan-btn');
  if (planBtn) {
    planBtn.addEventListener('click', runRoutePlanning);
  }

  var facilityRows = document.querySelectorAll('#hv-route-body .hv-assess-info-row[data-facility-id]');
  facilityRows.forEach(function(row) {
    row.addEventListener('click', function() {
      var facilityId = this.dataset.facilityId;
      flyToHVFacility(facilityId);
    });
  });
}

function runRoutePlanning() {
  var startInput = document.getElementById('hv-route-start')?.value?.trim();
  var endInput = document.getElementById('hv-route-end')?.value?.trim();

  if (!startInput || !endInput) {
    showToast('⚠️ 请输入起点和终点', 'warning');
    return;
  }

  hvState.routeConstraints.avoidForbidden = document.getElementById('hv-route-avoid-forbidden')?.checked || false;
  hvState.routeConstraints.preferHighway = document.getElementById('hv-route-prefer-highway')?.checked || false;
  hvState.routeConstraints.maxWeight = parseFloat(document.getElementById('hv-route-max-weight')?.value) || null;
  hvState.routeConstraints.maxHeight = parseFloat(document.getElementById('hv-route-max-height')?.value) || null;

  showToast('🛤️ 正在进行路径规划...', 'info');

  setTimeout(function() {
    hvState.routePlan = {
      totalDistance: (Math.random() * 50 + 20).toFixed(1),
      estimatedTime: Math.floor(Math.random() * 60 + 30) + ' 分钟',
      facilityCount: Math.floor(Math.random() * 5 + 2),
      riskCount: Math.floor(Math.random() * 3),
      facilities: [
        { facilityId: 'F001', name: '万州长江大桥', passable: true, riskLevel: 'low' },
        { facilityId: 'F002', name: '涪陵乌江隧道', passable: true, riskLevel: 'medium' },
        { facilityId: 'F003', name: '长寿湖大桥', passable: false, riskLevel: 'high' }
      ]
    };

    renderRouteCard();
    showToast('✅ 路径规划完成', 'success');
  }, 1000);
}

// ============================================================
// 辅助函数
// ============================================================

function updateStatusBadge() {
  var badge = document.getElementById('hv-assess-status-badge');
  if (!badge) return;

  var statusMap = {
    idle: '未开始',
    calculating: '计算中',
    completed: '计算完成',
    error: '计算失败'
  };

  badge.textContent = statusMap[hvState.taskStatus] || '未开始';

  if (hvState.taskStatus === 'calculating') {
    badge.style.color = '#FBBF24';
  } else if (hvState.taskStatus === 'completed') {
    badge.style.color = '#4ADE80';
  } else if (hvState.taskStatus === 'error') {
    badge.style.color = '#F87171';
  } else {
    badge.style.color = '#94A3B8';
  }
}

function getDefaultVehicle() {
  return {
    vehicleId: 'VH_' + Date.now(),
    vehicleName: '重载货车',
    vehicleType: 'heavy_truck',
    plateNumber: '',
    totalWeightT: 55,
    axleCount: 3,
    lengthM: 15.0,
    widthM: 2.55,
    heightM: 4.0,
    turningRadiusM: 15,
    cargoType: ''
  };
}

function saveAssessmentTask() {
  var task = {
    taskId: 'HV_TASK_' + Date.now(),
    assessType: hvState.assessType,
    facility: hvState.selectedFacility,
    vehicle: hvState.vehicle,
    model: hvState.selectedModel,
    assessmentResult: hvState.assessmentResult,
    routePlan: hvState.routePlan,
    createdAt: new Date().toISOString()
  };

  try {
    var saved = JSON.parse(localStorage.getItem('hv_assessment_tasks') || '[]');
    saved.unshift(task);
    localStorage.setItem('hv_assessment_tasks', JSON.stringify(saved));
    showToast('✅ 评估任务已保存', 'success');
  } catch (e) {
    showToast('❌ 保存失败: ' + e.message, 'error');
  }
}

function exportAssessmentReport() {
  if (!hvState.assessmentResult) {
    showToast('⚠️ 请先执行评估计算', 'warning');
    return;
  }

  var report = {
    title: '重车通行评估任务报告',
    taskId: 'HV_TASK_' + Date.now(),
    exportTime: new Date().toLocaleString(),
    assessType: hvState.assessType,
    facility: hvState.selectedFacility,
    vehicle: hvState.vehicle,
    model: hvState.selectedModel,
    assessmentResult: hvState.assessmentResult,
    routePlan: hvState.routePlan
  };

  var json = JSON.stringify(report, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '重车通行评估报告_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);

  showToast('📄 评估报告已导出', 'success');
}

function showToast(message, type) {
  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
    return;
  }
  var toast = document.createElement('div');
  toast.style.cssText = 'position:fixed;top:60px;left:50%;transform:translateX(-50%);padding:8px 20px;border-radius:6px;font-size:13px;z-index:3000;animation:fade-in 0.2s ease;'
    + (type === 'success' ? 'background:rgba(74,222,128,0.15);color:#4ADE80;border:1px solid rgba(74,222,128,0.2);'
    : type === 'warning' ? 'background:rgba(251,191,36,0.15);color:#FBBF24;border:1px solid rgba(251,191,36,0.2);'
    : type === 'error' ? 'background:rgba(248,113,113,0.15);color:#F87171;border:1px solid rgba(248,113,113,0.2);'
    : 'background:rgba(56,189,248,0.12);color:#38BDF8;border:1px solid rgba(56,189,248,0.15);');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(function() { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.3s'; }, 2000);
  setTimeout(function() { if (toast.parentNode) toast.remove(); }, 2500);
}