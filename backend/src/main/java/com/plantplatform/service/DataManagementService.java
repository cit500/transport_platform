package com.plantplatform.service;

import com.plantplatform.model.*;
import com.plantplatform.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 数据管理业务逻辑（资产管理模块）
 */
@Service
public class DataManagementService {

    @Autowired
    private BridgeArchiveRepository bridgeArchiveRepository;

    @Autowired
    private RoadArchiveRepository roadArchiveRepository;

    @Autowired
    private SimulationArchiveRepository simulationArchiveRepository;

    @Autowired
    private AlertRepository alertRepository;

    public List<BridgeArchive> getBridgeArchives() {
        return bridgeArchiveRepository.findAll();
    }

    public List<RoadArchive> getRoadArchives() {
        return roadArchiveRepository.findAll();
    }

    public List<SimulationArchive> getSimulationArchives() {
        return simulationArchiveRepository.findAllByOrderByDateDesc();
    }

    public List<Alert> getAlerts() {
        return alertRepository.findAllByOrderByIdDesc();
    }
}