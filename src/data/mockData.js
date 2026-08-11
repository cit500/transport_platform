/**
 * 平台 Mock 数据
 * 模拟 MySQL / Spring Boot / Python 算法返回的数据结构
 *
 * 所有数据均挂载到 window.__mockData，供后台管理模块编辑和持久化
 * 编辑后通过 localStorage 保存，刷新页面可保留
 */

// ============================================================
// 数据加载辅助：优先从 localStorage 读取，否则使用默认值
// ============================================================
function loadData(key, defaultVal) {
  try {
    var saved = localStorage.getItem('plant_mock_' + key);
    if (saved) return JSON.parse(saved);
  } catch (e) { /* ignore */ }
  return defaultVal;
}

function saveData(key, data) {
  try {
    localStorage.setItem('plant_mock_' + key, JSON.stringify(data));
  } catch (e) { /* ignore */ }
}

// ============================================================
// 1. 桥隧资产数据（与 MySQL data.sql 一致）
// ============================================================
export var bridgeArchives = loadData('bridgeArchives', [
  { uuid: 'BR_510100_0045', name: '重庆石板坡长江大桥', asset_type: 'bridge', district_name: '渝中区', longitude: 106.5514, latitude: 29.5628, route_name: 'G65包茂高速', route_code: 'G65', structure_type: '悬索桥', span_length: '1741m', design_load: '公路-Ⅰ级', current_status: 'normal', risk_level: 'low', risk_score: 0.18, health_index: 0.82, truck_pass_status: 'passable', monitoring_status: 'online', last_inspection_time: '2025-06-15', description: '重庆石板坡长江大桥，主跨1741m' },
  { uuid: 'BR_510100_0046', name: '重庆朝天门长江大桥', asset_type: 'bridge', district_name: '江北区', longitude: 106.6050, latitude: 29.5900, route_name: 'G93成渝环线', route_code: 'G93', structure_type: '悬索桥', span_length: '932m', design_load: '公路-Ⅱ级', current_status: 'warning', risk_level: 'medium', risk_score: 0.42, health_index: 0.65, truck_pass_status: 'restricted', monitoring_status: 'online', last_inspection_time: '2025-06-10', description: '朝天门长江大桥，主跨932m' },
  { uuid: 'BR_510100_0047', name: '重庆鱼洞长江大桥', asset_type: 'bridge', district_name: '巴南区', longitude: 106.5150, latitude: 29.4800, route_name: 'G75兰海高速', route_code: 'G75', structure_type: '斜拉桥', span_length: '1541m', design_load: '公路-Ⅰ级', current_status: 'normal', risk_level: 'low', risk_score: 0.12, health_index: 0.91, truck_pass_status: 'passable', monitoring_status: 'online', last_inspection_time: '2025-06-12', description: '鱼洞长江大桥，主跨1541m' },
  { uuid: 'BR_510100_0048', name: '重庆万州长江大桥', asset_type: 'bridge', district_name: '万州区', longitude: 108.4000, latitude: 30.8100, route_name: 'G50沪渝高速', route_code: 'G50', structure_type: '拱桥', span_length: '856m', design_load: '公路-Ⅱ级', current_status: 'danger', risk_level: 'high', risk_score: 0.78, health_index: 0.45, truck_pass_status: 'forbidden', monitoring_status: 'offline', last_inspection_time: '2025-06-08', description: '万州长江大桥，主筋锈蚀严重' },
  { uuid: 'BR_510100_0049', name: '重庆菜园坝长江大桥', asset_type: 'bridge', district_name: '渝中区', longitude: 106.5360, latitude: 29.5410, route_name: 'G5001绕城高速', route_code: 'G5001', structure_type: '梁桥', span_length: '1651m', design_load: '公路-Ⅰ级', current_status: 'normal', risk_level: 'low', risk_score: 0.15, health_index: 0.78, truck_pass_status: 'passable', monitoring_status: 'online', last_inspection_time: '2025-06-14', description: '菜园坝长江大桥，主跨1651m' },
  { uuid: 'BR_510100_0050', name: '重庆嘉华大桥', asset_type: 'bridge', district_name: '江北区', longitude: 106.5090, latitude: 29.5680, route_name: 'G65包茂高速', route_code: 'G65', structure_type: '斜拉桥', span_length: '1020m', design_load: '公路-Ⅰ级', current_status: 'normal', risk_level: 'low', risk_score: 0.10, health_index: 0.88, truck_pass_status: 'passable', monitoring_status: 'online', last_inspection_time: '2025-06-11', description: '嘉华大桥，主跨1020m' },
  { uuid: 'BR_510100_0051', name: '重庆千厮门大桥', asset_type: 'bridge', district_name: '江北区', longitude: 106.5810, latitude: 29.5710, route_name: 'G93成渝环线', route_code: 'G93', structure_type: '悬索桥', span_length: '720m', design_load: '公路-Ⅱ级', current_status: 'warning', risk_level: 'medium', risk_score: 0.35, health_index: 0.72, truck_pass_status: 'restricted', monitoring_status: 'online', last_inspection_time: '2025-06-09', description: '千厮门大桥，限载45t' },
  { uuid: 'BR_510100_0052', name: '重庆中梁山隧道', asset_type: 'tunnel', district_name: '九龙坡区', longitude: 106.5250, latitude: 29.5407, route_name: 'G5001绕城高速', route_code: 'G5001', structure_type: '隧道', span_length: '3603m', design_load: '公路-Ⅰ级', current_status: 'normal', risk_level: 'low', risk_score: 0.08, health_index: 0.85, truck_pass_status: 'passable', monitoring_status: 'online', last_inspection_time: '2025-06-13', description: '中梁山隧道，全长3603m' },
]);

// ============================================================
// 2. 路网业务属性（非几何，仅业务字段）
// ============================================================
// 初始从空表开始，用户通过"导入 JSON"加载 GeoJSON 属性
export var roadnetBusinessAttributes = loadData('roadnetBusinessAttributes', []);

// 路网分类统计
export var roadnetHighwayTypes = [
  { type: 'motorway', label: '高速公路主线', count: 0, color: '#e74c3c' },
  { type: 'motorway_link', label: '高速匝道', count: 0, color: '#ff8a80' },
  { type: 'trunk', label: '快速路/高等级干线', count: 0, color: '#f39c12' },
  { type: 'trunk_link', label: '快速路匝道', count: 0, color: '#f6b26b' },
];

// 路网总览统计（由加载时计算）
export var roadnetOverview = loadData('roadnetOverview', {
  edgeCount: 0,
  nodeCount: 0,
  districtCount: 0,
  motorwayKm: 0,
  trunkKm: 0,
  totalKm: 0,
});

