/**
 * 🚚 重车通行安全评估工作台（全屏版 v2）
 *
 * 新版布局：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 顶部工具栏                                                   │
 * ├──────────────────────────────────────────────────────────────┤
 * │ 顶部输入区 (三栏卡片：车辆参数 / 路线设置 / 桥隧清单)        │
 * ├──────────────────────────────┬───────────────────────────────┤
 * │ 中部地图区                   │ 右侧明细表区(卡片式)          │
 * ├──────────────────────────────┴───────────────────────────────┤
 * │ 底部结果报告区 (三栏：结论 / 统计 / 风险对象)               │
 * └──────────────────────────────────────────────────────────────┘
 *
 * 功能：
 * - 车辆参数录入（含轴重/轴距表格）
 * - 沿途桥梁/隧道搜索添加（从路网 / 手动 / 地图点击）
 * - 桥梁/隧道限重/限高/限宽编辑
 * - 占位评估规则（产生可演示结果）
 * - 右侧卡片式明细列表 + 可展开详情
 * - 底部综合结论 + 统计 + 风险对象列表
 * - 地图设施标记与状态高亮
 * - 方案保存/重置/导出 JSON
 */

import api, { checkBackendFast, setBackendAvailable, resetBackendStatus } from '../api/index.js';
import L from 'leaflet';
import {
  getMap, ensureRoadnetLayerVisible, addHVFacilityMarker, clearHVFacilityMarkers,
  updateHVFacilityMarkerStatus, clearHVAssessmentHighlights,
  addHVAssessmentHighlights, flyToHVFacility, fitHVFacilities,
  clearHVLayers, clearRoutes, clearMarkers, addAllBridgeMarkers
} from '../utils/mapUtils.js';

// ============================================================
// 状态管理
// ============================================================

var isActive = false;
var hvState = {
  vehicle: null,           // 当前车辆
  facilities: [],          // 沿途桥隧对象
  assessmentResults: null, // 评估结果
  schemeName: '默认方案',
  schemeStatus: '未评估',  // 未评估 / 已评估 / 已保存
  editDialogOpen: false,
  detailFilter: 'all',     // 明细筛选: all/pass/restricted/forbidden/unknown
  detailTypeFilter: 'all'  // 类型筛选: all/bridge/tunnel
};

// 保存原始地图容器父节点，用于关闭时恢复
var originalMapParent = null;

// ============================================================
// 导出接口
// ============================================================

export function isHeavyVehicleActive() {
  return isActive;
}

export function openHeavyVehicleModule() {
  if (isActive) return;
  isActive = true;
  document.body.classList.add('hv-active');

  // 初始化默认车辆
  hvState.vehicle = getDefaultVehicle();
  hvState.facilities = [];
  hvState.assessmentResults = null;
  hvState.schemeStatus = '未评估';
  hvState.detailFilter = 'all';
  hvState.detailTypeFilter = 'all';

  // 保存原始地图容器父节点
  var mapEl = document.getElementById('map');
  if (mapEl && mapEl.parentNode) {
    originalMapParent = mapEl.parentNode;
  }

  buildFullLayout();
  bindToolbarEvents();
  renderInputStrip();
  renderDetailPanel();
  renderResultFooter();

  // 确保路网可见
  ensureRoadnetLayerVisible();

  // 监听地图添加设施事件
  window.addEventListener('hv-add-facility', handleMapAddFacility);

  showToast('🚚 已进入重车通行安全评估工作台', 'info');
}

export function closeHeavyVehicleModule() {
  if (!isActive) return;
  isActive = false;
  document.body.classList.remove('hv-active');

  // 将地图放回原始位置
  var mapEl = document.getElementById('map');
  if (mapEl && originalMapParent) {
    try {
      originalMapParent.appendChild(mapEl);
    } catch (e) {
      console.warn('[HV] 恢复地图位置失败:', e);
    }
  }
  originalMapParent = null;

  var overlay = document.getElementById('hv-overlay');
  if (overlay) overlay.remove();

  clearHVLayers();
  clearRoutes();
  clearMarkers();

  // 恢复地图桥梁标记
  window.removeEventListener('hv-add-facility', handleMapAddFacility);

  // 强制刷新原始地图
  var map = getMap();
  if (map) {
    requestAnimationFrame(function() {
      map.invalidateSize();
    });
  }

  showToast('已退出重车评估工作台', 'info');
}

// ============================================================
// 构建全屏布局 (新版)
// ============================================================

function buildFullLayout() {
  // 移除已有
  var existing = document.getElementById('hv-overlay');
  if (existing) existing.remove();

  var containers = {
    modal: document.getElementById('modal-container') || document.body
  };

  var overlay = document.createElement('div');
  overlay.id = 'hv-overlay';
  overlay.className = 'hv-overlay';

  overlay.innerHTML = ''
    // === 顶部工具栏 ===
    + '<div class="hv-toolbar">'
    + '  <div class="hv-toolbar-left">'
    + '    <span class="hv-toolbar-title">🚚 重车通行安全评估</span>'
    + '    <span id="hv-backend-status" style="font-size:11px;color:var(--text-muted);">⏳ 检测中...</span>'
    + '    <button class="hv-toolbar-btn-sm" id="hv-btn-refresh-backend" title="重新检测后端连接">🔃</button>'
    + '  </div>'
    + '  <div class="hv-toolbar-center">'
    + '    <input class="hv-scheme-name" id="hv-scheme-name" value="' + hvState.schemeName + '" placeholder="方案名称" />'
    + '    <span class="hv-status-badge" id="hv-status-badge">' + hvState.schemeStatus + '</span>'
    + '  </div>'
    + '  <div class="hv-toolbar-right">'
    + '    <button class="hv-toolbar-btn" id="hv-btn-save">💾 保存方案</button>'
    + '    <button class="hv-toolbar-btn" id="hv-btn-export">📤 导出报告</button>'
    + '    <button class="hv-toolbar-btn danger" id="hv-btn-reset">🔄 重置</button>'
    + '    <button class="hv-toolbar-btn danger" id="hv-btn-close" style="font-weight:600;">✕ 返回首页</button>'
    + '  </div>'
    + '</div>'
    // === 顶部输入区 (由 renderInputStrip 填充) ===
    + '<div class="hv-input-strip" id="hv-input-strip"></div>'
    // === 主体区域：地图 + 右侧明细 ===
    + '<div class="hv-main-area" id="hv-main-area">'
    + '  <div class="hv-map-panel" id="hv-map-panel">'
    + '    <!-- 地图容器 #map 会被从原始位置移入此区域 -->'
    + '  </div>'
    + '  <div class="hv-detail-panel" id="hv-detail-panel">'
    + '    <div class="hv-detail-header">'
    + '      <span>📋 沿途桥隧评估明细</span>'
    + '      <span class="hv-detail-count" id="hv-detail-count">0 个对象</span>'
    + '    </div>'
    + '    <div class="hv-detail-toolbar" id="hv-detail-toolbar"></div>'
    + '    <div class="hv-detail-scroll" id="hv-detail-scroll"></div>'
    + '  </div>'
    + '</div>'
    // === 底部结果报告区 ===
    + '<div class="hv-result-footer" id="hv-result-footer">'
    + '  <div class="hv-footer-section" id="hv-footer-conclusion">'
    + '    <div class="hv-footer-title">📊 综合结论</div>'
    + '    <div class="hv-footer-body" id="hv-footer-conclusion-body"></div>'
    + '  </div>'
    + '  <div class="hv-footer-section" id="hv-footer-stats">'
    + '    <div class="hv-footer-title">📈 通行状态统计</div>'
    + '    <div class="hv-footer-body" id="hv-footer-stats-body"></div>'
    + '  </div>'
    + '  <div class="hv-footer-section" id="hv-footer-risks">'
    + '    <div class="hv-footer-title">⚠️ 关键风险对象</div>'
    + '    <div class="hv-footer-body" id="hv-footer-risks-body"></div>'
    + '  </div>'
    + '</div>';

  // 插入到 modal-container 之下
  containers.modal.appendChild(overlay);

  // 将原始 #map 移入地图面板
  var originalMap = document.getElementById('map');
  var mapPanel = document.getElementById('hv-map-panel');
  if (originalMap && mapPanel) {
    mapPanel.appendChild(originalMap);
  }

  // 强制地图刷新尺寸（关键修复）
  var map = getMap();
  if (map) {
    requestAnimationFrame(function() {
      map.invalidateSize();
      // 二次确保，应对部分浏览器渲染延迟
      setTimeout(function() {
        map.invalidateSize();
      }, 200);
    });
  }

  // 检测后端状态
  checkHVBackendStatus();
}

