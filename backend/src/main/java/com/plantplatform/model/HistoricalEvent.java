package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 历史灾害事件 — 对应 historical_events 表
 * 对应 mockData.js 中的 historicalEvents 数组
 */
@Entity
@Table(name = "historical_events")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class HistoricalEvent {

    @Id
    @Column(length = 50)
    private String id;

    @Column(length = 50)
    private String time;

    @Column(length = 500)
    private String description;   // 事件描述

    @Column(length = 20)
    private String tag;           // 标签：warning/danger/success

    @Column(name = "tag_text", length = 20)
    private String tagText;       // 标签文字：预警/复盘/阻断/限载/完成

    private Double lat;

    private Double lng;

    @Column(name = "has_replay")
    private Boolean hasReplay;    // 是否有复盘
}