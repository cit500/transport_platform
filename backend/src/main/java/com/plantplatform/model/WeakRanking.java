package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 薄弱环节排序 — 对应 weak_rankings 表
 * 对应 mockData.js 中的 weakRankings 数组
 */
@Entity
@Table(name = "weak_rankings")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class WeakRanking {

    @Id
    private Integer rank;

    @Column(length = 200)
    private String name;

    private Double impact;        // 影响因子
}