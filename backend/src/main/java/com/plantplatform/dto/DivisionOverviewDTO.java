package com.plantplatform.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 行政区 Overview DTO — 一次返回行政区的完整概览信息
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DivisionOverviewDTO {

    // ---- 行政区基础信息 ----
    private Long divisionId;
    private String divisionKey;
    private String canonicalName;
    private String displayName;
    private String divisionType;

    // ---- 当前状态指标 ----
    private Integer resilienceScore;       // null = 无数据
    private Integer disasterRiskRate;      // null = 无数据
    private Integer trafficGuaranteeRate;  // null = 无数据
    private String riskLevel;              // null = 无数据

    // ---- 资产摘要（未来 V1.3 从 transport_assets 统计）----
    private AssetSummaryDTO assetSummary;

    // ---- 路网摘要（未来 V1.4 从 road_edges 统计）----
    private RoadSummaryDTO roadSummary;

    // ---- 元数据 ----
    private String sourceType;             // null = 无状态数据
    private String updatedAt;              // null = 无状态数据

    /**
     * 资产摘要（当前为 null，待 V1.3 统计）
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class AssetSummaryDTO {
        private Integer bridgeCount;
        private Integer tunnelCount;
        private Integer totalAssetCount;
        private Integer highRiskCount;
    }

    /**
     * 路网摘要 — 从 road_edges 实际统计
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RoadSummaryDTO {
        private Integer edgeCount;          // road_edges 记录数
        private Double edgeLengthKm;        // SUM(length_m) / 1000
        private Integer bridgeEdgeCount;    // is_bridge=1 的路段数
        private Integer tunnelEdgeCount;    // is_tunnel=1 的路段数
    }
}
