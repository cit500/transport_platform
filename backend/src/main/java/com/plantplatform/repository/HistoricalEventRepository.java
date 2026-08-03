package com.plantplatform.repository;

import com.plantplatform.model.HistoricalEvent;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface HistoricalEventRepository extends JpaRepository<HistoricalEvent, String> {
}