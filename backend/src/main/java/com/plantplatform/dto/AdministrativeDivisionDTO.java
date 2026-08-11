package com.plantplatform.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 行政区划 DTO — 用于 API 返回，不包含 Geometry
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AdministrativeDivisionDTO {

    private Long id;
    private String divisionKey;
    private String canonicalName;
    private String displayName;
    private String divisionType;
    private Boolean isActive;
}
