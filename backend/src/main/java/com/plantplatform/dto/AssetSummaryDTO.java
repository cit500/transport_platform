package com.plantplatform.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * 资产统计摘要 DTO
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AssetSummaryDTO {
    /**
     * 资产总数
     */
    private Long totalAssets;

    /**
     * 桥梁数量
     */
    private Long bridgeCount;

    /**
     * 隧道数量
     */
    private Long tunnelCount;

    /**
     * 按绑定状态统计
     */
    private Map<String, Long> byBindingStatus;

    /**
     * 按来源类型统计
     */
    private Map<String, Long> bySourceType;

    /**
     * 未绑定资产数量
     */
    private Long unboundCount;

    /**
     * 待审核候选数量
     */
    private Long pendingCandidateCount;

    /**
     * 高风险资产数量 (risk_level IN HIGH, EXTREME)
     */
    private Long highRiskCount;

    /**
     * 受限通行资产数量 (pass_status = RESTRICTED)
     */
    private Long restrictedCount;

    /**
     * 禁止通行资产数量 (pass_status = BLOCKED)
     */
    private Long blockedCount;

    /**
     * 缺少 Geometry 的资产数量
     */
    private Long missingGeometryCount;

    // HOME-2: 桥梁/隧道状态统计
    private Long bridgeNormalCount;
    private Long bridgeRestrictedCount;
    private Long bridgeBlockedCount;
    private Long bridgeUnknownCount;
    private Long tunnelNormalCount;
    private Long tunnelRestrictedCount;
    private Long tunnelBlockedCount;
    private Long tunnelUnknownCount;
}
