import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    root: '.',
    publicDir: false,
    server: {
        port: 3000,
        open: '/',
        // 代理配置：将 /api 请求转发到 Spring Boot 后端（端口 8080）
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
                // 后端不可用时不会报错，前端 API 层会自动降级
                timeout: 120000,
                proxyTimeout: 120000
            }
        }
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        cssCodeSplit: false
    },
    plugins: [vue()]
});
