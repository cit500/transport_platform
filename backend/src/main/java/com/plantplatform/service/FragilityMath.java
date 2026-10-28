package com.plantplatform.service;

/**
 * 易损性计算核心：标准正态 CDF 与对数正态损伤概率。
 *
 * 冻结研究库（Seismic_Frontend_Fragility_Handoff_V1）中的概率用 Python 的
 * {@code 0.5*math.erfc(-z/sqrt(2))} 计算，本类给出等价的 Java 实现：
 * <pre>
 *   超越概率：P(DS ≥ DSi) = Φ( (ln IM − ln θi) / βi )
 *   状态概率：DS0 = 1−E1，DS1 = E1−E2，DS2 = E2−E3，DS3 = E3−E4，DS4 = E4
 * </pre>
 *
 * 关键约定与冻结库保持一致：
 * <ul>
 *   <li>概率闭合容差 1e-12，超出即视为计算失败；</li>
 *   <li>独立拟合的曲线在低强度段可能交叉，出现负状态概率时直接报错，
 *       不做排序、截断或兜底（与源实现 "no sorting/clipping/fallback" 一致）；</li>
 *   <li>IM 为 0 时超越概率取 0（对数极限），不做数值修补。</li>
 * </ul>
 *
 * 正态 CDF 通过 erfc 计算，erfc 用 a=0.5 的正则化不完全伽马函数求得：
 * 小宗量走全正项级数（无相消），大宗量走连分式，两者均接近机器精度，
 * 因此无需引入 commons-math 等第三方数学库。
 */
public final class FragilityMath {

    /** 状态概率闭合容差，与冻结库 tolerance 一致。 */
    public static final double CLOSURE_TOLERANCE = 1e-12;

    private static final double LOG_SQRT_PI = Math.log(Math.sqrt(Math.PI)); // lnΓ(1/2)
    private static final double SQRT_2 = Math.sqrt(2.0);
    private static final double EPS = 1e-16;
    private static final double FPMIN = 1e-300;
    private static final int MAX_ITER = 1000;

    private FragilityMath() { }

    /** 标准正态分布累积函数 Φ(z)。 */
    public static double normalCdf(double z) {
        return 0.5 * erfc(-z / SQRT_2);
    }

    /** 互补误差函数 erfc(x)，x 为任意有限值。 */
    public static double erfc(double x) {
        if (Double.isNaN(x)) return Double.NaN;
        if (x == Double.POSITIVE_INFINITY) return 0.0;
        if (x == Double.NEGATIVE_INFINITY) return 2.0;
        if (x < 0) return 2.0 - erfc(-x);
        double y = x * x;
        // erfc(x) = Q(1/2, x²)；小宗量用 P 的级数更稳（全正项），大宗量用 Q 的连分式
        return y < 1.5 ? 1.0 - lowerRegularizedGamma(y) : upperRegularizedGamma(y);
    }

    /** 单个损伤状态的超越概率 P(DS ≥ DSi)。 */
    public static double exceedance(double theta, double beta, double im) {
        if (im <= 0) return 0.0;
        return normalCdf((Math.log(im) - Math.log(theta)) / beta);
    }

    /**
     * 由四组（θ, β）算出 DS1–DS4 超越概率与 DS0–DS4 互斥状态概率。
     *
     * @param theta DS1–DS4 中位值，必须为正有限数
     * @param beta  DS1–DS4 对数标准差，必须为正有限数
     * @param im    强度指标取值，非负
     * @return 长度为 5 的 DS0–DS4 状态概率数组
     * @throws IllegalStateException 参数为非正值、曲线交叉产生负概率或概率不闭合
     */
    public static double[] stateProbabilities(double[] theta, double[] beta, double im) {
        if (theta == null || beta == null || theta.length != 4 || beta.length != 4) {
            throw new IllegalStateException("易损性参数不完整，需要 DS1–DS4 四组 θ/β");
        }
        for (int i = 0; i < 4; i++) {
            if (!isPositiveFinite(theta[i]) || !isPositiveFinite(beta[i])) {
                throw new IllegalStateException("易损性参数无效：θ 与 β 必须为正有限数");
            }
        }
        if (Double.isNaN(im) || im < 0) throw new IllegalStateException("强度指标无效：" + im);

        double[] exceedance = new double[4];
        for (int i = 0; i < 4; i++) exceedance[i] = exceedance(theta[i], beta[i], im);

        double[] states = new double[5];
        states[0] = 1.0 - exceedance[0];
        states[1] = exceedance[0] - exceedance[1];
        states[2] = exceedance[1] - exceedance[2];
        states[3] = exceedance[2] - exceedance[3];
        states[4] = exceedance[3];

        for (double p : states) {
            if (!isFinite(p) || p < 0.0 || p > 1.0) {
                throw new IllegalStateException("易损性曲线在当前强度下交叉或越界，拒绝给出结果（不做排序或截断）");
            }
        }
        double sum = kahanSum(states);
        if (Math.abs(sum - 1.0) > CLOSURE_TOLERANCE) {
            throw new IllegalStateException("损伤概率不闭合，和为 " + sum);
        }
        return states;
    }

    /** P(1/2, x)：级数展开，全正项，适用于 x 较小。 */
    private static double lowerRegularizedGamma(double x) {
        double a = 0.5;
        double ap = a;
        double sum = 1.0 / a;
        double del = sum;
        for (int n = 1; n <= MAX_ITER; n++) {
            ap += 1.0;
            del *= x / ap;
            sum += del;
            if (Math.abs(del) < Math.abs(sum) * EPS) break;
        }
        return sum * Math.exp(-x + a * Math.log(x) - LOG_SQRT_PI);
    }

    /** Q(1/2, x)：连分式展开（修正 Lentz 算法），适用于 x 较大。 */
    private static double upperRegularizedGamma(double x) {
        double a = 0.5;
        double b = x + 1.0 - a;
        double c = 1.0 / FPMIN;
        double d = 1.0 / b;
        double h = d;
        for (int i = 1; i <= MAX_ITER; i++) {
            double an = -i * (i - a);
            b += 2.0;
            d = an * d + b;
            if (Math.abs(d) < FPMIN) d = FPMIN;
            c = b + an / c;
            if (Math.abs(c) < FPMIN) c = FPMIN;
            d = 1.0 / d;
            double del = d * c;
            h *= del;
            if (Math.abs(del - 1.0) < EPS) break;
        }
        return Math.exp(-x + a * Math.log(x) - LOG_SQRT_PI) * h;
    }

    /** 补偿求和，降低五个状态概率相加时的舍入误差。 */
    private static double kahanSum(double[] values) {
        double sum = 0.0;
        double compensation = 0.0;
        for (double v : values) {
            double adjusted = v - compensation;
            double next = sum + adjusted;
            compensation = (next - sum) - adjusted;
            sum = next;
        }
        return sum;
    }

    private static boolean isFinite(double v) { return !Double.isNaN(v) && !Double.isInfinite(v); }

    private static boolean isPositiveFinite(double v) { return isFinite(v) && v > 0; }
}
