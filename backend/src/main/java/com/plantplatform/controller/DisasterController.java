package com.plantplatform.controller;

import com.plantplatform.service.PythonClientService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 灾害仿真 API
 * 调用 Python 算法服务进行多灾种仿真推演
 *
 * 当前 Python 服务未启动时，使用本地模拟数据降级
 */
@RestController
@RequestMapping("/api/disaster")
public class DisasterController {

    @Autowired
    private PythonClientService pythonClientService;

    /**
     * POST /api/disaster/simulate
     * 多灾种仿真解算
     *
     * @param params { disasterType, magnitude, depth, epicenterLat, epicenterLng, ... }
     * @return 仿真结果（热力图点、受影响桥梁、韧性损失等）
     */
    @PostMapping("/simulate")
    public ResponseEntity<Map<String, Object>> simulate(@RequestBody Map<String, Object> params) {
        Map<String, Object> result = pythonClientService.simulateDisaster(params);

        if (result == null) {
            result = getMockDisasterResult();
        }

        return ResponseEntity.ok(result);
    }

    /**
     * 模拟灾害仿真结果
     * 格式与 DisasterModule.js 中的 disasterSimResult 一致
     */
    private Map<String, Object> getMockDisasterResult() {
        Map<String, Object> result = new LinkedHashMap<>();

        // 热力影响点
        List<Map<String, Object>> heatPoints = new ArrayList<>();
        double[][] heatData = {
            {29.5989, 106.5409, 0.95},
            {29.6130, 106.5780, 0.75},
            {29.5630, 106.5130, 0.55},
            {29.5500, 106.5950, 0.35},
            {29.6350, 106.5500, 0.15}
        };
        for (double[] d : heatData) {
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("lat", d[0]);
            p.put("lng", d[1]);
            p.put("intensity", d[2]);
            heatPoints.add(p);
        }

        // 受影响桥梁UUID
        List<String> affectedBridges = Arrays.asList(
            "BR_510100_0045", "BR_510100_0046",
            "BR_510100_0047", "BR_510100_0048"
        );

        // 韧性损失
        Map<String, Object> loss = new LinkedHashMap<>();
        loss.put("efficiencyLoss", "45%");
        loss.put("connectivity", "0.43");
        loss.put("isolatedNodes", Arrays.asList("G65包茂高速 K1635+200", "G5001绕城高速 K128+600"));

        result.put("heatPoints", heatPoints);
        result.put("affectedBridges", affectedBridges);
        result.put("loss", loss);

        return result;
    }
}