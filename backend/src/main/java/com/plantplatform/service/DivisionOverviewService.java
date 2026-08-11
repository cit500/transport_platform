package com.plantplatform.service;

import com.plantplatform.dto.DivisionOverviewDTO;
import com.plantplatform.model.AdministrativeDivision;
import com.plantplatform.model.DivisionCurrentStatus;
import com.plantplatform.repository.AdministrativeDivisionRepository;
import com.plantplatform.repository.DivisionCurrentStatusRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

import org.springframework.transaction.annotation.Transactional;

/**
 * 行政区 Overview 服务
 *
 * 聚合 administrative_divisions + division_current_status，
 * 提供一次性的行政区概览数据。
 */
@Service
public class DivisionOverviewService {

    @Autowired
    private AdministrativeDivisionRepository divisionRepository;

    @Autowired
    private DivisionCurrentStatusRepository statusRepository;

    @Autowired
    private JdbcTemplate jdbc;

    /**
     * 查询所有活跃行政区的 Overview
     * V1.3C: 一次查询 road_edges GROUP BY division_id，避免 N+1
     * V1.4E: 一次查询 transport_assets GROUP BY division_id，填充 assetSummary
     */
    public List<DivisionOverviewDTO> getAllOverviews() {
        List<AdministrativeDivision> divisions = divisionRepository.findByIsActiveTrue();

        // 一次性查询所有行政区的路网统计
        Map<Long, Map<String, Object>> roadStatsMap = new HashMap<>();
        List<Map<String, Object>> roadStats = jdbc.queryForList(
            "SELECT division_id, " +
            "COUNT(*) as edge_count, " +
            "COALESCE(SUM(length_m), 0) / 1000.0 as edge_length_km, " +
            "SUM(CASE WHEN is_bridge = 1 THEN 1 ELSE 0 END) as bridge_edge_count, " +
            "SUM(CASE WHEN is_tunnel = 1 THEN 1 ELSE 0 END) as tunnel_edge_count " +
            "FROM road_edges WHERE division_id IS NOT NULL GROUP BY division_id"
        );
        for (Map<String, Object> row : roadStats) {
            Long divId = ((Number) row.get("division_id")).longValue();
            roadStatsMap.put(divId, row);
        }

        // V1.4E: 一次性查询所有行政区的资产统计
        Map<Long, Map<String, Object>> assetStatsMap = new HashMap<>();
        List<Map<String, Object>> assetStats = jdbc.queryForList(
            "SELECT ta.division_id, " +
            "COUNT(*) as total_count, " +
            "SUM(CASE WHEN ta.asset_type = 'BRIDGE' THEN 1 ELSE 0 END) as bridge_count, " +
            "SUM(CASE WHEN ta.asset_type = 'TUNNEL' THEN 1 ELSE 0 END) as tunnel_count, " +
            "SUM(CASE WHEN acs.risk_level IN ('HIGH', 'EXTREME') THEN 1 ELSE 0 END) as high_risk_count, " +
            "SUM(CASE WHEN acs.pass_status = 'RESTRICTED' THEN 1 ELSE 0 END) as restricted_count, " +
            "SUM(CASE WHEN acs.pass_status = 'BLOCKED' THEN 1 ELSE 0 END) as blocked_count " +
            "FROM transport_assets ta " +
            "LEFT JOIN asset_current_status acs ON ta.id = acs.asset_id " +
            "WHERE ta.is_active = 1 AND ta.division_id IS NOT NULL " +
            "GROUP BY ta.division_id"
        );
        for (Map<String, Object> row : assetStats) {
            Long divId = ((Number) row.get("division_id")).longValue();
            assetStatsMap.put(divId, row);
        }

        return divisions.stream()
            .map(d -> toOverviewDTO(d, roadStatsMap, assetStatsMap))
            .collect(Collectors.toList());
    }

