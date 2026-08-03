package com.plantplatform.controller;

import com.plantplatform.model.*;
import com.plantplatform.service.BridgeService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Optional;

/**
 * 基础数据 API
 * 提供桥梁、路网、区县统计、韧性指数等基础数据的查询接口
 *
 * @RestController = @Controller + @ResponseBody
 * 表示这个类的所有方法都返回 JSON 数据
 */
@RestController
@RequestMapping("/api")
public class BridgeController {

    @Autowired
    private BridgeService bridgeService;

    /**
     * GET /api/bridges - 获取所有桥梁
     */
    @GetMapping("/bridges")
    public ResponseEntity<List<Bridge>> getAllBridges() {
        return ResponseEntity.ok(bridgeService.getAllBridges());
    }

    /**
     * GET /api/bridges/{uuid} - 根据UUID获取单个桥梁
     */
    @GetMapping("/bridges/{uuid}")
    public ResponseEntity<Bridge> getBridgeByUuid(@PathVariable String uuid) {
        Optional<Bridge> bridge = bridgeService.getBridgeByUuid(uuid);
        return bridge.map(ResponseEntity::ok)
                     .orElse(ResponseEntity.notFound().build());
    }

    /**
     * GET /api/road-networks - 获取所有路网
     */
    @GetMapping("/road-networks")
    public ResponseEntity<List<RoadNetwork>> getRoadNetworks() {
        return ResponseEntity.ok(bridgeService.getAllRoadNetworks());
    }

    /**
     * GET /api/county-bridge-counts - 区县桥隧数量排行
     */
    @GetMapping("/county-bridge-counts")
    public ResponseEntity<List<CountyBridgeCount>> getCountyBridgeCounts() {
        return ResponseEntity.ok(bridgeService.getCountyBridgeCounts());
    }

    /**
     * GET /api/county-resilience-scores - 区县韧性指数排行
     */
    @GetMapping("/county-resilience-scores")
    public ResponseEntity<List<CountyResilienceScore>> getCountyResilienceScores() {
        return ResponseEntity.ok(bridgeService.getCountyResilienceScores());
    }

    /**
     * GET /api/weak-rankings - 关键薄弱环节排序
     */
    @GetMapping("/weak-rankings")
    public ResponseEntity<List<WeakRanking>> getWeakRankings() {
        return ResponseEntity.ok(bridgeService.getWeakRankings());
    }

    /**
     * GET /api/resilience-history - 韧性历史趋势
     */
    @GetMapping("/resilience-history")
    public ResponseEntity<List<ResilienceHistory>> getResilienceHistory() {
        return ResponseEntity.ok(bridgeService.getResilienceHistory());
    }

    /**
     * GET /api/historical-events - 历史灾害事件
     */
    @GetMapping("/historical-events")
    public ResponseEntity<List<HistoricalEvent>> getHistoricalEvents() {
        return ResponseEntity.ok(bridgeService.getHistoricalEvents());
    }
}