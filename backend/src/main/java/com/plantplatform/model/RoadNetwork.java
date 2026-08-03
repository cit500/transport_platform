package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 路网实体 — 对应 road_network 表
 * 对应 mockData.js 中的 roadNetwork 数组
 *
 * coords 字段用 TEXT 存储 JSON 字符串
 * 格式: [[lat,lng],[lat,lng],...]
 */
@Entity
@Table(name = "road_network")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RoadNetwork {

    @Id
    @Column(length = 50)
    private String id;            // 道路编号，如 R_001

    @Column(nullable = false, length = 100)
    private String name;          // 道路名称

    @Column(columnDefinition = "TEXT")
    private String coords;        // 坐标点 JSON 字符串

    @Column(length = 20)
    private String status;        // 状态: normal/warning/danger
}