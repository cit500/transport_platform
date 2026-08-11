package com.plantplatform.repository;

import com.plantplatform.model.TunnelAttributes;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * 隧道属性 Repository
 */
@Repository
public interface TunnelAttributesRepository extends JpaRepository<TunnelAttributes, Long> {

    Optional<TunnelAttributes> findByAssetId(Long assetId);
}
