/**
 * 🌋 灾害韧性评估模块（全屏专业版）
 *
 * 模块架构：
 * 1. 泥石流灾害危险性预测子模块（致灾端）
 * 2. 交通路网桥梁韧性鲁棒性评估子模块（承灾端）
 * 3. 联合综合风险可视化与成果输出中心（统一展示、导出）
 *
 * 整体业务链路：
 * 录入流域/路网基础数据 → 泥石流危险性计算 → 路网桥梁承灾体受损韧性评估 → 可视化输出
 *
 * 布局：
 * ┌──────────────────────────────────────────────────────────────┐
 * │ 顶部工具栏：工况选择 + 参数模板 + 方案保存 + 导出报告        │
 * ├──────────────────────────────────────────────────────────────┤
 * │ 左侧功能选项卡：数据录入 → 危险性预测 → 韧性评估 → 成果展示 │
 * ├──────────────────────────────────┬───────────────────────────┤
 * │ 中部：GIS地图区域                │ 右侧：结果明细+图表看板   │
 * └──────────────────────────────────┴───────────────────────────┘
 */

import api, { checkBackendFast, setBackendAvailable, resetBackendStatus } from '../api/index.js';
import { getMap, clearAllDebrisLayers, addDebrisRiskLayer, addDebrisImpactLayer, addRoadDamageLayer, flyToDebrisFeature, fitDebrisBounds } from '../utils/mapUtils.js';
import { createThresholdCurveChart, createCopulaHeatmap } from '../utils/debrisChartUtils.js';

// ============================================================
// 状态管理
// ============================================================

var isActive = false;
var originalMapParent = null;

var debrisState = {
  currentStep: 'input',         // input → hazard → resilience → result
  currentTab: 'terrain',        // 当前数据录入标签页: terrain/rainfall/auxiliary
  workingCondition: 'default',  // 当前工况: default/light/moderate/heavy/extreme
  schemeName: '默认方案',
  schemeStatus: '未计算',

  // 子模块1：泥石流危险性计算结果
  hazardResult: null,
  // 子模块2：路网韧性评估结果
  resilienceResult: null,

  // 参数配置
  parameters: {
    // 地形参数
    terrain: {
      relativeHeight: '',       // 相对高差H (m)
      channelLength: '',        // 沟道长度L (m)
      averageWidth: '',         // 平均沟道宽度B (m)
      basinArea: '',            // 流域面积A (km²)
      M_threshold: 0.51,        // 综合地形因子M阈值（可修改）
    },
    // 降雨参数
    rainfall: {
      K: 0.85,                  // 降雨衰减系数（默认）
      rainDuration: '',         // 降雨历时D (h)
      realIntensity: '',        // 实时雨强I (mm/h)
      real24h: '',              // 24h日预报雨量 (mm)
    },
    // 韧性评估权重配置
    resilienceWeights: {
      Rcom: 0.25,
      Rgcc: 0.20,
      Reff: 0.20,
      Racc: 0.25,
      Rcap: 0.10,
    }
  },

  // 数据缓存
  importedData: {
    terrainFiles: [],
    rainfallFiles: [],
    roadnetFiles: [],
    bridgeFiles: [],
  },

  // 预警列表
  highRiskWarnings: [],
};

// ============================================================
// 导出接口
// ============================================================

export function isDebrisResilienceActive() {
  return isActive;
}

export function openDebrisResilienceModule() {
  if (isActive) return;
  isActive = true;
  document.body.classList.add('debris-active');

  // 重置状态
  resetDebrisState();

  // 保存原始地图容器位置
  var mapEl = document.getElementById('map');
  if (mapEl && mapEl.parentNode) {
    originalMapParent = mapEl.parentNode;
  }

  buildFullLayout();
  bindToolbarEvents();
  renderLeftStepPanel();
  renderRightResultPanel();
  connectMapToLayout();

  checkDebrisBackendStatus();

  showToast('🌋 已进入灾害韧性评估工作台', 'info');
}

export function closeDebrisResilienceModule() {
  if (!isActive) return;
  isActive = false;
  document.body.classList.remove('debris-active');

  // 恢复地图到原始位置
  var mapEl = document.getElementById('map');
  if (mapEl && originalMapParent) {
    try {
      originalMapParent.appendChild(mapEl);
    } catch (e) {
      console.warn('[Debris] 恢复地图位置失败:', e);
    }
  }
  originalMapParent = null;

  var overlay = document.getElementById('debris-overlay');
  if (overlay) overlay.remove();

  clearAllDebrisLayers();

  // 强制刷新地图尺寸
  var map = getMap();
  if (map) {
    requestAnimationFrame(function() {
      map.invalidateSize();
    });
  }

  showToast('已退出灾害韧性评估', 'info');
}

function resetDebrisState() {
  debrisState.currentStep = 'input';
  debrisState.currentTab = 'terrain';
  debrisState.workingCondition = 'default';
  debrisState.schemeStatus = '未计算';
  debrisState.hazardResult = null;
  debrisState.resilienceResult = null;
  debrisState.highRiskWarnings = [];
}

// ============================================================
// 构建全屏布局
// ============================================================

function buildFullLayout() {
  var existing = document.getElementById('debris-overlay');
  if (existing) existing.remove();

  var modalContainer = document.getElementById('modal-container') || document.body;
  var overlay = document.createElement('div');
  overlay.id = 'debris-overlay';
  overlay.className = 'debris-overlay';

  overlay.innerHTML = `
    <!-- 顶部工具栏 -->
    <div class="debris-toolbar">
      <div class="debris-toolbar-left">
        <span class="debris-toolbar-title">🌋 灾害韧性评估</span>
        <span id="debris-backend-status" style="font-size:11px;color:var(--text-muted);">⏳ 检测中...</span>
        <button class="debris-toolbar-btn-sm" id="debris-btn-refresh-backend" title="重新检测后端连接">🔃</button>
      </div>
      <div class="debris-toolbar-center">
        <select id="debris-condition-select" class="debris-condition-select">
          <option value="default">默认工况</option>
          <option value="light">小雨情景</option>
          <option value="moderate">暴雨情景</option>
          <option value="heavy">大暴雨情景</option>
          <option value="extreme">特大暴雨情景</option>
        </select>
        <input class="debris-scheme-name" id="debris-scheme-name" value="${debrisState.schemeName}" placeholder="方案名称" />
        <span class="debris-status-badge" id="debris-status-badge">${debrisState.schemeStatus}</span>
      </div>
      <div class="debris-toolbar-right">
        <button class="debris-toolbar-btn" id="debris-btn-save">💾 保存方案</button>
        <button class="debris-toolbar-btn" id="debris-btn-export">📤 导出报告</button>
        <button class="debris-toolbar-btn danger" id="debris-btn-reset">🔄 重置</button>
        <button class="debris-toolbar-btn danger" id="debris-btn-close">✕ 返回</button>
      </div>
    </div>

    <!-- 主内容区域：左 + 中(地图) + 右 -->
    <div class="debris-main-container">
      <!-- 左侧：步骤导航 + 参数输入 -->
      <div class="debris-left-panel" id="debris-left-panel"></div>

      <!-- 中部：地图 -->
      <div class="debris-map-panel" id="debris-map-panel">
        <!-- 原始 #map 会被移动到这里 -->
      </div>

      <!-- 右侧：结果展示 + 图表 -->
      <div class="debris-right-panel" id="debris-right-panel"></div>
    </div>

    <!-- 底部预警条 -->
    <div class="debris-footer-alert" id="debris-footer-alert">
      <div class="debris-alert-title">🚨 高风险预警列表</div>
      <div class="debris-alert-list" id="debris-alert-list"></div>
    </div>
  `;

  modalContainer.appendChild(overlay);
}

function connectMapToLayout() {
  var originalMap = document.getElementById('map');
  var mapPanel = document.getElementById('debris-map-panel');
  if (originalMap && mapPanel) {
    mapPanel.appendChild(originalMap);
  }

  var map = getMap();
  if (map) {
    requestAnimationFrame(function() {
      map.invalidateSize();
      setTimeout(function() {
        map.invalidateSize();
      }, 200);
    });
  }
}

