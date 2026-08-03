import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: '.',
    publicDir: 'public',
    server: {
        port: 3000,
        open: true,
        // 代理配置：将 /api 请求转发到 Spring Boot 后端（端口 8080）
        proxy: {
            '/api': {
                target: 'http://localhost:8080',
                changeOrigin: true,
                // 后端不可用时不会报错，前端 API 层会自动降级
                timeout: 3000
            }
        }
    },
    build: {
        outDir: 'dist',
        assetsDir: 'assets',
        cssCodeSplit: false
    },
    plugins: [
        viteSingleFile(),
        // 静态文件服务：将 gaosu 目录映射为可通过 /gaosu/ 路径访问
        {
            name: 'serve-gaosu',
            configureServer(server) {
                const gaosuDir = path.resolve(__dirname, 'gaosu');
                if (!fs.existsSync(gaosuDir)) return;
                server.middlewares.use(function (req, res, next) {
                    if (req.url && req.url.startsWith('/gaosu/')) {
                        var filePath = path.join(gaosuDir, req.url.replace('/gaosu/', ''));
                        if (fs.existsSync(filePath)) {
                            var ext = path.extname(filePath).toLowerCase();
                            var mimeTypes = { '.json': 'application/json', '.geojson': 'application/geo+json', '.html': 'text/html', '.js': 'application/javascript' };
                            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
                            res.setHeader('Access-Control-Allow-Origin', '*');
                            res.end(fs.readFileSync(filePath));
                            return;
                        }
                    }
                    next();
                });
            }
        }
    ]
});