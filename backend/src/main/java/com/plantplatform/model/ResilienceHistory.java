package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 韧性历史趋势 — 对应 resilience_history 表
 * 对应 mockData.js 中的 resilienceHistory 数组
 * （原来是对象套数组，这里简化：每个月一条记录）
 */
@Entity
@Table(name = "resilience_history")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class ResilienceHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(length = 20)
    private String label;          // 月份标签，如 "1月"

    private Double connectivity;   // 连通度

    private Double efficiency;     // 网络效率
}