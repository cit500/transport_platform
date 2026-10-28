package com.plantplatform.service;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 易损性模型服务：从 fragility_model 表读取模型，按强度指标计算损伤状态概率。
 *
 * 地震模型参数逐值来自冻结研究库（对数正态中位值 θ 与对数标准差 β）；
 * 泥石流模型是平台默认参数，标注为待标定，仅用于输出可比对的相对结果。
 *
 * 概率计算全部委托 {@link FragilityMath}，本类负责取值、范围校验与结果组装。
 */
@Service
public class FragilityModelService {

    private final JdbcTemplate jdbc;

    public FragilityModelService(@Qualifier("platformJdbcTemplate") JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** 一条易损性曲线。platformAssetId 非空表示绑定到平台具体设施，空表示该资产类型的默认曲线。 */
    public record Model(long id, String hazardType, String assetType, String assetId, Long platformAssetId, String assetName,
                        String modelId, String modelVersion, String status, boolean evaluable, boolean published,
                        boolean allowResearch, String imType, String imUnit, Double validMin, Double validMax,
                        double[] theta, double[] beta, String sourceLabel, String limitations) { }

    private static final String COLUMNS = """
            id, hazard_type, asset_type, asset_id, platform_asset_id, asset_name, model_id, model_version, status,
            evaluable, published, allow_research, im_type, im_unit, valid_min, valid_max,
            theta_ds1, theta_ds2, theta_ds3, theta_ds4,
            beta_ds1, beta_ds2, beta_ds3, beta_ds4, source_label, limitations
            """;

    /** 列出可用模型，供界面选择；不含 θ/β 明细，避免把模型参数散落到前端。 */
    public List<Map<String,Object>> list(String hazardType, String assetType) {
        StringBuilder sql = new StringBuilder("SELECT id, hazard_type, asset_type, asset_id, platform_asset_id, asset_name, model_id, model_version,")
                .append(" status, evaluable, published, allow_research, im_type, im_unit, valid_min, valid_max,")
                .append(" source_label, limitations FROM fragility_model WHERE 1=1");
        List<Object> args = new ArrayList<>();
        if (hazardType != null && !hazardType.isBlank()) { sql.append(" AND hazard_type = ?"); args.add(hazardType); }
        if (assetType != null && !assetType.isBlank()) { sql.append(" AND asset_type = ?"); args.add(assetType); }
        sql.append(" ORDER BY evaluable DESC, published DESC, asset_type, id");
        try {
            return jdbc.queryForList(sql.toString(), args.toArray());
        } catch (DataAccessException e) {
            throw new IllegalStateException("读取易损性模型失败，请先执行 database/schema.sql 建表并导入 database/maintenance/seed_fragility_models.sql", e);
        }
    }

    public Model load(long id) {
        Map<String,Object> row;
        try {
            row = jdbc.queryForMap("SELECT " + COLUMNS + " FROM fragility_model WHERE id = ?", id);
        } catch (DataAccessException e) {
            throw new IllegalArgumentException("易损性模型不存在：id=" + id);
        }
        return toModel(row);
    }

    /**
     * 取默认模型：优先取绑定到该平台设施的曲线（platform_asset_id 匹配），
     * 没有绑定时回落到该资产类型的默认曲线（platform_asset_id IS NULL）。
     * 结构参数尚未参与匹配，匹配依据在结果中如实标注。
     */
    public Model defaultFor(String hazardType, String assetType, boolean allowResearch, Long platformAssetId) {
        List<Map<String,Object>> rows;
        try {
            rows = jdbc.queryForList("SELECT " + COLUMNS + """
                    FROM fragility_model
                    WHERE hazard_type = ? AND asset_type = ? AND evaluable = TRUE
                      AND (published = TRUE OR (allow_research = TRUE AND ? = TRUE))
                      AND (platform_asset_id IS NULL OR platform_asset_id = ?)
                    ORDER BY (platform_asset_id IS NOT NULL) DESC, published DESC, id
                    """, hazardType, assetType, allowResearch, platformAssetId);
        } catch (DataAccessException e) {
            throw new IllegalStateException("读取易损性模型失败，请确认 fragility_model 表与初始数据已导入", e);
        }
        if (rows.isEmpty()) {
            throw new IllegalStateException("没有可用于 " + assetType + " 的" + hazardType + "易损性模型"
                    + (allowResearch ? "" : "，可在界面勾选“允许使用研究参考模型”后重试"));
        }
        return toModel(rows.get(0));
    }

    /** 兼容旧签名：未提供设施绑定时按类型默认曲线解析。 */
    public Model defaultFor(String hazardType, String assetType, boolean allowResearch) {
        return defaultFor(hazardType, assetType, allowResearch, null);
    }

    /**
     * 计算单个强度指标下的损伤结果。
     *
     * @return 含超越概率、状态概率、主导损伤状态、超越 DS1 概率与外推标记的结果
     */
    public Map<String,Object> assess(Model model, double im) {
        if (model == null) throw new IllegalStateException("未指定易损性模型");
        if (!model.evaluable()) throw new IllegalStateException("模型 " + model.assetName() + " 为归档模型，不允许用于评估");
        if (!model.published() && !model.allowResearch()) {
            throw new IllegalStateException("模型 " + model.assetName() + " 未发布，需显式授权后才可评估");
        }

        double[] states = FragilityMath.stateProbabilities(model.theta(), model.beta(), im);
        Map<String,Object> exceedance = new LinkedHashMap<>();
        Map<String,Object> state = new LinkedHashMap<>();
        double previous = 0.0;
        for (int i = 0; i < 4; i++) {
            double ex = FragilityMath.exceedance(model.theta()[i], model.beta()[i], im);
            exceedance.put("DS" + (i + 1), round6(ex));
            previous = ex;
        }
        for (int i = 0; i < 5; i++) state.put("DS" + i, round6(states[i]));

        int dominant = 0;
        for (int i = 1; i < 5; i++) if (states[i] > states[dominant]) dominant = i;

        Map<String,Object> out = new LinkedHashMap<>();
        out.put("modelId", model.id());
        out.put("modelName", model.assetName());
        out.put("modelVersion", model.modelVersion());
        out.put("status", model.status());
        out.put("researchPreview", !model.published());
        out.put("imType", model.imType());
        out.put("imUnit", model.imUnit());
        out.put("imValue", round6(im));
        out.put("exceedanceProbabilities", exceedance);
        out.put("stateProbabilities", state);
        out.put("dominantDamageState", "DS" + dominant);
        out.put("damageProbability", round6(1.0 - states[0]));
        out.put("extrapolated", isExtrapolated(model, im));
        out.put("validRange", model.validMin() == null || model.validMax() == null
                ? null : List.of(model.validMin(), model.validMax()));
        out.put("matchBasis", model.platformAssetId() != null
                ? "已绑定该设施的专属曲线" : "按资产类型默认匹配，结构参数尚未参与");
        return out;
    }

    /** 曲线采样：返回逐点 {im, 超越概率, 状态概率}，用于前端绘制易损性曲线。 */
    public List<Map<String,Object>> curves(Model model, int points) {
        int count = Math.max(20, Math.min(points <= 0 ? 401 : points, 2000));
        double min = model.validMin() == null ? 0.01 : Math.max(model.validMin(), 1e-4);
        double max = model.validMax() == null ? 3.0 : model.validMax();
        if (max <= min) max = min * 10;
        List<Map<String,Object>> rows = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            double im = min + (max - min) * i / (count - 1.0);
            Map<String,Object> row = new LinkedHashMap<>();
            row.put("im", round6(im));
            try {
                double[] states = FragilityMath.stateProbabilities(model.theta(), model.beta(), im);
                for (int d = 1; d <= 4; d++) {
                    row.put("exceedanceDS" + d, round6(FragilityMath.exceedance(model.theta()[d - 1], model.beta()[d - 1], im)));
                }
                for (int d = 0; d < 5; d++) row.put("stateDS" + d, round6(states[d]));
            } catch (RuntimeException e) {
                // 曲线交叉的点不产出数值，前端按断点处理
                row.put("invalid", true);
            }
            rows.add(row);
        }
        return rows;
    }

