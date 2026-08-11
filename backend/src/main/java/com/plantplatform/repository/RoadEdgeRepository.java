package com.plantplatform.repository;

import com.plantplatform.model.RoadEdge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface RoadEdgeRepository extends JpaRepository<RoadEdge, Long> {

    /**
     * 通过源数据键查找（u+v+key）
     */
    Optional<RoadEdge> findBySourceUOsmidAndSourceVOsmidAndEdgeKey(
            Long sourceUOsmid, Long sourceVOsmid, Integer edgeKey);

    boolean existsBySourceUOsmidAndSourceVOsmidAndEdgeKey(
            Long sourceUOsmid, Long sourceVOsmid, Integer edgeKey);

    /**
     * 通过 division_id 查询所有路段
     */
    List<RoadEdge> findByDivisionId(Long divisionId);

    @Query(value = "SELECT COUNT(*) FROM road_edges", nativeQuery = true)
    long countAll();

    @Query(value = "SELECT COUNT(*) FROM road_edges WHERE u_node_id IS NULL OR v_node_id IS NULL", nativeQuery = true)
    long countNullNodeFk();

    @Query(value = "SELECT COUNT(*) FROM road_edges WHERE division_id IS NULL", nativeQuery = true)
    long countNullDivisionId();

    @Query(value = "SELECT COUNT(*) FROM road_edges WHERE is_bridge = true", nativeQuery = true)
    long countBridge();

    @Query(value = "SELECT COUNT(*) FROM road_edges WHERE is_tunnel = true", nativeQuery = true)
    long countTunnel();

    @Query(value = "SELECT MIN(length_m) FROM road_edges", nativeQuery = true)
    Double minLength();

    @Query(value = "SELECT MAX(length_m) FROM road_edges", nativeQuery = true)
    Double maxLength();

    @Query(value = "SELECT SUM(length_m) FROM road_edges", nativeQuery = true)
    Double sumLength();

    @Query(value = "SELECT highway, COUNT(*) FROM road_edges GROUP BY highway ORDER BY COUNT(*) DESC", nativeQuery = true)
    List<Object[]> highwayDistribution();

    @Query(value = "SELECT bridge_raw, COUNT(*) FROM road_edges GROUP BY bridge_raw ORDER BY COUNT(*) DESC", nativeQuery = true)
    List<Object[]> bridgeRawDistribution();

    @Query(value = "SELECT tunnel_raw, COUNT(*) FROM road_edges GROUP BY tunnel_raw ORDER BY COUNT(*) DESC", nativeQuery = true)
    List<Object[]> tunnelRawDistribution();

    /**
     * 查找 u_node_id 或 v_node_id 为 NULL 的 Edge（FK 不完整）
     */
    @Query(value = "SELECT * FROM road_edges WHERE u_node_id IS NULL OR v_node_id IS NULL LIMIT 10", nativeQuery = true)
    List<Object[]> findEdgesWithNullNodeFk();

    /**
     * 查找 division_id 为 NULL 的 Edge
     */
    @Query(value = "SELECT id, source_u_osmid, source_v_osmid, name, ref FROM road_edges WHERE division_id IS NULL", nativeQuery = true)
    List<Object[]> findEdgesWithNullDivision();

    /**
     * 查找 bridge='no' 的 Edge（用于验证 is_bridge=false）
     */
    @Query(value = "SELECT id, source_u_osmid, source_v_osmid, bridge_raw, is_bridge FROM road_edges WHERE bridge_raw = 'no'", nativeQuery = true)
    List<Object[]> findBridgeNoEdges();

    /**
     * 查找所有桥梁 Edge
     */
    List<RoadEdge> findByIsBridgeTrue();

    /**
     * 查找所有隧道 Edge
     */
    List<RoadEdge> findByIsTunnelTrue();
}
