package com.plantplatform.dto;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * 按道路 Edge 查询正式资产请求 DTO
 * POST /api/assets/by-road-edges
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AssetByRoadEdgesRequest {
    /**
     * 道路 Edge ID 列表
     */
    private List<Long> edgeIds;
}
