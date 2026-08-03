package com.plantplatform.controller;

import com.plantplatform.model.Alert;
import com.plantplatform.model.BridgeArchive;
import com.plantplatform.model.RoadArchive;
import com.plantplatform.model.SimulationArchive;
import com.plantplatform.service.DataManagementService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 数据管理 API（资产档案模块）
 */
@RestController
@RequestMapping("/api/data-mgmt")
public class DataManagementController {

    @Autowired
    private DataManagementService dataManagementService;

    @GetMapping("/bridge-archives")
    public ResponseEntity<List<BridgeArchive>> getBridgeArchives() {
        return ResponseEntity.ok(dataManagementService.getBridgeArchives());
    }

    @GetMapping("/road-archives")
    public ResponseEntity<List<RoadArchive>> getRoadArchives() {
        return ResponseEntity.ok(dataManagementService.getRoadArchives());
    }

    @GetMapping("/simulation-archives")
    public ResponseEntity<List<SimulationArchive>> getSimulationArchives() {
        return ResponseEntity.ok(dataManagementService.getSimulationArchives());
    }

    @GetMapping("/alerts")
    public ResponseEntity<List<Alert>> getAlerts() {
        return ResponseEntity.ok(dataManagementService.getAlerts());
    }
}