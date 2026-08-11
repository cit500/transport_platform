package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 资产候选 — 对应 asset_candidates 表
 *
 * 存储从路网 Edge 提取的桥梁/隧道候选信息。
 * 本轮只建立 Schema，不实现提取算法。
 */
@Entity
@Table(name = "asset_candidates")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AssetCandidate {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 候选类型：BRIDGE / TUNNEL
     */
    @Column(name = "candidate_type", nullable = false, length = 20)
    private String candidateType;

    /**
     * 候选名称
     */
    @Column(name = "candidate_name", length = 200)
    private String candidateName;

    /**
     * 行政区 ID (FK)
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "division_id", foreignKey = @ForeignKey(name = "fk_candidate_division"))
    private AdministrativeDivision division;

    /**
     * 道路名称
     */
    @Column(name = "road_name", length = 200)
    private String roadName;

    /**
     * 道路编号
     */
    @Column(name = "road_ref", length = 100)
    private String roadRef;

    /**
     * 包含的 Edge 数量
     */
    @Column(name = "edge_count")
    private Integer edgeCount;

    /**
     * 总 Edge 长度 (米)
     */
    @Column(name = "total_edge_length_m")
    private BigDecimal totalEdgeLengthM;

    /**
     * 置信度 (0-1)
     */
    @Column(name = "confidence", precision = 3, scale = 2)
    private BigDecimal confidence;

    /**
     * 审核状态：PENDING / CONFIRMED / IGNORED
     */
    @Column(name = "review_status", nullable = false, length = 20)
    private String reviewStatus = "PENDING";

    /**
     * 提取规则标识
     */
    @Column(name = "source_rule", length = 100)
    private String sourceRule;

    /**
     * 候选唯一键 (用于幂等提取)
     * 格式: TYPE:<hash>
     */
    @Column(name = "candidate_key", unique = true, length = 100)
    private String candidateKey;

    /**
     * 确认后创建的资产 ID
     */
    @Column(name = "created_asset_id")
    private Long createdAssetId;

    /**
     * 创建时间
     */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    /**
     * 审核时间
     */
    @Column(name = "reviewed_at")
    private LocalDateTime reviewedAt;
}
