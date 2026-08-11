package com.plantplatform.repository;

import com.plantplatform.model.DivisionCurrentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface DivisionCurrentStatusRepository extends JpaRepository<DivisionCurrentStatus, Long> {
    Optional<DivisionCurrentStatus> findByDivisionId(Long divisionId);
}
