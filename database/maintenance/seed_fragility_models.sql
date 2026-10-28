-- 易损性模型导入：地震部分逐值来自冻结研究库
--   Seismic_Frontend_Fragility_Handoff_V1/fragility_database/models/fragility_parameters.csv
-- 泥石流部分为平台默认参数，尚未经专业标定，仅用于跑通链路并给出可解释的结果。
-- 幂等：按 (hazard_type, asset_id, model_id, model_version) 唯一键更新。

USE transport_platform;

-- ---------------------------- 地震：桥梁 ----------------------------
INSERT INTO fragility_model
(hazard_type, asset_type, asset_id, asset_name, model_id, model_version, status,
 evaluable, published, allow_research, im_type, im_unit, valid_min, valid_max,
 theta_ds1, theta_ds2, theta_ds3, theta_ds4,
 beta_ds1, beta_ds2, beta_ds3, beta_ds4, source_label, limitations)
VALUES
('EARTHQUAKE','BRIDGE','bridge_B','示例桥梁 B','1','1.0.0','PUBLISHED',
 TRUE, TRUE, FALSE, 'PGA','g', 0.05, 1.00,
 0.14769594218884743, 0.169446547529945, 0.2470799556056023, 0.6275249007081711,
 0.5300581047577405, 0.5804703569975971, 0.5152885635761054, 0.5053444530849138,
 'frozen research database', '代表性 RC 单柱墩模型，PUBLISHED 仅表示平台发布，不等于现场工程验证；独立拟合曲线在低 PGA 可能交叉，交叉时拒绝给出结果。'),
('EARTHQUAKE','BRIDGE','bridge_C','示例桥梁 C','2','1.0.0','PUBLISHED',
 TRUE, TRUE, FALSE, 'PGA','g', 0.05, 1.20,
 0.17294746441018935, 0.21475217626562618, 0.3238290435483716, 0.8420955210893913,
 0.5226672890443511, 0.5131198363221101, 0.5784159340717991, 0.6314552086173633,
 'frozen research database', '代表性 RC 单柱墩模型，PUBLISHED 仅表示平台发布，不等于现场工程验证。'),
('EARTHQUAKE','BRIDGE','bridge_9846c0deabed','Bridge D 管理员建库验证桥','3','v1.0','PUBLISHED',
 TRUE, TRUE, FALSE, 'PGA','g', 0.05, 1.00,
 0.16180921622167188, 0.1841885805007244, 0.2599111420182879, 0.7138221559039567,
 0.5524916974892623, 0.5230818152623643, 0.5125204826310036, 0.5152641510805874,
 'frozen research database', '用于建库流程验证的代表性模型，不代表该桥已经过现场工程验证。')
ON DUPLICATE KEY UPDATE
 asset_name=VALUES(asset_name), status=VALUES(status), evaluable=VALUES(evaluable),
 published=VALUES(published), allow_research=VALUES(allow_research), im_type=VALUES(im_type),
 valid_min=VALUES(valid_min), valid_max=VALUES(valid_max),
 theta_ds1=VALUES(theta_ds1), theta_ds2=VALUES(theta_ds2), theta_ds3=VALUES(theta_ds3), theta_ds4=VALUES(theta_ds4),
 beta_ds1=VALUES(beta_ds1), beta_ds2=VALUES(beta_ds2), beta_ds3=VALUES(beta_ds3), beta_ds4=VALUES(beta_ds4),
 source_label=VALUES(source_label), limitations=VALUES(limitations);

-- 归档桥梁模型：参数与示例桥梁 C 一致，但禁止用于评估
INSERT INTO fragility_model
(hazard_type, asset_type, asset_id, asset_name, model_id, model_version, status,
 evaluable, published, allow_research, im_type, im_unit, valid_min, valid_max,
 theta_ds1, theta_ds2, theta_ds3, theta_ds4,
 beta_ds1, beta_ds2, beta_ds3, beta_ds4, source_label, limitations)
VALUES
('EARTHQUAKE','BRIDGE','bridge_C_pipeline_test_990fba80','Bridge C 流水线验证模型',
 'archive:4a1a2aa114f84ccda65e2cbc92bc2261','v1.0','UNREGISTERED_RESEARCH',
 FALSE, FALSE, FALSE, 'PGA','g', 0.05, 1.20,
 0.17294746441018935, 0.21475217626562618, 0.3238290435483716, 0.8420955210893913,
 0.5226672890443511, 0.5131198363221101, 0.5784159340717991, 0.6314552086173633,
 'frozen research database', '未注册的研究归档，仅用于流程验证，平台禁止使用该模型输出评估结果。')
ON DUPLICATE KEY UPDATE
 asset_name=VALUES(asset_name), status=VALUES(status), evaluable=VALUES(evaluable),
 published=VALUES(published), source_label=VALUES(source_label), limitations=VALUES(limitations);

-- ---------------------------- 地震：隧道 ----------------------------
-- 隧道 IM 为 target_input_PGA（目标输入 PGA），不是实测自由场地表 PGA
INSERT INTO fragility_model
(hazard_type, asset_type, asset_id, asset_name, model_id, model_version, status,
 evaluable, published, allow_research, im_type, im_unit, valid_min, valid_max,
 theta_ds1, theta_ds2, theta_ds3, theta_ds4,
 beta_ds1, beta_ds2, beta_ds3, beta_ds4, source_label, limitations)
