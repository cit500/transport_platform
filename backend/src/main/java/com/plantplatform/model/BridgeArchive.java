package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 桥隧档案实体 — 对应 bridge_archives 表
 * 对应 mockData.js 中的 bridgeArchiveData 数组
 */
@Entity
@Table(name = "bridge_archives")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class BridgeArchive {

    @Id
    @Column(length = 50)
    private String uuid;

    @Column(length = 100)
    private String name;

    @Column(length = 50)
    private String type;

    @Column(length = 50)
    private String span;

    @Column(name = "health_score")
    private Double healthScore;

    @Column(name = "load_limit")
    private Double loadLimit;

    @Column(length = 20)
    private String status;

    @Column(name = "last_inspection", length = 20)
    private String lastInspection;   // 最近巡检日期
}