// ============================================================
// 3. 行政区划与区域指标数据
// ============================================================
export var districtMetrics = loadData('districtMetrics', [
  // 重庆市37个区县，包含路网总览、桥隧数量、韧性评分、灾害风险率、通行保障率
  { district_id: 'd_01', district_name: '渝中区', district_adcode: '500103', asset_count: 142, bridge_count: 120, tunnel_count: 8, bridge_tunnel_count: 128, road_edge_count: 428, road_length_km: 98, motorway_length_km: 12, trunk_length_km: 86, control_node_count: 5, resilience_score: 92, disaster_risk_rate: 8, traffic_guarantee_rate: 96, monitoring_coverage: 0.97, high_risk_asset_count: 1, restricted_asset_count: 2, forbidden_asset_count: 0, unknown_status_asset_count: 0, risk_level: 'low' },
  { district_id: 'd_02', district_name: '万州区', district_adcode: '500101', asset_count: 138, bridge_count: 128, tunnel_count: 14, bridge_tunnel_count: 142, road_edge_count: 1872, road_length_km: 586, motorway_length_km: 215, trunk_length_km: 371, control_node_count: 8, resilience_score: 60, disaster_risk_rate: 35, traffic_guarantee_rate: 58, monitoring_coverage: 0.72, high_risk_asset_count: 6, restricted_asset_count: 8, forbidden_asset_count: 2, unknown_status_asset_count: 4, risk_level: 'medium' },
  { district_id: 'd_03', district_name: '涪陵区', district_adcode: '500102', asset_count: 127, bridge_count: 115, tunnel_count: 12, bridge_tunnel_count: 127, road_edge_count: 1698, road_length_km: 523, motorway_length_km: 186, trunk_length_km: 337, control_node_count: 6, resilience_score: 64, disaster_risk_rate: 30, traffic_guarantee_rate: 66, monitoring_coverage: 0.74, high_risk_asset_count: 4, restricted_asset_count: 6, forbidden_asset_count: 1, unknown_status_asset_count: 3, risk_level: 'medium' },
  { district_id: 'd_04', district_name: '南川区', district_adcode: '500119', asset_count: 35, bridge_count: 28, tunnel_count: 7, bridge_tunnel_count: 35, road_edge_count: 680, road_length_km: 210, motorway_length_km: 65, trunk_length_km: 145, control_node_count: 3, resilience_score: 52, disaster_risk_rate: 46, traffic_guarantee_rate: 54, monitoring_coverage: 0.65, high_risk_asset_count: 4, restricted_asset_count: 4, forbidden_asset_count: 1, unknown_status_asset_count: 2, risk_level: 'high' },
  { district_id: 'd_05', district_name: '黔江区', district_adcode: '500114', asset_count: 28, bridge_count: 22, tunnel_count: 6, bridge_tunnel_count: 28, road_edge_count: 520, road_length_km: 160, motorway_length_km: 48, trunk_length_km: 112, control_node_count: 2, resilience_score: 36, disaster_risk_rate: 64, traffic_guarantee_rate: 38, monitoring_coverage: 0.40, high_risk_asset_count: 8, restricted_asset_count: 5, forbidden_asset_count: 2, unknown_status_asset_count: 4, risk_level: 'extreme' },
  { district_id: 'd_06', district_name: '南岸区', district_adcode: '500108', asset_count: 96, bridge_count: 85, tunnel_count: 11, bridge_tunnel_count: 96, road_edge_count: 652, road_length_km: 198, motorway_length_km: 62, trunk_length_km: 136, control_node_count: 3, resilience_score: 85, disaster_risk_rate: 12, traffic_guarantee_rate: 87, monitoring_coverage: 0.93, high_risk_asset_count: 2, restricted_asset_count: 3, forbidden_asset_count: 0, unknown_status_asset_count: 1, risk_level: 'low' },
  { district_id: 'd_07', district_name: '沙坪坝区', district_adcode: '500106', asset_count: 87, bridge_count: 78, tunnel_count: 9, bridge_tunnel_count: 87, road_edge_count: 1024, road_length_km: 312, motorway_length_km: 98, trunk_length_km: 214, control_node_count: 4, resilience_score: 80, disaster_risk_rate: 18, traffic_guarantee_rate: 82, monitoring_coverage: 0.90, high_risk_asset_count: 2, restricted_asset_count: 3, forbidden_asset_count: 0, unknown_status_asset_count: 1, risk_level: 'low' },
  { district_id: 'd_08', district_name: '九龙坡区', district_adcode: '500107', asset_count: 78, bridge_count: 68, tunnel_count: 10, bridge_tunnel_count: 78, road_edge_count: 872, road_length_km: 267, motorway_length_km: 87, trunk_length_km: 180, control_node_count: 3, resilience_score: 76, disaster_risk_rate: 22, traffic_guarantee_rate: 78, monitoring_coverage: 0.86, high_risk_asset_count: 3, restricted_asset_count: 4, forbidden_asset_count: 0, unknown_status_asset_count: 1, risk_level: 'low' },
  { district_id: 'd_09', district_name: '巴南区', district_adcode: '500113', asset_count: 69, bridge_count: 58, tunnel_count: 11, bridge_tunnel_count: 69, road_edge_count: 1342, road_length_km: 412, motorway_length_km: 145, trunk_length_km: 267, control_node_count: 5, resilience_score: 72, disaster_risk_rate: 25, traffic_guarantee_rate: 74, monitoring_coverage: 0.80, high_risk_asset_count: 3, restricted_asset_count: 4, forbidden_asset_count: 0, unknown_status_asset_count: 2, risk_level: 'low' },
  { district_id: 'd_10', district_name: '大渡口区', district_adcode: '500104', asset_count: 58, bridge_count: 50, tunnel_count: 8, bridge_tunnel_count: 58, road_edge_count: 294, road_length_km: 87, motorway_length_km: 18, trunk_length_km: 69, control_node_count: 2, resilience_score: 68, disaster_risk_rate: 32, traffic_guarantee_rate: 70, monitoring_coverage: 0.78, high_risk_asset_count: 2, restricted_asset_count: 3, forbidden_asset_count: 1, unknown_status_asset_count: 1, risk_level: 'medium' },
  { district_id: 'd_11', district_name: '江津区', district_adcode: '500116', asset_count: 52, bridge_count: 44, tunnel_count: 8, bridge_tunnel_count: 52, road_edge_count: 1536, road_length_km: 476, motorway_length_km: 168, trunk_length_km: 308, control_node_count: 4, resilience_score: 55, disaster_risk_rate: 45, traffic_guarantee_rate: 58, monitoring_coverage: 0.65, high_risk_asset_count: 5, restricted_asset_count: 6, forbidden_asset_count: 1, unknown_status_asset_count: 3, risk_level: 'high' },
  { district_id: 'd_12', district_name: '永川区', district_adcode: '500118', asset_count: 46, bridge_count: 38, tunnel_count: 8, bridge_tunnel_count: 46, road_edge_count: 1198, road_length_km: 367, motorway_length_km: 124, trunk_length_km: 243, control_node_count: 3, resilience_score: 52, disaster_risk_rate: 48, traffic_guarantee_rate: 54, monitoring_coverage: 0.60, high_risk_asset_count: 5, restricted_asset_count: 5, forbidden_asset_count: 1, unknown_status_asset_count: 3, risk_level: 'high' },
  { district_id: 'd_13', district_name: '合川区', district_adcode: '500117', asset_count: 40, bridge_count: 32, tunnel_count: 8, bridge_tunnel_count: 40, road_edge_count: 1286, road_length_km: 398, motorway_length_km: 132, trunk_length_km: 266, control_node_count: 4, resilience_score: 48, disaster_risk_rate: 52, traffic_guarantee_rate: 50, monitoring_coverage: 0.56, high_risk_asset_count: 6, restricted_asset_count: 5, forbidden_asset_count: 1, unknown_status_asset_count: 4, risk_level: 'high' },
  { district_id: 'd_14', district_name: '綦江区', district_adcode: '500110', asset_count: 34, bridge_count: 26, tunnel_count: 8, bridge_tunnel_count: 34, road_edge_count: 1426, road_length_km: 445, motorway_length_km: 156, trunk_length_km: 289, control_node_count: 3, resilience_score: 44, disaster_risk_rate: 58, traffic_guarantee_rate: 46, monitoring_coverage: 0.52, high_risk_asset_count: 7, restricted_asset_count: 6, forbidden_asset_count: 2, unknown_status_asset_count: 4, risk_level: 'high' },
  { district_id: 'd_15', district_name: '城口县', district_adcode: '500229', asset_count: 27, bridge_count: 20, tunnel_count: 7, bridge_tunnel_count: 27, road_edge_count: 512, road_length_km: 156, motorway_length_km: 32, trunk_length_km: 124, control_node_count: 2, resilience_score: 39, disaster_risk_rate: 62, traffic_guarantee_rate: 42, monitoring_coverage: 0.38, high_risk_asset_count: 8, restricted_asset_count: 5, forbidden_asset_count: 2, unknown_status_asset_count: 5, risk_level: 'extreme' },
  { district_id: 'd_16', district_name: '北碚区', district_adcode: '500109', asset_count: 42, bridge_count: 36, tunnel_count: 6, bridge_tunnel_count: 42, road_edge_count: 762, road_length_km: 234, motorway_length_km: 78, trunk_length_km: 156, control_node_count: 3, resilience_score: 76, disaster_risk_rate: 20, traffic_guarantee_rate: 78, monitoring_coverage: 0.85, high_risk_asset_count: 2, restricted_asset_count: 3, forbidden_asset_count: 0, unknown_status_asset_count: 1, risk_level: 'low' },
  { district_id: 'd_19', district_name: '开州区', district_adcode: '500154', asset_count: 28, bridge_count: 22, tunnel_count: 6, bridge_tunnel_count: 28, road_edge_count: 1118, road_length_km: 345, motorway_length_km: 115, trunk_length_km: 230, control_node_count: 3, resilience_score: 45, disaster_risk_rate: 55, traffic_guarantee_rate: 42, monitoring_coverage: 0.50, high_risk_asset_count: 6, restricted_asset_count: 5, forbidden_asset_count: 1, unknown_status_asset_count: 3, risk_level: 'high' },
  { district_id: 'd_20', district_name: '梁平区', district_adcode: '500155', asset_count: 22, bridge_count: 18, tunnel_count: 4, bridge_tunnel_count: 22, road_edge_count: 866, road_length_km: 267, motorway_length_km: 88, trunk_length_km: 179, control_node_count: 2, resilience_score: 47, disaster_risk_rate: 50, traffic_guarantee_rate: 44, monitoring_coverage: 0.54, high_risk_asset_count: 5, restricted_asset_count: 4, forbidden_asset_count: 1, unknown_status_asset_count: 3, risk_level: 'high' },
  { district_id: 'd_21', district_name: '武隆区', district_adcode: '500156', asset_count: 20, bridge_count: 16, tunnel_count: 4, bridge_tunnel_count: 20, road_edge_count: 1012, road_length_km: 312, motorway_length_km: 102, trunk_length_km: 210, control_node_count: 2, resilience_score: 42, disaster_risk_rate: 60, traffic_guarantee_rate: 44, monitoring_coverage: 0.48, high_risk_asset_count: 7, restricted_asset_count: 5, forbidden_asset_count: 2, unknown_status_asset_count: 4, risk_level: 'high' },
  { district_id: 'd_22', district_name: '丰都县', district_adcode: '500230', asset_count: 18, bridge_count: 14, tunnel_count: 4, bridge_tunnel_count: 18, road_edge_count: 768, road_length_km: 234, motorway_length_km: 76, trunk_length_km: 158, control_node_count: 2, resilience_score: 43, disaster_risk_rate: 58, traffic_guarantee_rate: 42, monitoring_coverage: 0.46, high_risk_asset_count: 6, restricted_asset_count: 4, forbidden_asset_count: 1, unknown_status_asset_count: 3, risk_level: 'high' },
  { district_id: 'd_23', district_name: '垫江县', district_adcode: '500231', asset_count: 16, bridge_count: 12, tunnel_count: 4, bridge_tunnel_count: 16, road_edge_count: 648, road_length_km: 198, motorway_length_km: 65, trunk_length_km: 133, control_node_count: 2, resilience_score: 48, disaster_risk_rate: 48, traffic_guarantee_rate: 46, monitoring_coverage: 0.52, high_risk_asset_count: 5, restricted_asset_count: 4, forbidden_asset_count: 1, unknown_status_asset_count: 3, risk_level: 'high' },
  { district_id: 'd_24', district_name: '忠县', district_adcode: '500233', asset_count: 15, bridge_count: 11, tunnel_count: 4, bridge_tunnel_count: 15, road_edge_count: 866, road_length_km: 267, motorway_length_km: 88, trunk_length_km: 179, control_node_count: 2, resilience_score: 41, disaster_risk_rate: 62, traffic_guarantee_rate: 44, monitoring_coverage: 0.42, high_risk_asset_count: 7, restricted_asset_count: 5, forbidden_asset_count: 2, unknown_status_asset_count: 4, risk_level: 'high' },
  { district_id: 'd_25', district_name: '云阳县', district_adcode: '500235', asset_count: 14, bridge_count: 10, tunnel_count: 4, bridge_tunnel_count: 14, road_edge_count: 962, road_length_km: 298, motorway_length_km: 95, trunk_length_km: 203, control_node_count: 2, resilience_score: 38, disaster_risk_rate: 65, traffic_guarantee_rate: 40, monitoring_coverage: 0.38, high_risk_asset_count: 8, restricted_asset_count: 5, forbidden_asset_count: 2, unknown_status_asset_count: 5, risk_level: 'extreme' },
  { district_id: 'd_26', district_name: '奉节县', district_adcode: '500236', asset_count: 13, bridge_count: 9, tunnel_count: 4, bridge_tunnel_count: 13, road_edge_count: 1012, road_length_km: 312, motorway_length_km: 102, trunk_length_km: 210, control_node_count: 2, resilience_score: 35, disaster_risk_rate: 68, traffic_guarantee_rate: 38, monitoring_coverage: 0.32, high_risk_asset_count: 9, restricted_asset_count: 6, forbidden_asset_count: 2, unknown_status_asset_count: 5, risk_level: 'extreme' },
  { district_id: 'd_27', district_name: '巫山县', district_adcode: '500237', asset_count: 11, bridge_count: 7, tunnel_count: 4, bridge_tunnel_count: 11, road_edge_count: 768, road_length_km: 234, motorway_length_km: 72, trunk_length_km: 162, control_node_count: 1, resilience_score: 33, disaster_risk_rate: 72, traffic_guarantee_rate: 36, monitoring_coverage: 0.30, high_risk_asset_count: 8, restricted_asset_count: 5, forbidden_asset_count: 2, unknown_status_asset_count: 5, risk_level: 'extreme' },
  { district_id: 'd_28', district_name: '巫溪县', district_adcode: '500238', asset_count: 10, bridge_count: 6, tunnel_count: 4, bridge_tunnel_count: 10, road_edge_count: 584, road_length_km: 178, motorway_length_km: 52, trunk_length_km: 126, control_node_count: 1, resilience_score: 31, disaster_risk_rate: 75, traffic_guarantee_rate: 34, monitoring_coverage: 0.28, high_risk_asset_count: 9, restricted_asset_count: 5, forbidden_asset_count: 2, unknown_status_asset_count: 5, risk_level: 'extreme' },
  { district_id: 'd_29', district_name: '石柱县', district_adcode: '500240', asset_count: 17, bridge_count: 13, tunnel_count: 4, bridge_tunnel_count: 17, road_edge_count: 932, road_length_km: 289, motorway_length_km: 96, trunk_length_km: 193, control_node_count: 2, resilience_score: 40, disaster_risk_rate: 60, traffic_guarantee_rate: 42, monitoring_coverage: 0.40, high_risk_asset_count: 7, restricted_asset_count: 5, forbidden_asset_count: 1, unknown_status_asset_count: 4, risk_level: 'high' },
  { district_id: 'd_30', district_name: '秀山县', district_adcode: '500241', asset_count: 16, bridge_count: 12, tunnel_count: 4, bridge_tunnel_count: 16, road_edge_count: 786, road_length_km: 244, motorway_length_km: 73, trunk_length_km: 171, control_node_count: 2, resilience_score: 42, disaster_risk_rate: 58, traffic_guarantee_rate: 42, monitoring_coverage: 0.42, high_risk_asset_count: 6, restricted_asset_count: 4, forbidden_asset_count: 1, unknown_status_asset_count: 3, risk_level: 'high' },
  { district_id: 'd_31', district_name: '酉阳县', district_adcode: '500242', asset_count: 15, bridge_count: 11, tunnel_count: 4, bridge_tunnel_count: 15, road_edge_count: 868, road_length_km: 268, motorway_length_km: 82, trunk_length_km: 186, control_node_count: 2, resilience_score: 38, disaster_risk_rate: 64, traffic_guarantee_rate: 38, monitoring_coverage: 0.36, high_risk_asset_count: 7, restricted_asset_count: 5, forbidden_asset_count: 2, unknown_status_asset_count: 4, risk_level: 'extreme' },
  { district_id: 'd_32', district_name: '彭水县', district_adcode: '500243', asset_count: 14, bridge_count: 10, tunnel_count: 4, bridge_tunnel_count: 14, road_edge_count: 924, road_length_km: 294, motorway_length_km: 92, trunk_length_km: 202, control_node_count: 2, resilience_score: 36, disaster_risk_rate: 66, traffic_guarantee_rate: 36, monitoring_coverage: 0.34, high_risk_asset_count: 8, restricted_asset_count: 5, forbidden_asset_count: 2, unknown_status_asset_count: 4, risk_level: 'extreme' },
  { district_id: 'd_33', district_name: '长寿区', district_adcode: '500115', asset_count: 38, bridge_count: 32, tunnel_count: 6, bridge_tunnel_count: 38, road_edge_count: 698, road_length_km: 214, motorway_length_km: 68, trunk_length_km: 146, control_node_count: 3, resilience_score: 77, disaster_risk_rate: 18, traffic_guarantee_rate: 80, monitoring_coverage: 0.88, high_risk_asset_count: 2, restricted_asset_count: 3, forbidden_asset_count: 0, unknown_status_asset_count: 1, risk_level: 'low' },
  { district_id: 'd_34', district_name: '铜梁区', district_adcode: '500151', asset_count: 28, bridge_count: 24, tunnel_count: 4, bridge_tunnel_count: 28, road_edge_count: 786, road_length_km: 242, motorway_length_km: 78, trunk_length_km: 164, control_node_count: 2, resilience_score: 62, disaster_risk_rate: 32, traffic_guarantee_rate: 64, monitoring_coverage: 0.72, high_risk_asset_count: 3, restricted_asset_count: 4, forbidden_asset_count: 1, unknown_status_asset_count: 2, risk_level: 'medium' },
  { district_id: 'd_35', district_name: '潼南区', district_adcode: '500152', asset_count: 24, bridge_count: 20, tunnel_count: 4, bridge_tunnel_count: 24, road_edge_count: 668, road_length_km: 206, motorway_length_km: 66, trunk_length_km: 140, control_node_count: 2, resilience_score: 58, disaster_risk_rate: 38, traffic_guarantee_rate: 60, monitoring_coverage: 0.66, high_risk_asset_count: 4, restricted_asset_count: 4, forbidden_asset_count: 1, unknown_status_asset_count: 2, risk_level: 'medium' },
  { district_id: 'd_36', district_name: '荣昌区', district_adcode: '500153', asset_count: 22, bridge_count: 18, tunnel_count: 4, bridge_tunnel_count: 22, road_edge_count: 598, road_length_km: 184, motorway_length_km: 58, trunk_length_km: 126, control_node_count: 2, resilience_score: 56, disaster_risk_rate: 40, traffic_guarantee_rate: 58, monitoring_coverage: 0.62, high_risk_asset_count: 4, restricted_asset_count: 4, forbidden_asset_count: 1, unknown_status_asset_count: 2, risk_level: 'medium' },
  { district_id: 'd_37', district_name: '璧山区', district_adcode: '500120', asset_count: 26, bridge_count: 22, tunnel_count: 4, bridge_tunnel_count: 26, road_edge_count: 568, road_length_km: 174, motorway_length_km: 56, trunk_length_km: 118, control_node_count: 2, resilience_score: 74, disaster_risk_rate: 22, traffic_guarantee_rate: 76, monitoring_coverage: 0.84, high_risk_asset_count: 2, restricted_asset_count: 3, forbidden_asset_count: 0, unknown_status_asset_count: 1, risk_level: 'low' },
  { district_id: 'd_38', district_name: '大足区', district_adcode: '500111', asset_count: 32, bridge_count: 26, tunnel_count: 6, bridge_tunnel_count: 32, road_edge_count: 620, road_length_km: 192, motorway_length_km: 58, trunk_length_km: 134, control_node_count: 2, resilience_score: 50, disaster_risk_rate: 50, traffic_guarantee_rate: 52, monitoring_coverage: 0.60, high_risk_asset_count: 5, restricted_asset_count: 4, forbidden_asset_count: 1, unknown_status_asset_count: 2, risk_level: 'high' },
  { district_id: 'd_39', district_name: '两江新区', district_adcode: '500112', asset_count: 52, bridge_count: 46, tunnel_count: 6, bridge_tunnel_count: 52, road_edge_count: 486, road_length_km: 148, motorway_length_km: 46, trunk_length_km: 102, control_node_count: 3, resilience_score: 86, disaster_risk_rate: 12, traffic_guarantee_rate: 88, monitoring_coverage: 0.94, high_risk_asset_count: 1, restricted_asset_count: 2, forbidden_asset_count: 0, unknown_status_asset_count: 1, risk_level: 'low' },
]);

