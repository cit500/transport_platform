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
 * 交通资产主表 — 对应 transport_assets 表
 *
 * 存储桥梁/隧道正式资产基本信息。
 * 道路绑定必须通过 asset_road_relations 表，不直接保存 bound_edge_ids。
 */
@Entity
@Table(name = "transport_assets", uniqueConstraints = {
    @UniqueConstraint(columnNames = {"asset_code"})
})
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TransportAsset {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 资产编码，唯一标识
     */
    @Column(name = "asset_code", nullable = false, unique = true, length = 50)
    private String assetCode;

    /**
     * 资产类型：BRIDGE / TUNNEL
     */
    @Column(name = "asset_type", nullable = false, length = 20)
    private String assetType;

    /**
     * 资产名称
     */
    @Column(name = "asset_name", nullable = false, length = 200)
    private String assetName;

    /**
     * 行政区 FK
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "division_id", foreignKey = @ForeignKey(name = "fk_asset_division"))
    private AdministrativeDivision division;

    /**
     * 经度
     */
    @Column(name = "longitude")
    private Double longitude;

    /**
     * 纬度
     */
    @Column(name = "latitude")
    private Double latitude;

    /**
     * 空间几何点 (SRID 4326)
     */
    @JdbcTypeCode(SqlTypes.GEOMETRY)
    @Column(name = "geom", columnDefinition = "geometry SRID 4326")
    private Point geom;

    /**
     * 道路绑定状态：BOUND / PARTIAL / UNBOUND
     */
    @Column(name = "network_binding_status", nullable = false, length = 20)
    private String networkBindingStatus = "UNBOUND";

    /**
     * 数据来源：SEED / MANUAL / ROAD_CANDIDATE / IMPORTED
     */
    @Column(name = "source_type", nullable = false, length = 30)
    private String sourceType;

    /**
     * 来源引用（如候选ID、导入批次等）
     */
    @Column(name = "source_ref", length = 200)
    private String sourceRef;

    /**
     * 是否有效
     */
    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;

    /**
     * HOME-2: 资产图片路径（服务器相对路径）
     */
    @Column(name = "image_path", length = 500)
    private String imagePath;

    /**
     * 创建时间
     */
    @Column(name = "created_at", nullable = false)
    private LocalDateTime createdAt = LocalDateTime.now();

    /**
     * 更新时间
     */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt = LocalDateTime.now();
}
