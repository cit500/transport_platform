package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 资产当前状态 — 对应 asset_current_status 表
 *
 * 存储资产的健康评分、风险等级、通行状态、限载限高等动态信息。
 */
@Entity
@Table(name = "asset_current_status")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AssetCurrentStatus {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 资产 ID (UNIQUE FK)
     */
    @Column(name = "asset_id", nullable = false, unique = true)
    private Long assetId;

    /**
     * 关联资产主表
     */
    @OneToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "asset_id", insertable = false, updatable = false)
    private TransportAsset asset;

    /**
     * 健康评分 (0-1)
     */
    @Column(name = "health_score", precision = 3, scale = 2)
    private BigDecimal healthScore;

    /**
     * 风险等级：LOW / MEDIUM / HIGH / CRITICAL
     */
    @Column(name = "risk_level", length = 20)
    private String riskLevel;

    /**
     * 通行状态：OPEN / RESTRICTED / CLOSED
     */
    @Column(name = "pass_status", length = 20)
    private String passStatus;

    /**
     * 当前限载 (吨)
     */
    @Column(name = "current_load_limit_t", precision = 6, scale = 2)
    private BigDecimal currentLoadLimitT;

    /**
     * 当前限高 (米)
     */
    @Column(name = "current_height_limit_m", precision = 5, scale = 2)
    private BigDecimal currentHeightLimitM;

    /**
     * 当前限宽 (米)
     */
    @Column(name = "current_width_limit_m", precision = 5, scale = 2)
    private BigDecimal currentWidthLimitM;

    /**
     * 数据来源类型
     */
    @Column(name = "source_type", length = 30)
    private String sourceType;

    /**
     * 来源任务 ID
     */
    @Column(name = "source_task_id")
    private Long sourceTaskId;

    /**
     * 更新时间
     */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}