// ============================================================
// 4. 仪表盘指标（全市汇总）
// ============================================================
export var dashboardMetrics = loadData('dashboardMetrics', {
  totalAssets: 1673,
  bridgeCount: 1342,
  tunnelCount: 331,
  roadEdgeCount: 33086,
  roadLengthKm: 9976.8,
  bridgeDensity: 0.13,
  tunnelDensity: 0.03,
  districtCount: 37,
  monitorCoverage: 0.85,
  passableCount: 1412,
  restrictedCount: 186,
  forbiddenCount: 42,
  unknownCount: 33,
  resilienceScore: 55.6,
  disasterRiskRate: 43.9,
  trafficGuaranteeRate: 56.9,
  controlNodeCount: 101,
});

// ============================================================
// 5. 薄弱环节 / 风险排序
// ============================================================
export var riskRankingItems = loadData('riskRankingItems', [
  { rank_id: 'rr_01', rank: 1, asset_name: '菜园坝大桥', district_name: '渝中区', asset_type: 'bridge', risk_level: 'extreme', risk_score: 0.95, health_score: 62, risk_reason: '结构健康评分低于阈值，主梁裂缝扩展', event_type: '结构风险', longitude: 106.5360, latitude: 29.5410 },
  { rank_id: 'rr_02', rank: 2, asset_name: '明月山隧道', district_name: '万州区', asset_type: 'tunnel', risk_level: 'high', risk_score: 0.88, health_score: 68, risk_reason: '隧道衬砌渗水严重，机电设施老化', event_type: '结构风险', longitude: 108.3000, latitude: 30.8000 },
  { rank_id: 'rr_03', rank: 3, asset_name: 'G65包茂高速K1635+200', district_name: '武隆区', asset_type: 'road', risk_level: 'high', risk_score: 0.76, health_score: 58, risk_reason: '桥面单幅承重超限，I级风险', event_type: '通行风险', longitude: 107.7500, latitude: 29.4200 },
  { rank_id: 'rr_04', rank: 4, asset_name: '万州长江大桥', district_name: '万州区', asset_type: 'bridge', risk_level: 'high', risk_score: 0.64, health_score: 45, risk_reason: '主筋锈蚀严重，承载力下降', event_type: '结构风险', longitude: 108.4000, latitude: 30.8100 },
  { rank_id: 'rr_05', rank: 5, asset_name: '嘉陵江大桥', district_name: '北碚区', asset_type: 'bridge', risk_level: 'medium', risk_score: 0.52, health_score: 72, risk_reason: '支座老化，承载力下降', event_type: '结构风险', longitude: 106.4200, latitude: 29.8200 },
  { rank_id: 'rr_06', rank: 6, asset_name: 'S201省道K45+200', district_name: '城口县', asset_type: 'road', risk_level: 'medium', risk_score: 0.47, health_score: 55, risk_reason: '边坡稳定性不足，雨季易滑坡', event_type: '灾害风险', longitude: 108.6500, latitude: 31.9500 },
  { rank_id: 'rr_07', rank: 7, asset_name: '千厮门大桥', district_name: '江北区', asset_type: 'bridge', risk_level: 'medium', risk_score: 0.41, health_score: 72, risk_reason: '限载45t，超限车辆频繁通行', event_type: '通行风险', longitude: 106.5810, latitude: 29.5710 },
  { rank_id: 'rr_08', rank: 8, asset_name: '李家沱大桥', district_name: '巴南区', asset_type: 'bridge', risk_level: 'low', risk_score: 0.35, health_score: 78, risk_reason: '桥面铺装层破损，需定期维护', event_type: '数据缺失', longitude: 106.5350, latitude: 29.4850 },
]);