// ============================================================
// 后端检测
// ============================================================

async function checkHVBackendStatus() {
  try {
    // 使用 API 层的缓存检测（共享状态，避免重复请求）
    var online = await checkBackendFast();
    setBackendAvailable(online);
    var badge = document.getElementById('hv-backend-status');
    if (!badge) return;
    if (online) {
      badge.innerHTML = '🟢 后端已连接';
      badge.style.color = '#4ADE80';
    } else {
      badge.innerHTML = '🟡 离线模式 (本地数据)';
      badge.style.color = '#FBBF24';
    }
  } catch (e) {
    var badge = document.getElementById('hv-backend-status');
    if (badge) {
      badge.innerHTML = '🟡 离线模式 (本地数据)';
      badge.style.color = '#FBBF24';
    }
  }
}

// ============================================================
// 工具栏事件
// ============================================================

function bindToolbarEvents() {
  document.getElementById('hv-btn-close').addEventListener('click', closeHeavyVehicleModule);
  document.getElementById('hv-btn-reset').addEventListener('click', resetAll);
  document.getElementById('hv-btn-save').addEventListener('click', saveScheme);
  document.getElementById('hv-btn-export').addEventListener('click', exportReport);

  // 手动刷新后端连接
  var refreshBtn = document.getElementById('hv-btn-refresh-backend');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', function () {
      resetBackendStatus();  // 清除缓存，允许重新尝试 API
      var badge = document.getElementById('hv-backend-status');
      if (badge) {
        badge.innerHTML = '⏳ 重新检测中...';
        badge.style.color = 'var(--text-muted)';
      }
      checkHVBackendStatus();
      showToast('🔄 正在重新检测后端连接...', 'info');
    });
  }

  // 方案名称变更
  document.getElementById('hv-scheme-name').addEventListener('input', function(e) {
    hvState.schemeName = e.target.value || '默认方案';
  });
}

// ============================================================
// 顶部输入区渲染 (三栏卡片)
// ============================================================

function renderInputStrip() {
  var strip = document.getElementById('hv-input-strip');
  if (!strip) return;

  strip.innerHTML = ''
    // === 卡片1: 车辆参数 ===
    + '<div class="hv-card hv-card-input">'
    + '  <div class="hv-card-header">'
    + '    <span>🚛 车辆参数</span>'
    + '  </div>'
    + '  <div class="hv-card-body scroll-body">'
    + buildVehicleForm()
    + '  </div>'
    + '</div>'
    // === 卡片2: 路线/通道设置 ===
    + '<div class="hv-card hv-card-input">'
    + '  <div class="hv-card-header">'
    + '    <span>🛤️ 路线/通道设置</span>'
    + '  </div>'
    + '  <div class="hv-card-body scroll-body">'
    + buildRouteForm()
    + '  </div>'
    + '</div>'
    // === 卡片3: 沿途桥隧清单 ===
    + '<div class="hv-card hv-card-input">'
    + '  <div class="hv-card-header">'
    + '    <span>🌉 沿途桥隧清单 (<span id="hv-facility-count">' + hvState.facilities.length + '</span>)</span>'
    + '    <button class="hv-clear-list-btn" id="hv-btn-clear-list" title="清空清单">🗑️</button>'
    + '  </div>'
    + '  <div class="hv-card-body">'
    + '    <div class="hv-search-box">'
    + '      <input id="hv-facility-search" placeholder="搜索桥梁/隧道/道路编号/区县" />'
    + '      <button class="hv-search-btn" id="hv-btn-search">🔍 搜索</button>'
    + '    </div>'
    + '    <div class="hv-candidate-list" id="hv-candidate-list" style="display:none;"></div>'
    + '    <div class="hv-facility-mini-list" id="hv-facility-mini-list">'
    + renderFacilityMiniList()
    + '    </div>'
    + '    <div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap;">'
    + '      <button class="hv-fi-btn" onclick="window.__hvAddFromRoadnet()" style="font-size:10px;padding:3px 8px;border:1px solid rgba(56,189,248,0.15);border-radius:3px;">➕ 从路网搜索</button>'
    + '      <button class="hv-fi-btn" onclick="window.__hvAddManual()" style="font-size:10px;padding:3px 8px;border:1px solid rgba(56,189,248,0.15);border-radius:3px;">📝 手动添加</button>'
    + '      <button class="hv-fi-btn" onclick="window.__hvAddFromMap()" style="font-size:10px;padding:3px 8px;border:1px solid rgba(56,189,248,0.15);border-radius:3px;">🗺️ 地图选择</button>'
    + '    </div>'
    + '    <button class="hv-eval-btn" id="hv-eval-btn" style="margin-top:8px;">⚡ 开始评估</button>'
    + '  </div>'
    + '</div>';

  // 绑定事件
  var evalBtn = document.getElementById('hv-eval-btn');
  if (evalBtn) evalBtn.addEventListener('click', runAssessment);

  var searchBtn = document.getElementById('hv-btn-search');
  if (searchBtn) {
    searchBtn.addEventListener('click', function() {
      var keyword = document.getElementById('hv-facility-search').value;
      searchFromRoadnet(keyword);
    });
  }

  var searchInput = document.getElementById('hv-facility-search');
  if (searchInput) {
    searchInput.addEventListener('keyup', function(e) {
      if (e.key === 'Enter') {
        document.getElementById('hv-btn-search').click();
      }
    });
  }

  var clearBtn = document.getElementById('hv-btn-clear-list');
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      if (hvState.facilities.length === 0) return;
      if (!confirm('确定清空所有沿途对象？')) return;
      hvState.facilities = [];
      hvState.assessmentResults = null;
      hvState.schemeStatus = '未评估';
      updateStatusBadge();
      refreshAllUI();
      showToast('已清空沿途对象清单', 'info');
    });
  }

  // 车辆参数事件绑定
  bindVehicleEvents();

  // 暴露函数到全局
  window.__hvAddFromRoadnet = function() {
    var input = document.getElementById('hv-facility-search');
    if (input) { input.focus(); input.value = ''; }
    showToast('请输入道路名称、编号或区县搜索路网', 'info');
  };

  window.__hvAddManual = function() {
    openFacilityEditor(null);
  };

  window.__hvAddFromMap = function() {
    showToast('请在地图上双击桥梁或隧道线段添加到清单', 'info');
  };
}

/**
 * 顶部简化清单列表（每个对象只显示一行摘要）
 */
function renderFacilityMiniList() {
  var facilities = hvState.facilities;
  if (!facilities || facilities.length === 0) {
    return '<div class="hv-empty" style="padding:8px 0;font-size:11px;">暂无沿途对象</div>';
  }
  var html = '';
  // 只显示前5个，其余显示 "+N more"
  var displayCount = Math.min(facilities.length, 5);
  for (var i = 0; i < displayCount; i++) {
    var f = facilities[i];
    var typeIcon = f.facilityType === 'bridge' ? '🌉' : '🚇';
    var status = f.assessmentStatus || 'pending';
    var statusColor = status === 'pass' ? '#4ADE80' : status === 'restricted' ? '#FBBF24' : status === 'forbidden' ? '#F87171' : '#94A3B8';
    var dotColor = status === 'pending' ? '#94A3B8' : statusColor;
    html += '<div class="hv-mini-item" data-idx="' + i + '" onclick="window.__hvLocateFacility(' + i + ')">'
      + '  <span class="hv-mini-dot" style="background:' + dotColor + ';"></span>'
      + '  <span class="hv-mini-type">' + typeIcon + '</span>'
      + '  <span class="hv-mini-name">' + (f.name || '未命名') + '</span>'
      + '  <span class="hv-mini-ref">' + (f.roadRef || '-') + '</span>'
      + '  <span class="hv-mini-district">' + (f.districtName || '-') + '</span>'
      + '</div>';
  }
  if (facilities.length > 5) {
    html += '<div style="font-size:10px;color:var(--text-muted);text-align:center;padding:2px 0;">+ ' + (facilities.length - 5) + ' 个对象（详见右侧明细）</div>';
  }
  return html;
}

function refreshFacilityMiniList() {
  var listEl = document.getElementById('hv-facility-mini-list');
  var countEl = document.getElementById('hv-facility-count');
  if (listEl) listEl.innerHTML = renderFacilityMiniList();
  if (countEl) countEl.textContent = hvState.facilities.length;
}

