package com.plantplatform.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/**
 * 按道路 Edge 查询正式资产响应 DTO
 * 包含资产基本信息 + 当前状态 + 关联的 Road Edge ID 列表
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AssetByRoadEdgesDTO {
    /**
     * 资产 ID
     */
    private Long assetId;

    /**
     * 资产编码
     */
    private String assetCode;

    /**
     * 资产名称
     */
    private String assetName;

    /**
     * 资产类型：BRIDGE / TUNNEL
     */
    private String assetType;

    /**
     * 关联的 Road Edge ID 列表
     */
    private List<Long> roadEdgeIds;

    /**
     * 健康评分 (0-1)
     */
    private BigDecimal healthScore;

    /**
     * 风险等级：LOW / MEDIUM / HIGH / CRITICAL
     */
    private String riskLevel;

    /**
     * 通行状态：OPEN / RESTRICTED / CLOSED
     */
    private String passStatus;

    /**
     * 当前限载 (吨)
     */
    private BigDecimal currentLoadLimitT;

    /**
     * 当前限高 (米)
     */
    private BigDecimal currentHeightLimitM;

    /**
     * 当前限宽 (米)
     */
    private BigDecimal currentWidthLimitM;

    /**
     * 经度
     */
    private Double longitude;

    /**
     * 纬度
     */
    private Double latitude;
}
