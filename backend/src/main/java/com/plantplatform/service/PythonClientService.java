package com.plantplatform.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.Map;

/**
 * Python 算法服务客户端
 *
 * 通过 HTTP 调用 Python 算法服务（占位阶段）
 * 当前 Python 只返回模拟数据，不做实际计算
 */
@Service
public class PythonClientService {

    @Value("${python.service.url}")
    private String pythonServiceUrl;

    private final RestTemplate restTemplate = new RestTemplate();

    /**
     * 调用 Python 重车路径安全规避计算
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> calculateRoute(Map<String, Object> params) {
        try {
            String url = pythonServiceUrl + "/api/calculate-route";
            return restTemplate.postForObject(url, params, Map.class);
        } catch (Exception e) {
            System.err.println("[PythonClient] 调用路径计算失败: " + e.getMessage());
            // Python 服务不可用时，返回 null，让 Controller 降级到 mock
            return null;
        }
    }

    /**
     * 调用 Python 多灾种仿真解算
     */
    @SuppressWarnings("unchecked")
    public Map<String, Object> simulateDisaster(Map<String, Object> params) {
        try {
            String url = pythonServiceUrl + "/api/simulate-disaster";
            return restTemplate.postForObject(url, params, Map.class);
        } catch (Exception e) {
            System.err.println("[PythonClient] 调用灾害仿真失败: " + e.getMessage());
            return null;
        }
    }
}