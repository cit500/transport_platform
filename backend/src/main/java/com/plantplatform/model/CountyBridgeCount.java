package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 区县桥隧数量 — 对应 county_bridge_counts 表
 * 对应 mockData.js 中的 countyBridgeCounts 数组
 */
@Entity
@Table(name = "county_bridge_counts")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CountyBridgeCount {

    @Id
    @Column(length = 50)
    private String name;          // 区县名称

    @Column(nullable = false)
    private Integer count;        // 桥隧数量
}