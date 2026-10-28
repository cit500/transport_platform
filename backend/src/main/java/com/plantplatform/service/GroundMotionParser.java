package com.plantplatform.service;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 地震动记录解析：从 AT2（PEER 格式）或纯数值 TXT 中取 PGA 与持时。
 *
 * 规则与冻结研究库 src/ground_motion_reader.py 保持一致：
 * <ul>
 *   <li>TXT 必须无表头、每行一个有限数值，单位需调用方显式给出，不猜测；</li>
 *   <li>AT2 在前 20 行内查找同时含 NPTS 与 DT 的表头，表头区需含 ACCELERATION 关键字；</li>
 *   <li>支持新式 {@code NPTS= 2800, DT= .0100} 与旧式 {@code 2800 0.0100 NPTS, DT}；</li>
 *   <li>数据点数必须等于 NPTS；调用方给的 DT 与表头不一致（相对误差 1e-10）即报错；</li>
 *   <li>PGA = max(|a|) × 单位系数，内部统一为 g，重力加速度取 9.81；</li>
 *   <li>持时 = (NPTS − 1) × DT，DT 缺失时持时为 null 并给出提示。</li>
 * </ul>
 * 不做滤波、归一化或动力分析。
 */
public final class GroundMotionParser {

    public static final double GRAVITY = 9.81;
    private static final int MAX_FILE_BYTES = 20 * 1024 * 1024;
    private static final int HEADER_SCAN_LINES = 20;

    private static final Pattern AT2_HEADER = Pattern.compile(
            "NPTS\\s*=\\s*([0-9]+)\\s*,\\s*DT\\s*=\\s*([0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?)", Pattern.CASE_INSENSITIVE);
    private static final Pattern AT2_HEADER_LEGACY = Pattern.compile(
            "^\\s*([0-9]+)\\s+([0-9]*\\.?[0-9]+(?:[eE][-+]?[0-9]+)?)\\s+NPTS\\s*,\\s*DT", Pattern.CASE_INSENSITIVE);

    private GroundMotionParser() { }

    /** 解析结果。 */
    public record GroundMotion(String filename, String format, Integer npts, Double dt,
                               Double durationS, double pgaG, String unitOriginal, List<String> warnings) { }

    /**
     * @param content  文件文本
     * @param filename 原始文件名，用于判断格式
     * @param unit     调用方声明的单位（g / m/s2 / cm/s2 / gal 等），可为空表示由 AT2 表头决定
     * @param dt       调用方提供的时间步，可为空
     */
    public static GroundMotion parse(String content, String filename, String unit, Double dt) {
        if (content == null || content.isBlank()) throw new IllegalArgumentException("地震动文件内容为空");
        if (content.getBytes().length > MAX_FILE_BYTES) throw new IllegalArgumentException("地震动文件超过 20MB");
        String lower = filename == null ? "" : filename.toLowerCase(Locale.ROOT);
        return lower.endsWith(".at2") ? parseAt2(content, filename, unit, dt) : parseTxt(content, filename, unit, dt);
    }

    private static GroundMotion parseTxt(String content, String filename, String unit, Double dt) {
        List<String> warnings = new ArrayList<>();
        String resolvedUnit = normalizeUnit(unit);
        if (resolvedUnit == null) {
            throw new IllegalArgumentException("TXT 文件没有表头，必须由调用方显式指定单位（g / m·s⁻² / cm·s⁻²）");
        }
        double[] values = readNumbers(content, filename);
        double factor = unitFactor(resolvedUnit);
        double peak = 0.0;
        for (double v : values) peak = Math.max(peak, Math.abs(v));
        double pga = peak * factor;
        Double duration = null;
        if (dt != null && dt > 0) duration = (values.length - 1) * dt;
        else warnings.add("未提供 DT，仅能给出 PGA，持时不可用");
        return new GroundMotion(filename, "TXT", values.length, dt, duration, pga, resolvedUnit, warnings);
    }

