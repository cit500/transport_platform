package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 隧道特有属性 — 对应 tunnel_attributes 表
 *
 * 存储隧道设计/基础属性。
 */
@Entity
@Table(name = "tunnel_attributes")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class TunnelAttributes {

    /**
     * 资产 ID (PK/FK)
     */
    @Id
    @Column(name = "asset_id")
    private Long assetId;

    /**
     * 关联资产主表
     */
    @OneToOne(fetch = FetchType.LAZY)
    @MapsId
    @JoinColumn(name = "asset_id")
    private TransportAsset asset;

    /**
     * 隧道类型：分离式/连拱/圆形等
     */
    @Column(name = "tunnel_type", length = 50)
    private String tunnelType;

    /**
     * 隧道长度 (米)
     */
    @Column(name = "tunnel_length_m")
    private BigDecimal tunnelLengthM;

    /**
     * 设计净高 (米)
     */
    @Column(name = "design_clearance_height_m")
    private BigDecimal designClearanceHeightM;

    /**
     * 设计净宽 (米)
     */
    @Column(name = "design_clearance_width_m")
    private BigDecimal designClearanceWidthM;

    /**
     * 车道数
     */
    @Column(name = "lane_count")
    private Integer laneCount;

    /**
     * 建成年份
     */
    @Column(name = "construction_year")
    private Integer constructionYear;
}
