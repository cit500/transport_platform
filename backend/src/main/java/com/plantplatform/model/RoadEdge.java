package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.locationtech.jts.geom.LineString;

import java.time.LocalDateTime;

/**
 * 高速/快速路网路段 — 对应 road_edges 表
 *
 * 来源：chongqing_expressway_edges_district_fixed.geojson（11742 条路段）
 * 每条路段对应 OSM 的一个 way segment。
 *
 * 唯一键：(source_u_osmid, source_v_osmid, edge_key)
 * 节点关联：u_node_id / v_node_id FK → road_nodes.id
 * 行政区关联：division_id FK → administrative_divisions.id
 */
@Entity
@Table(name = "road_edges", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"source_u_osmid", "source_v_osmid", "edge_key"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RoadEdge {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    // ---- 节点 FK 关联 ----

    /**
     * 起点 Node FK
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "u_node_id", nullable = false, foreignKey = @ForeignKey(name = "fk_edge_u_node"))
    private RoadNode uNode;

    /**
     * 终点 Node FK
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "v_node_id", nullable = false, foreignKey = @ForeignKey(name = "fk_edge_v_node"))
    private RoadNode vNode;

    // ---- 源数据键（只读追踪） ----

    /**
     * 起点 OSMID（源数据保留，不可作正式 FK）
     */
    @Column(name = "source_u_osmid", nullable = false)
    private Long sourceUOsmid;

    /**
     * 终点 OSMID（源数据保留，不可作正式 FK）
     */
    @Column(name = "source_v_osmid", nullable = false)
    private Long sourceVOsmid;

    /**
     * OSM edge key（与 u/v 组成唯一键）
     */
    @Column(name = "edge_key", nullable = false)
    private Integer edgeKey;

    // ---- OSM 元数据 ----

    /**
     * OSM way ID（复合字符串，不可作唯一键）
     */
    @Column(name = "osmid", length = 2000)
    private String osmid;

    /**
     * 道路名称
     */
    @Column(name = "name", length = 255)
    private String name;

    /**
     * 道路编号（G319, G50 等）
     */
    @Column(name = "ref", length = 100)
    private String ref;

    /**
     * 道路等级
     */
    @Column(name = "highway", nullable = false, length = 50)
    private String highway;

    /**
     * 是否单向
     */
    @Column(name = "oneway")
    private Boolean oneway;

    public void setOeway(Boolean oneway) {
        this.oneway = oneway;
    }

    public Boolean getOeway() {
        return this.oneway;
    }

    /**
     * 车道数
     */
    @Column(name = "lanes", length = 20)
    private String lanes;

    /**
     * 限速
     */
    @Column(name = "maxspeed", length = 20)
    private String maxspeed;

    /**
     * 路段长度（米），路网 Edge 长度/路径计算权重
     */
    @Column(name = "length_m", nullable = false)
    private Double lengthM;

    // ---- 桥隧属性（路段属性，非资产） ----

    /**
     * bridge 原始值
     */
    @Column(name = "bridge_raw", length = 50)
    private String bridgeRaw;

    /**
     * 是否桥梁段
     */
    @Column(name = "is_bridge")
    private Boolean isBridge;

    /**
     * tunnel 原始值
     */
    @Column(name = "tunnel_raw", length = 50)
    private String tunnelRaw;

    /**
     * 是否隧道段
     */
    @Column(name = "is_tunnel")
    private Boolean isTunnel;

    // ---- 行政区关联 ----

    /**
     * 行政区 FK
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "division_id", foreignKey = @ForeignKey(name = "fk_edge_division"))
    private AdministrativeDivision division;

    /**
     * 源数据 district_name（仅供参考，非正式关联）
     */
    @Column(name = "source_district_name", length = 50)
    private String sourceDistrictName;

    // ---- 空间数据 ----

    /**
     * 路段几何 (SRID 4326, WGS84)
     */
    @JdbcTypeCode(SqlTypes.GEOMETRY)
    @Column(name = "geom", nullable = false, columnDefinition = "LINESTRING NOT NULL SRID 4326")
    private LineString geom;

    // ---- 元数据 ----

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
