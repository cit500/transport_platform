package com.plantplatform.repository;

import com.plantplatform.model.AssetCurrentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * 资产当前状态 Repository
 */
@Repository
public interface AssetCurrentStatusRepository extends JpaRepository<AssetCurrentStatus, Long> {

    Optional<AssetCurrentStatus> findByAssetId(Long assetId);
}
