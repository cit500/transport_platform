/**
 * 右侧面板 - 核心分析模块 / 韧性核心指标 / 区县韧性与通行概况
 *
 * 数据来源：通过 API 层获取，后端不可用时自动降级到 mockData
 */
import api from '../api/index.js';
import { openHeavyVehicleModule, isHeavyVehicleActive, closeHeavyVehicleModule } from './HeavyVehicleModule.js';
import { openDebrisResilienceModule, isDebrisResilienceActive, closeDebrisResilienceModule } from './DebrisResilienceModule.js';
import { openDataManagement } from './DataManagementModule.js';

export function initRightPanel() {
    initModuleButtons();
    initMetricCards();
    initCountyResilience();
}

// ============================================================
// 面板一：核心分析模块
// ============================================================
function initModuleButtons() {
    var c = document.getElementById('module-buttons');
    if (!c) return;

    api.getModuleConfigs().then(function(modules) {
        var sorted = (modules || []).slice().sort(function(a, b) { return (a.display_order || 99) - (b.display_order || 99); });
        var entries = sorted.slice(0, 3);
        if (entries.length === 0) {
            entries = [
                { module_name: '重车通行评估', icon: '🚚', description: '重车路径规划与限载校核' },
                { module_name: '灾害韧性评估', icon: '🌋', description: '泥石流灾害概率预测与路网韧性评估' },
                { module_name: '数据管理', icon: '🗄️', description: '桥隧资产与区县指标数据管理' }
            ];
        }

        c.style.cssText = 'display:flex;gap:8px;padding:2px 0;';
        entries.forEach(function(m) {
            var btn = document.createElement('div');
            btn.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:8px 6px;background:rgba(56,189,248,0.06);border:1px solid rgba(56,189,248,0.15);border-radius:6px;cursor:pointer;transition:all 0.2s;min-height:58px;';
            btn.title = m.description || '';
            btn.innerHTML =
                '<span style="font-size:24px;line-height:1;">' + (m.icon || '🔧') + '</span>' +
                '<span style="font-size:11px;color:var(--text-primary);font-weight:600;text-align:center;line-height:1;">' + m.module_name + '</span>';

            btn.addEventListener('mouseenter', function() { btn.style.borderColor = 'rgba(56,189,248,0.5)'; btn.style.background = 'rgba(56,189,248,0.1)'; });
            btn.addEventListener('mouseleave', function() { btn.style.borderColor = 'rgba(56,189,248,0.15)'; btn.style.background = 'rgba(56,189,248,0.06)'; });
            btn.addEventListener('click', function() {
                var name = m.module_name;
                // 先关闭所有其他模块（一次只允许一个全屏模块打开）
                if (isHeavyVehicleActive()) closeHeavyVehicleModule();
                if (isDebrisResilienceActive()) closeDebrisResilienceModule();
                var dmOv = document.getElementById('data-mgmt-overlay');
                if (dmOv) { dmOv.remove(); document.body.classList.remove('dm-modal-open'); }
                // 打开对应模块
                if (name === '重车通行评估') {
                    openHeavyVehicleModule();
                } else if (name === '灾害韧性评估') {
                    openDebrisResilienceModule();
                } else if (name === '数据管理') {
                    openDataManagement();
                } else {
                    window.showToast('🔧 ' + name + ' 功能开发中', 'info');
                }
            });
            c.appendChild(btn);
        });
    });
}

// ============================================================
// 面板二：韧性核心指标（三个核心指标）
// ============================================================
function initMetricCards() {
    var c = document.getElementById('gauge-value');
    if (!c) return;

    // 初始显示"加载中..."
    c.innerHTML = '<div style="text-align:center;padding:16px;font-size:12px;color:var(--text-muted);">加载中...</div>';

    // 监听区县选中事件（点击左侧区县列表或地图区县时触发）
    window.addEventListener('district-selected', function(e) {
        var d = e.detail;
        if (d) {
            updateMetricCards(c, d.district_name, d.resilience_score, d.disaster_risk_rate, d.traffic_guarantee_rate);
        }
    });

    // 默认加载全市平均值
    loadCityAverageMetrics(c);
}

function loadCityAverageMetrics(c) {
    api.getDistrictMetrics().then(function(metrics) {
        if (!metrics || metrics.length === 0) {
            c.innerHTML = '<div style="text-align:center;padding:16px;font-size:12px;color:var(--text-muted);">暂无数据</div>';
            return;
        }
        var totalResilience = 0, totalDisasterRisk = 0, totalTraffic = 0;
        var count = metrics.length;
        metrics.forEach(function(d) {
            totalResilience += (d.resilience_score || 0);
            totalDisasterRisk += (d.disaster_risk_rate || 0);
            totalTraffic += (d.traffic_guarantee_rate || 0);
        });
        var avgResilience = (totalResilience / count).toFixed(1);
        var avgDisasterRisk = (totalDisasterRisk / count).toFixed(1);
        var avgTraffic = (totalTraffic / count).toFixed(1);
        updateMetricCards(c, '重庆市', avgResilience, avgDisasterRisk, avgTraffic);
    });
}