// ============================================================
// 工具栏事件绑定
// ============================================================

function bindToolbarEvents() {
  document.getElementById('debris-btn-refresh-backend')?.addEventListener('click', function() {
    resetBackendStatus();
    checkDebrisBackendStatus();
  });

  document.getElementById('debris-condition-select')?.addEventListener('change', function(e) {
    debrisState.workingCondition = e.target.value;
    loadWorkingCondition(debrisState.workingCondition);
    renderLeftStepPanel();
    showToast('已切换工况: ' + e.target.selectedOptions[0].text, 'info');
  });

  document.getElementById('debris-scheme-name')?.addEventListener('input', function(e) {
    debrisState.schemeName = e.target.value;
  });

  document.getElementById('debris-btn-save')?.addEventListener('click', function() {
    saveCurrentScheme();
  });

  document.getElementById('debris-btn-export')?.addEventListener('click', function() {
    exportAssessmentReport();
  });

  document.getElementById('debris-btn-reset')?.addEventListener('click', function() {
    if (confirm('确定要重置所有参数和结果吗？')) {
      resetDebrisState();
      resetDebrisState();
      renderLeftStepPanel();
      renderRightResultPanel();
      clearAllDebrisLayers();
      showToast('已重置所有参数', 'info');
    }
  });

  document.getElementById('debris-btn-close')?.addEventListener('click', function() {
    closeDebrisResilienceModule();
  });
}

// ============================================================
// 左侧步骤面板渲染
// ============================================================

function renderLeftStepPanel() {
  var panel = document.getElementById('debris-left-panel');
  if (!panel) return;

  var steps = [
    { id: 'input', label: '📥 数据输入', active: debrisState.currentStep === 'input' },
    { id: 'hazard', label: '🌄 灾害预测', active: debrisState.currentStep === 'hazard', disabled: !hasInputData() },
    { id: 'resilience', label: '🛣️ 韧性评估', active: debrisState.currentStep === 'resilience', disabled: !debrisState.hazardResult },
    { id: 'result', label: '📊 结果导出', active: debrisState.currentStep === 'result', disabled: !debrisState.resilienceResult },
  ];

  var contentHtml = '';

  if (debrisState.currentStep === 'input') {
    // 自动填充示例数据（首次进入）
    if (!debrisState.parameters.terrain.relativeHeight) {
      fillMockData();
    }
    contentHtml = renderDataInputContent();
  } else if (debrisState.currentStep === 'hazard') {
    contentHtml = renderHazardConfigContent();
  } else if (debrisState.currentStep === 'resilience') {
    contentHtml = renderResilienceConfigContent();
  } else if (debrisState.currentStep === 'result') {
    contentHtml = renderResultConfigContent();
  }

  panel.innerHTML = `
    <div class="debris-step-nav">
      ${steps.map(s => `
        <div class="debris-step-item ${s.active ? 'active' : ''} ${s.disabled ? 'disabled' : ''}" data-step="${s.id}">
          <span class="debris-step-label">${s.label}</span>
        </div>
      `).join('')}
    </div>
    <div class="debris-step-content">
      ${contentHtml}
    </div>
  `;

  // 绑定步骤点击事件
  panel.querySelectorAll('.debris-step-item:not(.disabled)').forEach(item => {
    item.addEventListener('click', function() {
      var stepId = this.dataset.step;
      debrisState.currentStep = stepId;
      renderLeftStepPanel();
      renderRightResultPanel();
    });
  });

  bindInputEvents();
}

// ============================================================
// 1. 数据录入内容渲染
// ============================================================

function renderDataInputContent() {
  var tabs = [
    { id: 'terrain', label: '地形数据', active: debrisState.currentTab === 'terrain' },
    { id: 'rainfall', label: '降雨气象', active: debrisState.currentTab === 'rainfall' },
    { id: 'auxiliary', label: '辅助建模', active: debrisState.currentTab === 'auxiliary' },
    { id: 'roadnet', label: '路网桥梁', active: debrisState.currentTab === 'roadnet' },
  ];

  var p = debrisState.parameters;

  var contentByTab = {
    terrain: `
      <div class="form-group">
        <label class="form-label">相对高差 H (m)</label>
        <input type="number" class="form-input" id="input-relative-height" value="${p.terrain.relativeHeight}" placeholder="输入流域相对高差" />
      </div>
      <div class="form-group">
        <label class="form-label">沟道长度 L (m)</label>
        <input type="number" class="form-input" id="input-channel-length" value="${p.terrain.channelLength}" placeholder="输入主沟道长度" />
      </div>
      <div class="form-group">
        <label class="form-label">平均沟道宽度 B (m)</label>
        <input type="number" class="form-input" id="input-average-width" value="${p.terrain.averageWidth}" placeholder="输入沟道平均宽度" />
      </div>
      <div class="form-group">
        <label class="form-label">流域面积 A (km²)</label>
        <input type="number" step="0.01" class="form-input" id="input-basin-area" value="${p.terrain.basinArea}" placeholder="输入流域面积" />
      </div>
      <div class="form-group">
        <label class="form-label">综合地形因子 M 阈值</label>
        <input type="number" step="0.01" class="form-input" id="input-m-threshold" value="${p.terrain.M_threshold}" />
        <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">系统默认 0.51，可根据区域特征调整</div>
      </div>
      <div class="form-group">
        <label class="form-label">批量导入地形文件</label>
        <div class="file-upload-area" id="terrain-upload-area">
          <div style="text-align:center;color:var(--text-muted);font-size:11px;">
            📁 拖拽文件或点击上传<br/>
            支持: SHP流域边界、DEM栅格文件
          </div>
          <input type="file" id="terrain-file-input" multiple style="display:none;" />
        </div>
        <div id="terrain-file-list" class="file-list"></div>
      </div>
    `,
    rainfall: `
      <div class="form-group">
        <label class="form-label">24h预报雨量 P_real (mm)</label>
        <input type="number" step="0.1" class="form-input" id="input-real-24h" value="${p.rainfall.real24h}" placeholder="输入24小时预报降雨量" />
      </div>
      <div class="form-group">
        <label class="form-label">降雨历时 D (h)</label>
        <input type="number" class="form-input" id="input-rain-duration" value="${p.rainfall.rainDuration}" placeholder="输入降雨历时" />
      </div>
      <div class="form-group">
        <label class="form-label">实时雨强 I (mm/h)</label>
        <input type="number" step="0.1" class="form-input" id="input-real-intensity" value="${p.rainfall.realIntensity}" placeholder="输入实时降雨强度" />
      </div>
      <div class="form-group collapse-header">
        <span class="form-label">模型参数 (点击展开)</span>
        <button class="btn-collapse" id="btn-collapse-params">▼</button>
      </div>
      <div class="collapse-content" id="content-rain-params" style="display:none;">
        <div class="form-group">
          <label class="form-label">降雨衰减系数 K</label>
          <input type="number" step="0.01" class="form-input" id="input-k-value" value="${p.rainfall.K}" />
          <div style="font-size:11px;color:var(--text-muted);margin-top:4px;">默认 0.85，前期有效降雨计算用</div>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">导入降雨数据文件</label>
        <div class="file-upload-area" id="rainfall-upload-area">
          <div style="text-align:center;color:var(--text-muted);font-size:11px;">
            📁 拖拽文件或点击上传<br/>
            支持: Excel逐日降雨序列、预报网格数据
          </div>
          <input type="file" id="rainfall-file-input" multiple style="display:none;" />
        </div>
        <div id="rainfall-file-list" class="file-list"></div>
      </div>
    `,
    auxiliary: `
      <div class="form-group">
        <label class="form-label">评价单元栅格尺寸 (m)</label>
        <input type="number" class="form-input" id="input-grid-size" value="30" placeholder="网格划分尺寸" />
      </div>
      <div class="form-group">
        <label class="form-label">ROC/AUC 检验阈值</label>
        <input type="number" step="0.01" class="form-input" id="input-roc-threshold" value="0.70" placeholder="模型验证阈值" />
      </div>
      <div class="form-group">
        <label class="form-label">导入历史泥石流事件</label>
        <div class="file-upload-area" id="history-upload-area">
          <div style="text-align:center;color:var(--text-muted);font-size:11px;">
            📁 导入Excel历史事件数据集<br/>
            包含: 发生时间、冲出体积、桥梁损毁
          </div>
          <input type="file" id="history-file-input" style="display:none;" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">导入桥梁点位矢量</label>
        <div class="file-upload-area" id="bridge-upload-area">
          <div style="text-align:center;color:var(--text-muted);font-size:11px;">
            📁 导入SHP/GEOJSON桥梁数据<br/>
            包含: 坐标、结构信息
          </div>
          <input type="file" id="bridge-point-input" style="display:none;" />
        </div>
        <div id="bridge-file-list" class="file-list"></div>
      </div>
    `,
    roadnet: `
      <div class="form-group">
        <label class="form-label">导入路网矢量数据</label>
        <div class="file-upload-area" id="roadnet-upload-area">
          <div style="text-align:center;color:var(--text-muted);font-size:11px;">
            📁 拖拽文件或点击上传<br/>
            支持: SHP道路线段、节点拓扑
          </div>
          <input type="file" id="roadnet-file-input" multiple style="display:none;" />
        </div>
        <div id="roadnet-file-list" class="file-list"></div>
      </div>
      <div class="form-group">
        <label class="form-label">应急设施数据</label>
        <div class="file-upload-area" id="emergency-upload-area">
          <div style="text-align:center;color:var(--text-muted);font-size:11px;">
            📁 导入医院/安置点/储备点<br/>
            格式: CSV/SHP
          </div>
          <input type="file" id="emergency-file-input" style="display:none;" />
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">应急可达时间阈值 (分钟)</label>
        <input type="number" class="form-input" id="input-emergency-time" value="30" placeholder="T=30分钟" />
      </div>
    `
  };

  var currentTab = debrisState.currentTab;
  var fileListHtml = {
    terrain: renderFileList(debrisState.importedData.terrainFiles),
    rainfall: renderFileList(debrisState.importedData.rainfallFiles),
    roadnet: renderFileList(debrisState.importedData.roadnetFiles),
  };

  return `
    <div class="debris-input-tabs">
      ${tabs.map(t => `
        <button class="debris-input-tab ${t.active ? 'active' : ''}" data-tab="${t.id}">${t.label}</button>
      `).join('')}
    </div>
    <div class="debris-input-content">
      ${contentByTab[currentTab]}
    </div>
    <div style="margin-top:12px;">
      <button class="btn-primary btn-full" id="btn-next-to-hazard">下一步 → 灾害预测</button>
    </div>
  `;
}

