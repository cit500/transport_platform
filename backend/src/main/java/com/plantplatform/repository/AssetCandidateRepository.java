package com.plantplatform.repository;

import com.plantplatform.model.AssetCandidate;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 资产候选 Repository
 */
@Repository
public interface AssetCandidateRepository extends JpaRepository<AssetCandidate, Long> {

    List<AssetCandidate> findByReviewStatus(String reviewStatus);

    List<AssetCandidate> findByCandidateType(String candidateType);

    /**
     * 分页查询待审核候选
     */
    @Query("SELECT c FROM AssetCandidate c " +
           "LEFT JOIN FETCH c.division d " +
           "WHERE c.reviewStatus = :status " +
           "AND (:candidateType IS NULL OR c.candidateType = :candidateType)")
    Page<AssetCandidate> findByReviewStatusWithDivision(
            @Param("status") String status,
            @Param("candidateType") String candidateType,
            Pageable pageable);

    /**
     * 统计待审核候选数量
     */
    @Query("SELECT COUNT(c) FROM AssetCandidate c WHERE c.reviewStatus = 'PENDING'")
    long countPendingCandidates();

    /**
     * 统计各类型待审核候选数量
     */
    @Query("SELECT c.candidateType, COUNT(c) FROM AssetCandidate c " +
           "WHERE c.reviewStatus = 'PENDING' GROUP BY c.candidateType")
    List<Object[]> countPendingByType();

    /**
     * 检查 candidateKey 是否已存在
     */
    boolean existsByCandidateKey(String candidateKey);
}
