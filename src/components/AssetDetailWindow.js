/**
 * 正式桥隧资产详情窗口 (V1.4E)
 * 点击正式资产 Marker 后弹出，展示完整资产信息
 */
import api from '../api/index.js';

/**
 * 打开正式资产详情窗口
 * @param {number} assetId - 资产 ID
 */
export async function openAssetDetail(assetId) {
    showToast('🔍 正在加载资产详情...', 'info');

    // 关闭已有弹窗
    const existing = document.getElementById('asset-detail-overlay');
    if (existing) existing.remove();

    try {
        const detail = await api.getAssetDetail(assetId);
        if (!detail) {
            showToast('未找到该资产', 'error');
            return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'bridge-detail-overlay';
        overlay.id = 'asset-detail-overlay';

        const typeIcon = detail.assetType === 'BRIDGE' ? '🌉' : '🚇';
        const typeName = detail.assetType === 'BRIDGE' ? '桥梁' : '隧道';

        // 状态颜色
        const riskColors = { LOW: '#4ADE80', MEDIUM: '#FBBF24', HIGH: '#F87171', EXTREME: '#EF4444' };
        const passColors = { NORMAL: '#4ADE80', RESTRICTED: '#FBBF24', BLOCKED: '#F87171', UNKNOWN: '#94A3B8' };
        const riskColor = riskColors[detail.currentStatus?.riskLevel] || '#94A3B8';
        const passColor = passColors[detail.currentStatus?.passStatus] || '#94A3B8';

        overlay.innerHTML = `
        <div class="bridge-detail-content glass-panel" style="max-width:800px;">
          <div class="modal-header">
            <h2>${typeIcon} ${detail.assetName} <span style="font-size:12px;font-weight:400;color:var(--text-muted);font-family:monospace;">${detail.assetCode}</span></h2>
            <div style="display:flex;align-items:center;gap:12px;">
              <span style="font-size:12px;padding:4px 12px;border-radius:20px;background:rgba(56,189,248,0.1);border:1px solid rgba(56,189,248,0.3);color:#38BDF8;">
                ${typeName}
              </span>
              <button class="modal-close-btn" id="ad-close-btn">✕</button>
            </div>
          </div>
          <div style="padding:20px;overflow-y:auto;max-height:calc(90vh - 100px);">
            <!-- 基本信息 -->
            <div style="margin-bottom:20px;">
              <div style="font-weight:600;margin-bottom:12px;color:var(--text-primary);">📋 基本信息</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                <div style="padding:10px;background:rgba(56,189,248,0.03);border-radius:6px;border:1px solid rgba(56,189,248,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">资产编号</div>
                  <div style="font-size:13px;color:var(--text-primary);font-family:monospace;">${detail.assetCode}</div>
                </div>
                <div style="padding:10px;background:rgba(56,189,248,0.03);border-radius:6px;border:1px solid rgba(56,189,248,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">行政区</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.divisionName || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(56,189,248,0.03);border-radius:6px;border:1px solid rgba(56,189,248,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">坐标</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.longitude ? detail.longitude.toFixed(4) : '-'}, ${detail.latitude ? detail.latitude.toFixed(4) : '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(56,189,248,0.03);border-radius:6px;border:1px solid rgba(56,189,248,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">网络绑定状态</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.networkBindingStatus || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(56,189,248,0.03);border-radius:6px;border:1px solid rgba(56,189,248,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">数据来源</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.sourceType || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(56,189,248,0.03);border-radius:6px;border:1px solid rgba(56,189,248,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">更新时间</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.updatedAt ? new Date(detail.updatedAt).toLocaleString() : '-'}</div>
                </div>
              </div>
            </div>

            <!-- 结构属性 (BRIDGE) -->
            ${detail.assetType === 'BRIDGE' && detail.bridgeAttributes ? `
            <div style="margin-bottom:20px;">
              <div style="font-weight:600;margin-bottom:12px;color:var(--text-primary);">🌉 桥梁属性</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div style="padding:10px;background:rgba(74,222,128,0.03);border-radius:6px;border:1px solid rgba(74,222,128,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">结构类型</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.bridgeAttributes.structureType || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(74,222,128,0.03);border-radius:6px;border:1px solid rgba(74,222,128,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">总长 (m)</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.bridgeAttributes.totalLengthM || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(74,222,128,0.03);border-radius:6px;border:1px solid rgba(74,222,128,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">最大跨径 (m)</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.bridgeAttributes.maxSpanM || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(74,222,128,0.03);border-radius:6px;border:1px solid rgba(74,222,128,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">设计荷载</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.bridgeAttributes.designLoad || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(74,222,128,0.03);border-radius:6px;border:1px solid rgba(74,222,128,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">桥面宽度 (m)</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.bridgeAttributes.deckWidthM || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(74,222,128,0.03);border-radius:6px;border:1px solid rgba(74,222,128,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">建成年份</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.bridgeAttributes.constructionYear || '-'}</div>
                </div>
              </div>
            </div>
            ` : ''}

            <!-- 结构属性 (TUNNEL) -->
            ${detail.assetType === 'TUNNEL' && detail.tunnelAttributes ? `
            <div style="margin-bottom:20px;">
              <div style="font-weight:600;margin-bottom:12px;color:var(--text-primary);">🚇 隧道属性</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div style="padding:10px;background:rgba(74,222,128,0.03);border-radius:6px;border:1px solid rgba(74,222,128,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">隧道类型</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.tunnelAttributes.tunnelType || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(74,222,128,0.03);border-radius:6px;border:1px solid rgba(74,222,128,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">长度 (m)</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.tunnelAttributes.tunnelLengthM || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(74,222,128,0.03);border-radius:6px;border:1px solid rgba(74,222,128,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">设计净高 (m)</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.tunnelAttributes.designClearanceHeightM || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(74,222,128,0.03);border-radius:6px;border:1px solid rgba(74,222,128,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">设计净宽 (m)</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.tunnelAttributes.designClearanceWidthM || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(74,222,128,0.03);border-radius:6px;border:1px solid rgba(74,222,128,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">车道数</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.tunnelAttributes.laneCount || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(74,222,128,0.03);border-radius:6px;border:1px solid rgba(74,222,128,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">建成年份</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.tunnelAttributes.constructionYear || '-'}</div>
                </div>
              </div>
            </div>
            ` : ''}

            <!-- 当前状态 -->
            ${detail.currentStatus ? `
            <div style="margin-bottom:20px;">
              <div style="font-weight:600;margin-bottom:12px;color:var(--text-primary);">📊 当前状态</div>
              <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
                <div style="padding:10px;background:rgba(${detail.currentStatus.riskLevel === 'LOW' ? '74,222,128' : detail.currentStatus.riskLevel === 'MEDIUM' ? '251,191,36' : '248,113,113'},0.03);border-radius:6px;border:1px solid rgba(${detail.currentStatus.riskLevel === 'LOW' ? '74,222,128' : detail.currentStatus.riskLevel === 'MEDIUM' ? '251,191,36' : '248,113,113'},0.15);">
                  <div style="font-size:10px;color:var(--text-muted);">健康评分</div>
                  <div style="font-size:18px;font-weight:700;color:${riskColor};">${detail.currentStatus.healthScore ? detail.currentStatus.healthScore.toFixed(2) : '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(${detail.currentStatus.riskLevel === 'LOW' ? '74,222,128' : detail.currentStatus.riskLevel === 'MEDIUM' ? '251,191,36' : '248,113,113'},0.03);border-radius:6px;border:1px solid rgba(${detail.currentStatus.riskLevel === 'LOW' ? '74,222,128' : detail.currentStatus.riskLevel === 'MEDIUM' ? '251,191,36' : '248,113,113'},0.15);">
                  <div style="font-size:10px;color:var(--text-muted);">风险等级</div>
                  <div style="font-size:13px;font-weight:600;color:${riskColor};">${detail.currentStatus.riskLevel || '-'}</div>
                </div>
                <div style="padding:10px;background:rgba(${detail.currentStatus.passStatus === 'NORMAL' ? '74,222,128' : detail.currentStatus.passStatus === 'RESTRICTED' ? '251,191,36' : '248,113,113'},0.03);border-radius:6px;border:1px solid rgba(${detail.currentStatus.passStatus === 'NORMAL' ? '74,222,128' : detail.currentStatus.passStatus === 'RESTRICTED' ? '251,191,36' : '248,113,113'},0.15);">
                  <div style="font-size:10px;color:var(--text-muted);">通行状态</div>
                  <div style="font-size:13px;font-weight:600;color:${passColor};">${detail.currentStatus.passStatus || '-'}</div>
                </div>
                ${detail.currentStatus.currentLoadLimitT ? `
                <div style="padding:10px;background:rgba(56,189,248,0.03);border-radius:6px;border:1px solid rgba(56,189,248,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">当前限载 (t)</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.currentStatus.currentLoadLimitT}</div>
                </div>
                ` : ''}
                ${detail.currentStatus.currentHeightLimitM ? `
                <div style="padding:10px;background:rgba(56,189,248,0.03);border-radius:6px;border:1px solid rgba(56,189,248,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">当前限高 (m)</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.currentStatus.currentHeightLimitM}</div>
                </div>
                ` : ''}
                ${detail.currentStatus.currentWidthLimitM ? `
                <div style="padding:10px;background:rgba(56,189,248,0.03);border-radius:6px;border:1px solid rgba(56,189,248,0.08);">
                  <div style="font-size:10px;color:var(--text-muted);">当前限宽 (m)</div>
                  <div style="font-size:13px;color:var(--text-primary);">${detail.currentStatus.currentWidthLimitM}</div>
                </div>
                ` : ''}
              </div>
            </div>
            ` : ''}

            <!-- 道路关联 -->
            ${detail.roadRelations && detail.roadRelations.length > 0 ? `
            <div style="margin-bottom:20px;">
              <div style="font-weight:600;margin-bottom:12px;color:var(--text-primary);">🛣️ 道路关联 (${detail.roadRelations.length})</div>
              <div style="background:rgba(56,189,248,0.03);border-radius:6px;border:1px solid rgba(56,189,248,0.08);overflow:hidden;">
                <table style="width:100%;font-size:12px;border-collapse:collapse;">
                  <thead>
                    <tr style="background:rgba(56,189,248,0.05);">
                      <th style="padding:8px;text-align:left;color:var(--text-muted);">Edge ID</th>
                      <th style="padding:8px;text-align:left;color:var(--text-muted);">道路名称</th>
                      <th style="padding:8px;text-align:left;color:var(--text-muted);">编号</th>
                      <th style="padding:8px;text-align:left;color:var(--text-muted);">类型</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${detail.roadRelations.map(r => `
                    <tr style="border-top:1px solid rgba(56,189,248,0.05);">
                      <td style="padding:8px;font-family:monospace;color:var(--text-primary);">${r.roadEdgeId}</td>
                      <td style="padding:8px;color:var(--text-primary);">${r.edgeName || '-'}</td>
                      <td style="padding:8px;color:var(--text-primary);">${r.edgeRef || '-'}</td>
                      <td style="padding:8px;color:var(--text-primary);">${r.relationType || '-'}</td>
                    </tr>
                    `).join('')}
                  </tbody>
                </table>
              </div>
            </div>
            ` : ''}

            <!-- 操作按钮 -->
            <div style="display:flex;gap:12px;margin-top:20px;">
              ${detail.longitude && detail.latitude ? `
              <button class="btn-primary" onclick="window.__assetLocate(${detail.id}, ${detail.latitude}, ${detail.longitude})">
                📍 地图定位
              </button>
              ` : ''}
              <button class="btn-secondary" onclick="window.dispatchEvent(new CustomEvent('asset-selected', { detail: { assetId: ${detail.id}, source: 'detail' } }))">
                📊 选择此资产
              </button>
            </div>
          </div>
        </div>
        `;

        document.body.appendChild(overlay);

        // 关闭按钮
        document.getElementById('ad-close-btn').addEventListener('click', () => {
            overlay.remove();
        });

        // 点击背景关闭
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                overlay.remove();
            }
        });

        // 地图定位函数
        window.__assetLocate = (assetId, lat, lng) => {
            window.dispatchEvent(new CustomEvent('asset-selected', {
                detail: { assetId, source: 'detail', lat, lng }
            }));
        };

    } catch (error) {
        console.error('[AssetDetail] 加载失败:', error);
        showToast('加载资产详情失败', 'error');
    }
}

/**
 * 关闭资产详情窗口
 */
export function closeAssetDetail() {
    const el = document.getElementById('asset-detail-overlay');
    if (el) el.remove();
}
