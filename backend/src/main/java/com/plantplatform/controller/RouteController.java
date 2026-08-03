package com.plantplatform.controller;

import com.plantplatform.service.PythonClientService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.*;

/**
 * 路径规划 API
 * 调用 Python 算法服务进行重车通行安全评估
 *
 * 当前 Python 服务未启动时，使用本地模拟数据降级
 */
@RestController
@RequestMapping("/api/route")
public class RouteController {

    @Autowired
    private PythonClientService pythonClientService;

    /**
     * POST /api/route/calculate
     * 重车路径安全规避计算
     *
     * @param params { weights, startLng, startLat, endLng, endLat, ... }
     * @return 安全路径和阻断标记
     */
    @PostMapping("/calculate")
    public ResponseEntity<Map<String, Object>> calculateRoute(@RequestBody Map<String, Object> params) {
        // 先尝试调用 Python 算法服务
        Map<String, Object> result = pythonClientService.calculateRoute(params);

        // Python 不可用时，返回模拟数据（与前端 mockData.js 格式一致）
        if (result == null) {
            result = getMockRouteResult();
        }

        return ResponseEntity.ok(result);
    }

    /**
     * 模拟路径计算结果
     * 格式与 HeavyVehicleModule.js 中的 heavyVehicleRouteResult 一致
     */
    private Map<String, Object> getMockRouteResult() {
        Map<String, Object> result = new LinkedHashMap<>();

        // 安全推荐保通路径
        List<List<Double>> safePath = Arrays.asList(
            Arrays.asList(29.5628, 106.5514),
            Arrays.asList(29.5710, 106.5650),
            Arrays.asList(29.5800, 106.5780),
            Arrays.asList(29.5900, 106.5900),
            Arrays.asList(29.6010, 106.6050)
        );

        // 常规最短路径（有风险）
        List<List<Double>> shortPath = Arrays.asList(
            Arrays.asList(29.5628, 106.5514),
            Arrays.asList(29.5550, 106.5400),
            Arrays.asList(29.5480, 106.5280),
            Arrays.asList(29.5600, 106.5150),
            Arrays.asList(29.5750, 106.5250),
            Arrays.asList(29.5900, 106.5400),
            Arrays.asList(29.6010, 106.6050)
        );

        // 阻断标记
        List<Map<String, Object>> blockPoints = Arrays.asList(
            createBlockPoint("G75 兰海高速 K1054+200 桥面单幅承重超限", 29.5550, 106.5400),
            createBlockPoint("G93 成渝环线 K512+800 对桥梁影响较大", 29.5480, 106.5280),
            createBlockPoint("G50 沪渝高速 K1691+300 桥梁技术状况较差", 29.5600, 106.5150)
        );

        result.put("safePath", safePath);
        result.put("shortPath", shortPath);
        result.put("blockPoints", blockPoints);
        result.put("safeLength", "35.6km");
        result.put("shortLength", "28.3km");
        result.put("blockLength", "6.8km");

        // 方案对比卡片
        Map<String, Object> card1 = new LinkedHashMap<>();
        card1.put("title", "安全推荐保通路");
        card1.put("tag", "推荐");
        card1.put("tagColor", "green");
        card1.put("length", "35.6km");
        card1.put("time", "42min");
        card1.put("limit", "全线限载55t");
        card1.put("risk", "低");

        Map<String, Object> card2 = new LinkedHashMap<>();
        card2.put("title", "常规最短路径");
        card2.put("tag", "有风险");
        card2.put("tagColor", "red");
        card2.put("length", "28.3km");
        card2.put("time", "31min");
        card2.put("limit", "多处≤40t");
        card2.put("risk", "高");

        result.put("planCards", Arrays.asList(card1, card2));

        return result;
    }

    private Map<String, Object> createBlockPoint(String desc, double lat, double lng) {
        Map<String, Object> point = new LinkedHashMap<>();
        point.put("description", desc);
        point.put("lat", lat);
        point.put("lng", lng);
        return point;
    }
}