-- fragility_model 增加逐桥（逐设施）绑定字段，用于把易损性曲线绑定到平台具体设施。
-- NULL 表示该资产类型的默认曲线；评估时优先取绑定当前设施的曲线，再回落类型默认。
-- 已执行过时会报 Duplicate column name，可忽略。
USE transport_platform;

ALTER TABLE fragility_model
    ADD COLUMN platform_asset_id BIGINT NULL COMMENT '绑定的平台设施 transport_asset.id；NULL 表示该资产类型的默认曲线' AFTER asset_id,
    ADD KEY idx_fragility_platform_asset (platform_asset_id);
