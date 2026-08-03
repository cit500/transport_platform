package com.plantplatform.model;

import jakarta.persistence.*;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 仿真档案 — 对应 simulation_archives 表
 * 对应 mockData.js 中的 simulationArchiveData 数组
 */
@Entity
@Table(name = "simulation_archives")
@Data
@NoArgsConstructor
@AllArgsConstructor
public class SimulationArchive {

    @Id
    @Column(length = 50)
    private String id;

    @Column(length = 20)
    private String date;

    @Column(name = "sim_type", length = 50)
    private String type;          // 仿真类型

    @Column(length = 50)
    private String zone;          // 区域

    @Column(name = "loss_percent")
    private Integer lossPercent;  // 网络损失百分比

    @Column(length = 20)
    private String status;        // 状态
}