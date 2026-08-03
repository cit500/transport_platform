package com.plantplatform.repository;

import com.plantplatform.model.WeakRanking;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface WeakRankingRepository extends JpaRepository<WeakRanking, Integer> {
    List<WeakRanking> findAllByOrderByImpactDesc();
}