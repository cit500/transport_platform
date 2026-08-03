package com.plantplatform.repository;

import com.plantplatform.model.CountyResilienceScore;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CountyResilienceScoreRepository extends JpaRepository<CountyResilienceScore, String> {
    List<CountyResilienceScore> findAllByOrderByScoreDesc();
}