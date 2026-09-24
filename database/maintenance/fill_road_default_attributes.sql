-- 只填充缺失的道路通行参数，不覆盖已经核验或人工导入的数据。
-- 默认值服务于当前演示模型，不代表真实道路设计参数。

USE transport_resilience_v2;

UPDATE road_edge
SET lane_count = CASE
    WHEN road_class REGEXP '(^|;|,)motorway($|;|,)' THEN 4
    WHEN road_class REGEXP '(^|;|,)trunk($|;|,)' THEN 3
    WHEN road_class REGEXP '(^|;|,)primary($|;|,)' THEN 2
    ELSE 2
END
WHERE lane_count IS NULL OR lane_count <= 0;

UPDATE road_edge
SET design_speed_kmh = CASE
    WHEN road_class REGEXP '(^|;|,)motorway($|;|,)' THEN 100
    WHEN road_class REGEXP '(^|;|,)trunk($|;|,)' THEN 80
    WHEN road_class REGEXP '(^|;|,)primary($|;|,)' THEN 60
    ELSE 40
END
WHERE design_speed_kmh IS NULL OR design_speed_kmh <= 0;

SELECT road_class,
       COUNT(*) AS edge_count,
       MIN(lane_count) AS min_lane_count,
       MAX(lane_count) AS max_lane_count,
       MIN(design_speed_kmh) AS min_speed_kmh,
       MAX(design_speed_kmh) AS max_speed_kmh
FROM road_edge
GROUP BY road_class
ORDER BY edge_count DESC;