VALUES
('EARTHQUAKE','TUNNEL','jiudingshan_s4','九顶山 S4',
 'tunnel:jiudingshan_s4:final20:0c552ab23a308f4a1b532ec41b065d9e665f0cfa29dc4d36be151a4c2c530404','final20','RESEARCH_REFERENCE',
 TRUE, FALSE, TRUE, 'TARGET_INPUT_PGA','g', 0.10, 1.00,
 0.3919857458339809, 0.5879786187509715, 0.9799643645849522, 1.371950110418933,
 0.43142896214342, 0.43142896214342, 0.43142896214341997, 0.43142896214342,
 'frozen research database', '20 条记录、增量弯矩参考指标与假定配筋，属研究参考容量模型，非实测工程鉴定；线弹性响应与强度缩放假设，超过 1g 属线性外推；IM 为目标输入 PGA。'),
('EARTHQUAKE','TUNNEL','benchmark_circular_tunnel_v1','BCT-01 基准圆形隧道',
 'tunnel:benchmark_circular_tunnel_v1:final20_damage_v2:c1145bb70afc7c289a4f32ca2f9eab2149067486c535ced7196a09eecb76e060','final20_damage_v2','RESEARCH_REFERENCE',
 TRUE, FALSE, TRUE, 'TARGET_INPUT_PGA','g', 0.10, 1.00,
 0.5205418092164901, 1.1290343077358367, 1.6935514616037546, 2.258068615471674,
 0.42652534965226413, 0.42652534965226413, 0.42652534965226413, 0.4265253496522642,
 'frozen research database', '合成基准隧道：DS1 为简化弹性开裂弯矩代理，DS2/DS3 为研究容量比例，DS4 为参考抗弯容量；未考虑轴力、初始应力、围岩约束及材料非线性。')
ON DUPLICATE KEY UPDATE
 asset_name=VALUES(asset_name), status=VALUES(status), evaluable=VALUES(evaluable),
 published=VALUES(published), allow_research=VALUES(allow_research), im_type=VALUES(im_type),
 valid_min=VALUES(valid_min), valid_max=VALUES(valid_max),
 theta_ds1=VALUES(theta_ds1), theta_ds2=VALUES(theta_ds2), theta_ds3=VALUES(theta_ds3), theta_ds4=VALUES(theta_ds4),
 beta_ds1=VALUES(beta_ds1), beta_ds2=VALUES(beta_ds2), beta_ds3=VALUES(beta_ds3), beta_ds4=VALUES(beta_ds4),
 source_label=VALUES(source_label), limitations=VALUES(limitations);

-- ---------------------------- 泥石流：平台默认参数（待标定） ----------------------------
-- IM 为泥石流综合强度指数 I（无量纲，范围 0~3），由流速、流深、淤埋与冲刷合成：
--   I = 0.5 * (v^2 * h / 30) + 0.3 * (淤埋深度 / 2) + 0.2 * 冲刷比
-- 隧道侧权重不同（以洞口淤埋堵塞为主），由服务层按资产类型区分。
INSERT INTO fragility_model
(hazard_type, asset_type, asset_id, asset_name, model_id, model_version, status,
 evaluable, published, allow_research, im_type, im_unit, valid_min, valid_max,
 theta_ds1, theta_ds2, theta_ds3, theta_ds4,
 beta_ds1, beta_ds2, beta_ds3, beta_ds4, source_label, limitations)
VALUES
('DEBRIS_FLOW','BRIDGE','platform_default_bridge','桥梁泥石流默认曲线（待标定）','default','v0.1','PLATFORM_DEFAULT',
 TRUE, TRUE, FALSE, 'DEBRIS_INTENSITY','index', 0.0, 3.0,
 0.35, 0.60, 0.95, 1.40,
 0.60, 0.60, 0.65, 0.70,
 'platform default', '平台预设参数，未经专业标定或实测校验，仅用于输出可比对的相对结果与跑通链路；接入正式泥石流易损性模型后应整体替换。'),
('DEBRIS_FLOW','TUNNEL','platform_default_tunnel','隧道泥石流默认曲线（待标定）','default','v0.1','PLATFORM_DEFAULT',
 TRUE, TRUE, FALSE, 'DEBRIS_INTENSITY','index', 0.0, 3.0,
 0.55, 0.90, 1.35, 1.90,
 0.65, 0.65, 0.70, 0.75,
 'platform default', '平台预设参数，未经专业标定或实测校验；隧道主要考虑洞口淤埋与堵塞，曲线较桥梁更晚进入损伤。')
ON DUPLICATE KEY UPDATE
 asset_name=VALUES(asset_name), status=VALUES(status), evaluable=VALUES(evaluable),
 published=VALUES(published), im_type=VALUES(im_type), im_unit=VALUES(im_unit),
 valid_min=VALUES(valid_min), valid_max=VALUES(valid_max),
 theta_ds1=VALUES(theta_ds1), theta_ds2=VALUES(theta_ds2), theta_ds3=VALUES(theta_ds3), theta_ds4=VALUES(theta_ds4),
 beta_ds1=VALUES(beta_ds1), beta_ds2=VALUES(beta_ds2), beta_ds3=VALUES(beta_ds3), beta_ds4=VALUES(beta_ds4),
 source_label=VALUES(source_label), limitations=VALUES(limitations);