function updateMetricCards(c, title, resilienceScore, disasterRiskRate, trafficGuaranteeRate) {
    // 颜色规则：韧性总评分 80以上绿色 60~80黄色 60以下红色
    var resilienceColor = '#4ADE80';
    if (resilienceScore < 60) resilienceColor = '#F87171';
    else if (resilienceScore < 80) resilienceColor = '#FBBF24';

    // 灾害风险率：20%以下绿色 20%~40%黄色 40%以上红色
    var riskColor = '#4ADE80';
    if (disasterRiskRate > 40) riskColor = '#F87171';
    else if (disasterRiskRate > 20) riskColor = '#FBBF24';

    // 通行保障率：80%以上绿色 60%~80%黄色 60%以下红色
    var trafficColor = '#4ADE80';
    if (trafficGuaranteeRate < 60) trafficColor = '#F87171';
    else if (trafficGuaranteeRate < 80) trafficColor = '#FBBF24';

    // 更新标题栏标签
    var label = document.getElementById('gauge-city-label');
    if (label) {
        label.textContent = (title === '重庆市') ? '重庆市 / 全市平均' : title;
    }

    c.innerHTML =
        '<div style="display:flex;flex-direction:column;gap:4px;padding:2px 10px;">' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;">' +
        '<div style="background:rgba(74,222,128,0.08);border:1px solid rgba(74,222,128,0.2);border-radius:5px;padding:6px 4px;text-align:center;">' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:2px;line-height:1.2;">韧性总评分</div>' +
        '<div style="font-size:20px;font-weight:900;color:' + resilienceColor + ';line-height:1.2;">' + resilienceScore + '</div>' +
        '</div>' +
        '<div style="background:rgba(251,191,36,0.08);border:1px solid rgba(251,191,36,0.2);border-radius:5px;padding:6px 4px;text-align:center;">' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:2px;line-height:1.2;">灾害风险率</div>' +
        '<div style="font-size:20px;font-weight:900;color:' + riskColor + ';line-height:1.2;">' + disasterRiskRate + '%</div>' +
        '</div>' +
        '<div style="background:rgba(56,189,248,0.08);border:1px solid rgba(56,189,248,0.2);border-radius:5px;padding:6px 4px;text-align:center;">' +
        '<div style="font-size:12px;color:var(--text-muted);margin-bottom:2px;line-height:1.2;">通行保障率</div>' +
        '<div style="font-size:20px;font-weight:900;color:' + trafficColor + ';line-height:1.2;">' + trafficGuaranteeRate + '%</div>' +
        '</div>' +
        '</div></div>';
}

// ============================================================
// 面板三：区县韧性与通行概况
// ============================================================
function initCountyResilience() {
    var list = document.getElementById('county-resilience-list');
    if (!list) return;
    list.innerHTML = '';

    api.getDistrictMetrics().then(function(data) {
        // 按韧性评分从高到低排序
        data.sort(function(a, b) { return (b.resilience_score || 0) - (a.resilience_score || 0); });

        // 表头
        var header = document.createElement('div');
        header.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 6px;margin-bottom:2px;font-size:12px;color:var(--text-muted);font-weight:600;border-bottom:1px solid rgba(56,189,248,0.1);';
        header.innerHTML =
            '<span style="flex:3;text-align:left;">区县</span>' +
            '<span style="flex:1;text-align:center;">韧性</span>' +
            '<span style="flex:1;text-align:center;">风险</span>' +
            '<span style="flex:1;text-align:center;">通行</span>';
        list.appendChild(header);

        data.forEach(function(d) {
            var resilienceScore = d.resilience_score || 0;
            var disasterRiskRate = d.disaster_risk_rate || 0;
            var trafficGuaranteeRate = d.traffic_guarantee_rate || 0;

            // 颜色编码（使用小标签颜色）
            var resilienceColor = '#4ADE80';
            if (resilienceScore < 60) resilienceColor = '#F87171';
            else if (resilienceScore < 75) resilienceColor = '#FBBF24';

            var riskColor = '#4ADE80';
            if (disasterRiskRate > 25) riskColor = '#F87171';
            else if (disasterRiskRate > 15) riskColor = '#FBBF24';

            var trafficColor = '#4ADE80';
            if (trafficGuaranteeRate < 60) trafficColor = '#F87171';
            else if (trafficGuaranteeRate < 80) trafficColor = '#FBBF24';

            var el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;gap:6px;padding:2px 6px;margin-bottom:1px;height:22px;border-radius:2px;cursor:pointer;font-size:11px;';
            el.innerHTML =
                '<span style="flex:3;text-align:left;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + d.district_name + '</span>' +
                '<span style="flex:1;text-align:center;color:' + resilienceColor + ';font-weight:600;">' + resilienceScore + '</span>' +
                '<span style="flex:1;text-align:center;color:' + riskColor + ';font-weight:600;">' + disasterRiskRate + '%</span>' +
                '<span style="flex:1;text-align:center;color:' + trafficColor + ';font-weight:600;">' + trafficGuaranteeRate + '%</span>';

            el.addEventListener('click', function() {
                window.showToast('📍 已选择: ' + d.district_name, 'info');
                window.__selectedDistrict = d;
                var evt = new CustomEvent('district-selected', { detail: d });
                window.dispatchEvent(evt);
            });

            list.appendChild(el);
        });
    });
}