    /**
     * 根据 division_id 查询单个 Overview
     */
    public Optional<DivisionOverviewDTO> getOverviewById(Long divisionId) {
        return divisionRepository.findById(divisionId)
            .map(d -> {
                Map<Long, Map<String, Object>> roadStatsMap = new HashMap<>();
                List<Map<String, Object>> roadStats = jdbc.queryForList(
                    "SELECT division_id, " +
                    "COUNT(*) as edge_count, " +
                    "COALESCE(SUM(length_m), 0) / 1000.0 as edge_length_km, " +
                    "SUM(CASE WHEN is_bridge = 1 THEN 1 ELSE 0 END) as bridge_edge_count, " +
                    "SUM(CASE WHEN is_tunnel = 1 THEN 1 ELSE 0 END) as tunnel_edge_count " +
                    "FROM road_edges WHERE division_id = ? GROUP BY division_id", divisionId
                );
                for (Map<String, Object> row : roadStats) {
                    Long divId = ((Number) row.get("division_id")).longValue();
                    roadStatsMap.put(divId, row);
                }

                // V1.4E: 资产统计
                Map<Long, Map<String, Object>> assetStatsMap = new HashMap<>();
                List<Map<String, Object>> assetStats = jdbc.queryForList(
                    "SELECT ta.division_id, " +
                    "COUNT(*) as total_count, " +
                    "SUM(CASE WHEN ta.asset_type = 'BRIDGE' THEN 1 ELSE 0 END) as bridge_count, " +
                    "SUM(CASE WHEN ta.asset_type = 'TUNNEL' THEN 1 ELSE 0 END) as tunnel_count, " +
                    "SUM(CASE WHEN acs.risk_level IN ('HIGH', 'EXTREME') THEN 1 ELSE 0 END) as high_risk_count, " +
                    "SUM(CASE WHEN acs.pass_status = 'RESTRICTED' THEN 1 ELSE 0 END) as restricted_count, " +
                    "SUM(CASE WHEN acs.pass_status = 'BLOCKED' THEN 1 ELSE 0 END) as blocked_count " +
                    "FROM transport_assets ta " +
                    "LEFT JOIN asset_current_status acs ON ta.id = acs.asset_id " +
                    "WHERE ta.is_active = 1 AND ta.division_id = ? " +
                    "GROUP BY ta.division_id", divisionId
                );
                for (Map<String, Object> row : assetStats) {
                    Long divId = ((Number) row.get("division_id")).longValue();
                    assetStatsMap.put(divId, row);
                }

                return toOverviewDTO(d, roadStatsMap, assetStatsMap);
            });
    }

    /**
     * 根据 division_key 查询单个 Overview
     */
    public Optional<DivisionOverviewDTO> getOverviewByDivisionKey(String divisionKey) {
        return divisionRepository.findByDivisionKey(divisionKey)
            .map(d -> {
                Map<Long, Map<String, Object>> roadStatsMap = new HashMap<>();
                List<Map<String, Object>> roadStats = jdbc.queryForList(
                    "SELECT division_id, " +
                    "COUNT(*) as edge_count, " +
                    "COALESCE(SUM(length_m), 0) / 1000.0 as edge_length_km, " +
                    "SUM(CASE WHEN is_bridge = 1 THEN 1 ELSE 0 END) as bridge_edge_count, " +
                    "SUM(CASE WHEN is_tunnel = 1 THEN 1 ELSE 0 END) as tunnel_edge_count " +
                    "FROM road_edges WHERE division_id = ? GROUP BY division_id", d.getId()
                );
                for (Map<String, Object> row : roadStats) {
                    Long divId = ((Number) row.get("division_id")).longValue();
                    roadStatsMap.put(divId, row);
                }

                // V1.4E: 资产统计
                Map<Long, Map<String, Object>> assetStatsMap = new HashMap<>();
                List<Map<String, Object>> assetStats = jdbc.queryForList(
                    "SELECT ta.division_id, " +
                    "COUNT(*) as total_count, " +
                    "SUM(CASE WHEN ta.asset_type = 'BRIDGE' THEN 1 ELSE 0 END) as bridge_count, " +
                    "SUM(CASE WHEN ta.asset_type = 'TUNNEL' THEN 1 ELSE 0 END) as tunnel_count, " +
                    "SUM(CASE WHEN acs.risk_level IN ('HIGH', 'EXTREME') THEN 1 ELSE 0 END) as high_risk_count, " +
                    "SUM(CASE WHEN acs.pass_status = 'RESTRICTED' THEN 1 ELSE 0 END) as restricted_count, " +
                    "SUM(CASE WHEN acs.pass_status = 'BLOCKED' THEN 1 ELSE 0 END) as blocked_count " +
                    "FROM transport_assets ta " +
                    "LEFT JOIN asset_current_status acs ON ta.id = acs.asset_id " +
                    "WHERE ta.is_active = 1 AND ta.division_id = ? " +
                    "GROUP BY ta.division_id", d.getId()
                );
                for (Map<String, Object> row : assetStats) {
                    Long divId = ((Number) row.get("division_id")).longValue();
                    assetStatsMap.put(divId, row);
                }

                return toOverviewDTO(d, roadStatsMap, assetStatsMap);
            });
    }

