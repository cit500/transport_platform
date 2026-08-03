package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 预警记录 — 对应 alerts 表
 * 对应 main.js 中底部预警表格的数据
 */
@Entity
@Table(name = "alerts")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class Alert {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "alert_time", length = 50)
    private String time;           // 预警时间

    @Column(length = 20)
    private String level;          // 等级：I级/II级

    @Column(name = "level_color", length = 20)
    private String levelColor;     // 颜色：red/yellow

    @Column(name = "bridge_name", length = 100)
    private String bridgeName;     // 桥梁名称

    @Column(name = "bridge_group", length = 100)
    private String bridgeGroup;    // 所属桥群

    @Column(name = "alert_type", length = 50)
    private String alertType;      // 预警类型

    @Column(length = 200)
    private String content;        // 预警内容

    @Column(length = 20)
    private String status;         // 处置状态
}