// ============================================================
// 6. 趋势数据（韧性历史趋势）
// ============================================================
export var trendData = [
  { label: '1月', connectivity: 65, efficiency: 72, resilience: 68 },
  { label: '2月', connectivity: 68, efficiency: 74, resilience: 70 },
  { label: '3月', connectivity: 72, efficiency: 71, resilience: 72 },
  { label: '4月', connectivity: 78, efficiency: 76, resilience: 76 },
  { label: '5月', connectivity: 82, efficiency: 79, resilience: 80 },
  { label: '6月', connectivity: 85, efficiency: 83, resilience: 84 },
];

// ============================================================
// 7. 预警记录
// ============================================================
export var alertRecords = loadData('alertRecords', [
  { alert_id: 'al_001', alert_time: '2025-06-24 07:30:00', level: 'I级', level_color: 'red', bridge_name: '石板坡长江大桥', bridge_group: '渝中南桥群', alert_type: '结构变形', content: '主塔偏位超阈值3.2mm，I级高风险', status: '处置中' },
  { alert_id: 'al_002', alert_time: '2025-06-24 06:15:00', level: 'II级', level_color: 'yellow', bridge_name: '朝天门长江大桥', bridge_group: '渝中南桥群', alert_type: '裂缝扩展', content: '下游侧箱梁底板横向裂缝达0.28mm', status: '已响应' },
  { alert_id: 'al_003', alert_time: '2025-06-24 04:45:00', level: 'II级', level_color: 'yellow', bridge_name: '万州长江大桥', bridge_group: '万州桥群', alert_type: '超限预警', content: '监测到超限车辆(58.7t)通过，II级预警', status: '已响应' },
  { alert_id: 'al_004', alert_time: '2025-06-24 02:30:00', level: 'I级', level_color: 'red', bridge_name: '鱼洞长江大桥', bridge_group: '巴南桥群', alert_type: '抗风响应', content: '桥面横向振幅超限0.25Hz，I级高风险', status: '处置中' },
  { alert_id: 'al_005', alert_time: '2025-06-24 00:10:00', level: 'II级', level_color: 'yellow', bridge_name: '千厮门大桥', bridge_group: '渝中南桥群', alert_type: '位移监测', content: '梁端纵向位移超限达12cm，II级预警', status: '已处置' },
  { alert_id: 'al_006', alert_time: '2025-06-23 22:00:00', level: 'II级', level_color: 'yellow', bridge_name: '嘉华大桥', bridge_group: '江北桥群', alert_type: '振动异常', content: '主梁竖向振动异常增大，II级预警', status: '已处置' },
]);