// ============================================================
// 车辆参数表单
// ============================================================

function getDefaultVehicle() {
  return {
    vehicleId: 'VH_' + Date.now(),
    vehicleName: '重载货车',
    vehicleType: 'heavy_truck',
    plateNumber: '',
    totalWeightT: 55,
    axleCount: 3,
    axleLoadsT: [18, 18, 19],
    axleSpacingsM: [0, 3.5, 1.3],
    lengthM: 15.0,
    widthM: 2.55,
    heightM: 4.0,
    turningRadiusM: 15,
    cargoType: '',
    remark: ''
  };
}

function buildVehicleForm() {
  var v = hvState.vehicle;
  return ''
    + '<div class="hv-form-row">'
    + '  <div class="hv-form-group" style="flex:2;">'
    + '    <label class="hv-form-label">车辆名称</label>'
    + '    <input class="hv-form-input" id="hv-v-name" value="' + (v.vehicleName || '') + '" />'
    + '  </div>'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">类型</label>'
    + '    <select class="hv-form-select" id="hv-v-type">'
    + '      <option value="light_truck"' + (v.vehicleType === 'light_truck' ? ' selected' : '') + '>普通货车</option>'
    + '      <option value="heavy_truck"' + (v.vehicleType === 'heavy_truck' ? ' selected' : '') + '>重载货车</option>'
    + '      <option value="heavy_cargo"' + (v.vehicleType === 'heavy_cargo' ? ' selected' : '') + '>大件运输车</option>'
    + '      <option value="special"' + (v.vehicleType === 'special' ? ' selected' : '') + '>特种运输车</option>'
    + '    </select>'
    + '  </div>'
    + '</div>'
    + '<div class="hv-form-row">'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">总重 (t)</label>'
    + '    <input class="hv-form-input" type="number" id="hv-v-weight" value="' + v.totalWeightT + '" step="0.5" />'
    + '  </div>'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">轴数</label>'
    + '    <input class="hv-form-input" type="number" id="hv-v-axles" value="' + v.axleCount + '" min="2" max="12" />'
    + '  </div>'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">车牌号</label>'
    + '    <input class="hv-form-input" id="hv-v-plate" value="' + (v.plateNumber || '') + '" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-form-row">'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">车长 (m)</label>'
    + '    <input class="hv-form-input" type="number" id="hv-v-length" value="' + v.lengthM + '" step="0.1" />'
    + '  </div>'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">车宽 (m)</label>'
    + '    <input class="hv-form-input" type="number" id="hv-v-width" value="' + v.widthM + '" step="0.01" />'
    + '  </div>'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">车高 (m)</label>'
    + '    <input class="hv-form-input" type="number" id="hv-v-height" value="' + v.heightM + '" step="0.01" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-form-row">'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">转弯半径 (m)</label>'
    + '    <input class="hv-form-input" type="number" id="hv-v-radius" value="' + (v.turningRadiusM || 15) + '" step="0.5" />'
    + '  </div>'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">货物类型</label>'
    + '    <input class="hv-form-input" id="hv-v-cargo" value="' + (v.cargoType || '') + '" />'
    + '  </div>'
    + '</div>'
    // 轴重/轴距表格
    + '<div style="margin-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">📊 轴重与轴距</div>'
    + '  <table class="hv-axle-table" id="hv-axle-table">'
    + '    <thead><tr><th>轴号</th><th>轴重 (t)</th><th>与前轴距离 (m)</th></tr></thead>'
    + '    <tbody id="hv-axle-tbody">'
    + renderAxleRows(v)
    + '    </tbody>'
    + '  </table>'
    + '  <div style="font-size:10px;color:var(--text-muted);margin-top:4px;text-align:right;">'
    + '    总轴重: <span id="hv-axle-total">' + v.axleLoadsT.reduce(function(a, b) { return a + b; }, 0).toFixed(1) + '</span> t'
    + '    <span id="hv-axle-warn" style="color:#FBBF24;margin-left:8px;display:none;">⚠ 与总重不一致</span>'
    + '  </div>'
    + '</div>';
}

function renderAxleRows(v) {
  var html = '';
  var loads = v.axleLoadsT || [];
  var spacings = v.axleSpacingsM || [];
  for (var i = 0; i < v.axleCount; i++) {
    html += '<tr>'
      + '<td style="color:var(--text-secondary);">' + (i + 1) + '</td>'
      + '<td><input type="number" class="hv-axle-load" data-idx="' + i + '" value="' + (loads[i] || 0) + '" step="0.5" /></td>'
      + '<td><input type="number" class="hv-axle-space" data-idx="' + i + '" value="' + (i === 0 ? '-' : (spacings[i] || 0)) + '" step="0.1"' + (i === 0 ? ' disabled style="color:var(--text-muted);"' : '') + ' /></td>'
      + '</tr>';
  }
  return html;
}

function bindVehicleEvents() {
  // 轴数变更 → 重建轴重表
  document.getElementById('hv-v-axles').addEventListener('change', function() {
    var newCount = parseInt(this.value) || 3;
    if (newCount < 2) { newCount = 2; this.value = 2; }
    if (newCount > 12) { newCount = 12; this.value = 12; }

    var oldLoads = hvState.vehicle.axleLoadsT || [];
    var oldSpacings = hvState.vehicle.axleSpacingsM || [];
    var newLoads = [];
    var newSpacings = [];
    for (var i = 0; i < newCount; i++) {
      newLoads.push(i < oldLoads.length ? oldLoads[i] : 10);
      newSpacings.push(i === 0 ? 0 : (i < oldSpacings.length ? oldSpacings[i] : 1.4));
    }
    hvState.vehicle.axleCount = newCount;
    hvState.vehicle.axleLoadsT = newLoads;
    hvState.vehicle.axleSpacingsM = newSpacings;

    var tbody = document.getElementById('hv-axle-tbody');
    if (tbody) tbody.innerHTML = renderAxleRows(hvState.vehicle);
    updateAxleTotal();
    bindAxleInputEvents();
  });

  // 车辆总重变更 → 检查一致性
  document.getElementById('hv-v-weight').addEventListener('input', function() {
    updateAxleTotal();
  });

  // 初始绑定轴输入
  bindAxleInputEvents();

  function bindAxleInputEvents() {
    document.querySelectorAll('.hv-axle-load').forEach(function(input) {
      input.addEventListener('input', function() {
        var idx = parseInt(this.dataset.idx);
        hvState.vehicle.axleLoadsT[idx] = parseFloat(this.value) || 0;
        updateAxleTotal();
      });
    });
    document.querySelectorAll('.hv-axle-space').forEach(function(input) {
      input.addEventListener('input', function() {
        var idx = parseInt(this.dataset.idx);
        if (idx > 0) {
          hvState.vehicle.axleSpacingsM[idx] = parseFloat(this.value) || 0;
        }
      });
    });
  }

  function updateAxleTotal() {
    var total = 0;
    document.querySelectorAll('.hv-axle-load').forEach(function(input) {
      total += parseFloat(input.value) || 0;
    });
    var totalEl = document.getElementById('hv-axle-total');
    var warnEl = document.getElementById('hv-axle-warn');
    if (totalEl) totalEl.textContent = total.toFixed(1);
    var vehicleWeight = parseFloat(document.getElementById('hv-v-weight').value) || 0;
    if (warnEl) {
      if (Math.abs(total - vehicleWeight) > 1) {
        warnEl.style.display = 'inline';
      } else {
        warnEl.style.display = 'none';
      }
    }
  }
}

// ============================================================
// 路线表单
// ============================================================

function buildRouteForm() {
  return ''
    + '<div class="hv-form-group">'
    + '  <label class="hv-form-label">起点</label>'
    + '  <input class="hv-form-input" id="hv-route-start" value="" placeholder="输入起点名称（占位）" />'
    + '</div>'
    + '<div class="hv-form-group">'
    + '  <label class="hv-form-label">终点</label>'
    + '  <input class="hv-form-input" id="hv-route-end" value="" placeholder="输入终点名称（占位）" />'
    + '</div>'
    + '<div class="hv-form-row">'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">通道名称</label>'
    + '    <input class="hv-form-input" id="hv-route-name" value="" placeholder="如：渝东北通道" />'
    + '  </div>'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">道路编号</label>'
    + '    <input class="hv-form-input" id="hv-route-ref" value="" placeholder="如：G50" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-form-group">'
    + '  <label class="hv-form-label">所属区县</label>'
    + '  <input class="hv-form-input" id="hv-route-district" value="" placeholder="如：万州区" />'
    + '</div>'
    + '<div style="font-size:10px;color:var(--text-muted);margin-top:4px;padding:4px 8px;background:rgba(56,189,248,0.03);border-radius:3px;">'
    + '  💡 当前阶段起终点只作为方案信息保存，不触发真实路径搜索。<br>'
    + '  请通过搜索或手动添加方式管理沿途桥隧清单。'
    + '</div>';
}

