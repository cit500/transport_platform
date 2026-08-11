package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

/**
 * 行政区当前状态 — 对应 division_current_status 表
 *
 * 存储每个行政区的核心运营指标。
 * division_id 外键关联 administrative_divisions.id。
 */
@Entity
@Table(name = "division_current_status")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DivisionCurrentStatus {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 关联行政区 ID（外键）
     */
    @Column(name = "division_id", nullable = false, unique = true)
    private Long divisionId;

    /**
     * 韧性评分 (0-100)
     */
    @Column(name = "resilience_score")
    private Integer resilienceScore;

    /**
     * 灾害风险率 (%)
     */
    @Column(name = "disaster_risk_rate")
    private Integer disasterRiskRate;

    /**
     * 通行保障率 (%)
     */
    @Column(name = "traffic_guarantee_rate")
    private Integer trafficGuaranteeRate;

    /**
     * 风险等级：low / medium / high / extreme
     */
    @Column(name = "risk_level", length = 20)
    private String riskLevel;

    /**
     * 数据来源：SEED / ASSESSMENT / MANUAL
     */
    @Column(name = "source_type", length = 20)
    private String sourceType;

    /**
     * 关联任务 ID（可选）
     */
    @Column(name = "source_task_id", length = 64)
    private String sourceTaskId;

    /**
     * 最后更新时间
     */
    @Column(name = "updated_at")
    private LocalDateTime updatedAt;
}
