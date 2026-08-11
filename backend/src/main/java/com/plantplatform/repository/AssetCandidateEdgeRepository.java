package com.plantplatform.repository;

import com.plantplatform.model.AssetCandidateEdge;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * 候选 Edge 关联 Repository
 */
@Repository
public interface AssetCandidateEdgeRepository extends JpaRepository<AssetCandidateEdge, Long> {

    List<AssetCandidateEdge> findByCandidateIdOrderBySequenceNo(Long candidateId);

    List<AssetCandidateEdge> findByRoadEdgeId(Long roadEdgeId);

    /**
     * 删除候选的所有 Edge 关联
     */
    void deleteByCandidateId(Long candidateId);
}