// ============================================================
// 沿途桥隧清单
// ============================================================

function renderFacilityList() {
  var facilities = hvState.facilities;
  if (!facilities || facilities.length === 0) {
    return '<div class="hv-empty">暂无沿途对象<br>请搜索路网或手动添加</div>';
  }
  var html = '';
  facilities.forEach(function(f, idx) {
    var typeLabel = f.facilityType === 'bridge' ? '桥' : '隧';
    var typeClass = f.facilityType === 'bridge' ? 'bridge' : 'tunnel';
    var status = f.assessmentStatus || 'pending';
    var statusText = status === 'pass' ? '可通行' : status === 'restricted' ? '限制通行' : status === 'forbidden' ? '不可通行' : '待评估';
    var statusColor = status === 'pass' ? '#4ADE80' : status === 'restricted' ? '#FBBF24' : status === 'forbidden' ? '#F87171' : '#94A3B8';

    html += '<div class="hv-facility-item" data-idx="' + idx + '">'
      + '  <div class="hv-fi-left">'
      + '    <span class="hv-fi-type ' + typeClass + '">' + typeLabel + '</span>'
      + '    <span class="hv-fi-name">' + (f.name || '未命名') + '</span>'
      + '  </div>'
      + '  <span class="hv-fi-status" style="color:' + statusColor + ';">' + statusText + '</span>'
      + '  <div class="hv-fi-actions">'
      + '    <button class="hv-fi-btn" onclick="window.__hvEditFacility(' + idx + ')">✏️</button>'
      + '    <button class="hv-fi-btn" onclick="window.__hvLocateFacility(' + idx + ')">📍</button>'
      + '    <button class="hv-fi-btn danger" onclick="window.__hvDeleteFacility(' + idx + ')">🗑️</button>'
      + '  </div>'
      + '</div>';
  });
  return html;
}

function refreshAllUI() {
  refreshFacilityMiniList();
  renderDetailPanel();
  renderResultFooter();
  refreshMapMarkers();
}

function refreshFacilityList() {
  refreshFacilityMiniList();
  renderDetailPanel();
  renderResultFooter();
  refreshMapMarkers();
}

function refreshMapMarkers() {
  clearHVFacilityMarkers();
  hvState.facilities.forEach(function(f) {
    if (f.longitude && f.latitude) {
      addHVFacilityMarker(f);
    }
  });
  if (hvState.facilities.length > 0) {
    fitHVFacilities(hvState.facilities);
  }
}

// 暴露设施操作到全局
window.__hvEditFacility = function(idx) {
  var facility = hvState.facilities[idx];
  if (facility) openFacilityEditor(facility, idx);
};

window.__hvLocateFacility = function(idx) {
  var facility = hvState.facilities[idx];
  if (facility && facility.facilityId) {
    flyToHVFacility(facility.facilityId);
  }
};

window.__hvDeleteFacility = function(idx) {
  hvState.facilities.splice(idx, 1);
  hvState.assessmentResults = null;
  hvState.schemeStatus = '未评估';
  updateStatusBadge();
  refreshAllUI();
};

// ============================================================
// 设施编辑器弹窗
// ============================================================

function openFacilityEditor(facility, idx) {
  if (hvState.editDialogOpen) return;
  hvState.editDialogOpen = true;

  var isNew = !facility;
  var f = facility || {
    facilityId: 'RF_' + Date.now(),
    source: 'manual',
    sourceEdgeId: '',
    facilityType: 'bridge',
    name: '',
    roadName: '',
    roadRef: '',
    districtName: '',
    longitude: null,
    latitude: null,
    lengthM: null,
    limitWeightT: null,
    limitHeightM: null,
    limitWidthM: null,
    maxspeed: null,
    lanes: null,
    bridge: null,
    tunnel: null,
    structureType: '',
    technicalCondition: '',
    riskLevel: 'medium',
    remark: ''
  };

  var overlay = document.createElement('div');
  overlay.className = 'hv-edit-overlay';
  overlay.id = 'hv-edit-overlay';
  overlay.addEventListener('click', closeEditDialog);

  var dialog = document.createElement('div');
  dialog.className = 'hv-edit-dialog';
  dialog.id = 'hv-edit-dialog';
  dialog.innerHTML = ''
    + '<h3>' + (isNew ? '📝 添加沿途对象' : '✏️ 编辑沿途对象') + '</h3>'
    + '<div class="hv-form-row">'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">类型</label>'
    + '    <select class="hv-form-select" id="hv-edit-type">'
    + '      <option value="bridge"' + (f.facilityType === 'bridge' ? ' selected' : '') + '>桥梁</option>'
    + '      <option value="tunnel"' + (f.facilityType === 'tunnel' ? ' selected' : '') + '>隧道</option>'
    + '    </select>'
    + '  </div>'
    + '  <div class="hv-form-group" style="flex:2;">'
    + '    <label class="hv-form-label">名称</label>'
    + '    <input class="hv-form-input" id="hv-edit-name" value="' + (f.name || '') + '" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-form-row">'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">道路编号</label>'
    + '    <input class="hv-form-input" id="hv-edit-ref" value="' + (f.roadRef || '') + '" />'
    + '  </div>'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">区县</label>'
    + '    <input class="hv-form-input" id="hv-edit-district" value="' + (f.districtName || '') + '" />'
    + '  </div>'
    + '</div>'
    + '<div class="hv-form-row">'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">长度 (m)</label>'
    + '    <input class="hv-form-input" type="number" id="hv-edit-length" value="' + (f.lengthM || '') + '" step="1" />'
    + '  </div>'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">经度</label>'
    + '    <input class="hv-form-input" type="number" id="hv-edit-lng" value="' + (f.longitude || '') + '" step="0.0001" />'
    + '  </div>'
    + '  <div class="hv-form-group">'
    + '    <label class="hv-form-label">纬度</label>'
    + '    <input class="hv-form-input" type="number" id="hv-edit-lat" value="' + (f.latitude || '') + '" step="0.0001" />'
    + '  </div>'
    + '</div>'
    + '<div style="border-top:1px solid rgba(56,189,248,0.1);padding-top:8px;margin-top:8px;">'
    + '  <div style="font-size:11px;color:var(--text-secondary);margin-bottom:4px;">🚧 限行参数</div>'
    + '  <div class="hv-form-row">'
    + '    <div class="hv-form-group">'
    + '      <label class="hv-form-label">限重 (t)</label>'
    + '      <input class="hv-form-input" type="number" id="hv-edit-limit-weight" value="' + (f.limitWeightT || '') + '" step="0.5" />'
    + '    </div>'
    + '    <div class="hv-form-group">'
    + '      <label class="hv-form-label">限高 (m)</label>'
    + '      <input class="hv-form-input" type="number" id="hv-edit-limit-height" value="' + (f.limitHeightM || '') + '" step="0.1" />'
    + '    </div>'
    + '    <div class="hv-form-group">'
    + '      <label class="hv-form-label">限宽 (m)</label>'
    + '      <input class="hv-form-input" type="number" id="hv-edit-limit-width" value="' + (f.limitWidthM || '') + '" step="0.1" />'
    + '    </div>'
    + '  </div>'
    + '</div>'
    + '<div class="hv-form-group" style="margin-top:8px;">'
    + '  <label class="hv-form-label">备注</label>'
    + '  <input class="hv-form-input" id="hv-edit-remark" value="' + (f.remark || '') + '" />'
    + '</div>'
    + '<div style="display:flex;gap:8px;margin-top:12px;justify-content:flex-end;">'
    + '  <button class="hv-toolbar-btn" id="hv-edit-cancel" style="padding:6px 16px;">取消</button>'
    + '  <button class="hv-toolbar-btn primary" id="hv-edit-save" style="padding:6px 16px;">' + (isNew ? '添加' : '保存') + '</button>'
    + '</div>';

  document.body.appendChild(overlay);
  document.body.appendChild(dialog);

  document.getElementById('hv-edit-cancel').addEventListener('click', closeEditDialog);
  document.getElementById('hv-edit-save').addEventListener('click', function() {
    var edited = {
      facilityId: isNew ? 'RF_' + Date.now() : f.facilityId,
      source: f.source || 'manual',
      sourceEdgeId: f.sourceEdgeId || '',
      facilityType: document.getElementById('hv-edit-type').value,
      name: document.getElementById('hv-edit-name').value || '未命名',
      roadName: f.roadName || '',
      roadRef: document.getElementById('hv-edit-ref').value || '',
      districtName: document.getElementById('hv-edit-district').value || '',
      longitude: parseFloat(document.getElementById('hv-edit-lng').value) || null,
      latitude: parseFloat(document.getElementById('hv-edit-lat').value) || null,
      lengthM: parseFloat(document.getElementById('hv-edit-length').value) || null,
      limitWeightT: parseFloat(document.getElementById('hv-edit-limit-weight').value) || null,
      limitHeightM: parseFloat(document.getElementById('hv-edit-limit-height').value) || null,
      limitWidthM: parseFloat(document.getElementById('hv-edit-limit-width').value) || null,
      maxspeed: f.maxspeed || null,
      lanes: f.lanes || null,
      bridge: f.bridge || null,
      tunnel: f.tunnel || null,
      structureType: f.structureType || '',
      technicalCondition: f.technicalCondition || '',
      riskLevel: f.riskLevel || 'medium',
      remark: document.getElementById('hv-edit-remark').value || ''
    };

    if (isNew) {
      hvState.facilities.push(edited);
    } else if (idx !== null && idx !== undefined) {
      hvState.facilities[idx] = edited;
    }

    hvState.assessmentResults = null;
    hvState.schemeStatus = '未评估';
    updateStatusBadge();
    refreshAllUI();
    closeEditDialog();
    showToast('✅ 已' + (isNew ? '添加' : '更新') + '「' + edited.name + '」', 'success');
  });

  function closeEditDialog() {
    hvState.editDialogOpen = false;
    var o = document.getElementById('hv-edit-overlay');
    var d = document.getElementById('hv-edit-dialog');
    if (o) o.remove();
    if (d) d.remove();
  }
}

