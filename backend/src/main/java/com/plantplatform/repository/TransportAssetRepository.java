package com.plantplatform.repository;

import com.plantplatform.model.TransportAsset;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

/**
 * 交通资产 Repository
 */
@Repository
public interface TransportAssetRepository extends JpaRepository<TransportAsset, Long> {

    Optional<TransportAsset> findByAssetCode(String assetCode);

    List<TransportAsset> findByAssetType(String assetType);

    List<TransportAsset> findByIsActiveTrue();

    List<TransportAsset> findBySourceType(String sourceType);

    List<TransportAsset> findByNetworkBindingStatus(String networkBindingStatus);

    /**
     * 分页查询资产（支持多条件筛选）
     */
    @Query("SELECT a FROM TransportAsset a " +
           "LEFT JOIN FETCH a.division d " +
           "WHERE a.isActive = true " +
           "AND (:assetType IS NULL OR a.assetType = :assetType) " +
           "AND (:divisionId IS NULL OR a.division.id = :divisionId) " +
           "AND (:keyword IS NULL OR a.assetCode LIKE %:keyword% OR a.assetName LIKE %:keyword%) " +
           "AND (:sourceType IS NULL OR a.sourceType = :sourceType) " +
           "AND (:bindingStatus IS NULL OR a.networkBindingStatus = :bindingStatus)")
    Page<TransportAsset> searchAssets(
            @Param("assetType") String assetType,
            @Param("divisionId") Long divisionId,
            @Param("keyword") String keyword,
            @Param("sourceType") String sourceType,
            @Param("bindingStatus") String bindingStatus,
            Pageable pageable);

    /**
     * 统计各类型资产数量
     */
    @Query("SELECT a.assetType, COUNT(a) FROM TransportAsset a " +
           "WHERE a.isActive = true GROUP BY a.assetType")
    List<Object[]> countByAssetType();

    /**
     * 统计各绑定状态数量
     */
    @Query("SELECT a.networkBindingStatus, COUNT(a) FROM TransportAsset a " +
           "WHERE a.isActive = true GROUP BY a.networkBindingStatus")
    List<Object[]> countByBindingStatus();

    /**
     * 统计各来源类型数量
     */
    @Query("SELECT a.sourceType, COUNT(a) FROM TransportAsset a " +
           "WHERE a.isActive = true GROUP BY a.sourceType")
    List<Object[]> countBySourceType();

    /**
     * 统计无道路绑定的资产数量
     */
    @Query("SELECT COUNT(a) FROM TransportAsset a " +
           "WHERE a.isActive = true AND a.networkBindingStatus = 'UNBOUND'")
    long countUnboundAssets();

    /**
     * 检查 assetCode 是否已存在
     */
    boolean existsByAssetCode(String assetCode);

    /**
     * V1.4F: 检查同类型同名资产是否存在（用于业务查重）
     * @param assetType 资产类型 (BRIDGE/TUNNEL)
     * @param assetName 资产名称
     * @return 是否存在
     */
    boolean existsByAssetTypeAndAssetName(String assetType, String assetName);

    /**
     * V1.4F: 根据同类型同名查找资产（用于编辑时查重）
     */
    Optional<TransportAsset> findByAssetTypeAndAssetName(String assetType, String assetName);

    /**
     * V1.4F: 软删除 - 设置 is_active = false
     */
    @Query("UPDATE TransportAsset a SET a.isActive = false, a.updatedAt = CURRENT_TIMESTAMP WHERE a.id = :id")
    @org.springframework.transaction.annotation.Transactional
    int softDeleteById(@Param("id") Long id);
}
