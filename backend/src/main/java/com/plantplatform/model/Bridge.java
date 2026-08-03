package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 桥梁/隧道 实体 — 对应 bridges 表
 * 对应 mockData.js 中的 bridges 数组
 */
@Entity
@Table(name = "bridges")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Bridge {

    @Id
    @Column(length = 50)
    private String uuid;          // 唯一标识，如 BR_510100_0045

    @Column(nullable = false, length = 100)
    private String name;          // 桥梁名称

    @Column(length = 50)
    private String type;          // 类型：悬索桥/斜拉桥/拱桥/梁桥/隧道

    @Column(length = 50)
    private String span;          // 跨径，如 1741m

    @Column(name = "design_load", length = 50)
    private String designLoad;    // 设计荷载等级

    @Column(nullable = false)
    private Double lat;           // 纬度

    @Column(nullable = false)
    private Double lng;           // 经度

    @Column(name = "health_score")
    private Double healthScore;   // 健康评分 0.0~1.0

    @Column(name = "load_limit")
    private Double loadLimit;     // 限载阈值(吨)，隧道为 null

    @Column(length = 20)
    private String status;        // 状态: normal/warning/danger
}