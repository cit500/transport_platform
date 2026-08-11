package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 资产道路关联 — 对应 asset_road_relations 表
 *
 * 存储资产与路网 Edge 的绑定关系。
 * 道路绑定必须通过此表，不直接保存 bound_edge_ids。
 */
@Entity
@Table(name = "asset_road_relations", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"asset_id", "road_edge_id"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AssetRoadRelation {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 资产 ID (FK)
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "asset_id", nullable = false, foreignKey = @ForeignKey(name = "fk_relation_asset"))
    private TransportAsset asset;

    /**
     * 路网 Edge ID (FK)
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "road_edge_id", nullable = false, foreignKey = @ForeignKey(name = "fk_relation_edge"))
    private RoadEdge roadEdge;

    /**
     * 关系类型：PRIMARY / ADJACENT
     */
    @Column(name = "relation_type", nullable = false, length = 20)
    private String relationType = "PRIMARY";

    /**
     * 序号（多条 Edge 时的顺序）
     */
    @Column(name = "sequence_no")
    private Integer sequenceNo;

    /**
     * 创建时间
     */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();
}