// ============================================================
// 从路网搜索
// ============================================================

async function searchFromRoadnet(keyword) {
  var candidateList = document.getElementById('hv-candidate-list');
  if (!candidateList) return;

  if (!keyword) {
    candidateList.style.display = 'none';
    return;
  }

  candidateList.innerHTML = '<div style="padding:8px;text-align:center;color:var(--text-muted);">🔍 搜索中...</div>';
  candidateList.style.display = 'block';

  try {
    var results = await api.searchRoadnetFacilities(keyword);
    if (!results || results.length === 0) {
      candidateList.innerHTML = '<div style="padding:8px;text-align:center;color:var(--text-muted);">未找到匹配的道路</div>';
      return;
    }

    var html = '';
    // 只显示 bridge=yes 或 tunnel=yes 的道路
    var candidates = results.filter(function(r) { return r.bridge === 'yes' || r.tunnel === 'yes'; });
    if (candidates.length === 0) {
      // 也显示普通道路
      candidates = results.slice(0, 20);
    }

    candidates.forEach(function(r) {
      var isBridge = r.bridge === 'yes';
      var isTunnel = r.tunnel === 'yes';
      var typeIcon = isBridge ? '🌉' : isTunnel ? '🕳️' : '🛣️';
      var typeLabel = isBridge ? '桥梁段' : isTunnel ? '隧道段' : '道路段';
      var name = r.name || r.ref || '未命名';
      var ref = r.ref || '-';
      var district = r.district_name || '-';
      var len = r.length ? parseFloat(r.length).toFixed(0) + 'm' : '-';

      html += '<div class="hv-candidate-item" onclick="window.__hvAddCandidate(\'' + encodeURIComponent(JSON.stringify(r)) + '\')">'
        + '  <span>' + typeIcon + ' ' + name + ' (' + ref + ' / ' + district + ')</span>'
        + '  <span style="font-size:10px;color:var(--text-muted);">' + len + ' ' + typeLabel + ' +</span>'
        + '</div>';
    });

    candidateList.innerHTML = html;

    window.__hvAddCandidate = function(encoded) {
      try {
        var data = JSON.parse(decodeURIComponent(encoded));
        addRoadnetCandidate(data);
        candidateList.style.display = 'none';
        document.getElementById('hv-facility-search').value = '';
      } catch (e) {
        console.error('[HV] 添加候选失败:', e);
      }
    };

  } catch (e) {
    console.warn('[HV] 路网搜索失败:', e);
    candidateList.innerHTML = '<div style="padding:8px;text-align:center;color:#F87171;">❌ 搜索失败</div>';
  }
}

function addRoadnetCandidate(data) {
  var isBridge = data.bridge === 'yes';
  var isTunnel = data.tunnel === 'yes';
  var coords = getCoordsFromFeature(data);

  var facility = {
    facilityId: 'RF_' + Date.now(),
    source: 'roadnet',
    sourceEdgeId: data.edge_id || (data.u + '_' + data.v + '_' + (data.key || 0)),
    facilityType: isBridge ? 'bridge' : isTunnel ? 'tunnel' : 'bridge',
    name: data.name || data.ref || '未命名道路段',
    roadName: data.name || '',
    roadRef: data.ref || '',
    districtName: data.district_name || '',
    longitude: coords.lng,
    latitude: coords.lat,
    lengthM: data.length ? parseFloat(data.length) : null,
    limitWeightT: null,
    limitHeightM: null,
    limitWidthM: null,
    maxspeed: data.maxspeed || null,
    lanes: data.lanes || null,
    bridge: data.bridge || null,
    tunnel: data.tunnel || null,
    structureType: '',
    technicalCondition: '',
    riskLevel: 'medium',
    remark: ''
  };

  hvState.facilities.push(facility);
  hvState.assessmentResults = null;
  hvState.schemeStatus = '未评估';
  updateStatusBadge();
  refreshAllUI();
  showToast('✅ 已添加「' + facility.name + '」', 'success');
}

function getCoordsFromFeature(data) {
  if (data.longitude && data.latitude) {
    return { lng: parseFloat(data.longitude), lat: parseFloat(data.latitude) };
  }
  // 默认重庆坐标
  return { lng: 106.55 + Math.random() * 0.5, lat: 29.56 + Math.random() * 0.3 };
}

// ============================================================
// 地图添加设施事件处理
// ============================================================

function handleMapAddFacility(e) {
  var detail = e.detail;
  if (!detail) return;

  var facility = {
    facilityId: 'RF_' + Date.now(),
    source: 'map_click',
    sourceEdgeId: detail.sourceEdgeId || '',
    facilityType: detail.facilityType || 'bridge',
    name: detail.name || '未命名道路段',
    roadName: detail.roadName || '',
    roadRef: detail.roadRef || '',
    districtName: detail.districtName || '',
    longitude: detail.longitude || null,
    latitude: detail.latitude || null,
    lengthM: detail.lengthM || null,
    limitWeightT: null,
    limitHeightM: null,
    limitWidthM: null,
    maxspeed: detail.maxspeed || null,
    lanes: detail.lanes || null,
    bridge: detail.bridge || null,
    tunnel: detail.tunnel || null,
    structureType: '',
    technicalCondition: '',
    riskLevel: 'medium',
    remark: ''
  };

  hvState.facilities.push(facility);
  hvState.assessmentResults = null;
  hvState.schemeStatus = '未评估';
  updateStatusBadge();
  refreshAllUI();
}

// ============================================================
// 占位评估逻辑
// ============================================================