function renderFileList(files) {
  if (!files || files.length === 0) return '';
  return '<div style="margin-top:6px;">' + files.map(f => `
    <div style="font-size:11px;padding:4px 6px;background:rgba(56,189,248,0.1);border-radius:4px;margin-bottom:2px;">
      📄 ${f.name}
    </div>
  `).join('') + '</div>';
}

// ============================================================
// 2. 危险性预测配置
// ============================================================

function renderHazardConfigContent() {
  var summary = getInputDataSummary();
  var p = debrisState.parameters;

  return `
    <div class="debris-config-summary">
      <div class="summary-title">📋 已录入数据摘要</div>
      <div class="summary-item">
        <span>流域地形参数</span>
        <span class="${summary.hasTerrain ? 'text-ok' : 'text-missing'}">${summary.hasTerrain ? '✓ 已完成' : '○ 不完整'}</span>
      </div>
      <div class="summary-item">
        <span>降雨气象数据</span>
        <span class="${summary.hasRainfall ? 'text-ok' : 'text-missing'}">${summary.hasRainfall ? '✓ 已完成' : '○ 不完整'}</span>
      </div>
      <div class="summary-item">
        <span>辅助建模数据</span>
        <span class="${summary.hasAuxiliary ? 'text-ok' : 'text-missing'}">${summary.hasAuxiliary ? '✓ 已完成' : '○ 可选'}</span>
      </div>
      <div class="summary-item">
        <span>导入文件数量</span>
        <span>${summary.totalFiles} 个</span>
      </div>
    </div>

    <div class="form-section-title">⚙️ 计算选项</div>

    <div class="checkbox-group">
      <label class="checkbox-item">
        <input type="checkbox" id="calc-susceptibility" checked />
        <span>泥石流易发性评价（灰色关联法）</span>
      </label>
      <label class="checkbox-item">
        <input type="checkbox" id="calc-threshold" checked />
        <span>降雨阈值与临界雨量计算</span>
      </label>
      <label class="checkbox-item">
        <input type="checkbox" id="calc-probability" checked />
        <span>发生概率与冲出规模预测</span>
      </label>
      <label class="checkbox-item">
        <input type="checkbox" id="calc-bridge-probability" checked />
        <span>桥梁链式破坏概率计算</span>
      </label>
    </div>

    <div class="form-section-title">权重方案</div>
    <div class="radio-group">
      <label class="radio-item">
        <input type="radio" name="weight-scheme" value="ahp-entropy" checked />
        <span>AHP主观 + 熵权客观组合</span>
      </label>
      <label class="radio-item">
        <input type="radio" name="weight-scheme" value="critic" />
        <span>CRITIC客观权重法</span>
      </label>
      <label class="radio-item">
        <input type="radio" name="weight-scheme" value="custom" />
        <span>自定义权重</span>
      </label>
    </div>

    <div style="margin-top:16px;">
      <button class="btn-secondary btn-full" id="btn-back-to-input">← 返回数据录入</button>
      <button class="btn-primary btn-full" id="btn-run-hazard-calc" style="margin-top:8px;">
        ⚡ 执行泥石流危险性计算
      </button>
    </div>
  `;
}

function getInputDataSummary() {
  var p = debrisState.parameters;
  var t = p.terrain;
  var r = p.rainfall;

  return {
    hasTerrain: !!(t.relativeHeight && t.channelLength && t.averageWidth && t.basinArea),
    hasRainfall: !!(r.real24h && r.rainDuration && r.realIntensity),
    hasAuxiliary: !!(debrisState.importedData.bridgeFiles.length > 0),
    totalFiles: debrisState.importedData.terrainFiles.length +
                debrisState.importedData.rainfallFiles.length +
                debrisState.importedData.roadnetFiles.length,
  };
}

function hasInputData() {
  var summary = getInputDataSummary();
  return summary.hasTerrain && summary.hasRainfall;
}

// ============================================================
// 3. 韧性评估配置
// ============================================================

