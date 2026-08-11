package com.plantplatform.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.util.List;

/**
 * 资产创建/更新请求 DTO
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AssetCreateDTO {
    // ---- 基本信息 ----
    private String assetType; // BRIDGE / TUNNEL
    private String assetName;
    private Long divisionId;
    private Double longitude;
    private Double latitude;

    // ---- 桥梁属性 ----
    private BridgeAttributesDTO bridgeAttributes;

    // ---- 隧道属性 ----
    private TunnelAttributesDTO tunnelAttributes;

    // ---- 当前状态 ----
    private CurrentStatusDTO currentStatus;

    // ---- 道路绑定 ----
    private List<Long> edgeIds;

    /**
     * 桥梁属性子 DTO
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class BridgeAttributesDTO {
        private String structureType;
        private BigDecimal totalLengthM;
        private BigDecimal maxSpanM;
        private String spanConfiguration;
        private String designLoad;
        private BigDecimal designLoadT;
        private BigDecimal deckWidthM;
        private BigDecimal designClearanceHeightM;
        private BigDecimal designClearanceWidthM;
        private Integer constructionYear;
    }

    /**
     * 隧道属性子 DTO
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class TunnelAttributesDTO {
        private String tunnelType;
        private BigDecimal tunnelLengthM;
        private BigDecimal designClearanceHeightM;
        private BigDecimal designClearanceWidthM;
        private Integer laneCount;
        private Integer constructionYear;
    }

    /**
     * 当前状态子 DTO
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CurrentStatusDTO {
        private BigDecimal healthScore;
        private String riskLevel;
        private String passStatus;
        private BigDecimal currentLoadLimitT;
        private BigDecimal currentHeightLimitM;
        private BigDecimal currentWidthLimitM;
    }
}