function runAssessment() {
  if (hvState.facilities.length === 0) {
    showToast('⚠️ 请先添加至少一个桥梁或隧道对象', 'warning');
    return;
  }

  // 收集当前车辆参数
  collectVehicleParams();

  var btn = document.getElementById('hv-eval-btn');
  btn.textContent = '⏳ 评估计算中...';
  btn.disabled = true;

  showToast('🔍 正在进行通行安全评估...', 'info');

  setTimeout(function() {
    var results = [];
    hvState.facilities.forEach(function(f) {
      var result = evaluateFacility(f, hvState.vehicle);
      results.push(result);
      // 更新设施状态
      f.assessmentStatus = result.assessmentStatus;
      f.assessmentScore = result.assessmentScore;
      f.reason = result.reason;
      f.suggestion = result.suggestion;
      f.exceedItems = result.exceedItems;
    });

    // 统计
    var summary = calculateSummary(results);

    hvState.assessmentResults = {
      summary: summary,
      itemResults: results
    };
    hvState.schemeStatus = '已评估';
    updateStatusBadge();

    // 更新界面
    refreshAllUI();

    // 更新地图标记
    clearHVAssessmentHighlights();
    results.forEach(function(r) {
      if (r.longitude && r.latitude) {
        addHVAssessmentHighlights([r]);
      }
      updateHVFacilityMarkerStatus(r.facilityId, r.assessmentStatus);
    });

    btn.textContent = '⚡ 开始评估';
    btn.disabled = false;

    var overallText = summary.overallStatus === 'pass' ? '✅ 可通行' : summary.overallStatus === 'restricted' ? '⚠️ 限制通行' : summary.overallStatus === 'forbidden' ? '🚫 不可通行' : '❓ 信息不足';
    showToast('✅ 评估完成，总体结论：' + overallText + '（' + summary.totalCount + '个对象）', summary.overallStatus === 'pass' ? 'success' : 'info');
  }, 800);
}

/**
 * 占位评估规则
 */
function evaluateFacility(facility, vehicle) {
  var result = {
    facilityId: facility.facilityId,
    facilityType: facility.facilityType,
    name: facility.name,
    roadRef: facility.roadRef,
    districtName: facility.districtName,
    longitude: facility.longitude,
    latitude: facility.latitude,
    lengthM: facility.lengthM,
    limitWeightT: facility.limitWeightT,
    limitHeightM: facility.limitHeightM,
    limitWidthM: facility.limitWidthM,
    vehicleWeight: vehicle.totalWeightT,
    vehicleHeight: vehicle.heightM,
    vehicleWidth: vehicle.widthM,
    assessmentStatus: 'unknown',
    assessmentScore: 0,
    reason: '',
    suggestion: '',
    exceedItems: []
  };

  if (facility.facilityType === 'bridge') {
    // 桥梁评估：基于限重
    var limitW = facility.limitWeightT;
    if (!limitW || limitW <= 0) {
      result.assessmentStatus = 'unknown';
      result.reason = '缺少桥梁限重数据';
      result.suggestion = '请补充桥梁限重参数';
      result.assessmentScore = 0;
    } else if (vehicle.totalWeightT <= limitW) {
      result.assessmentStatus = 'pass';
      result.reason = '车辆总重 ' + vehicle.totalWeightT + 't 未超过桥梁限重 ' + limitW + 't';
      result.suggestion = '正常通行';
      result.assessmentScore = 100 - (vehicle.totalWeightT / limitW) * 30;
    } else if (vehicle.totalWeightT <= limitW * 1.1) {
      result.assessmentStatus = 'restricted';
      result.exceedItems.push('weight');
      result.reason = '车辆总重 ' + vehicle.totalWeightT + 't 接近桥梁限重 ' + limitW + 't（超限' + ((vehicle.totalWeightT / limitW - 1) * 100).toFixed(0) + '%）';
      result.suggestion = '建议限速限载通行';
      result.assessmentScore = Math.max(30, 70 - ((vehicle.totalWeightT / limitW - 1) * 100));
    } else {
      result.assessmentStatus = 'forbidden';
      result.exceedItems.push('weight');
      result.reason = '车辆总重 ' + vehicle.totalWeightT + 't 超过桥梁限重 ' + limitW + 't（超限' + ((vehicle.totalWeightT / limitW - 1) * 100).toFixed(0) + '%）';
      result.suggestion = '建议绕行或进行专项承载复核';
      result.assessmentScore = Math.max(10, 30 - ((vehicle.totalWeightT / limitW - 1) * 20));
    }
  } else if (facility.facilityType === 'tunnel') {
    // 隧道评估：基于限高+限宽
    var limitH = facility.limitHeightM;
    var limitW = facility.limitWidthM;

    if ((!limitH || limitH <= 0) && (!limitW || limitW <= 0)) {
      result.assessmentStatus = 'unknown';
      result.reason = '缺少隧道限高/限宽数据';
      result.suggestion = '请补充隧道限高和限宽参数';
      result.assessmentScore = 0;
    } else {
      var heightOk = true;
      var widthOk = true;
      var issues = [];

      if (limitH && limitH > 0) {
        if (vehicle.heightM > limitH) {
          heightOk = false;
          result.exceedItems.push('height');
          issues.push('车高 ' + vehicle.heightM + 'm 超过限高 ' + limitH + 'm');
        } else if (vehicle.heightM > limitH * 0.95) {
          result.exceedItems.push('height_near');
          issues.push('车高 ' + vehicle.heightM + 'm 接近限高 ' + limitH + 'm（' + ((vehicle.heightM / limitH) * 100).toFixed(0) + '%）');
        }
      }

      if (limitW && limitW > 0) {
        if (vehicle.widthM > limitW) {
          widthOk = false;
          result.exceedItems.push('width');
          issues.push('车宽 ' + vehicle.widthM + 'm 超过限宽 ' + limitW + 'm');
        } else if (vehicle.widthM > limitW * 0.95) {
          result.exceedItems.push('width_near');
          issues.push('车宽 ' + vehicle.widthM + 'm 接近限宽 ' + limitW + 'm（' + ((vehicle.widthM / limitW) * 100).toFixed(0) + '%）');
        }
      }

      if (!heightOk || !widthOk) {
        result.assessmentStatus = 'forbidden';
        result.reason = issues.join('；');
        result.suggestion = '建议绕行';
        result.assessmentScore = 15;
      } else if (result.exceedItems.length > 0) {
        result.assessmentStatus = 'restricted';
        result.reason = issues.join('；');
        result.suggestion = '建议限速谨慎通行';
        result.assessmentScore = 60;
      } else {
        result.assessmentStatus = 'pass';
        result.reason = '车辆尺寸（高' + vehicle.heightM + 'm, 宽' + vehicle.widthM + 'm）满足隧道限界要求';
        result.suggestion = '正常通行';
        result.assessmentScore = 95;
      }
    }
  } else {
    // 普通道路控制点
    result.assessmentStatus = 'pass';
    result.reason = '普通道路控制点，默认可通行';
    result.suggestion = '正常通行';
    result.assessmentScore = 100;
  }

  return result;
}

function calculateSummary(results) {
  var summary = {
    totalCount: results.length,
    passCount: 0,
    restrictedCount: 0,
    forbiddenCount: 0,
    unknownCount: 0,
    overallStatus: 'unknown'
  };

  results.forEach(function(r) {
    if (r.assessmentStatus === 'pass') summary.passCount++;
    else if (r.assessmentStatus === 'restricted') summary.restrictedCount++;
    else if (r.assessmentStatus === 'forbidden') summary.forbiddenCount++;
    else summary.unknownCount++;
  });

  // 总体结论
  if (summary.forbiddenCount > 0) {
    summary.overallStatus = 'forbidden';
  } else if (summary.restrictedCount > 0) {
    summary.overallStatus = 'restricted';
  } else if (summary.unknownCount > 0) {
    summary.overallStatus = 'unknown';
  } else {
    summary.overallStatus = 'pass';
  }

  return summary;
}

// ============================================================
// 收集车辆参数
// ============================================================

function collectVehicleParams() {
  var v = hvState.vehicle;
  v.vehicleName = document.getElementById('hv-v-name').value || v.vehicleName;
  v.vehicleType = document.getElementById('hv-v-type').value;
  v.plateNumber = document.getElementById('hv-v-plate').value || '';
  v.totalWeightT = parseFloat(document.getElementById('hv-v-weight').value) || v.totalWeightT;
  v.axleCount = parseInt(document.getElementById('hv-v-axles').value) || v.axleCount;
  v.lengthM = parseFloat(document.getElementById('hv-v-length').value) || v.lengthM;
  v.widthM = parseFloat(document.getElementById('hv-v-width').value) || v.widthM;
  v.heightM = parseFloat(document.getElementById('hv-v-height').value) || v.heightM;
  v.turningRadiusM = parseFloat(document.getElementById('hv-v-radius').value) || v.turningRadiusM;
  v.cargoType = document.getElementById('hv-v-cargo').value || '';
}

// ============================================================
// 右侧卡片式明细渲染
// ============================================================

