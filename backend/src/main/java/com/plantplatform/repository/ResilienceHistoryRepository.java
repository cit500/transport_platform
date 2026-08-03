package com.plantplatform.repository;

import com.plantplatform.model.ResilienceHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ResilienceHistoryRepository extends JpaRepository<ResilienceHistory, Long> {
    List<ResilienceHistory> findAllByOrderByIdAsc();
}