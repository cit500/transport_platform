package com.plantplatform.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 路网 Edge 列表 DTO — 不含 Geometry
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RoadEdgeDTO {
    private Long id;
    private Long sourceUOsmid;
    private Long sourceVOsmid;
    private Integer edgeKey;
    private String osmid;
    private String name;
    private String ref;
    private String highway;
    private Boolean oneWay;
    private String lanes;
    private String maxspeed;
    private Double lengthM;
    private String bridgeRaw;
    private Boolean isBridge;
    private String tunnelRaw;
    private Boolean isTunnel;
    private Long divisionId;
    private String divisionKey;
    private String divisionName;
    private String sourceDistrictName;
}
