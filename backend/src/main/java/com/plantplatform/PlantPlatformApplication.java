package com.plantplatform;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

/**
 * 交通网络安全韧性评估平台 - 后端入口
 *
 * @SpringBootApplication = @Configuration + @EnableAutoConfiguration + @ComponentScan
 * 自动扫描 com.plantplatform 包及其子包下的所有组件
 */
@SpringBootApplication
public class PlantPlatformApplication {

    public static void main(String[] args) {
        SpringApplication.run(PlantPlatformApplication.class, args);
        System.out.println("================================");
        System.out.println("  🚀 平台后端启动成功!");
        System.out.println("  📡 API: http://localhost:8080/api");
        System.out.println("================================");
    }
}