function renderResilienceConfigContent() {
  var w = debrisState.parameters.resilienceWeights;

  return `
    <div class="debris-config-summary">
      <div class="summary-title">🌄 危险性计算状态</div>
      <div class="summary-item">
        <span>计算状态</span>
        <span class="text-ok">✓ 已完成</span>
      </div>
      ${debrisState.hazardResult ? `
        <div class="summary-item">
          <span>高风险沟道</span>
          <span style="color:#F87171;font-weight:600;">${debrisState.hazardResult.highRiskCount || 0} 条</span>
        </div>
        <div class="summary-item">
          <span>风险桥梁</span>
          <span style="color:#F87171;font-weight:600;">${debrisState.hazardResult.atRiskBridges || 0} 座</span>
        </div>
      ` : ''}
    </div>

    <div class="form-section-title">📊 综合鲁棒性指标权重</div>
    <div class="weight-slider-group">
      <div class="weight-item">
        <div class="weight-label">
          <span>R_com 连通保持率</span>
          <span class="weight-value">${w.Rcom.toFixed(2)}</span>
        </div>
        <input type="range" min="0" max="1" step="0.05" class="weight-slider" data-key="Rcom" value="${w.Rcom}" />
      </div>
      <div class="weight-item">
        <div class="weight-label">
          <span>R_gcc 最大连通子图</span>
          <span class="weight-value">${w.Rgcc.toFixed(2)}</span>
        </div>
        <input type="range" min="0" max="1" step="0.05" class="weight-slider" data-key="Rgcc" value="${w.Rgcc}" />
      </div>
      <div class="weight-item">
        <div class="weight-label">
          <span>R_eff 网络效率</span>
          <span class="weight-value">${w.Reff.toFixed(2)}</span>
        </div>
        <input type="range" min="0" max="1" step="0.05" class="weight-slider" data-key="Reff" value="${w.Reff}" />
      </div>
      <div class="weight-item">
        <div class="weight-label">
          <span>R_acc 可达性保持</span>
          <span class="weight-value">${w.Racc.toFixed(2)}</span>
        </div>
        <input type="range" min="0" max="1" step="0.05" class="weight-slider" data-key="Racc" value="${w.Racc}" />
      </div>
      <div class="weight-item">
        <div class="weight-label">
          <span>R_cap 容量保持率</span>
          <span class="weight-value">${w.Rcap.toFixed(2)}</span>
        </div>
        <input type="range" min="0" max="1" step="0.05" class="weight-slider" data-key="Rcap" value="${w.Rcap}" />
      </div>
    </div>

    <div class="form-section-title">💾 权重方案</div>
    <div class="scheme-buttons">
      <button class="btn-sm-secondary" id="btn-save-weight-scheme">保存当前权重</button>
      <button class="btn-sm-secondary" id="btn-reset-weight">恢复默认权重</button>
    </div>

    <div style="margin-top:16px;">
      <button class="btn-secondary btn-full" id="btn-back-to-hazard">← 返回危险性配置</button>
      <button class="btn-primary btn-full" id="btn-run-resilience-calc" style="margin-top:8px;">
        🛣️ 执行路网韧性评估计算
      </button>
    </div>
  `;
}

// ============================================================
// 4. 成果输出配置
// ============================================================

function renderResultConfigContent() {
  return `
    <div class="debris-config-summary">
      <div class="summary-title">✅ 计算完成</div>
      <div class="summary-item">
        <span>泥石流危险性</span>
        <span class="text-ok">✓ 已完成</span>
      </div>
      <div class="summary-item">
        <span>路网韧性评估</span>
        <span class="text-ok">✓ 已完成</span>
      </div>
      <div class="summary-item">
        <span>综合鲁棒性得分</span>
        <span style="font-weight:700;" class="${getRobustnessScoreClass()}">${debrisState.resilienceResult?.robustTotal?.toFixed(2) || '-'}</span>
      </div>
    </div>

    <div class="form-section-title">📤 导出选项</div>
    <div class="checkbox-group">
      <label class="checkbox-item">
        <input type="checkbox" id="export-excel" checked />
        <span>Excel 数据表格</span>
      </label>
      <label class="checkbox-item">
        <input type="checkbox" id="export-charts" checked />
        <span>分析图表图片 (PNG)</span>
      </label>
      <label class="checkbox-item">
        <input type="checkbox" id="export-report" checked />
        <span>Word/PDF 评估报告</span>
      </label>
      <label class="checkbox-item">
        <input type="checkbox" id="export-shp" checked />
        <span>矢量图层 (SHP)</span>
      </label>
    </div>

    <div class="form-section-title">🎨 可视化主题</div>
    <div class="radio-group">
      <label class="radio-item">
        <input type="radio" name="map-theme" value="standard" checked />
        <span>标准风险色系</span>
      </label>
      <label class="radio-item">
        <input type="radio" name="map-theme" value="thermal" />
        <span>热力渐变主题</span>
      </label>
      <label class="radio-item">
        <input type="radio" name="map-theme" value="monochrome" />
        <span>打印灰度主题</span>
      </label>
    </div>

    <div style="margin-top:16px;">
      <button class="btn-secondary btn-full" id="btn-back-to-resilience">← 返回韧性配置</button>
      <button class="btn-primary btn-full" id="btn-generate-output" style="margin-top:8px;">
        📊 生成综合可视化成果
      </button>
      <button class="btn-secondary btn-full" id="btn-export-report-now" style="margin-top:8px;">
        📤 导出评估报告
      </button>
    </div>
  `;
}

function getRobustnessScoreClass() {
  if (!debrisState.resilienceResult) return '';
  var score = debrisState.resilienceResult.robustTotal || 0;
  if (score >= 0.8) return 'text-ok';
  if (score >= 0.6) return 'text-warning';
  return 'text-danger';
}

// ============================================================
// 右侧结果面板渲染
// ============================================================

function renderRightResultPanel() {
  var panel = document.getElementById('debris-right-panel');
  if (!panel) return;

  if (debrisState.currentStep === 'input') {
    panel.innerHTML = `
      <div class="debris-right-header">
        <span>ℹ️ 数据录入向导</span>
      </div>
      <div class="debris-right-content">
        <div style="text-align:center;padding:40px 16px;color:var(--text-muted);">
          <div style="font-size:48px;margin-bottom:12px;">📥</div>
          <div style="font-weight:600;margin-bottom:8px;">请在左侧录入基础数据</div>
          <div style="font-size:12px;line-height:1.6;">
            按顺序录入：地形数据 → 降雨气象 → 辅助建模 → 路网桥梁<br/>
            完成后点击"下一步"进入灾害预测阶段
          </div>
          <div style="margin-top:20px;padding:12px;background:rgba(251,191,36,0.1);border:1px solid rgba(251,191,36,0.2);border-radius:6px;font-size:11px;text-align:left;">
            <strong>💡 提示：</strong><br/>
            • 支持单沟手动参数录入和批量流域文件导入<br/>
            • 所有模型内置参数可在面板微调<br/>
            • 示例数据已自动填充，可直接进入下一步
          </div>
        </div>
      </div>
    `;
  } else if (debrisState.currentStep === 'hazard') {
    panel.innerHTML = `
      <div class="debris-right-header">
        <span>🌄 灾害预测</span>
      </div>
      <div class="debris-right-content">
        ${debrisState.hazardResult ? renderHazardResultPreview() : `
          <div style="text-align:center;padding:40px 16px;color:var(--text-muted);">
            <div style="font-size:48px;margin-bottom:12px;">⚡</div>
            <div>配置参数后点击计算</div>
          </div>
        `}
      </div>
    `;
  } else if (debrisState.currentStep === 'resilience') {
    panel.innerHTML = `
      <div class="debris-right-header">
        <span>🛣️ 路网韧性鲁棒性评估</span>
      </div>
      <div class="debris-right-content">
        ${debrisState.resilienceResult ? renderResilienceResultPreview() : `
          <div style="text-align:center;padding:40px 16px;color:var(--text-muted);">
            <div style="font-size:48px;margin-bottom:12px;">🧮</div>
            <div>完成危险性计算后执行韧性评估</div>
          </div>
          <div style="margin:16px;padding:12px;background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.2);border-radius:6px;font-size:12px;">
            <strong>📐 综合鲁棒性公式：</strong><br/>
            <div style="margin-top:8px;font-family:monospace;">
            Rob = w1·R_com + w2·R_gcc + w3·R_eff + w4·R_acc + w5·R_cap
            </div>
            <ul style="margin-top:8px;padding-left:16px;">
              <li>R_com: 连通保持率</li>
              <li>R_gcc: 最大连通子图保持率</li>
              <li>R_eff: 网络效率保持率</li>
              <li>R_acc: 关键设施可达性保持率</li>
              <li>R_cap: 通行容量保持率</li>
            </ul>
          </div>
        `}
      </div>
    `;
  } else if (debrisState.currentStep === 'result') {
    panel.innerHTML = `
      <div class="debris-right-header">
        <span>📊 结果导出</span>
      </div>
      <div class="debris-right-content debris-result-content">
        ${renderFullResultContent()}
      </div>
    `;
    // 图表需要在DOM插入后渲染
    if (debrisState.resilienceResult) {
      setTimeout(() => {
        renderResultCharts();
      }, 100);
    }
  }
}

