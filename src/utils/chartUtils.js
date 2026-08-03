/**
 * Chart.js 图表工具函数
 */

let resilienceChartInstance = null;

/**
 * 创建韧性演化折线图
 */
export function createResilienceChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    // 销毁旧实例
    if (resilienceChartInstance) {
        resilienceChartInstance.destroy();
    }

    resilienceChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: data.labels,
            datasets: [
                {
                    label: '连通度',
                    data: data.connectivity,
                    borderColor: '#4ADE80',
                    backgroundColor: 'rgba(74, 222, 128, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#4ADE80',
                    borderWidth: 2,
                },
                {
                    label: '网络效率',
                    data: data.efficiency,
                    borderColor: '#38BDF8',
                    backgroundColor: 'rgba(56, 189, 248, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#38BDF8',
                    borderWidth: 2,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 800 },
            plugins: {
                legend: {
                    labels: {
                        color: '#94A3B8',
                        font: { size: 10, family: "'Segoe UI','PingFang SC',sans-serif" },
                        boxWidth: 12,
                        padding: 8,
                    }
                },
                tooltip: {
                    backgroundColor: 'rgba(10, 20, 40, 0.9)',
                    titleColor: '#E2E8F0',
                    bodyColor: '#94A3B8',
                    borderColor: 'rgba(56, 189, 248, 0.3)',
                    borderWidth: 1,
                }
            },
            scales: {
                x: {
                    ticks: { color: '#64748B', font: { size: 10 } },
                    grid: { color: 'rgba(56, 189, 248, 0.05)' },
                },
                y: {
                    min: 0.5,
                    max: 1.0,
                    ticks: { color: '#64748B', font: { size: 10 } },
                    grid: { color: 'rgba(56, 189, 248, 0.08)' },
                }
            }
        }
    });

    return resilienceChartInstance;
}

/**
 * 创建桥梁载荷响应柱状图
 */
export function createBridgeLoadChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    return new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['主梁抗弯强度', '支座剪力', '桥墩轴力', '基础承载力'],
            datasets: [{
                label: '受载响应百分比 (%)',
                data: data,
                backgroundColor: data.map(v => v >= 100 ? 'rgba(248,113,113,0.7)' : v >= 80 ? 'rgba(251,191,36,0.7)' : 'rgba(74,222,128,0.7)'),
                borderColor: data.map(v => v >= 100 ? '#F87171' : v >= 80 ? '#FBBF24' : '#4ADE80'),
                borderWidth: 1,
                borderRadius: 4,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            indexAxis: 'y',
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 20, 40, 0.9)',
                    titleColor: '#E2E8F0',
                    bodyColor: '#94A3B8',
                    borderColor: 'rgba(56, 189, 248, 0.3)',
                    borderWidth: 1,
                    callbacks: {
                        label: ctx => `${ctx.parsed.x}%`
                    }
                }
            },
            scales: {
                x: {
                    max: 120,
                    ticks: { color: '#64748B', font: { size: 10 }, callback: v => v + '%' },
                    grid: { color: 'rgba(56, 189, 248, 0.05)' },
                },
                y: {
                    ticks: { color: '#94A3B8', font: { size: 11 } },
                    grid: { display: false },
                }
            }
        }
    });
}

/**
 * 创建灾害损失雷达图
 */
export function createDisasterRadarChart(canvasId, data) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return null;

    return new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['桥梁', '隧道', '路基', '边坡', '交安设施', '机电设备'],
            datasets: [{
                label: '受损程度',
                data: data,
                backgroundColor: 'rgba(248,113,113,0.15)',
                borderColor: '#F87171',
                pointBackgroundColor: '#F87171',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: '#F87171',
                borderWidth: 2,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: '#94A3B8', font: { size: 10, family: "'Segoe UI','PingFang SC',sans-serif" } }
                }
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
