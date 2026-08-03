package com.plantplatform.service;

import com.plantplatform.model.*;
import com.plantplatform.repository.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.*;

/**
 * 桥梁数据业务逻辑
 */
@Service
public class BridgeService {

    @Autowired
    private BridgeRepository bridgeRepository;

    @Autowired
    private RoadNetworkRepository roadNetworkRepository;

    @Autowired
    private CountyBridgeCountRepository countyBridgeCountRepository;

    @Autowired
    private CountyResilienceScoreRepository countyResilienceScoreRepository;

    @Autowired
    private WeakRankingRepository weakRankingRepository;

    @Autowired
    private ResilienceHistoryRepository resilienceHistoryRepository;

    @Autowired
    private HistoricalEventRepository historicalEventRepository;

    public List<Bridge> getAllBridges() {
        return bridgeRepository.findAll();
    }

    public Optional<Bridge> getBridgeByUuid(String uuid) {
        return bridgeRepository.findById(uuid);
    }

    public List<RoadNetwork> getAllRoadNetworks() {
        return roadNetworkRepository.findAll();
    }

    public List<CountyBridgeCount> getCountyBridgeCounts() {
        return countyBridgeCountRepository.findAllByOrderByCountDesc();
    }

    public List<CountyResilienceScore> getCountyResilienceScores() {
        return countyResilienceScoreRepository.findAllByOrderByScoreDesc();
    }

    public List<WeakRanking> getWeakRankings() {
        return weakRankingRepository.findAllByOrderByImpactDesc();
    }

    public List<ResilienceHistory> getResilienceHistory() {
        return resilienceHistoryRepository.findAllByOrderByIdAsc();
    }

    public List<HistoricalEvent> getHistoricalEvents() {
        return historicalEventRepository.findAll();
    }
}