// ============================================================
// 8. 评估任务与日志数据
// ============================================================
export var assessmentTaskLogs = loadData('assessmentTaskLogs', [
  { log_id: 'log_001', time: '2026-07-06 14:30', task_type: '重车通行评估', asset_name: '菜园坝大桥', district_name: '渝中区', disaster_risk_rate: null, resilience_score: null, traffic_guarantee_rate: 82, status: '已完成' },
  { log_id: 'log_002', time: '2026-07-06 14:20', task_type: '灾害韧性评估', asset_name: '明月山隧道', district_name: '万州区', disaster_risk_rate: 18, resilience_score: 76, traffic_guarantee_rate: 64, status: '限制通行' },
  { log_id: 'log_003', time: '2026-07-06 13:45', task_type: '重车通行评估', asset_name: '朝天门长江大桥', district_name: '江北区', disaster_risk_rate: null, resilience_score: null, traffic_guarantee_rate: 78, status: '计算中' },
  { log_id: 'log_004', time: '2026-07-06 13:00', task_type: '数据维护', asset_name: '万州长江大桥', district_name: '万州区', disaster_risk_rate: 22, resilience_score: 60, traffic_guarantee_rate: 58, status: '已完成' },
  { log_id: 'log_005', time: '2026-07-06 11:30', task_type: '桥隧状态更新', asset_name: '嘉华大桥', district_name: '江北区', disaster_risk_rate: null, resilience_score: null, traffic_guarantee_rate: 90, status: '已归档' },
  { log_id: 'log_006', time: '2026-07-06 10:00', task_type: '灾害韧性评估', asset_name: '石板坡长江大桥', district_name: '渝中区', disaster_risk_rate: 8, resilience_score: 92, traffic_guarantee_rate: 96, status: '已完成' },
  { log_id: 'log_007', time: '2026-07-06 09:20', task_type: '路网状态更新', asset_name: 'G75兰海高速K1054+200', district_name: '渝中区', disaster_risk_rate: null, resilience_score: null, traffic_guarantee_rate: null, status: '待处理' },
  { log_id: 'log_008', time: '2026-07-05 16:00', task_type: '重车通行评估', asset_name: '千厮门大桥', district_name: '江北区', disaster_risk_rate: null, resilience_score: null, traffic_guarantee_rate: 72, status: '已完成' },
  { log_id: 'log_009', time: '2026-07-05 14:30', task_type: '灾害韧性评估', asset_name: '鱼洞长江大桥', district_name: '巴南区', disaster_risk_rate: 25, resilience_score: 72, traffic_guarantee_rate: 74, status: '已归档' },
  { log_id: 'log_010', time: '2026-07-05 11:00', task_type: '数据维护', asset_name: '中梁山隧道', district_name: '九龙坡区', disaster_risk_rate: null, resilience_score: null, traffic_guarantee_rate: null, status: '失败' },
]);