function renderHazardResultPreview() {
  if (!debrisState.hazardResult) return '';
  var hr = debrisState.hazardResult;

  var riskLevelClass = {
    low: 'text-ok',
    medium: 'text-warning',
    high: 'text-danger',
    extreme: 'text-danger',
  };

  return `
    <div class="hazard-preview-card">
      <div class="preview-card-title">🎯 沟道类型判定</div>
      <div class="preview-value" style="color:${hr.channelType === '窄陡型' ? '#F87171' : '#4ADE80'}">${hr.channelType || '-'}</div>
      <div class="preview-row">
        <span>综合地形因子 M</span>
        <span>${hr.Mvalue?.toFixed(3) || '-'}</span>
      </div>
    </div>

    <div class="hazard-preview-card">
      <div class="preview-card-title">🌧️ 临界雨量</div>
      <div class="preview-row">
        <span>1h临界雨强</span>
        <span>${hr.P1h?.toFixed(1)} mm</span>
      </div>
      <div class="preview-row">
        <span>24h临界雨量</span>
        <span>${hr.P1d?.toFixed(1)} mm</span>
      </div>
      <div class="preview-row">
        <span>实时雨量对比</span>
        <span class="${hr.riskLevelClass}">${hr.warningLevel || '-'}</span>
      </div>
    </div>

    <div class="hazard-preview-card">
      <div class="preview-card-title">📊 概率统计</div>
      <div class="preview-row">
        <span>泥石流发生概率</span>
        <span>${(hr.occurrenceProbability * 100)?.toFixed(1)}%</span>
      </div>
      <div class="preview-row">
        <span>期望冲出体积</span>
        <span>${hr.expectedVolume?.toFixed(0)} m³</span>
      </div>
      <div class="preview-row">
        <span>桥梁破坏概率</span>
        <span>${(hr.bridgeFailureProbability * 100)?.toFixed(1)}%</span>
      </div>
    </div>

    <div class="hazard-preview-card">
      <div class="preview-card-title">🗺️ 风险分级</div>
      <div class="risk-stats">
        <div class="risk-stat-item">
          <div class="risk-stat-num" style="color:#4ADE80">${hr.countLowRisk || 0}</div>
          <div class="risk-stat-label">低风险</div>
        </div>
        <div class="risk-stat-item">
          <div class="risk-stat-num" style="color:#FBBF24">${hr.countMediumRisk || 0}</div>
          <div class="risk-stat-label">中风险</div>
        </div>
        <div class="risk-stat-item">
          <div class="risk-stat-num" style="color:#F87171">${hr.countHighRisk || 0}</div>
          <div class="risk-stat-label">高风险</div>
        </div>
      </div>
    </div>

    <div style="margin-top:12px;">
      <button class="btn-primary btn-full" id="btn-next-to-resilience">下一步 → 路网韧性评估</button>
    </div>
  `;
}

function renderResilienceResultPreview() {
  if (!debrisState.resilienceResult) return '';
  var rr = debrisState.resilienceResult;

  function getRobustBadge(score) {
    if (score >= 0.8) return '<span class="badge-ok">' + (score * 100).toFixed(1) + '%</span>';
    if (score >= 0.6) return '<span class="badge-warning">' + (score * 100).toFixed(1) + '%</span>';
    return '<span class="badge-danger">' + (score * 100).toFixed(1) + '%</span>';
  }

  return `
    <div class="robust-summary-card">
      <div class="robust-total-score">
        <div class="robust-total-label">综合鲁棒性总分</div>
        <div class="robust-total-value ${getRobustnessScoreClass()}">${(rr.robustTotal * 100).toFixed(1)}<span style="font-size:18px;">%</span></div>
        <div class="robust-total-grade">${getRobustGrade(rr.robustTotal)}</div>
      </div>
    </div>

    <div class="robust-indicators-table">
      <div class="robust-indicator-row header">
        <span>指标</span>
        <span>灾前</span>
        <span>灾后</span>
        <span>保持率</span>
      </div>
      <div class="robust-indicator-row">
        <span>连通保持率</span>
        <span>${rr.preConnectivity}</span>
        <span>${rr.postConnectivity}</span>
        ${getRobustBadge(rr.Rcom)}
      </div>
      <div class="robust-indicator-row">
        <span>最大连通子图</span>
        <span>${rr.preGcc}</span>
        <span>${rr.postGcc}</span>
        ${getRobustBadge(rr.Rgcc)}
      </div>
      <div class="robust-indicator-row">
        <span>网络效率</span>
        <span>${rr.preEfficiency?.toFixed(2)}</span>
        <span>${rr.postEfficiency?.toFixed(2)}</span>
        ${getRobustBadge(rr.Reff)}
      </div>
      <div class="robust-indicator-row">
        <span>可达性保持</span>
        <span>${rr.preAccessibility?.toFixed(2)}</span>
        <span>${rr.postAccessibility?.toFixed(2)}</span>
        ${getRobustBadge(rr.Racc)}
      </div>
      <div class="robust-indicator-row">
        <span>容量保持率</span>
        <span>-</span>
        <span>-</span>
        ${getRobustBadge(rr.Rcap)}
      </div>
    </div>

    <div class="robust-summary-card">
      <div class="preview-card-title">📊 受损统计</div>
      <div class="preview-row">
        <span>损毁路段</span>
        <span>${rr.damagedRoads || 0} 段</span>
      </div>
      <div class="preview-row">
        <span>断联片区</span>
        <span>${rr.isolatedAreas || 0} 个</span>
      </div>
      <div class="preview-row">
        <span>应急不可达面积</span>
        <span>${rr.inaccessibleArea || 0} km²</span>
      </div>
      <div class="preview-row">
        <span>损毁风险桥梁</span>
        <span style="color:#F87171">${rr.damagedBridges || 0} 座</span>
      </div>
    </div>

    <div style="margin-top:12px;">
      <button class="btn-primary btn-full" id="btn-next-to-result">下一步 → 生成结果导出</button>
    </div>
    <canvas id="robust-radar-chart" style="width:100%;height:200px;margin-top:12px;"></canvas>
  `;

  setTimeout(() => {
    if (rr) {
      createRobustnessRadarChart('robust-radar-chart', rr);
    }
  }, 100);
}

function getRobustGrade(score) {
  if (score >= 0.8) return '优秀';
  if (score >= 0.7) return '良好';
  if (score >= 0.6) return '一般';
  if (score >= 0.5) return '较差';
  return '极差';
}

function renderFullResultContent() {
  var hr = debrisState.hazardResult;
  var rr = debrisState.resilienceResult;

  return `
    <div class="result-summary-row">
      <div class="result-summary-card">
        <div class="result-card-title">🌋 泥石流危险性</div>
        <div class="result-item">
          <span>发生概率</span>
          <span style="color:#F87171;font-weight:600;">${(hr.occurrenceProbability * 100).toFixed(1)}%</span>
        </div>
        <div class="result-item">
          <span>桥梁破坏概率</span>
          <span style="color:#F87171;font-weight:600;">${(hr.bridgeFailureProbability * 100).toFixed(1)}%</span>
        </div>
        <div class="result-item">
          <span>高风险沟道</span>
          <span style="color:#F87171;font-weight:600;">${hr.countHighRisk || 0}</span>
        </div>
      </div>
      <div class="result-summary-card">
        <div class="result-card-title">🛣️ 路网韧性</div>
        <div class="result-item">
          <span>综合鲁棒性</span>
          <span style="font-weight:700;" class="${getRobustnessScoreClass()}">${(rr.robustTotal * 100).toFixed(1)}%</span>
        </div>
        <div class="result-item">
          <span>分级</span>
          <span style="font-weight:600;" class="${getRobustnessScoreClass()}">${getRobustGrade(rr.robustTotal)}</span>
        </div>
        <div class="result-item">
          <span>断联片区</span>
          <span style="color:#F87171;font-weight:600;">${rr.isolatedAreas || 0}</span>
        </div>
      </div>
    </div>

    <div class="result-chart-block">
      <div class="result-chart-title">I-D 降雨阈值曲线</div>
      <canvas id="chart-threshold-curve" style="width:100%;height:160px;"></canvas>
    </div>

    <div class="result-chart-block">
      <div class="result-chart-title">五大鲁棒性指标雷达图</div>
      <canvas id="result-robust-radar" style="width:100%;height:220px;"></canvas>
    </div>

    <div class="result-chart-block">
      <div class="result-chart-title">降雨-体积联合概率热力图</div>
      <canvas id="chart-copula-heatmap" style="width:100%;height:160px;"></canvas>
    </div>

    <div class="result-export-actions">
      <button class="btn-primary" id="btn-export-excel">📊 导出Excel</button>
      <button class="btn-primary" id="btn-export-images">🖼️ 导出图片</button>
      <button class="btn-primary" id="btn-export-word">📄 生成报告</button>
      <button class="btn-primary" id="btn-export-shp">🗺️ 导出矢量</button>
    </div>
  `;
}

