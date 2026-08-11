package com.plantplatform.repository;

import com.plantplatform.model.BridgeAttributes;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * 桥梁属性 Repository
 */
@Repository
public interface BridgeAttributesRepository extends JpaRepository<BridgeAttributes, Long> {

    Optional<BridgeAttributes> findByAssetId(Long assetId);
}
