package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 行政区划主数据 — 对应 administrative_divisions 表
 *
 * 以 chongqing_districts_county_fixed.geojson 中的 37 个行政区为空间基准。
 * 业务关联统一使用 division_id，不以 district_name 作为正式主键。
 *
 * 三层名称体系：
 *   canonical_name — 官方全称（如"酉阳土家族苗族自治县"）
 *   display_name  — 显示简称（如"酉阳县"）
 *   division_key  — 稳定标识（行政区编码，如"500242"）
 */
@Entity
@Table(name = "administrative_divisions")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AdministrativeDivision {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 稳定标识（行政区编码，如 500101）
     * 唯一索引，用于跨表关联
     */
    @Column(name = "division_key", nullable = false, unique = true, length = 20)
    private String divisionKey;

    /**
     * 官方全称（如"酉阳土家族苗族自治县"）
     * 来源：GeoJSON properties.district_name
     */
    @Column(name = "canonical_name", nullable = false, unique = true, length = 60)
    private String canonicalName;

    /**
     * 显示简称（如"酉阳县"）
     * 用于地图标签、tooltip 等 UI 显示
     * 显式配置，不通过字符串 replace 自动生成
     */
    @Column(name = "display_name", nullable = false, length = 30)
    private String displayName;

    /**
     * 行政区类型：district（区）/ county（县）/ special（特殊区域如两江新区）
     */
    @Column(name = "division_type", nullable = false, length = 20)
    private String divisionType;

    /**
     * 行政区几何（Polygon / MultiPolygon）
     * WGS84 坐标系，SRID 4326
     * 来源：GeoJSON geometry
     */
    @JdbcTypeCode(SqlTypes.GEOMETRY)
    @Column(name = "geom", columnDefinition = "geometry SRID 4326")
    private org.locationtech.jts.geom.Geometry geom;

    /**
     * 是否为当前活跃的行政区
     * 江北区、渝北区等 legacy 区县设为 false
     */
    @Column(name = "is_active", nullable = false)
    private Boolean isActive = true;
}