function renderResultCharts() {
  var hr = debrisState.hazardResult;
  var rr = debrisState.resilienceResult;

  if (hr) {
    createThresholdCurveChart('chart-threshold-curve', hr);
  }
  if (rr) {
    createRobustnessRadarChart('result-robust-radar', rr);
  }
  if (hr) {
    createCopulaHeatmap('chart-copula-heatmap', hr);
  }
}

// ============================================================
// 事件绑定
// ============================================================

function bindInputEvents() {
  // 标签页切换
  document.querySelectorAll('.debris-input-tab').forEach(tab => {
    tab.addEventListener('click', function() {
      document.querySelectorAll('.debris-input-tab').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
      debrisState.currentTab = this.dataset.tab;
      renderLeftStepPanel();
    });
  });

  // 参数输入绑定
  bindNumberInput('input-relative-height', 'terrain', 'relativeHeight');
  bindNumberInput('input-channel-length', 'terrain', 'channelLength');
  bindNumberInput('input-average-width', 'terrain', 'averageWidth');
  bindNumberInput('input-basin-area', 'terrain', 'basinArea');
  bindNumberInput('input-m-threshold', 'terrain', 'M_threshold');

  bindNumberInput('input-real-24h', 'rainfall', 'real24h');
  bindNumberInput('input-rain-duration', 'rainfall', 'rainDuration');
  bindNumberInput('input-real-intensity', 'rainfall', 'realIntensity');
  bindNumberInput('input-k-value', 'rainfall', 'K');

  // 权重滑块
  document.querySelectorAll('.weight-slider').forEach(slider => {
    slider.addEventListener('input', function() {
      var key = this.dataset.key;
      var value = parseFloat(this.value);
      debrisState.parameters.resilienceWeights[key] = value;
      this.parentElement.querySelector('.weight-value').textContent = value.toFixed(2);
    });
  });

  // 文件上传
  bindFileUpload('terrain-upload-area', 'terrain-file-input', 'terrainFiles');
  bindFileUpload('rainfall-upload-area', 'rainfall-file-input', 'rainfallFiles');
  bindFileUpload('roadnet-upload-area', 'roadnet-file-input', 'roadnetFiles');
  bindFileUpload('bridge-upload-area', 'bridge-point-input', 'bridgeFiles');

  // 折叠面板
  document.getElementById('btn-collapse-params')?.addEventListener('click', function() {
    var content = document.getElementById('content-rain-params');
    var isHidden = content.style.display === 'none';
    content.style.display = isHidden ? 'block' : 'none';
    this.textContent = isHidden ? '▲' : '▼';
  });

  // 按钮
  document.getElementById('btn-next-to-hazard')?.addEventListener('click', function() {
    if (!hasInputData()) {
      showToast('⚠️ 请先完成地形和降雨数据录入', 'warning');
      return;
    }
    debrisState.currentStep = 'hazard';
    renderLeftStepPanel();
    renderRightResultPanel();
  });

  document.getElementById('btn-back-to-input')?.addEventListener('click', function() {
    debrisState.currentStep = 'input';
    renderLeftStepPanel();
    renderRightResultPanel();
  });

  document.getElementById('btn-back-to-hazard')?.addEventListener('click', function() {
    debrisState.currentStep = 'hazard';
    renderLeftStepPanel();
    renderRightResultPanel();
  });

  document.getElementById('btn-back-to-resilience')?.addEventListener('click', function() {
    debrisState.currentStep = 'resilience';
    renderLeftStepPanel();
    renderRightResultPanel();
  });

  document.getElementById('btn-run-hazard-calc')?.addEventListener('click', function() {
    runHazardCalculation();
  });

  document.getElementById('btn-run-resilience-calc')?.addEventListener('click', function() {
    runResilienceCalculation();
  });

  document.getElementById('btn-next-to-resilience')?.addEventListener('click', function() {
    debrisState.currentStep = 'resilience';
    renderLeftStepPanel();
    renderRightResultPanel();
  });

  document.getElementById('btn-next-to-result')?.addEventListener('click', function() {
    debrisState.currentStep = 'result';
    renderLeftStepPanel();
    renderRightResultPanel();
    renderAllMaps();
  });

  document.getElementById('btn-generate-output')?.addEventListener('click', function() {
    generateFullOutput();
  });

  document.getElementById('btn-export-report-now')?.addEventListener('click', function() {
    exportAssessmentReport();
  });

  document.getElementById('btn-reset-weight')?.addEventListener('click', function() {
    debrisState.parameters.resilienceWeights = {
      Rcom: 0.25, Rgcc: 0.20, Reff: 0.20, Racc: 0.25, Rcap: 0.10
    };
    renderLeftStepPanel();
    showToast('已恢复默认权重配置', 'info');
  });

  // 导出按钮
  document.getElementById('btn-export-excel')?.addEventListener('click', exportExcel);
  document.getElementById('btn-export-images')?.addEventListener('click', exportImages);
  document.getElementById('btn-export-word')?.addEventListener('click', exportAssessmentReport);
  document.getElementById('btn-export-shp')?.addEventListener('click', exportShapefile);
}

function bindNumberInput(elementId, paramCategory, paramKey) {
  var el = document.getElementById(elementId);
  if (!el) return;
  el.addEventListener('input', function() {
    var val = parseFloat(this.value);
    debrisState.parameters[paramCategory][paramKey] = this.value ? val : '';
  });
}

function bindFileUpload(areaId, inputId, dataKey) {
  var area = document.getElementById(areaId);
  var input = document.getElementById(inputId);
  if (!area || !input) return;

  area.addEventListener('click', () => input.click());

  input.addEventListener('change', function(e) {
    var files = Array.from(e.target.files);
    debrisState.importedData[dataKey] = files.map(f => ({ name: f.name, size: f.size }));
    renderLeftStepPanel();
    showToast(`✅ 已导入 ${files.length} 个文件`, 'success');
  });
}

// ============================================================
// 核心计算逻辑（调用API + mock降级）
// ============================================================

function runHazardCalculation() {
  var btn = document.getElementById('btn-run-hazard-calc');
  btn.textContent = '⏳ 计算中...';
  btn.disabled = true;
  debrisState.schemeStatus = '计算中';
  updateStatusBadge();

  showToast('🔍 正在调用算法服务计算泥石流危险性...', 'info');

  var params = {
    terrain: { ...debrisState.parameters.terrain },
    rainfall: { ...debrisState.parameters.rainfall },
    workingCondition: debrisState.workingCondition,
  };

  api.calculateDebrisHazard(params).then(function(result) {
    btn.textContent = '⚡ 执行泥石流危险性计算';
    btn.disabled = false;

    if (!result) {
      showToast('❌ 计算失败', 'error');
      return;
    }

    debrisState.hazardResult = normalizeHazardResult(result);
    debrisState.schemeStatus = '已计算';
    updateStatusBadge();

    // 提取预警列表
    debrisState.highRiskWarnings = extractHighRiskWarnings(debrisState.hazardResult);
    renderFooterAlert();

    // 更新地图
    renderHazardMap(debrisState.hazardResult);

    renderRightResultPanel();
    showToast('✅ 泥石流危险性计算完成', 'success');
  }).catch(function(err) {
    btn.textContent = '⚡ 执行泥石流危险性计算';
    btn.disabled = false;
    debrisState.schemeStatus = '计算失败';
    updateStatusBadge();
    showToast('❌ 计算异常: ' + err.message, 'error');
  });
}