function renderDetailPanel() {
  var scroll = document.getElementById('hv-detail-scroll');
  var toolbar = document.getElementById('hv-detail-toolbar');
  var countEl = document.getElementById('hv-detail-count');
  if (!scroll) return;

  var facilities = hvState.facilities;
  var results = hvState.assessmentResults;

  // 更新计数
  if (countEl) {
    countEl.textContent = facilities.length + ' 个对象';
  }

  // 渲染筛选工具栏
  if (toolbar) {
    var filterStatus = hvState.detailFilter || 'all';
    var filterType = hvState.detailTypeFilter || 'all';
    toolbar.innerHTML = ''
      + '<div class="hv-detail-filters">'
      + '  <select class="hv-detail-filter-select" id="hv-detail-filter-status">'
      + '    <option value="all"' + (filterStatus === 'all' ? ' selected' : '') + '>全部状态</option>'
      + '    <option value="pass"' + (filterStatus === 'pass' ? ' selected' : '') + '>可通行</option>'
      + '    <option value="restricted"' + (filterStatus === 'restricted' ? ' selected' : '') + '>限制通行</option>'
      + '    <option value="forbidden"' + (filterStatus === 'forbidden' ? ' selected' : '') + '>不可通行</option>'
      + '    <option value="unknown"' + (filterStatus === 'unknown' ? ' selected' : '') + '>信息不足</option>'
      + '  </select>'
      + '  <select class="hv-detail-filter-select" id="hv-detail-filter-type">'
      + '    <option value="all"' + (filterType === 'all' ? ' selected' : '') + '>全部类型</option>'
      + '    <option value="bridge"' + (filterType === 'bridge' ? ' selected' : '') + '>桥梁</option>'
      + '    <option value="tunnel"' + (filterType === 'tunnel' ? ' selected' : '') + '>隧道</option>'
      + '  </select>'
      + '</div>';

    // 绑定筛选事件
    document.getElementById('hv-detail-filter-status').addEventListener('change', function() {
      hvState.detailFilter = this.value;
      renderDetailPanel();
    });
    document.getElementById('hv-detail-filter-type').addEventListener('change', function() {
      hvState.detailTypeFilter = this.value;
      renderDetailPanel();
    });
  }

  if (!facilities || facilities.length === 0) {
    scroll.innerHTML = '<div class="hv-empty" style="padding:40px 0;">暂无沿途对象<br><span style="font-size:11px;">请在顶部输入区添加桥梁或隧道</span></div>';
    return;
  }

  // 筛选
  var filtered = facilities.slice();
  if (hvState.detailFilter && hvState.detailFilter !== 'all') {
    filtered = filtered.filter(function(f) {
      var status = f.assessmentStatus || 'pending';
      if (hvState.detailFilter === 'unknown') return status === 'unknown' || status === 'pending';
      return status === hvState.detailFilter;
    });
  }
  if (hvState.detailTypeFilter && hvState.detailTypeFilter !== 'all') {
    filtered = filtered.filter(function(f) {
      return f.facilityType === hvState.detailTypeFilter;
    });
  }

  if (filtered.length === 0) {
    scroll.innerHTML = '<div class="hv-empty" style="padding:40px 0;">没有匹配的筛选结果</div>';
    return;
  }

  var html = '';
  filtered.forEach(function(f, idx) {
    var r = results ? (results.itemResults.find(function(item) { return item.facilityId === f.facilityId; }) || null) : null;
    var status = r ? r.assessmentStatus : (f.assessmentStatus || 'pending');
    var statusText = status === 'pass' ? '可通行' : status === 'restricted' ? '限制通行' : status === 'forbidden' ? '不可通行' : status === 'unknown' ? '信息不足' : '待评估';
    var statusColor = status === 'pass' ? '#4ADE80' : status === 'restricted' ? '#FBBF24' : status === 'forbidden' ? '#F87171' : '#94A3B8';
    var typeIcon = f.facilityType === 'bridge' ? '🌉' : '🚇';
    var typeLabel = f.facilityType === 'bridge' ? '桥梁' : '隧道';
    var reason = r ? (r.reason || '') : (f.reason || '');
    var suggestion = r ? (r.suggestion || '') : '';
    var score = r ? (r.assessmentScore || 0) : 0;
    var actualIdx = hvState.facilities.indexOf(f);

    html += '<div class="hv-detail-card" data-idx="' + actualIdx + '">'
      + '  <div class="hv-detail-card-main" onclick="window.__hvToggleDetail(this)">'
      + '    <div class="hv-detail-card-left">'
      + '      <span class="hv-detail-type-icon">' + typeIcon + '</span>'
      + '      <div class="hv-detail-card-info">'
      + '        <span class="hv-detail-card-name">' + (f.name || '未命名') + '</span>'
      + '        <span class="hv-detail-card-meta">' + (f.roadRef || '-') + ' / ' + (f.districtName || '-') + '</span>'
      + '      </div>'
      + '    </div>'
      + '    <div class="hv-detail-card-right">'
      + '      <span class="hv-detail-card-status" style="color:' + statusColor + ';">' + statusText + '</span>'
      + '      <span class="hv-detail-card-arrow">▶</span>'
      + '    </div>'
      + '  </div>'
      + '  <div class="hv-detail-card-expand" style="display:none;">'
      + '    <div class="hv-detail-card-body">'
      + '      <div class="hv-detail-info-row"><span>类型</span><span>' + typeLabel + '</span></div>'
      + '      <div class="hv-detail-info-row"><span>长度</span><span>' + (f.lengthM ? f.lengthM.toFixed(1) + ' m' : '-') + '</span></div>'
      + '      <div class="hv-detail-info-row"><span>限重</span><span>' + (f.limitWeightT ? f.limitWeightT + ' t' : '-') + '</span></div>'
      + '      <div class="hv-detail-info-row"><span>限高</span><span>' + (f.limitHeightM ? f.limitHeightM + ' m' : '-') + '</span></div>'
      + '      <div class="hv-detail-info-row"><span>限宽</span><span>' + (f.limitWidthM ? f.limitWidthM + ' m' : '-') + '</span></div>'
      + '      <div class="hv-detail-info-row"><span>车辆总重</span><span>' + (hvState.vehicle.totalWeightT || '-') + ' t</span></div>'
      + '      <div class="hv-detail-info-row"><span>车高</span><span>' + (hvState.vehicle.heightM || '-') + ' m</span></div>'
      + '      <div class="hv-detail-info-row"><span>车宽</span><span>' + (hvState.vehicle.widthM || '-') + ' m</span></div>'
      + '      <div class="hv-detail-info-row"><span>评估分数</span><span>' + (score ? score.toFixed(0) : '-') + '</span></div>'
      + (reason ? '<div class="hv-detail-info-row"><span>限制原因</span><span style="color:#F87171;">' + reason + '</span></div>' : '')
      + (suggestion ? '<div class="hv-detail-info-row"><span>建议措施</span><span style="color:#FBBF24;">' + suggestion + '</span></div>' : '')
      + '    </div>'
      + '    <div class="hv-detail-card-actions">'
      + '      <button class="hv-fi-btn" onclick="window.__hvDetailLocate(' + actualIdx + ')" title="定位">📍</button>'
      + '      <button class="hv-fi-btn" onclick="window.__hvDetailEdit(' + actualIdx + ')" title="编辑">✏️</button>'
      + '      <button class="hv-fi-btn danger" onclick="window.__hvDetailDelete(' + actualIdx + ')" title="删除">🗑️</button>'
      + '    </div>'
      + '  </div>'
      + '</div>';
  });

  scroll.innerHTML = html;

  // 绑定全局详情操作
  window.__hvToggleDetail = function(el) {
    var expand = el.nextElementSibling;
    var arrow = el.querySelector('.hv-detail-card-arrow');
    if (expand.style.display === 'none') {
      expand.style.display = 'block';
      if (arrow) arrow.innerHTML = '▼';
    } else {
      expand.style.display = 'none';
      if (arrow) arrow.innerHTML = '▶';
    }
  };

  window.__hvDetailLocate = function(idx) {
    window.__hvLocateFacility(idx);
  };

  window.__hvDetailEdit = function(idx) {
    window.__hvEditFacility(idx);
  };

  window.__hvDetailDelete = function(idx) {
    window.__hvDeleteFacility(idx);
  };
}

// ============================================================
// 底部结果报告区
// ============================================================