// ============================================================
// 9. 模块配置数据
// ============================================================
export var moduleConfigs = loadData('moduleConfigs', [
  { module_id: 'mod_01', module_name: '重车通行评估', module_type: 'business', icon: '🚚', description: '重车路径规划与限载校核', enabled: true, display_order: 1 },
  { module_id: 'mod_02', module_name: '灾害韧性评估', module_type: 'business', icon: '🌋', description: '泥石流灾害概率预测与路网韧性评估', enabled: true, display_order: 2 },
  { module_id: 'mod_03', module_name: '数据管理', module_type: 'system', icon: '🗄️', description: '桥隧资产与区县指标数据管理', enabled: true, display_order: 3 },
]);

// ============================================================
// 9. 历史仿真成果归档（与 MySQL data.sql 一致）
// ============================================================
export var simulationArchiveData = loadData('simulationArchiveData', [
  { id: 'SIM_20250601', date: '2025-06-01', type: '地震灾害模拟', zone: '渝北区', lossPercent: 30, status: 'completed' },
  { id: 'SIM_20250515', date: '2025-05-15', type: '泥石流灾害模拟', zone: '城口县', lossPercent: 45, status: 'completed' },
  { id: 'SIM_20250420', date: '2025-04-20', type: '地震灾害模拟', zone: '万州区', lossPercent: 25, status: 'completed' },
  { id: 'SIM_20250310', date: '2025-03-10', type: '泥石流灾害模拟', zone: '綦江区', lossPercent: 38, status: 'completed' },
]);

