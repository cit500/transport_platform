package com.plantplatform.repository;

import com.plantplatform.model.SimulationArchive;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface SimulationArchiveRepository extends JpaRepository<SimulationArchive, String> {
    List<SimulationArchive> findAllByOrderByDateDesc();
}