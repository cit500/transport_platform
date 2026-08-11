package com.plantplatform.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 资产详情 DTO — 合并基本信息、属性、状态、道路关联
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AssetDetailDTO {
    // ---- 基本信息 ----
    private Long id;
    private String assetCode;
    private String assetName;
    private String assetType;
    private Long divisionId;
    private String divisionName;
    private Double longitude;
    private Double latitude;
    private String networkBindingStatus;
    private String sourceType;
    private String sourceRef;
    private Boolean isActive;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
    
    // HOME-2: 资产图片路径
    private String imagePath;

    // ---- 桥梁/隧道属性 ----
    private BridgeAttributesDTO bridgeAttributes;
    private TunnelAttributesDTO tunnelAttributes;

    // ---- 当前状态 ----
    private CurrentStatusDTO currentStatus;

    // ---- 道路关联 ----
    private List<RoadRelationDTO> roadRelations;

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
        private String sourceType;
        private Long sourceTaskId;
        private LocalDateTime updatedAt;
    }

    /**
     * 道路关联子 DTO
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class RoadRelationDTO {
        private Long id;
        private Long roadEdgeId;
        private String edgeName;
        private String edgeRef;
        private String relationType;
        private Integer sequenceNo;
    }
}
