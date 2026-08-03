package com.plantplatform.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;
import org.springframework.web.filter.CorsFilter;

/**
 * CORS 跨域配置
 *
 * 前端运行在 localhost:3000，后端运行在 localhost:8080
 * 浏览器的"同源策略"会阻止跨域请求，这个配置告诉浏览器允许跨域
 */
@Configuration
public class CorsConfig {

    @Bean
    public CorsFilter corsFilter() {
        CorsConfiguration config = new CorsConfiguration();
        // 允许所有来源（开发阶段）
        config.addAllowedOriginPattern("*");
        // 允许携带凭证（cookie等）
        config.setAllowCredentials(true);
        // 允许所有 HTTP 方法（GET, POST, PUT, DELETE 等）
        config.addAllowedMethod("*");
        // 允许所有请求头
        config.addAllowedHeader("*");

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return new CorsFilter(source);
    }
}