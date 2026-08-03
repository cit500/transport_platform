package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 路网档案实体 — 对应 road_archives 表
 * 对应 mockData.js 中的 roadArchiveData 数组
 */
@Entity
@Table(name = "road_archives")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class RoadArchive {

    @Id
    @Column(length = 50)
    private String id;

    @Column(length = 100)
    private String name;

    @Column(length = 50)
    private String length;

    @Column(length = 50)
    private String category;

    private Integer lanes;

    @Column(length = 20)
    private String status;
}