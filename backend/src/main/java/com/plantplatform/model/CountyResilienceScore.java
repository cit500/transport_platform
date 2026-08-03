package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 区县韧性指数 — 对应 county_resilience_scores 表
 * 对应 mockData.js 中的 countyResilienceScores 数组
 */
@Entity
@Table(name = "county_resilience_scores")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class CountyResilienceScore {

    @Id
    @Column(length = 50)
    private String name;          // 区县名称

    @Column(nullable = false)
    private Integer score;        // 韧性指数 0~100
}