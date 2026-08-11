package com.plantplatform.repository;

import com.plantplatform.model.AssetRoadRelation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 资产道路关联 Repository
 */
@Repository
public interface AssetRoadRelationRepository extends JpaRepository<AssetRoadRelation, Long> {

    List<AssetRoadRelation> findByAssetIdOrderBySequenceNo(Long assetId);

    List<AssetRoadRelation> findByRoadEdgeId(Long roadEdgeId);

    /**
     * 检查资产是否已绑定某 Edge
     */
    boolean existsByAssetIdAndRoadEdgeId(Long assetId, Long roadEdgeId);

    /**
     * 删除资产的所有道路关联
     */
    void deleteByAssetId(Long assetId);

    /**
     * 统计资产绑定的 Edge 数量
     */
    @Query("SELECT COUNT(r) FROM AssetRoadRelation r WHERE r.asset.id = :assetId")
    long countByAssetId(@Param("assetId") Long assetId);
}