function runResilienceCalculation() {
  var btn = document.getElementById('btn-run-resilience-calc');
  btn.textContent = '⏳ 计算中...';
  btn.disabled = true;

  showToast('🧮 正在评估路网韧性鲁棒性...', 'info');

  var params = {
    hazardResult: debrisState.hazardResult,
    weights: { ...debrisState.parameters.resilienceWeights },
  };

  api.calculateRoadResilience(params).then(function(result) {
    btn.textContent = '🛣️ 执行路网韧性评估计算';
    btn.disabled = false;

    if (!result) {
      showToast('❌ 韧性评估失败', 'error');
      return;
    }

    debrisState.resilienceResult = normalizeResilienceResult(result);
    debrisState.schemeStatus = '评估完成';
    updateStatusBadge();

    // 更新地图
    renderResilienceMap(debrisState.resilienceResult);

    renderRightResultPanel();
    showToast('✅ 路网韧性评估完成，综合鲁棒性 ' + (debrisState.resilienceResult.robustTotal * 100).toFixed(1) + '%', 'success');
  }).catch(function(err) {
    btn.textContent = '🛣️ 执行路网韧性评估计算';
    btn.disabled = false;
    showToast('❌ 评估异常: ' + err.message, 'error');
  });
}

function normalizeHazardResult(result) {
  // 处理 null/undefined 或已有计算结果的返回值
  if (result && result.Mvalue !== undefined) return result;

  // Mock数据降级
  var p = debrisState.parameters;
  var H = parseFloat(p.terrain.relativeHeight) || 1200;
  var L = parseFloat(p.terrain.channelLength) || 3500;
  var A = parseFloat(p.terrain.basinArea) || 18;
  var real24h = parseFloat(p.rainfall.real24h) || 180;

  // 计算模拟值
  var M = (H / 1000) * Math.sqrt(A) / (L / 1000);
  var channelType = M > p.terrain.M_threshold ? '窄陡型' : '宽缓型';
  var P1d = 269.27 - 1.1656 * 50;
  var occurrenceProbability = real24h > P1d ? 0.75 : (real24h > P1d * 0.8 ? 0.45 : 0.15);
  var bridgeFailureProbability = occurrenceProbability * 0.8;

  return {
    Mvalue: M,
    channelType: channelType,
    P1h: real24h / 24 * 1.2,
    P1d: P1d,
    occurrenceProbability: occurrenceProbability,
    expectedVolume: A * 10000 * (H / 1000) * 0.3,
    bridgeFailureProbability: bridgeFailureProbability,
    countLowRisk: 8,
    countMediumRisk: 3,
    countHighRisk: 2,
    highRiskCount: 2,
    atRiskBridges: 3,
    warningLevel: real24h > P1d ? '高概率预警' : (real24h > P1d * 0.8 ? '中概率监测' : '安全'),
    riskLevelClass: real24h > P1d ? 'text-danger' : (real24h > P1d * 0.8 ? 'text-warning' : 'text-ok'),
  };
}

function normalizeResilienceResult(result) {
  if (result && result.robustTotal !== undefined) return result;

  // Mock数据降级
  var hazardProb = debrisState.hazardResult?.occurrenceProbability || 0.5;
  var baseRobust = 1 - hazardProb * 0.4;
  var w = debrisState.parameters.resilienceWeights;

  return {
    robustTotal: baseRobust * 1.0,
    Rcom: baseRobust * (1 - hazardProb * 0.3),
    Rgcc: baseRobust * (1 - hazardProb * 0.4),
    Reff: baseRobust * (1 - hazardProb * 0.35),
    Racc: baseRobust * (1 - hazardProb * 0.45),
    Rcap: baseRobust * (1 - hazardProb * 0.25),
    preConnectivity: 156,
    postConnectivity: Math.round(156 * baseRobust),
    preGcc: 128,
    postGcc: Math.round(128 * baseRobust),
    preEfficiency: 0.85,
    postEfficiency: 0.85 * baseRobust,
    preAccessibility: 0.92,
    postAccessibility: 0.92 * baseRobust,
    damagedRoads: Math.round(12 * hazardProb),
    isolatedAreas: hazardProb > 0.5 ? 2 : (hazardProb > 0.3 ? 1 : 0),
    inaccessibleArea: Math.round(12 * hazardProb),
    damagedBridges: debrisState.hazardResult?.atRiskBridges || 0,
  };
}

function extractHighRiskWarnings(hazardResult) {
  var warnings = [];
  if (hazardResult.countHighRisk > 0) {
    warnings.push({
      type: 'gully',
      name: '流域 #A' + Math.floor(Math.random() * 99),
      risk: '高风险泥石流',
      probability: (hazardResult.occurrenceProbability * 100).toFixed(1) + '%',
    });
  }
  if (hazardResult.atRiskBridges > 0) {
    for (var i = 0; i < hazardResult.atRiskBridges; i++) {
      warnings.push({
        type: 'bridge',
        name: '桥梁 #B' + (i + 1),
        risk: '高损毁风险',
        probability: (hazardResult.bridgeFailureProbability * 100).toFixed(1) + '%',
      });
    }
  }
  return warnings;
}

// ============================================================
// 地图渲染
// ============================================================

function renderAllMaps() {
  clearAllDebrisLayers();
  if (debrisState.hazardResult) {
    renderHazardMap(debrisState.hazardResult);
  }
  if (debrisState.resilienceResult) {
    renderResilienceMap(debrisState.resilienceResult);
  }
}

function renderHazardMap(hazardResult) {
  var map = getMap();
  if (!map) return;

  clearAllDebrisLayers();
  addDebrisRiskLayer(hazardResult);

  showToast('🗺️ 地图已更新：泥石流风险分区图层', 'info');
}

function renderResilienceMap(resilienceResult) {
  var map = getMap();
  if (!map) return;

  addRoadDamageLayer(resilienceResult);

  showToast('🗺️ 地图已更新：路网受损分区图层', 'info');
}

// ============================================================
// 工况管理 & 模拟数据
// ============================================================

var workingConditionPresets = {
  default: { terrain: {}, rainfall: { real24h: '', rainDuration: '', realIntensity: '' } },
  light: { terrain: {}, rainfall: { real24h: '50', rainDuration: '6', realIntensity: '8.3' } },
  moderate: { terrain: {}, rainfall: { real24h: '120', rainDuration: '12', realIntensity: '10' } },
  heavy: { terrain: {}, rainfall: { real24h: '220', rainDuration: '18', realIntensity: '12.2' } },
  extreme: { terrain: {}, rainfall: { real24h: '350', rainDuration: '24', realIntensity: '14.6' } },
};

function loadWorkingCondition(conditionName) {
  var preset = workingConditionPresets[conditionName] || workingConditionPresets.default;
  Object.assign(debrisState.parameters.rainfall, preset.rainfall);
}

function fillMockData() {
  debrisState.parameters.terrain = {
    relativeHeight: '1200',
    channelLength: '3500',
    averageWidth: '45',
    basinArea: '18.5',
    M_threshold: 0.51,
  };
  debrisState.parameters.rainfall = {
    K: 0.85,
    rainDuration: '12',
    realIntensity: '10.5',
    real24h: '180',
  };
  debrisState.importedData.terrainFiles = [
    { name: 'basin_boundary.shp', size: 2048 },
    { name: 'dem_30m.tif', size: 10240 },
  ];
  debrisState.importedData.rainfallFiles = [
    { name: 'daily_rainfall_2026.csv', size: 4096 },
  ];
}

// ============================================================
// 方案保存 & 导出
// ============================================================

