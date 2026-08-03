/**
 * 单桥承载极限详情评估窗 (半屏弹窗)
 * 点击桥梁要素后弹出，展示结构图解 + 载荷响应仿真
 */
import { bridges } from '../data/mockData.js';
import { createBridgeLoadChart } from '../utils/chartUtils.js';

export function openBridgeDetail(uuid) {
    const bridge = bridges.find(b => b.uuid === uuid);
    if (!bridge) {
        showToast(`未找到桥梁: ${uuid}`, 'error');
        return;
    }

    showToast(`🔍 正在加载 ${bridge.name} 详情...`, 'info');

    // 关闭已有弹窗
    const existing = document.getElementById('bridge-detail-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'bridge-detail-overlay';
    overlay.id = 'bridge-detail-overlay';

    // 模拟载荷响应数据
    const loadData = generateLoadResponse(bridge);

    const statusColor = { normal: '#4ADE80', warning: '#FBBF24', danger: '#F87171' }[bridge.status] || '#4ADE80';
    const statusText = { normal: '常态运行', warning: '预警状态', danger: '严重受损' }[bridge.status] || '未知';

    overlay.innerHTML = `
    <div class="bridge-detail-content glass-panel">
      <div class="modal-header">
        <h2>🌉 ${bridge.name} <span style="font-size:12px;font-weight:400;color:var(--text-muted);font-family:monospace;">${bridge.uuid}</span></h2>
        <div style="display:flex;align-items:center;gap:12px;">
          <span style="font-size:12px;padding:4px 12px;border-radius:20px;background:rgba(${bridge.status === 'normal' ? '74,222,128' : bridge.status === 'warning' ? '251,191,36' : '248,113,113'},0.1);border:1px solid ${statusColor};color:${statusColor};">
            ${statusText}
          </span>
          <button class="modal-close-btn" id="bd-close-btn">✕</button>
        </div>
      </div>
      <div class="bridge-detail-body">
        <!-- 左栏: 结构易损性大样 -->
        <div class="bridge-detail-col">
          <div class="panel-section-title">结构易损性大样</div>

          <div class="bridge-struct-diagram">
            ${bridge.type === '悬索桥' ? '🌉 悬索桥结构示意图' :
            bridge.type === '斜拉桥' ? '🏗️ 斜拉桥结构示意图' :
                bridge.type === '拱桥' ? '🏛️ 拱桥结构示意图' :
                    bridge.type === '梁桥' ? '📐 梁桥结构示意图' :
                        '🚇 隧道结构示意图'}
            <br/>
            <span style="font-size:10px;color:var(--text-muted);">(结构图加载区域 - 集成 BIM 模型)</span>
          </div>

          <div class="bridge-info-grid">
            <div class="bridge-info-item">
              <label>结构类型</label>
              <span>${bridge.type}</span>
            </div>
            <div class="bridge-info-item">
              <label>跨径组合</label>
              <span>${bridge.span}</span>
            </div>
            <div class="bridge-info-item">
              <label>设计荷载等级</label>
              <span>${bridge.designLoad}</span>
            </div>
            <div class="bridge-info-item">
              <label>健康评分</label>
              <span style="color:${bridge.healthScore >= 0.8 ? '#4ADE80' : bridge.healthScore >= 0.6 ? '#FBBF24' : '#F87171'};">${bridge.healthScore.toFixed(2)}</span>
            </div>
            <div class="bridge-info-item">
              <label>限载阈值</label>
              <span>${bridge.loadLimit ? bridge.loadLimit + ' t' : '无限制'}</span>
            </div>
            <div class="bridge-info-item">
              <label>韧性评级</label>
              <span style="color:${bridge.healthScore >= 0.8 ? '#4ADE80' : bridge.healthScore >= 0.6 ? '#FBBF24' : '#F87171'};">
                ${bridge.healthScore >= 0.8 ? '高韧性' : bridge.healthScore >= 0.6 ? '中韧性' : '低韧性'}
              </span>
            </div>
          </div>

          <div style="margin-top:12px;padding:10px;background:rgba(248,113,113,0.05);border:1px solid rgba(248,113,113,0.15);border-radius:8px;">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">⚠️ 结构劣化风险评估</div>
            <div style="font-size:13px;color:${loadData.some(v => v >= 100) ? '#F87171' : loadData.some(v => v >= 80) ? '#FBBF24' : '#4ADE80'};">
              ${loadData.some(v => v >= 100)
            ? '⚠️ 主梁抗弯强度已达 105%，触发结构劣化越界警告！'
            : loadData.some(v => v >= 80)
                ? '⚡ 部分构件接近承载极限，建议限载通行'
                : '✅ 各结构指标均在安全范围内'}
            </div>
          </div>
        </div>

        <!-- 右栏: 重车载荷响应仿真 -->
        <div class="bridge-detail-col">
          <div class="panel-section-title">重车载荷响应仿真</div>
          <div style="font-size:12px;color:var(--text-muted);margin-bottom:8px;">
            当前模拟车重: <strong style="color:var(--accent-blue);">55 t</strong> | 桥梁限载: <strong style="color:${bridge.loadLimit && bridge.loadLimit < 55 ? '#F87171' : '#4ADE80'};">${bridge.loadLimit ? bridge.loadLimit + ' t' : '无限制'}</strong>
          </div>

          <div style="height:240px;">
            <canvas id="bridge-load-chart"></canvas>
          </div>

          <div style="margin-top:16px;">
            <div class="panel-section-title">受载响应详情</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
              ${['主梁抗弯强度', '支座剪力', '桥墩轴力', '基础承载力'].map((name, i) => {
                    const v = loadData[i];
                    const color = v >= 100 ? '#F87171' : v >= 80 ? '#FBBF24' : '#4ADE80';
                    return `
                  <div style="padding:8px;background:rgba(56,189,248,0.03);border-radius:6px;border:1px solid rgba(56,189,248,0.05);">
                    <div style="font-size:10px;color:var(--text-muted);">${name}</div>
                    <div style="font-size:16px;font-weight:700;color:${color};">${v}%</div>
                  </div>
                `;
                }).join('')}
            </div>
          </div>

          <div style="margin-top:12px;">
            <button class="btn-primary btn-full" onclick="showToast('📋 正在生成 ${bridge.name} 承载极限评估报告...','success')">
              📋 生成承载极限评估报告
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

    document.getElementById('bridge-detail-container').appendChild(overlay);

    // 关闭
    document.getElementById('bd-close-btn').addEventListener('click', closeBridgeDetail);

    // 渲染载荷图表
    setTimeout(() => {
        createBridgeLoadChart('bridge-load-chart', loadData);
    }, 100);
}

function closeBridgeDetail() {
    const el = document.getElementById('bridge-detail-overlay');
    if (el) el.remove();
}

function generateLoadResponse(bridge) {
    // 基于桥梁健康分和限载生成模拟载荷响应数据
    const baseHealth = bridge.healthScore || 0.8;
    const loadLimit = bridge.loadLimit || 60;
    const simulatedWeight = 55; // 模拟当前车重

    // 载荷比率越高，响应百分比越高
    const loadRatio = simulatedWeight / loadLimit;

    // 主梁抗弯强度
    const beam = Math.min(120, Math.round((1.0 + (loadRatio - 0.7) * 0.8) * (1.1 - baseHealth * 0.3) * 100));
    // 支座剪力
    const support = Math.min(120, Math.round((0.9 + (loadRatio - 0.7) * 0.6) * (1.0 - baseHealth * 0.25) * 100));
    // 桥墩轴力
    const pier = Math.min(120, Math.round((0.8 + (loadRatio - 0.7) * 0.5) * (0.95 - baseHealth * 0.2) * 100));
    // 基础承载力
    const foundation = Math.min(120, Math.round((0.7 + (loadRatio - 0.7) * 0.4) * (0.9 - baseHealth * 0.15) * 100));

    return [beam, support, pier, foundation];
}

// 暴露到全局供地图弹窗调用
window.openBridgeDetail = openBridgeDetail;
