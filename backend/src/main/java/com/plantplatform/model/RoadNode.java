package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.Point;

import java.time.LocalDateTime;

/**
 * 高速/快速路网节点 — 对应 road_nodes 表
 *
 * 来源：chongqing_expressway_nodes.geojson（8488 个节点）
 * 每个节点对应 OSM 的一个交叉口/端点。
 */
@Entity
@Table(name = "road_nodes")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RoadNode {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * OSM Node ID（全局唯一）
     * 来源：GeoJSON properties.osmid
     */
    @Column(name = "osmid", nullable = false, unique = true)
    private Long osmid;

    /**
     * 连接的路段数（节点度数）
     * 来源：GeoJSON properties.street_count
     */
    @Column(name = "street_count")
    private Integer streetCount;

    /**
     * 空间点 (SRID 4326, WGS84)
     * MySQL GEOMETRY 类型，经度在前纬度在后
     */
    @JdbcTypeCode(SqlTypes.GEOMETRY)
    @Column(name = "geom", nullable = false, columnDefinition = "POINT NOT NULL SRID 4326")
    private Point geom;

    /**
     * 数据来源标记
     */
    @Column(name = "source_type", length = 20)
    private String sourceType;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    @Column(name = "updated_at")
    private LocalDateTime updatedAt;

    @PrePersist
    protected void onCreate() {
        createdAt = LocalDateTime.now();
        updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now();
    }
}