// ============================================================
// 10. 历史灾害事件（与 MySQL data.sql 一致）
// ============================================================
export var historicalEvents = [
  { id: 'E001', time: '2024-03-15 14:30', desc: 'G75兰海高速K1054+200桥面单幅承重超限，I级风险', tag: 'warning', tagText: '预警', lat: 29.6130, lng: 106.5780, hasReplay: true },
  { id: 'E002', time: '2024-02-28 09:15', desc: 'G93成渝环线K512+800对桥梁影响较大，分级管养中', tag: 'danger', tagText: '复盘', lat: 29.5750, lng: 106.5250, hasReplay: true },
  { id: 'E003', time: '2024-01-10 11:00', desc: 'G65包茂高速K1635+200桥面单幅承重超限', tag: 'warning', tagText: '阻断', lat: 29.5407, lng: 106.5250, hasReplay: false },
  { id: 'E004', time: '2023-12-20 16:40', desc: 'G50沪渝高速K1691+300桥梁技术状况较差', tag: 'danger', tagText: '限载', lat: 29.5600, lng: 106.5150, hasReplay: false },
  { id: 'E005', time: '2023-11-05 08:20', desc: 'G5001绕城高速K128+600维护完成，恢复通行', tag: 'success', tagText: '完成', lat: 29.5680, lng: 106.5090, hasReplay: true },
];

// ============================================================
// 10b. 平台任务与评估日志
// ============================================================
export var platformTaskLogs = loadData('platformTaskLogs', [
  { log_id: 'LOG_001', time: '2026-07-06 16:30', task_type: '重车通行评估', asset_name: '菜园坝大桥', district_name: '渝中区', disaster_risk_rate: null, resilience_score: 76, traffic_guarantee_rate: 82, task_status: '已完成' },
  { log_id: 'LOG_002', time: '2026-07-06 14:15', task_type: '灾害韧性评估', asset_name: '明月山隧道', district_name: '万州区', disaster_risk_rate: 35, resilience_score: 60, traffic_guarantee_rate: 58, task_status: '已归档' },
  { log_id: 'LOG_003', time: '2026-07-06 11:00', task_type: '数据维护', asset_name: '嘉陵江大桥', district_name: '江北区', disaster_risk_rate: 10, resilience_score: 88, traffic_guarantee_rate: 90, task_status: '已完成' },
  { log_id: 'LOG_004', time: '2026-07-05 09:30', task_type: '桥隧状态更新', asset_name: '中梁山隧道', district_name: '沙坪坝区', disaster_risk_rate: 18, resilience_score: 80, traffic_guarantee_rate: 82, task_status: '已完成' },
  { log_id: 'LOG_005', time: '2026-07-05 08:00', task_type: '重车通行评估', asset_name: '长江大桥', district_name: '南岸区', disaster_risk_rate: 12, resilience_score: 85, traffic_guarantee_rate: 87, task_status: '计算中' },
  { log_id: 'LOG_006', time: '2026-07-04 17:45', task_type: '路网状态更新', asset_name: 'G65包茂高速控制段', district_name: '武隆区', disaster_risk_rate: 60, resilience_score: 42, traffic_guarantee_rate: 44, task_status: '待处理' },
  { log_id: 'LOG_007', time: '2026-07-04 15:20', task_type: '重车通行评估', asset_name: '重庆石板坡长江大桥', district_name: '渝中区', disaster_risk_rate: 8, resilience_score: 92, traffic_guarantee_rate: 96, task_status: '已完成' },
  { log_id: 'LOG_008', time: '2026-07-03 10:00', task_type: '灾害韧性评估', asset_name: '城口县山区路段', district_name: '城口县', disaster_risk_rate: 62, resilience_score: 39, traffic_guarantee_rate: 42, task_status: '已归档' },
]);

// ============================================================
// 11. 桥梁标记数据（与 MySQL data.sql 一致，简化为首页地图所用）
// ============================================================
export var bridges = [
  { uuid: 'BR_510100_0045', name: '重庆石板坡长江大桥', type: '悬索桥', span: '1741m', designLoad: '公路-Ⅰ级', lat: 29.5628, lng: 106.5514, healthScore: 0.82, loadLimit: 55, status: 'normal' },
  { uuid: 'BR_510100_0046', name: '重庆朝天门长江大桥', type: '悬索桥', span: '932m', designLoad: '公路-Ⅱ级', lat: 29.5900, lng: 106.6050, healthScore: 0.65, loadLimit: 40, status: 'warning' },
  { uuid: 'BR_510100_0047', name: '重庆鱼洞长江大桥', type: '斜拉桥', span: '1541m', designLoad: '公路-Ⅰ级', lat: 29.4800, lng: 106.5150, healthScore: 0.91, loadLimit: 60, status: 'normal' },
  { uuid: 'BR_510100_0048', name: '重庆万州长江大桥', type: '拱桥', span: '856m', designLoad: '公路-Ⅱ级', lat: 30.8100, lng: 108.4000, healthScore: 0.45, loadLimit: 30, status: 'danger' },
  { uuid: 'BR_510100_0049', name: '重庆菜园坝长江大桥', type: '梁桥', span: '1651m', designLoad: '公路-Ⅰ级', lat: 29.5410, lng: 106.5360, healthScore: 0.78, loadLimit: 55, status: 'normal' },
  { uuid: 'BR_510100_0050', name: '重庆嘉华大桥', type: '斜拉桥', span: '1020m', designLoad: '公路-Ⅰ级', lat: 29.5680, lng: 106.5090, healthScore: 0.88, loadLimit: 55, status: 'normal' },
  { uuid: 'BR_510100_0051', name: '重庆千厮门大桥', type: '悬索桥', span: '720m', designLoad: '公路-Ⅱ级', lat: 29.5710, lng: 106.5810, healthScore: 0.72, loadLimit: 45, status: 'warning' },
  { uuid: 'BR_510100_0052', name: '重庆中梁山隧道', type: '隧道', span: '3603m', designLoad: '公路-Ⅰ级', lat: 29.5407, lng: 106.5250, healthScore: 0.85, loadLimit: null, status: 'normal' },
];

// ============================================================
// 保存/持久化函数
// ============================================================
export function saveMockData(key, data) {
  saveData(key, data);
  // 同时更新内存中的导出变量
  window.__mockData = window.__mockData || {};
  window.__mockData[key] = data;
}

export function resetAllMockData() {
  var keys = ['bridgeArchives', 'roadnetBusinessAttributes', 'roadnetOverview', 'districtMetrics', 'dashboardMetrics', 'riskRankingItems', 'trendData', 'alertRecords', 'assessmentTaskLogs', 'platformTaskLogs', 'moduleConfigs', 'simulationArchiveData'];
  keys.forEach(function(k) {
    localStorage.removeItem('plant_mock_' + k);
  });
  window.location.reload();
}

