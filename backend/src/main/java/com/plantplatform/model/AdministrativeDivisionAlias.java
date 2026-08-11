package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 行政区划别名 — 对应 administrative_division_aliases 表
 *
 * 支持多别名映射到同一个 division_id。
 * 例如："酉阳县" → 酉阳土家族苗族自治县，"江北区" → 两江新区（legacy）
 */
@Entity
@Table(name = "administrative_division_aliases",
       uniqueConstraints = @UniqueConstraint(columnNames = {"alias_name"}))
@Data
@NoArgsConstructor
@AllArgsConstructor
public class AdministrativeDivisionAlias {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * 别名字符串（如"酉阳县"、"江北区"）
     * 唯一索引
     */
    @Column(name = "alias_name", nullable = false, unique = true, length = 60)
    private String aliasName;

    /**
     * 关联的行政区 ID
     */
    @Column(name = "division_id", nullable = false)
    private Long divisionId;

    /**
     * 别名类型：
     *   short    — 缩写别名（如"石柱县" → "石柱土家族自治县"）
     *   legacy   — 历史区划别名（如"江北区" → "两江新区"）
     *   variant  — 变体名称
     */
    @Column(name = "alias_type", nullable = false, length = 20)
    private String aliasType;
}