function renderResultFooter() {
  var conclusionBody = document.getElementById('hv-footer-conclusion-body');
  var statsBody = document.getElementById('hv-footer-stats-body');
  var risksBody = document.getElementById('hv-footer-risks-body');
  if (!conclusionBody) return;

  var results = hvState.assessmentResults;

  if (!results || !results.summary) {
    conclusionBody.innerHTML = '<div class="hv-footer-empty">暂无评估结果<br><span style="font-size:10px;">添加对象后点击「开始评估」</span></div>';
    if (statsBody) statsBody.innerHTML = '<div class="hv-footer-empty">暂无数据</div>';
    if (risksBody) risksBody.innerHTML = '<div class="hv-footer-empty">暂无数据</div>';
    return;
  }

  var summary = results.summary;

  // 综合结论
  var overallText = summary.overallStatus === 'pass' ? '✅ 可通行'
    : summary.overallStatus === 'restricted' ? '⚠️ 限制通行'
    : summary.overallStatus === 'forbidden' ? '🚫 不可通行'
    : '❓ 信息不足';
  var suggestionText = summary.overallStatus === 'pass' ? '正常通行'
    : summary.overallStatus === 'restricted' ? '限速限载通行'
    : summary.overallStatus === 'forbidden' ? '建议绕行'
    : '补充数据后再评估';
  var overallClass = summary.overallStatus === 'pass' ? 'pass'
    : summary.overallStatus === 'restricted' ? 'restricted'
    : summary.overallStatus === 'forbidden' ? 'forbidden'
    : 'unknown';

  conclusionBody.innerHTML = ''
    + '<div class="hv-footer-conclusion ' + overallClass + '">'
    + '  <div class="hv-footer-conclusion-text">' + overallText + '</div>'
    + '  <div class="hv-footer-conclusion-detail">评估对象：' + summary.totalCount + ' 个</div>'
    + '  <div class="hv-footer-conclusion-detail">建议：' + suggestionText + '</div>'
    + '  <div class="hv-footer-conclusion-detail" style="font-size:10px;color:var(--text-muted);">方案状态：' + hvState.schemeStatus + '</div>'
    + '</div>';

  // 通行状态统计
  if (statsBody) {
    statsBody.innerHTML = ''
      + '<div class="hv-footer-stats-grid">'
      + '  <div class="hv-footer-stat-item"><span class="hv-footer-stat-num" style="color:#4ADE80;">' + summary.passCount + '</span><span class="hv-footer-stat-label">可通行</span></div>'
      + '  <div class="hv-footer-stat-item"><span class="hv-footer-stat-num" style="color:#FBBF24;">' + summary.restrictedCount + '</span><span class="hv-footer-stat-label">限制通行</span></div>'
      + '  <div class="hv-footer-stat-item"><span class="hv-footer-stat-num" style="color:#F87171;">' + summary.forbiddenCount + '</span><span class="hv-footer-stat-label">不可通行</span></div>'
      + '  <div class="hv-footer-stat-item"><span class="hv-footer-stat-num" style="color:#94A3B8;">' + summary.unknownCount + '</span><span class="hv-footer-stat-label">信息不足</span></div>'
      + '</div>';
  }

  // 关键风险对象
  if (risksBody) {
    risksBody.innerHTML = renderRiskItems(results.itemResults);
  }
}

function renderRiskItems(itemResults) {
  // 排序：不可通行 > 限制通行 > 信息不足 > 可通行
  var sorted = (itemResults || []).slice().sort(function(a, b) {
    var order = { forbidden: 0, restricted: 1, unknown: 2, pass: 3 };
    return (order[a.assessmentStatus] || 4) - (order[b.assessmentStatus] || 4);
  });

  // 只显示前5个非可通行的
  var riskItems = sorted.filter(function(r) { return r.assessmentStatus !== 'pass'; }).slice(0, 5);

  if (riskItems.length === 0) {
    return '<div class="hv-empty" style="padding:12px 0;font-size:11px;">所有对象均评估为可通行 ✅</div>';
  }

  var html = '';
  riskItems.forEach(function(r) {
    var statusIcon = r.assessmentStatus === 'forbidden' ? '🚫' : r.assessmentStatus === 'restricted' ? '⚠️' : '❓';
    html += '<div class="hv-risk-item" data-facility-id="' + r.facilityId + '" onclick="window.__hvRiskLocate(\'' + r.facilityId + '\')">'
      + '  <span>' + statusIcon + '</span>'
      + '  <span class="hv-risk-name">' + (r.name || '未命名') + '</span>'
      + '  <span class="hv-risk-reason">' + (r.reason ? r.reason.substring(0, 20) + (r.reason.length > 20 ? '...' : '') : '-') + '</span>'
      + '</div>';
  });
  return html;
}

// 风险对象定位
window.__hvRiskLocate = function(facilityId) {
  flyToHVFacility(facilityId);
  // 高亮右侧对应卡片
  var cards = document.querySelectorAll('.hv-detail-card');
  cards.forEach(function(card) {
    var idx = parseInt(card.dataset.idx);
    var f = hvState.facilities[idx];
    if (f && f.facilityId === facilityId) {
      card.style.borderColor = '#38BDF8';
      card.style.boxShadow = '0 0 12px rgba(56,189,248,0.3)';
      // 展开详情
      var expand = card.querySelector('.hv-detail-card-expand');
      var arrow = card.querySelector('.hv-detail-card-arrow');
      if (expand) expand.style.display = 'block';
      if (arrow) arrow.innerHTML = '▼';
    } else {
      card.style.borderColor = '';
      card.style.boxShadow = '';
    }
  });
};

// ============================================================
// 状态更新
// ============================================================

function updateStatusBadge() {
  var badge = document.getElementById('hv-status-badge');
  if (badge) badge.textContent = hvState.schemeStatus;
}

// ============================================================
// 保存方案
// ============================================================

function saveScheme() {
  collectVehicleParams();
  var schemeName = document.getElementById('hv-scheme-name').value || '默认方案';

  var scheme = {
    assessmentId: 'HVA_' + Date.now(),
    schemeName: schemeName,
    vehicle: JSON.parse(JSON.stringify(hvState.vehicle)),
    facilities: JSON.parse(JSON.stringify(hvState.facilities)),
    assessmentResults: hvState.assessmentResults ? JSON.parse(JSON.stringify(hvState.assessmentResults)) : null,
    createdAt: new Date().toISOString()
  };

  // 保存到 localStorage
  try {
    api.saveHeavyVehicleAssessmentScheme(scheme).then(function() {
      hvState.schemeStatus = '已保存';
      updateStatusBadge();
      showToast('✅ 方案「' + schemeName + '」已保存', 'success');
    }).catch(function() {
      // 降级到 localStorage 直接保存
      fallbackSaveScheme(scheme);
    });
  } catch (e) {
    fallbackSaveScheme(scheme);
  }
}

function fallbackSaveScheme(scheme) {
  try {
    var saved = JSON.parse(localStorage.getItem('hv_schemes') || '[]');
    saved.unshift(scheme);
    localStorage.setItem('hv_schemes', JSON.stringify(saved));
    hvState.schemeStatus = '已保存';
    updateStatusBadge();
    showToast('✅ 方案已保存到本地', 'success');
  } catch (e) {
    showToast('❌ 保存失败: ' + e.message, 'error');
  }
}

// ============================================================
// 导出报告
// ============================================================

function exportReport() {
  if (!hvState.assessmentResults) {
    showToast('⚠️ 请先进行评估再导出报告', 'warning');
    return;
  }

  collectVehicleParams();

  var report = {
    reportTitle: '重车通行安全评估报告',
    schemeName: hvState.schemeName,
    exportTime: new Date().toLocaleString(),
    vehicle: hvState.vehicle,
    facilityCount: hvState.facilities.length,
    summary: hvState.assessmentResults.summary,
    itemResults: hvState.assessmentResults.itemResults,
    facilities: hvState.facilities
  };

  var json = JSON.stringify(report, null, 2);
  var blob = new Blob([json], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = '重车评估报告_' + hvState.schemeName + '_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);

  showToast('📤 报告已导出为 JSON 文件', 'success');
}

// ============================================================
// 重置
// ============================================================

function resetAll() {
  if (hvState.facilities.length > 0 || hvState.assessmentResults) {
    if (!confirm('确定要重置所有参数和结果吗？')) return;
  }

  hvState.vehicle = getDefaultVehicle();
  hvState.facilities = [];
  hvState.assessmentResults = null;
  hvState.schemeStatus = '未评估';
  updateStatusBadge();

  // 重新渲染
  renderInputStrip();
  renderDetailPanel();
  renderResultFooter();
  clearHVFacilityMarkers();
  clearHVAssessmentHighlights();

  showToast('🔄 已重置所有参数', 'info');
}

// ============================================================
// Toast 提示
// ============================================================

function showToast(message, type) {
  // 检查是否已有全局 toast 函数
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