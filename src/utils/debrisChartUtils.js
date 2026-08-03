/**
 * 泥石流灾害韧性评估专用图表工具
 * 依赖 Chart.js
 */

/**
 * I-D 降雨阈值对比曲线
 * 窄陡型、宽缓型、汶川震区三条曲线叠加
 */
export function createThresholdCurveChart(canvasId, data) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  var ctx = canvas.getContext('2d');

  var durations = [0.5, 1, 2, 3, 6, 12, 24, 48];

  // 三条 I-D 阈值曲线：I = a * D^(-b)
  var narrowSteep = durations.map(function(D) { return 28.5 * Math.pow(D, -0.62); });     // 窄陡型
  var wideGentle = durations.map(function(D) { return 18.2 * Math.pow(D, -0.55); });      // 宽缓型
  var wenchuan = durations.map(function(D) { return 35.0 * Math.pow(D, -0.68); });        // 汶川震区

  // 当前工况点
  var currentDuration = parseFloat(document.getElementById('input-rain-duration')?.value) || 12;
  var currentIntensity = parseFloat(document.getElementById('input-real-intensity')?.value) || 10;

  return new Chart(ctx, {
    type: 'line',
    data: {
      labels: durations.map(function(d) { return d + 'h'; }),
      datasets: [
        {
          label: '窄陡型阈值',
          data: narrowSteep,
          borderColor: '#F87171',
          backgroundColor: 'transparent',
          borderDash: [5, 3],
          pointRadius: 3,
          pointBackgroundColor: '#F87171',
          tension: 0.4,
          fill: false,
        },
        {
          label: '宽缓型阈值',
          data: wideGentle,
          borderColor: '#FBBF24',
          backgroundColor: 'transparent',
          borderDash: [3, 3],
          pointRadius: 3,
          pointBackgroundColor: '#FBBF24',
          tension: 0.4,
          fill: false,
        },
        {
          label: '汶川震区阈值',
          data: wenchuan,
          borderColor: '#FB923C',
          backgroundColor: 'transparent',
          borderDash: [8, 4],
          pointRadius: 3,
          pointBackgroundColor: '#FB923C',
          tension: 0.4,
          fill: false,
        },
        {
          label: '当前工况',
          data: [{ x: currentDuration, y: currentIntensity }],
          borderColor: '#38BDF8',
          backgroundColor: '#38BDF8',
          pointRadius: 8,
          pointStyle: 'star',
          showLine: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94A3B8', font: { size: 9 } } },
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
          type: 'logarithmic',
          title: { display: true, text: '降雨历时 D (h)', color: '#94A3B8', font: { size: 10 } },
          ticks: { color: '#64748B', font: { size: 9 }, callback: function(v) { return v + 'h'; } },
          grid: { color: 'rgba(56, 189, 248, 0.05)' },
        },
        y: {
          type: 'logarithmic',
          title: { display: true, text: '雨强 I (mm/h)', color: '#94A3B8', font: { size: 10 } },
          ticks: { color: '#64748B', font: { size: 9 } },
          grid: { color: 'rgba(56, 189, 248, 0.08)' },
        }
      }
    }
  });
}

/**
 * Copula 联合概率热力图（降雨强度-泥石流体积）
 */
export function createCopulaHeatmap(canvasId, data) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  var ctx = canvas.getContext('2d');

  var rainLabels = ['50mm', '80mm', '120mm', '180mm', '250mm', '350mm'];
  var volumeLabels = ['<1万m³', '1-5万', '5-10万', '10-50万', '>50万'];

  var heatData = [
    [0.02, 0.05, 0.08, 0.12, 0.15],
    [0.05, 0.10, 0.18, 0.25, 0.20],
    [0.10, 0.20, 0.35, 0.45, 0.30],
    [0.15, 0.30, 0.50, 0.65, 0.45],
    [0.25, 0.45, 0.65, 0.80, 0.60],
    [0.35, 0.55, 0.75, 0.88, 0.72],
  ];

  new Chart(ctx, {
    type: 'matrix',
    data: {
      datasets: [{
        label: '联合概率',
        data: heatData.flatMap(function(row, i) {
          return row.map(function(val, j) {
            return { x: j, y: i, v: val };
          });
        }),
        backgroundColor: function(ctx) {
          var val = ctx.dataset.data[ctx.dataIndex].v;
          if (val >= 0.7) return 'rgba(248, 113, 113, 0.85)';
          if (val >= 0.5) return 'rgba(251, 191, 36, 0.75)';
          if (val >= 0.3) return 'rgba(251, 146, 60, 0.65)';
          if (val >= 0.1) return 'rgba(56, 189, 248, 0.5)';
          return 'rgba(74, 222, 128, 0.4)';
        },
        width: function() { return 40; },
        height: function() { return 30; },
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: function(items) {
              var item = items[0];
              return '降雨: ' + rainLabels[item.dataIndex % 5] + ', 体积: ' + volumeLabels[Math.floor(item.dataIndex / 5)];
            },
            label: function(context) {
              return '联合概率: ' + (context.dataset.data[context.dataIndex].v * 100).toFixed(0) + '%';
            }
          },
          backgroundColor: 'rgba(10, 20, 40, 0.9)',
          titleColor: '#E2E8F0',
          bodyColor: '#94A3B8',
        }
      },
      scales: {
        x: {
          type: 'category',
          labels: volumeLabels,
          ticks: { color: '#64748B', font: { size: 9 } },
          grid: { display: false },
        },
        y: {
          type: 'category',
          labels: rainLabels,
          ticks: { color: '#64748B', font: { size: 9 } },
          grid: { display: false },
          reverse: true,
        }
      }
    }
  });
}

