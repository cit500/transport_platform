package com.plantplatform.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 本地开发用的 .env 文件加载器。
 *
 * Spring Boot 不会自动读取 .env 文件，而数字人助手的密钥只允许保存在 Git 忽略的
 * .env.llm.local 中（application.yml 受版本跟踪，禁止写入密钥）。本类在 Spring 容器
 * 启动前把该文件里的键值对写入 JVM 系统属性，使 application.yml 中的
 * ${PLANT_LLM_API_KEY:} 这类占位符能够解析到。
 *
 * 取值优先级：真实环境变量 &gt; 本文件。文件不存在时静默跳过，不打印密钥内容。
 * 仅用于本地开发；服务器部署一般没有该文件，也不受影响。
 */
public final class EnvFileLoader {

    private static final Logger log = LoggerFactory.getLogger(EnvFileLoader.class);

    /** 默认文件名；可用环境变量 PLANT_ENV_FILE 指向其他路径。 */
    private static final String FILE_NAME = ".env.llm.local";
    private static final String PATH_OVERRIDE = "PLANT_ENV_FILE";
    /** 从当前工作目录向上查找的层数，覆盖在 backend/ 子目录启动的场景。 */
    private static final int MAX_UPWARD_LEVELS = 4;

    private static final Pattern LINE = Pattern.compile("^\\s*([A-Za-z_][A-Za-z0-9_]*)\\s*=\\s*(.*?)\\s*$");

    private EnvFileLoader() { }

    /** 载入配置，返回实际写入的键数量。 */
    public static int load() {
        Path file = locate();
        if (file == null || !Files.isRegularFile(file)) {
            log.debug("未找到 {}，跳过本地环境变量载入", FILE_NAME);
            return 0;
        }
        int loaded = 0;
        try {
            for (String raw : Files.readAllLines(file, StandardCharsets.UTF_8)) {
                if (raw.isBlank() || raw.trim().startsWith("#")) continue;
                Matcher matcher = LINE.matcher(raw);
                if (!matcher.matches()) continue;
                String key = matcher.group(1);
                String value = stripQuotes(matcher.group(2));
                String fromEnv = System.getenv(key);
                if (fromEnv != null && !fromEnv.isBlank()) continue;
                System.setProperty(key, value);
                loaded++;
            }
        } catch (IOException e) {
            log.warn("读取 {} 失败：{}", file, e.getMessage());
            return 0;
        }
        log.info("已从 {} 载入 {} 项本地配置（文件受 Git 忽略，内容不打印）", file, loaded);
        return loaded;
    }

    /** 定位文件：PLANT_ENV_FILE 显式指定优先，否则从工作目录逐级向上找。 */
    private static Path locate() {
        String override = System.getenv(PATH_OVERRIDE);
        if (override == null || override.isBlank()) override = System.getProperty(PATH_OVERRIDE);
        if (override != null && !override.isBlank()) return Paths.get(override.trim());

        Path dir = Paths.get(System.getProperty("user.dir", ".")).toAbsolutePath().normalize();
        for (int level = 0; level <= MAX_UPWARD_LEVELS && dir != null; level++) {
            Path candidate = dir.resolve(FILE_NAME);
            if (Files.isRegularFile(candidate)) return candidate;
            dir = dir.getParent();
        }
        return null;
    }

    private static String stripQuotes(String value) {
        if (value.length() >= 2) {
            char first = value.charAt(0);
            char last = value.charAt(value.length() - 1);
            if ((first == '"' || first == '\'') && first == last) {
                return value.substring(1, value.length() - 1);
            }
        }
        return value;
    }
}
