package com.plantplatform.repository;

import com.plantplatform.model.CountyBridgeCount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CountyBridgeCountRepository extends JpaRepository<CountyBridgeCount, String> {
    List<CountyBridgeCount> findAllByOrderByCountDesc();
}