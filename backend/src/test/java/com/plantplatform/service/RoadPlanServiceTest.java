package com.plantplatform.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class RoadPlanServiceTest {
    @Test void reversesGeometryAndDeduplicatesAssetsInTravelOrderWithoutRequiringAssetCoordinates() {
        var graphs = mock(RoadGraphService.class);
        var jdbc = mock(JdbcTemplate.class);
        var graph = RoadGraphService.build(List.of(new RoadGraphService.Node(1,106,29),
                new RoadGraphService.Node(2,107,29),new RoadGraphService.Node(3,108,29)),
                List.of(new RoadGraphService.Edge(10,1,2,100),new RoadGraphService.Edge(11,2,3,200)),System.nanoTime());
        when(graphs.graph()).thenReturn(graph);
        when(jdbc.queryForList(contains("geometryJson"), any(Object[].class))).thenReturn(List.of(
                Map.of("id",10L,"geometryJson","{\"type\":\"LineString\",\"coordinates\":[[106,29],[107,29]]}"),
                Map.of("id",11L,"geometryJson","{\"type\":\"LineString\",\"coordinates\":[[107,29],[108,29]]}")));
        when(jdbc.queryForList(contains("asset_road_relation"), any(Object[].class))).thenReturn(List.of(
                Map.of("roadEdgeId",10L,"assetId",7L,"assetType","BRIDGE","assetName","桥"),
                Map.of("roadEdgeId",11L,"assetId",7L,"assetType","BRIDGE","assetName","桥"),
                Map.of("roadEdgeId",11L,"assetId",8L,"assetType","TUNNEL","assetName","隧")));
        var service = new RoadPlanService(graphs,jdbc,new ObjectMapper());
        var result = service.plan(Map.of("originLongitude",108,"originLatitude",29,
                "destinationLongitude",106,"destinationLatitude",29));
        assertEquals(List.of(11L,10L),result.get("edgeIds"));
        assertEquals(0.3,(Double)result.get("distanceKm"),1e-9);
        List<?> assets = (List<?>)result.get("assets");
        assertEquals(2,assets.size());
        assertEquals(7L,((Map<?,?>)assets.get(0)).get("id"));
        assertEquals(11L,((Map<?,?>)assets.get(0)).get("firstEdgeId"));
        assertNotNull(((Map<?,?>)assets.get(0)).get("focusLatitude"));
        List<?> segments=(List<?>)result.get("segments");
        List<?> points=(List<?>)((Map<?,?>)segments.get(0)).get("points");
        assertEquals(List.of(29.0,108.0),points.get(0));
    }

    @Test void rejectsMissingOrInvalidCoordinatesBeforeDatabaseAccess() {
        var graphs=mock(RoadGraphService.class);
        var service=new RoadPlanService(graphs,mock(JdbcTemplate.class),new ObjectMapper());
        assertThrows(IllegalArgumentException.class,()->service.plan(Map.of()));
        assertThrows(IllegalArgumentException.class,()->service.plan(Map.of("originLongitude","NaN")));
        verifyNoInteractions(graphs);
    }
}