// 初始化时将数据挂到全局
// ============================================================
// 重车评估 - 车辆模板
// ============================================================
var vehicleProfiles = [
  {
    vehicleId: 'VH_0001',
    plateNumber: '渝A·12345',
    vehicleType: '六轴铰接列车',
    totalMassT: 49,
    axleCount: 6,
    axleLoadsT: [8, 10, 10, 10, 6, 5],
    axleSpacingM: [3.5, 6.0, 1.5, 7.0, 1.5],
    totalLengthM: 18.5,
    totalWidthM: 2.55,
    cargoType: '钢材',
    oversize: false,
    overload: false,
    routePlan: null,
    createdAt: '2026-06-01'
  },
  {
    vehicleId: 'VH_0002',
    plateNumber: '渝B·67890',
    vehicleType: '五轴铰接列车',
    totalMassT: 43,
    axleCount: 5,
    axleLoadsT: [7, 9, 9, 9, 9],
    axleSpacingM: [3.5, 6.0, 1.5, 7.0],
    totalLengthM: 16.5,
    totalWidthM: 2.55,
    cargoType: '集装箱',
    oversize: false,
    overload: false,
    routePlan: null,
    createdAt: '2026-06-02'
  },
  {
    vehicleId: 'VH_0003',
    plateNumber: '渝C·54321',
    vehicleType: '六轴铰接列车',
    totalMassT: 58,
    axleCount: 6,
    axleLoadsT: [9, 12, 12, 12, 7, 6],
    axleSpacingM: [3.5, 6.0, 1.5, 7.0, 1.5],
    totalLengthM: 18.5,
    totalWidthM: 2.55,
    cargoType: '大型设备',
    oversize: true,
    overload: true,
    routePlan: null,
    createdAt: '2026-06-03'
  },
  {
    vehicleId: 'VH_0004',
    plateNumber: '渝D·09876',
    vehicleType: '四轴单车',
    totalMassT: 31,
    axleCount: 4,
    axleLoadsT: [7, 8, 8, 8],
    axleSpacingM: [3.5, 6.0, 1.5],
    totalLengthM: 12.0,
    totalWidthM: 2.55,
    cargoType: '散货',
    oversize: false,
    overload: false,
    routePlan: null,
    createdAt: '2026-06-04'
  },
  {
    vehicleId: 'VH_0005',
    plateNumber: '渝E·11223',
    vehicleType: '六轴铰接列车',
    totalMassT: 55,
    axleCount: 6,
    axleLoadsT: [9, 11, 11, 11, 7, 6],
    axleSpacingM: [3.5, 6.0, 1.5, 7.0, 1.5],
    totalLengthM: 18.5,
    totalWidthM: 2.55,
    cargoType: '矿产',
    oversize: false,
    overload: true,
    routePlan: null,
    createdAt: '2026-06-05'
  }
];

// ============================================================
// 重车评估 - 沿途桥隧模板
// ============================================================
var routeFacilityTemplates = [
  {
    facilityId: 'RF_0001',
    source: 'roadnet',
    sourceEdgeId: 'edge_001',
    facilityType: 'bridge',
    name: '长江大桥',
    roadName: 'G348国道',
    roadRef: 'G348',
    districtName: '涪陵区',
    longitude: 107.1,
    latitude: 29.6,
    lengthM: 28738,
    limitWeightT: 49,
    limitHeightM: null,
    limitWidthM: null,
    maxspeed: 60,
    lanes: 4,
    bridge: 'yes',
    tunnel: null,
    structureType: '连续刚构',
    technicalCondition: '二类',
    riskLevel: 'medium',
    remark: ''
  },
  {
    facilityId: 'RF_0002',
    source: 'roadnet',
    sourceEdgeId: 'edge_002',
    facilityType: 'tunnel',
    name: '明月山隧道',
    roadName: 'G50沪渝高速',
    roadRef: 'G50',
    districtName: '万州区',
    longitude: 108.3,
    latitude: 30.8,
    lengthM: 3850,
    limitWeightT: null,
    limitHeightM: 4.5,
    limitWidthM: 3.5,
    maxspeed: 80,
    lanes: 2,
    bridge: null,
    tunnel: 'yes',
    structureType: '分离式隧道',
    technicalCondition: '一类',
    riskLevel: 'low',
    remark: ''
  },
  {
    facilityId: 'RF_0003',
    source: 'manual',
    sourceEdgeId: 'edge_003',
    facilityType: 'bridge',
    name: '嘉陵江大桥',
    roadName: 'G75兰海高速',
    roadRef: 'G75',
    districtName: '北碚区',
    longitude: 106.42,
    latitude: 29.82,
    lengthM: 1280,
    limitWeightT: 55,
    limitHeightM: null,
    limitWidthM: null,
    maxspeed: 80,
    lanes: 4,
    bridge: 'yes',
    tunnel: null,
    structureType: '斜拉桥',
    technicalCondition: '二类',
    riskLevel: 'medium',
    remark: ''
  },
  {
    facilityId: 'RF_0004',
    source: 'roadnet',
    sourceEdgeId: 'edge_004',
    facilityType: 'tunnel',
    name: '中梁山隧道',
    roadName: 'G85渝昆高速',
    roadRef: 'G85',
    districtName: '九龙坡区',
    longitude: 106.48,
    latitude: 29.50,
    lengthM: 3200,
    limitWeightT: null,
    limitHeightM: 4.2,
    limitWidthM: 3.2,
    maxspeed: 60,
    lanes: 2,
    bridge: null,
    tunnel: 'yes',
    structureType: '连拱隧道',
    technicalCondition: '二类',
    riskLevel: 'medium',
    remark: ''
  }
];

// ============================================================
// 重车评估 - 历史评估方案
// ============================================================
var heavyVehicleAssessmentSchemes = [];

// 初始化时将数据挂到全局
window.__mockData = {
  bridgeArchives: bridgeArchives,
  roadnetBusinessAttributes: roadnetBusinessAttributes,
  districtMetrics: districtMetrics,
  dashboardMetrics: dashboardMetrics,
  riskRankingItems: riskRankingItems,
  trendData: trendData,
  alertRecords: alertRecords,
  assessmentTaskLogs: assessmentTaskLogs,
  platformTaskLogs: platformTaskLogs,
  moduleConfigs: moduleConfigs,
  simulationArchiveData: simulationArchiveData,
  historicalEvents: historicalEvents,
  bridges: bridges,
  vehicleProfiles: vehicleProfiles,
  routeFacilityTemplates: routeFacilityTemplates,
  heavyVehicleAssessmentSchemes: heavyVehicleAssessmentSchemes,
};