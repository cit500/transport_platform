package com.plantplatform.repository;

import com.plantplatform.model.RoadNode;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface RoadNodeRepository extends JpaRepository<RoadNode, Long> {

    Optional<RoadNode> findByOsmid(Long osmid);

    boolean existsByOsmid(Long osmid);

    @Query(value = "SELECT COUNT(*) FROM road_nodes", nativeQuery = true)
    long countAll();

    @Query(value = "SELECT COUNT(DISTINCT osmid) FROM road_nodes", nativeQuery = true)
    long countDistinctOsmid();
}
