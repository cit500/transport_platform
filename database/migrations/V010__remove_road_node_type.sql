-- 节点分类当前不参与任何业务，运行时节点只保留主键、连接度和空间位置。

USE transport_resilience_v2;

SET @drop_node_type = IF(
    EXISTS(
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = 'road_node' AND column_name = 'node_type'
    ),
    'ALTER TABLE road_node DROP COLUMN node_type',
    'DO 0'
);
PREPARE stmt FROM @drop_node_type;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

ALTER TABLE road_node
    COMMENT = '本地路网节点；id为稳定主键，street_count为脚本刷新得到的无向连接度';
