USE transport_resilience_v2;

SELECT 'default_vehicle_count' check_name, COUNT(*) actual_value FROM vehicle_profile WHERE is_default = TRUE
UNION ALL SELECT 'published_module_count', COUNT(*) FROM dashboard_publication
UNION ALL SELECT 'heavy_result_count', COUNT(*) FROM heavy_passage_result
UNION ALL SELECT 'region_assessment_count', COUNT(*) FROM region_assessment_result
UNION ALL SELECT 'hazard_notice_count', COUNT(*) FROM hazard_notice
UNION ALL SELECT 'assistant_qa_count', COUNT(*) FROM assistant_qa;

SELECT a.asset_type, r.passability_status, COUNT(*) result_count
FROM heavy_passage_result r
JOIN transport_asset a ON a.id = r.asset_id
GROUP BY a.asset_type, r.passability_status
ORDER BY a.asset_type, r.passability_status;

SELECT risk_level, COUNT(*) region_count
FROM region_assessment_result
GROUP BY risk_level
ORDER BY risk_level;
