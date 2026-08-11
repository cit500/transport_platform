package com.plantplatform.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 候选详情 DTO — 包含源 Edge 列表
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CandidateDetailDTO {
    // ---- 基本信息 ----
    private Long id;
    private String candidateType;
    private String candidateName;
    private Long divisionId;
    private String divisionName;
    private String roadName;
    private String roadRef;
    private Integer edgeCount;
    private BigDecimal totalEdgeLengthM;
    private BigDecimal confidence;
    private String reviewStatus;
    private String sourceRule;
    private String candidateKey;
    private Long createdAssetId;
    private LocalDateTime createdAt;
    private LocalDateTime reviewedAt;

    // ---- 源 Edge 列表 ----
    private List<CandidateEdgeDTO> edges;

    /**
     * 候选 Edge 子 DTO
     */
    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class CandidateEdgeDTO {
        private Long edgeId;
        private String name;
        private String ref;
        private Double lengthM;
        private Long sourceUOsmid;
        private Long sourceVOsmid;
        private Integer edgeKey;
        private Long divisionId;
        private String divisionName;
        private Integer sequenceNo;
    }
}
