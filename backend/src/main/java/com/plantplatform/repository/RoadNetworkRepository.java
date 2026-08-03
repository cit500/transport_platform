package com.plantplatform.repository;

import com.plantplatform.model.RoadNetwork;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface RoadNetworkRepository extends JpaRepository<RoadNetwork, String> {
}