package com.plantplatform.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 路网 Edge 详情 DTO — 含 Geometry (GeoJSON 格式)
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RoadEdgeDetailDTO extends RoadEdgeDTO {
    /**
     * GeoJSON 格式的 Geometry
     * coordinates = [longitude, latitude]...
     */
    private Object geometry;
}
