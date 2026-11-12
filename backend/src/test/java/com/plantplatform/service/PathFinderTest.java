package com.plantplatform.service;

import org.junit.jupiter.api.Test;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

class PathFinderTest {
    private RoadGraphService.Graph graph() {
        return RoadGraphService.build(List.of(new RoadGraphService.Node(1, 106, 29),
                new RoadGraphService.Node(2, 106.1, 29), new RoadGraphService.Node(3, 106.2, 29),
                new RoadGraphService.Node(4, 108, 30)),
                List.of(new RoadGraphService.Edge(10, 1, 2, 100), new RoadGraphService.Edge(11, 2, 3, 200),
                        new RoadGraphService.Edge(12, 1, 3, 500), new RoadGraphService.Edge(13, 1, 2, 150)), System.nanoTime());
    }
    @Test void shortestPathUsesLengthAndPreservesParallelEdgeIdentity() {
        var route = PathFinder.solve(graph().adjacency(), 1, 3, Set.of());
        assertTrue(route.reachable()); assertEquals(300, route.lengthM());
        assertEquals(List.of(10L, 11L), route.steps().stream().map(PathFinder.Step::edgeId).toList());
    }
    @Test void everyEdgeCanBeTraversedBackwards() {
        var route = PathFinder.solve(graph().adjacency(), 3, 1, Set.of());
        assertEquals(List.of(11L, 10L), route.steps().stream().map(PathFinder.Step::edgeId).toList());
        assertEquals(3, route.steps().get(0).from()); assertEquals(300, route.lengthM());
    }
    @Test void distinguishesUnreachableFromSameNode() {
        assertFalse(PathFinder.solve(graph().adjacency(), 1, 4, Set.of()).reachable());
        var route = PathFinder.solve(graph().adjacency(), 1, 1, Set.of());
        assertTrue(route.reachable()); assertEquals(0, route.lengthM()); assertTrue(route.steps().isEmpty());
    }
    @Test void exclusionsDoNotMutateSharedGraph() {
        var g = graph();
        assertEquals(350, PathFinder.solve(g.adjacency(), 1, 3, Set.of(10L)).lengthM());
        assertEquals(300, PathFinder.solve(g.adjacency(), 1, 3, Set.of()).lengthM());
    }
    @Test void nearestNodeHasNoDistanceThresholdAndHandlesLargeOffsets() {
        var nearest = RoadGraphService.nearest(graph(), 0, 0);
        assertNotNull(nearest);
        assertEquals(1, nearest.id());
        assertEquals(2, RoadGraphService.nearest(graph(), 106.10001, 29).id());
    }
}
