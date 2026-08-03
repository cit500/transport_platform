package com.plantplatform.repository;

import com.plantplatform.model.BridgeArchive;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface BridgeArchiveRepository extends JpaRepository<BridgeArchive, String> {
}