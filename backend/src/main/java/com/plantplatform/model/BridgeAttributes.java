package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.math.BigDecimal;

/**
 * 桥梁特有属性 — 对应 bridge_attributes 表
 *
 * 存储桥梁设计/基础属性，不保存当前动态限载。
 */
@Entity
@Table(name = "bridge_attributes")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class BridgeAttributes {

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
     * 结构类型：悬索桥/斜拉桥/拱桥/梁桥等
     */
    @Column(name = "structure_type", length = 50)
    private String structureType;

    /**
     * 桥梁总长 (米)
     */
    @Column(name = "total_length_m")
    private BigDecimal totalLengthM;

    /**
     * 最大跨径 (米)
     */
    @Column(name = "max_span_m")
    private BigDecimal maxSpanM;

    /**
     * 跨径配置描述
     */
    @Column(name = "span_configuration", length = 500)
    private String spanConfiguration;

    /**
     * 设计荷载等级
     */
    @Column(name = "design_load", length = 50)
    private String designLoad;

    /**
     * 设计荷载 (吨)
     */
    @Column(name = "design_load_t")
    private BigDecimal designLoadT;

    /**
     * 桥面宽度 (米)
     */
    @Column(name = "deck_width_m")
    private BigDecimal deckWidthM;

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
     * 建成年份
     */
    @Column(name = "construction_year")
    private Integer constructionYear;
}