    /**
     * 转换为 Overview DTO（带路网统计 + 资产统计）
     */
    private DivisionOverviewDTO toOverviewDTO(AdministrativeDivision div, 
            Map<Long, Map<String, Object>> roadStatsMap,
            Map<Long, Map<String, Object>> assetStatsMap) {
        Optional<DivisionCurrentStatus> statusOpt = statusRepository.findByDivisionId(div.getId());

        DivisionOverviewDTO dto = new DivisionOverviewDTO();
        dto.setDivisionId(div.getId());
        dto.setDivisionKey(div.getDivisionKey());
        dto.setCanonicalName(div.getCanonicalName());
        dto.setDisplayName(div.getDisplayName());
        dto.setDivisionType(div.getDivisionType());

        if (statusOpt.isPresent()) {
            DivisionCurrentStatus s = statusOpt.get();
            dto.setResilienceScore(s.getResilienceScore());
            dto.setDisasterRiskRate(s.getDisasterRiskRate());
            dto.setTrafficGuaranteeRate(s.getTrafficGuaranteeRate());
            dto.setRiskLevel(s.getRiskLevel());
            dto.setSourceType(s.getSourceType());
            dto.setUpdatedAt(s.getUpdatedAt() != null ? s.getUpdatedAt().toString() : null);
        }

        // V1.4E: assetSummary 从预查询的 assetStatsMap 获取
        Map<String, Object> assetStats = assetStatsMap.get(div.getId());
        if (assetStats != null) {
            dto.setAssetSummary(new DivisionOverviewDTO.AssetSummaryDTO(
                ((Number) assetStats.get("bridge_count")).intValue(),
                ((Number) assetStats.get("tunnel_count")).intValue(),
                ((Number) assetStats.get("total_count")).intValue(),
                ((Number) assetStats.get("high_risk_count")).intValue()
            ));
        } else {
            // 没有资产的行政区
            dto.setAssetSummary(new DivisionOverviewDTO.AssetSummaryDTO(0, 0, 0, 0));
        }

        // roadSummary: 从预查询的 roadStatsMap 获取
        Map<String, Object> stats = roadStatsMap.get(div.getId());
        if (stats != null) {
            dto.setRoadSummary(new DivisionOverviewDTO.RoadSummaryDTO(
                ((Number) stats.get("edge_count")).intValue(),
                ((Number) stats.get("edge_length_km")).doubleValue(),
                ((Number) stats.get("bridge_edge_count")).intValue(),
                ((Number) stats.get("tunnel_edge_count")).intValue()
            ));
        } else {
            // 没有 Road Edge 的行政区：edgeCount=0, edgeLengthKm=0
            dto.setRoadSummary(new DivisionOverviewDTO.RoadSummaryDTO(0, 0.0, 0, 0));
        }

        return dto;
    }

    /**
     * 更新行政区当前状态
     */
    @Transactional
    public Optional<DivisionCurrentStatus> updateCurrentStatus(Long divisionId,
            Integer resilienceScore, Integer disasterRiskRate,
            Integer trafficGuaranteeRate, String riskLevel) {
        // 确认行政区存在
        if (!divisionRepository.existsById(divisionId)) {
            return Optional.empty();
        }

        Optional<DivisionCurrentStatus> existing = statusRepository.findByDivisionId(divisionId);
        DivisionCurrentStatus status;
        if (existing.isPresent()) {
            // 更新已有记录
            status = existing.get();
        } else {
            // 首次插入
            status = new DivisionCurrentStatus();
            status.setDivisionId(divisionId);
        }

        if (resilienceScore != null) status.setResilienceScore(resilienceScore);
        if (disasterRiskRate != null) status.setDisasterRiskRate(disasterRiskRate);
        if (trafficGuaranteeRate != null) status.setTrafficGuaranteeRate(trafficGuaranteeRate);
        if (riskLevel != null) status.setRiskLevel(riskLevel);
        status.setSourceType("MANUAL");
        status.setUpdatedAt(LocalDateTime.now());
        return Optional.of(statusRepository.save(status));
    }

