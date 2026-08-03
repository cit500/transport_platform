package com.plantplatform.repository;

import com.plantplatform.model.RoadArchive;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface RoadArchiveRepository extends JpaRepository<RoadArchive, String> {
}