/**
 * 创建韧性指标贡献柱状图
 */
export function createRobustnessBarChart(canvasId, data) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  var ctx = canvas.getContext('2d');

  var labels = ['连通保持率', '最大连通子图', '网络效率', '可达性保持', '容量保持率'];
  var values = [
    data.Rcom * data.robustTotal * 100,
    data.Rgcc * data.robustTotal * 100,
    data.Reff * data.robustTotal * 100,
    data.Racc * data.robustTotal * 100,
    data.Rcap * data.robustTotal * 100,
  ];

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '贡献占比',
        data: values,
        backgroundColor: [
          'rgba(74, 222, 128, 0.7)',
          'rgba(56, 189, 248, 0.7)',
          'rgba(251, 191, 36, 0.7)',
          'rgba(251, 146, 60, 0.7)',
          'rgba(248, 113, 113, 0.7)',
        ],
        borderColor: [
          '#4ADE80', '#38BDF8', '#FBBF24', '#FB923C', '#F87171',
        ],
        borderWidth: 1,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10, 20, 40, 0.9)',
          titleColor: '#E2E8F0',
          bodyColor: '#94A3B8',
        }
      },
      scales: {
        x: {
          ticks: { color: '#64748B', font: { size: 9 } },
          grid: { display: false },
        },
        y: {
          ticks: { color: '#64748B', font: { size: 9 }, callback: function(v) { return v.toFixed(1) + '%'; } },
          grid: { color: 'rgba(56, 189, 248, 0.05)' },
        }
      }
    }
  });
}

/**
 * 关联系数分布直方图
 */
export function createCorrelationHistogram(canvasId, data) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  var ctx = canvas.getContext('2d');

  var bins = ['0-0.2', '0.2-0.4', '0.4-0.6', '0.6-0.8', '0.8-1.0'];
  var counts = [5, 12, 25, 18, 8];

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels: bins,
      datasets: [{
        label: '单元数量',
        data: counts,
        backgroundColor: 'rgba(56, 189, 248, 0.6)',
        borderColor: '#38BDF8',
        borderWidth: 1,
        borderRadius: 3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: 'rgba(10, 20, 40, 0.9)',
          titleColor: '#E2E8F0',
          bodyColor: '#94A3B8',
        }
      },
      scales: {
        x: {
          title: { display: true, text: '关联度区间', color: '#94A3B8', font: { size: 10 } },
          ticks: { color: '#64748B', font: { size: 9 } },
          grid: { display: false },
        },
        y: {
          title: { display: true, text: '单元数', color: '#94A3B8', font: { size: 10 } },
          ticks: { color: '#64748B', font: { size: 9 } },
          grid: { color: 'rgba(56, 189, 248, 0.05)' },
        }
      }
    }
  });
}

/**
 * 前期有效降雨—临界雨量拟合关系图
 */
export function createRainfallFitScatter(canvasId) {
  var canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === 'undefined') return;
  var ctx = canvas.getContext('2d');

  // 模拟散点: P1d = 269.27 - 1.1656P
  var scatterData = [];
  for (var i = 0; i < 25; i++) {
    var P = 20 + Math.random() * 160;
    var P1d = 269.27 - 1.1656 * P + (Math.random() - 0.5) * 40;
    scatterData.push({ x: P, y: Math.max(50, P1d) });
  }

  var fitX = [20, 180];
  var fitY = fitX.map(function(x) { return 269.27 - 1.1656 * x; });

  return new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [
        {
          label: '历史数据点',
          data: scatterData,
          backgroundColor: 'rgba(56, 189, 248, 0.5)',
          pointRadius: 4,
        },
        {
          label: '拟合曲线',
          data: fitX.map(function(x, i) { return { x: x, y: fitY[i] }; }),
          type: 'line',
          borderColor: '#F87171',
          backgroundColor: 'transparent',
          borderWidth: 2,
          borderDash: [5, 3],
          pointRadius: 0,
          fill: false,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          labels: { color: '#94A3B8', font: { size: 9 } }
        },
        tooltip: {
          backgroundColor: 'rgba(10, 20, 40, 0.9)',
          titleColor: '#E2E8F0',
          bodyColor: '#94A3B8',
        }
      },
      scales: {
        x: {
          title: { display: true, text: '前期有效降雨量 P (mm)', color: '#94A3B8', font: { size: 10 } },
          ticks: { color: '#64748B', font: { size: 9 } },
          grid: { color: 'rgba(56, 189, 248, 0.05)' },
        },
        y: {
          title: { display: true, text: '24h临界雨量 P1d (mm)', color: '#94A3B8', font: { size: 10 } },
          ticks: { color: '#64748B', font: { size: 9 } },
          grid: { color: 'rgba(56, 189, 248, 0.08)' },
        }
      }
    }
  });
}