    public boolean isExtrapolated(Model model, double im) {
        if (model.validMin() == null || model.validMax() == null) return false;
        return im < model.validMin() || im > model.validMax();
    }

    private static Model toModel(Map<String,Object> row) {
        double[] theta = {
                dbl(row.get("theta_ds1")), dbl(row.get("theta_ds2")),
                dbl(row.get("theta_ds3")), dbl(row.get("theta_ds4"))
        };
        double[] beta = {
                dbl(row.get("beta_ds1")), dbl(row.get("beta_ds2")),
                dbl(row.get("beta_ds3")), dbl(row.get("beta_ds4"))
        };
        return new Model(
                lng(row.get("id")), str(row.get("hazard_type")), str(row.get("asset_type")),
                str(row.get("asset_id")),
                row.get("platform_asset_id") == null ? null : lng(row.get("platform_asset_id")),
                str(row.get("asset_name")), str(row.get("model_id")),
                str(row.get("model_version")), str(row.get("status")),
                bool(row.get("evaluable")), bool(row.get("published")), bool(row.get("allow_research")),
                str(row.get("im_type")), str(row.get("im_unit")),
                row.get("valid_min") == null ? null : dbl(row.get("valid_min")),
                row.get("valid_max") == null ? null : dbl(row.get("valid_max")),
                theta, beta, str(row.get("source_label")), str(row.get("limitations")));
    }

    private static double round6(double v) { return Math.round(v * 1e6) / 1e6; }
    private static String str(Object v) { return v == null ? null : String.valueOf(v); }
    private static double dbl(Object v) { return v == null ? Double.NaN : Double.parseDouble(String.valueOf(v)); }
    private static long lng(Object v) { return v == null ? 0L : ((Number) v).longValue(); }
    private static boolean bool(Object v) {
        if (v == null) return false;
        if (v instanceof Boolean b) return b;
        return "1".equals(String.valueOf(v)) || "true".equalsIgnoreCase(String.valueOf(v));
    }
}