    private static GroundMotion parseAt2(String content, String filename, String unit, Double dt) {
        List<String> warnings = new ArrayList<>();
        String[] lines = content.split("\\R");
        int headerLine = -1;
        Integer npts = null;
        Double headerDt = null;
        int scan = Math.min(lines.length, HEADER_SCAN_LINES);
        for (int i = 0; i < scan; i++) {
            String line = lines[i];
            Matcher m = AT2_HEADER.matcher(line);
            if (m.find()) {
                headerLine = i;
                npts = Integer.parseInt(m.group(1));
                headerDt = Double.parseDouble(m.group(2));
                break;
            }
            Matcher legacy = AT2_HEADER_LEGACY.matcher(line);
            if (legacy.find()) {
                headerLine = i;
                npts = Integer.parseInt(legacy.group(1));
                headerDt = Double.parseDouble(legacy.group(2));
                break;
            }
        }
        if (headerLine < 0) throw new IllegalArgumentException("Invalid AT2: NPTS/DT header not found");

        StringBuilder header = new StringBuilder();
        for (int i = 0; i < headerLine; i++) header.append(lines[i]).append('\n');
        if (!header.toString().toUpperCase(Locale.ROOT).contains("ACCELERATION")) {
            throw new IllegalArgumentException("AT2 表头缺少 ACCELERATION 关键字");
        }

        String headerUnit = null;
        for (String line : header.toString().split("\\R")) {
            int idx = line.toUpperCase(Locale.ROOT).indexOf("UNITS OF");
            if (idx >= 0) {
                headerUnit = normalizeUnit(line.substring(idx + "UNITS OF".length()).replaceAll("[^A-Za-z0-9/\\.\\^\\-]", ""));
                break;
            }
        }
        String resolvedUnit = unit == null || unit.isBlank() ? headerUnit : normalizeUnit(unit);
        if (resolvedUnit == null) throw new IllegalArgumentException("无法确定单位：AT2 表头与调用方都未给出");
        if (headerUnit != null && unit != null && !unit.isBlank() && !headerUnit.equals(normalizeUnit(unit))) {
            throw new IllegalArgumentException("单位冲突：AT2 表头为 " + headerUnit + "，调用方指定为 " + normalizeUnit(unit));
        }

        Double resolvedDt = dt;
        if (resolvedDt == null || resolvedDt <= 0) resolvedDt = headerDt;
        else if (headerDt != null && Math.abs(resolvedDt - headerDt) > headerDt * 1e-10) {
            throw new IllegalArgumentException("DT 不一致：表头 " + headerDt + "，调用方 " + resolvedDt);
        }

        double[] values = new double[0];
        List<Double> collected = new ArrayList<>();
        for (int i = headerLine + 1; i < lines.length; i++) {
            for (String token : lines[i].trim().split("[\\s,]+")) {
                if (token.isEmpty()) continue;
                try {
                    collected.add(Double.parseDouble(token.replace('D', 'E').replace('d', 'e')));
                } catch (NumberFormatException ignored) { /* 表头残留行跳过 */ }
            }
        }
        values = new double[collected.size()];
        for (int i = 0; i < values.length; i++) values[i] = collected.get(i);

        if (values.length != npts) {
            throw new IllegalArgumentException("AT2 NPTS mismatch：表头声明 " + npts + "，实际读到 " + values.length + " 个点");
        }
        double factor = unitFactor(resolvedUnit);
        double peak = 0.0;
        for (double v : values) peak = Math.max(peak, Math.abs(v));
        Double duration = resolvedDt == null ? null : (npts - 1) * resolvedDt;
        if (duration == null) warnings.add("DT unavailable; PGA-based rapid assessment remains available.");
        return new GroundMotion(filename, "PEER_AT2", npts, resolvedDt, duration, peak * factor, resolvedUnit, warnings);
    }

    private static double[] readNumbers(String content, String filename) {
        List<Double> values = new ArrayList<>();
        String[] lines = content.split("\\R");
        for (String raw : lines) {
            String line = raw.trim();
            if (line.isEmpty()) continue;
            String[] parts = line.split("[\\s,]+");
            if (parts.length != 1) {
                throw new IllegalArgumentException("TXT 每行必须恰好一个数值，第 " + (values.size() + 1) + " 行不合规则：" + line);
            }
            try {
                double v = Double.parseDouble(parts[0].replace('D', 'E').replace('d', 'e'));
                if (!Double.isFinite(v)) throw new NumberFormatException();
                values.add(v);
            } catch (NumberFormatException e) {
                throw new IllegalArgumentException("TXT 第 " + (values.size() + 1) + " 行不是有限数值：" + line);
            }
        }
        if (values.isEmpty()) throw new IllegalArgumentException("TXT 文件没有有效数据：" + filename);
        double[] out = new double[values.size()];
        for (int i = 0; i < out.length; i++) out[i] = values.get(i);
        return out;
    }

    /** 单位归一化：gal 视为 cm/s²，兼容 m/s^2、m/sec2 等写法。 */
    public static String normalizeUnit(String unit) {
        if (unit == null) return null;
        String u = unit.trim().toLowerCase(Locale.ROOT).replaceAll("\\s", "");
        if (u.isEmpty()) return null;
        return switch (u) {
            case "g", "gravity" -> "g";
            case "m/s2", "m/s^2", "m/sec2", "m/sec^2", "m/s/s", "ms-2", "m·s-2" -> "m/s2";
            case "cm/s2", "cm/s^2", "cm/sec2", "cm/sec^2", "gal", "cm·s-2" -> "cm/s2";
            default -> null;
        };
    }

    public static double unitFactor(String unit) {
        return switch (unit) {
            case "g" -> 1.0;
            case "m/s2" -> 1.0 / GRAVITY;
            case "cm/s2" -> 0.01 / GRAVITY;
            default -> throw new IllegalArgumentException("不支持的单位：" + unit);
        };
    }
}