function saveCurrentScheme() {
  var name = document.getElementById('debris-scheme-name')?.value || '未命名方案';
  var scheme = {
    name: name,
    savedAt: new Date().toLocaleString(),
    parameters: JSON.parse(JSON.stringify(debrisState.parameters)),
    workingCondition: debrisState.workingCondition,
    hazardResult: debrisState.hazardResult,
    resilienceResult: debrisState.resilienceResult,
  };

  try {
    var saved = JSON.parse(localStorage.getItem('debris_schemes') || '[]');
    saved.push(scheme);
    localStorage.setItem('debris_schemes', JSON.stringify(saved));
    debrisState.schemeStatus = '已保存';
    updateStatusBadge();
    showToast('✅ 方案已保存: ' + name, 'success');
  } catch (e) {
    showToast('❌ 方案保存失败: ' + e.message, 'error');
  }
}

function exportAssessmentReport() {
  var hr = debrisState.hazardResult;
  var rr = debrisState.resilienceResult;

  if (!hr || !rr) {
    showToast('⚠️ 请先完成完整评估再导出报告', 'warning');
    return;
  }

  var reportContent = [
    '========================================',
    '  泥石流灾害韧性评估报告',
    '========================================',
    '',
    '【方案信息】',
    '  方案名称: ' + (document.getElementById('debris-scheme-name')?.value || '未命名'),
    '  工况类型: ' + debrisState.workingCondition,
    '  生成时间: ' + new Date().toLocaleString(),
    '',
    '【1. 泥石流危险性预测】',
    '  沟道类型: ' + (hr.channelType || '-'),
    '  地形因子M: ' + (hr.Mvalue?.toFixed(3) || '-'),
    '  发生概率: ' + (hr.occurrenceProbability * 100).toFixed(1) + '%',
    '  期望冲出体积: ' + (hr.expectedVolume?.toFixed(0) || '-') + ' m³',
    '  桥梁破坏概率: ' + (hr.bridgeFailureProbability * 100).toFixed(1) + '%',
    '',
    '【2. 降雨阈值分析】',
    '  1h临界雨强: ' + (hr.P1h?.toFixed(1) || '-') + ' mm',
    '  24h临界雨量: ' + (hr.P1d?.toFixed(1) || '-') + ' mm',
    '  预警等级: ' + (hr.warningLevel || '-'),
    '',
    '【3. 路网韧性鲁棒性评估】',
    '  综合鲁棒性: ' + (rr.robustTotal * 100).toFixed(1) + '%',
    '  分级: ' + getRobustGrade(rr.robustTotal),
    '  连通保持率: ' + (rr.Rcom * 100).toFixed(1) + '%',
    '  最大连通子图: ' + (rr.Rgcc * 100).toFixed(1) + '%',
    '  网络效率: ' + (rr.Reff * 100).toFixed(1) + '%',
    '  可达性保持: ' + (rr.Racc * 100).toFixed(1) + '%',
    '  容量保持率: ' + (rr.Rcap * 100).toFixed(1) + '%',
    '',
    '【4. 损毁统计】',
    '  损毁路段: ' + (rr.damagedRoads || 0) + ' 段',
    '  断联片区: ' + (rr.isolatedAreas || 0) + ' 个',
    '  应急盲区面积: ' + (rr.inaccessibleArea || 0) + ' km²',
    '========================',
    '  报告结束',
    '========================',
  ].join('\n');

  var blob = new Blob([reportContent], { type: 'text/plain;charset=utf-8' });
  var link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = '灾害韧性评估报告_' + new Date().toISOString().slice(0, 10) + '.txt';
  link.click();
  URL.revokeObjectURL(link.href);

  showToast('📄 评估报告已导出', 'success');
}

function generateFullOutput() {
  if (!debrisState.hazardResult || !debrisState.resilienceResult) {
    showToast('⚠️ 请先完成完整计算再生成成果', 'warning');
    return;
  }
  renderAllMaps();
  renderRightResultPanel();
  showToast('📊 综合可视化成果已生成', 'success');
}

function exportExcel() {
  showToast('📊 Excel导出功能 - 开发中（mock）', 'info');
}

function exportImages() {
  showToast('🖼️ 图片导出功能 - 开发中（mock）', 'info');
}

function exportShapefile() {
  showToast('🗺️ 矢量导出功能 - 开发中（mock）', 'info');
}

// ============================================================
// UI 辅助函数
// ============================================================

function renderFooterAlert() {
  var alertList = document.getElementById('debris-alert-list');
  if (!alertList) return;

  if (!debrisState.highRiskWarnings || debrisState.highRiskWarnings.length === 0) {
    alertList.innerHTML = '<div style="padding:8px 16px;color:var(--text-muted);font-size:12px;">暂无高风险预警</div>';
    return;
  }

  alertList.innerHTML = debrisState.highRiskWarnings.map(function(w) {
    var color = w.type === 'gully' ? '#F87171' : '#FB923C';
    return '<div class="alert-item" style="border-left:3px solid ' + color + ';">' +
      '<span class="alert-icon">' + (w.type === 'gully' ? '🌄' : '🌉') + '</span>' +
      '<span class="alert-name">' + w.name + '</span>' +
      '<span class="alert-desc">' + w.risk + '</span>' +
      '<span class="alert-prob" style="color:' + color + ';">' + w.probability + '</span>' +
      '<button class="alert-jump-btn" data-name="' + w.name + '">📍 定位</button>' +
      '</div>';
  }).join('');

  alertList.querySelectorAll('.alert-jump-btn').forEach(function(btn) {
    btn.addEventListener('click', function() {
      showToast('正在定位: ' + this.dataset.name, 'info');
      flyToDebrisFeature(this.dataset.name);
    });
  });
}

function updateStatusBadge() {
  var badge = document.getElementById('debris-status-badge');
  if (badge) badge.textContent = debrisState.schemeStatus;
}

function checkDebrisBackendStatus() {
  checkBackendFast().then(function(online) {
    setBackendAvailable(online);
    var badge = document.getElementById('debris-backend-status');
    if (!badge) return;
    if (online) {
      badge.innerHTML = '🟢 后端已连接';
      badge.style.color = '#4ADE80';
    } else {
      badge.innerHTML = '🟡 离线模式 (本地数据)';
      badge.style.color = '#FBBF24';
    }
  }).catch(function() {
    var badge = document.getElementById('debris-backend-status');
    if (badge) {
      badge.innerHTML = '🟡 离线模式 (本地数据)';
      badge.style.color = '#FBBF24';
    }
  });
}

function createRobustnessRadarChart(canvasId, data) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  var ctx = canvas.getContext('2d');

  new Chart(ctx, {
    type: 'radar',
    data: {
      labels: ['连通保持率', '最大连通子图', '网络效率', '可达性保持', '容量保持率'],
      datasets: [{
        label: '灾后保持率',
        data: [
          data.Rcom * 100,
          data.Rgcc * 100,
          data.Reff * 100,
          data.Racc * 100,
          data.Rcap * 100,
        ],
        backgroundColor: 'rgba(56, 189, 248, 0.15)',
        borderColor: '#38BDF8',
        pointBackgroundColor: '#38BDF8',
        pointBorderColor: '#fff',
        pointHoverBackgroundColor: '#fff',
        pointHoverBorderColor: '#38BDF8',
        borderWidth: 2,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94A3B8', font: { size: 10 } } }
      },
      scales: {
        r: {
          angleLines: { color: 'rgba(56, 189, 248, 0.1)' },
          grid: { color: 'rgba(56, 189, 248, 0.1)' },
          pointLabels: { color: '#94A3B8', font: { size: 10 } },
          ticks: { color: '#64748B', backdropColor: 'transparent', stepSize: 20 },
          min: 0,
          max: 100,
        }
      }
    }
  });
}

// ============================================================
// API 扩展（在 api/index.js 中注册）
// ============================================================

api.calculateDebrisHazard = api.calculateDebrisHazard || function(params) {
  return Promise.resolve(normalizeHazardResult(null));
};

api.calculateRoadResilience = api.calculateRoadResilience || function(params) {
  return Promise.resolve(normalizeResilienceResult(null));
};