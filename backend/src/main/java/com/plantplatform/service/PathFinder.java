package com.plantplatform.service;

import java.util.*;

/** 距离最短路；禁用边集合只作用于当前查询，不修改共享图。 */
public final class PathFinder {
    private PathFinder() {}
    public record Step(long edgeId, long from, long to, double lengthM) {}
    public record Result(boolean reachable, List<Step> steps, double lengthM) {}
    private record Candidate(long node, double distance) {}

    public static Result solve(Map<Long, List<Step>> adjacency, long origin, long destination,
                               Set<Long> disabledEdges) {
        if (origin == destination) return new Result(true, List.of(), 0);
        Map<Long, Double> distance = new HashMap<>();
        Map<Long, Step> previous = new HashMap<>();
        PriorityQueue<Candidate> queue = new PriorityQueue<>(Comparator.comparingDouble(Candidate::distance)
                .thenComparingLong(Candidate::node));
        distance.put(origin, 0.0);
        queue.add(new Candidate(origin, 0));
        while (!queue.isEmpty()) {
            Candidate current = queue.poll();
            if (current.distance() > distance.getOrDefault(current.node(), Double.POSITIVE_INFINITY)) continue;
            if (current.node() == destination) break;
            for (Step step : adjacency.getOrDefault(current.node(), List.of())) {
                if (disabledEdges.contains(step.edgeId())) continue;
                double next = current.distance() + step.lengthM();
                if (next < distance.getOrDefault(step.to(), Double.POSITIVE_INFINITY)) {
                    distance.put(step.to(), next);
                    previous.put(step.to(), step);
                    queue.add(new Candidate(step.to(), next));
                }
            }
        }
        if (!distance.containsKey(destination)) return new Result(false, List.of(), 0);
        LinkedList<Step> steps = new LinkedList<>();
        for (long node = destination; node != origin;) {
            Step step = previous.get(node);
            steps.addFirst(step);
            node = step.from();
        }
        return new Result(true, List.copyOf(steps), distance.get(destination));
    }
}
