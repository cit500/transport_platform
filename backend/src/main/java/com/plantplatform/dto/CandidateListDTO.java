package com.plantplatform.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 候选列表 DTO
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CandidateListDTO {
    private Long id;
    private String candidateType;
    private String candidateName;
    private Long divisionId;
    private String divisionName;
    private String roadName;
    private String roadRef;
    private Integer edgeCount;
    private java.math.BigDecimal totalEdgeLengthM;
    private java.math.BigDecimal confidence;
    private String reviewStatus;
    private String sourceRule;
    private Long createdAssetId;
    private java.time.LocalDateTime createdAt;
    private java.time.LocalDateTime reviewedAt;
}