    /**
     * Seed 数据基线 — 37区初始值
     * 硬编码在代码中，保证只有一个可靠来源
     */
    private static final Map<String, int[]> SEED_BASELINE = new HashMap<>();
    static {
        SEED_BASELINE.put("500103", new int[]{92, 8, 96});  // 渝中区
        SEED_BASELINE.put("500101", new int[]{60, 35, 58});  // 万州区
        SEED_BASELINE.put("500102", new int[]{64, 30, 66});  // 涪陵区
        SEED_BASELINE.put("500108", new int[]{85, 12, 87});  // 南岸区
        SEED_BASELINE.put("500106", new int[]{80, 18, 82});  // 沙坪坝区
        SEED_BASELINE.put("500107", new int[]{76, 22, 78});  // 九龙坡区
        SEED_BASELINE.put("500113", new int[]{72, 25, 74});  // 巴南区
        SEED_BASELINE.put("500104", new int[]{68, 32, 70});  // 大渡口区
        SEED_BASELINE.put("500116", new int[]{55, 45, 58});  // 江津区
        SEED_BASELINE.put("500118", new int[]{52, 48, 54});  // 永川区
        SEED_BASELINE.put("500117", new int[]{48, 52, 50});  // 合川区
        SEED_BASELINE.put("500110", new int[]{44, 58, 46});  // 綦江区
        SEED_BASELINE.put("500229", new int[]{39, 62, 42});  // 城口县
        SEED_BASELINE.put("500109", new int[]{76, 20, 78});  // 北碚区
        SEED_BASELINE.put("500154", new int[]{45, 55, 42});  // 开州区
        SEED_BASELINE.put("500155", new int[]{47, 50, 44});  // 梁平区
        SEED_BASELINE.put("500156", new int[]{42, 60, 44});  // 武隆区
        SEED_BASELINE.put("500230", new int[]{43, 58, 42});  // 丰都县
        SEED_BASELINE.put("500231", new int[]{48, 48, 46});  // 垫江县
        SEED_BASELINE.put("500233", new int[]{41, 62, 44});  // 忠县
        SEED_BASELINE.put("500235", new int[]{38, 65, 40});  // 云阳县
        SEED_BASELINE.put("500236", new int[]{35, 68, 38});  // 奉节县
        SEED_BASELINE.put("500237", new int[]{33, 72, 36});  // 巫山县
        SEED_BASELINE.put("500238", new int[]{31, 75, 34});  // 巫溪县
        SEED_BASELINE.put("500240", new int[]{40, 60, 42});  // 石柱县
        SEED_BASELINE.put("500241", new int[]{42, 58, 42});  // 秀山县
        SEED_BASELINE.put("500242", new int[]{38, 64, 38});  // 酉阳县
        SEED_BASELINE.put("500243", new int[]{36, 66, 36});  // 彭水县
        SEED_BASELINE.put("500190", new int[]{86, 12, 88});  // 两江新区
        SEED_BASELINE.put("500115", new int[]{77, 18, 80});  // 长寿区
        SEED_BASELINE.put("500151", new int[]{62, 32, 64});  // 铜梁区
        SEED_BASELINE.put("500152", new int[]{58, 38, 60});  // 潼南区
        SEED_BASELINE.put("500153", new int[]{56, 40, 58});  // 荣昌区
        SEED_BASELINE.put("500120", new int[]{74, 22, 76});  // 璧山区
        SEED_BASELINE.put("500111", new int[]{50, 50, 52});  // 大足区
        SEED_BASELINE.put("500114", new int[]{36, 64, 38});  // 黔江区
        SEED_BASELINE.put("500119", new int[]{52, 46, 54});  // 南川区
    }

    private static final Map<String, String> SEED_RISK_LEVEL = new HashMap<>();
    static {
        for (Map.Entry<String, int[]> entry : SEED_BASELINE.entrySet()) {
            int rs = entry.getValue()[0];
            String level = rs >= 80 ? "low" : rs >= 60 ? "medium" : rs >= 40 ? "high" : "extreme";
            SEED_RISK_LEVEL.put(entry.getKey(), level);
        }
    }

    /**
     * 重置单个行政区到种子数据
     */
    @Transactional
    public boolean resetSingleDivision(Long divisionId) {
        // 查找行政区
        Optional<AdministrativeDivision> divOpt = divisionRepository.findById(divisionId);
        if (divOpt.isEmpty()) return false;

        AdministrativeDivision div = divOpt.get();
        String divKey = div.getDivisionKey();
        int[] seedValues = SEED_BASELINE.get(divKey);
        if (seedValues == null) return false;

        Optional<DivisionCurrentStatus> existing = statusRepository.findByDivisionId(divisionId);
        DivisionCurrentStatus status;
        if (existing.isPresent()) {
            status = existing.get();
        } else {
            status = new DivisionCurrentStatus();
            status.setDivisionId(divisionId);
        }

        status.setResilienceScore(seedValues[0]);
        status.setDisasterRiskRate(seedValues[1]);
        status.setTrafficGuaranteeRate(seedValues[2]);
        status.setRiskLevel(SEED_RISK_LEVEL.getOrDefault(divKey, "medium"));
        status.setSourceType("SEED");
        status.setUpdatedAt(LocalDateTime.now());
        statusRepository.save(status);
        return true;
    }

    /**
     * 重置全部37区到种子数据
     */
    @Transactional
    public int resetAllDivisions() {
        List<AdministrativeDivision> allDivisions = divisionRepository.findByIsActiveTrue();
        int count = 0;
        for (AdministrativeDivision div : allDivisions) {
            if (resetSingleDivision(div.getId())) {
                count++;
            }
        }
        return count;
    }
}
