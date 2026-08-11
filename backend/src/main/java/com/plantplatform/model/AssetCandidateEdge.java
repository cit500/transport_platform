package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 候选 Edge 关联 — 对应 asset_candidate_edges 表
 *
 * 存储候选与路网 Edge 的关联关系。
 * 本轮只建立 Schema，不实现提取算法。
 */
@Entity
@Table(name = "asset_candidate_edges", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"candidate_id", "road_edge_id"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AssetCandidateEdge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 候选 ID (FK)
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "candidate_id", nullable = false, foreignKey = @ForeignKey(name = "fk_ce_candidate"))
    private AssetCandidate candidate;

    /**
     * 路网 Edge ID (FK)
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "road_edge_id", nullable = false, foreignKey = @ForeignKey(name = "fk_ce_edge"))
    private RoadEdge roadEdge;

    /**
     * 序号
     */
    @Column(name = "sequence_no")
    private Integer sequenceNo;
}
