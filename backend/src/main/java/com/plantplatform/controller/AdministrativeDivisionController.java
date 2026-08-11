package com.plantplatform.controller;

import com.plantplatform.dto.AdministrativeDivisionDTO;
import com.plantplatform.dto.DivisionOverviewDTO;
import com.plantplatform.model.AdministrativeDivision;
import com.plantplatform.service.AdministrativeDivisionService;
import com.plantplatform.service.DivisionOverviewService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * 行政区划主数据 API
 *
 * GET  /api/administrative-divisions                  — 查询所有活跃行政区
 * GET  /api/administrative-divisions/{id}             — 根据 ID 查询
 * GET  /api/administrative-divisions/resolve?name=    — 根据名称解析
 * GET  /api/administrative-divisions/overview         — 37 区 Overview
 * GET  /api/administrative-divisions/{id}/overview    — 单区 Overview
 */
@RestController
@RequestMapping("/api/administrative-divisions")
public class AdministrativeDivisionController {

    @Autowired
    private AdministrativeDivisionService divisionService;

    @Autowired
    private DivisionOverviewService overviewService;

    private AdministrativeDivisionDTO toDTO(AdministrativeDivision d) {
        return new AdministrativeDivisionDTO(
            d.getId(), d.getDivisionKey(), d.getCanonicalName(),
            d.getDisplayName(), d.getDivisionType(), d.getIsActive());
    }

    @GetMapping
    public ResponseEntity<List<AdministrativeDivisionDTO>> getAll() {
        return ResponseEntity.ok(divisionService.findAllActive().stream()
            .map(this::toDTO).collect(Collectors.toList()));
    }

    @GetMapping("/{id}")
    public ResponseEntity<AdministrativeDivisionDTO> getById(@PathVariable Long id) {
        return divisionService.findById(id)
            .map(d -> ResponseEntity.ok(toDTO(d)))
            .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/resolve")
    public ResponseEntity<Map<String, Object>> resolveByName(@RequestParam String name) {
        Optional<AdministrativeDivision> div = divisionService.resolveByName(name);
        if (div.isPresent()) {
            AdministrativeDivision d = div.get();
            return ResponseEntity.ok(Map.of(
                "id", d.getId(), "divisionKey", d.getDivisionKey(),
                "canonicalName", d.getCanonicalName(),
                "displayName", d.getDisplayName(),
                "divisionType", d.getDivisionType(), "isActive", d.getIsActive()));
        }
        return ResponseEntity.ok(Map.of("found", false, "query", name));
    }

    @GetMapping("/overview")
    public ResponseEntity<List<DivisionOverviewDTO>> getAllOverviews() {
        return ResponseEntity.ok(overviewService.getAllOverviews());
    }

    @GetMapping("/{id}/overview")
    public ResponseEntity<DivisionOverviewDTO> getOverviewById(@PathVariable Long id) {
        return overviewService.getOverviewById(id)
            .map(ResponseEntity::ok)
            .orElse(ResponseEntity.notFound().build());
    }

    /**
     * 修改行政区当前状态
     */
    @PutMapping("/{id}/current-status")
    public ResponseEntity<Map<String, Object>> updateCurrentStatus(
            @PathVariable Long id,
            @RequestBody Map<String, Object> body) {
        try {
            Integer resilienceScore = body.containsKey("resilienceScore") ?
                ((Number) body.get("resilienceScore")).intValue() : null;
            Integer disasterRiskRate = body.containsKey("disasterRiskRate") ?
                ((Number) body.get("disasterRiskRate")).intValue() : null;
            Integer trafficGuaranteeRate = body.containsKey("trafficGuaranteeRate") ?
                ((Number) body.get("trafficGuaranteeRate")).intValue() : null;
            String riskLevel = (String) body.getOrDefault("riskLevel", null);

            return overviewService.updateCurrentStatus(id, resilienceScore,
                    disasterRiskRate, trafficGuaranteeRate, riskLevel)
                .map(s -> {
                    Map<String, Object> result = new HashMap<>();
                    result.put("success", true);
                    result.put("divisionId", s.getDivisionId());
                    result.put("resilienceScore", s.getResilienceScore());
                    result.put("disasterRiskRate", s.getDisasterRiskRate());
                    result.put("trafficGuaranteeRate", s.getTrafficGuaranteeRate());
                    result.put("riskLevel", s.getRiskLevel());
                    result.put("sourceType", s.getSourceType());
                    result.put("updatedAt", s.getUpdatedAt() != null ? s.getUpdatedAt().toString() : null);
                    return ResponseEntity.ok(result);
                })
                .orElse(ResponseEntity.status(404).body(Map.of("error", "Division not found")));
        } catch (Exception e) {
            Map<String, Object> err = new HashMap<>();
            err.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            return ResponseEntity.status(500).body(err);
        }
    }

    /**
     * 重置单个行政区到种子数据
     * POST /api/administrative-divisions/{id}/current-status/reset
     */
    @PostMapping("/{id}/current-status/reset")
    public ResponseEntity<Map<String, Object>> resetCurrentStatus(@PathVariable Long id) {
        try {
            boolean success = overviewService.resetSingleDivision(id);
            if (success) {
                return ResponseEntity.ok(Map.of("success", true, "message", "已恢复种子数据"));
            } else {
                return ResponseEntity.status(404).body(Map.of("error", "Division not found or no seed baseline"));
            }
        } catch (Exception e) {
            Map<String, Object> err = new HashMap<>();
            err.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            return ResponseEntity.status(500).body(err);
        }
    }

    /**
     * 重置全部37区到种子数据
     * POST /api/administrative-divisions/current-status/reset
     */
    @PostMapping("/current-status/reset")
    public ResponseEntity<Map<String, Object>> resetAllCurrentStatus() {
        try {
            int count = overviewService.resetAllDivisions();
            return ResponseEntity.ok(Map.of("success", true, "resetCount", count));
        } catch (Exception e) {
            Map<String, Object> err = new HashMap<>();
            err.put("error", e.getClass().getSimpleName() + ": " + e.getMessage());
            return ResponseEntity.status(500).body(err);
        }
    }
}
