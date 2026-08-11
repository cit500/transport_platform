package com.plantplatform.controller;

import com.plantplatform.dto.RoadEdgeDTO;
import com.plantplatform.dto.RoadEdgeDetailDTO;
import com.plantplatform.service.RoadNetworkService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.Map;

/**
 * 路网查询管理 API
 * /api/road-network/*
 */
@RestController
@RequestMapping("/api/road-network")
public class RoadNetworkController {

    @Autowired
    private RoadNetworkService roadNetworkService;

    /**
     * 分页查询 Edge
     * GET /api/road-network/edges
     */
    @GetMapping("/edges")
    public ResponseEntity<Page<RoadEdgeDTO>> searchEdges(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) String keyword,
            @RequestParam(required = false) Long divisionId,
            @RequestParam(required = false) String highway,
            @RequestParam(required = false) Boolean isBridge,
            @RequestParam(required = false) Boolean isTunnel) {

        return ResponseEntity.ok(roadNetworkService.searchEdges(
            keyword, divisionId, highway, isBridge, isTunnel,
            PageRequest.of(page, size)
        ));
    }

    /**
     * Edge 详情
     * GET /api/road-network/edges/{id}
     */
    @GetMapping("/edges/{id}")
    public ResponseEntity<?> getEdgeDetail(@PathVariable Long id) {
        RoadEdgeDetailDTO dto = roadNetworkService.getEdgeDetail(id);
        if (dto == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(dto);
    }

    /**
     * GeoJSON FeatureCollection
     * GET /api/road-network/geojson
     */
    @GetMapping("/geojson")
    public ResponseEntity<Map<String, Object>> getGeoJson() {
        return ResponseEntity.ok(roadNetworkService.getGeoJsonFeatures());
    }

    /**
     * 全局统计
     * GET /api/road-network/summary
     */
    @GetMapping("/summary")
    public ResponseEntity<Map<String, Object>> getSummary() {
        return ResponseEntity.ok(roadNetworkService.getStats());
    }
}
