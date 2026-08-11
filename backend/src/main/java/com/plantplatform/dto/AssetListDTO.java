package com.plantplatform.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 资产列表 DTO — 不含 Geometry
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AssetListDTO {
    private Long id;
    private String assetCode;
    private String assetName;
    private String assetType;
    private Long divisionId;
    private String divisionName;
    private String structureType;
    private BigDecimal healthScore;
    private String riskLevel;
    private String passStatus;
    private String networkBindingStatus;
    private String sourceType;
}
