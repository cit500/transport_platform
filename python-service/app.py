"""
交通网络安全韧性评估平台 - Python 算法服务

当前为占位阶段，所有接口返回模拟数据
后续将接入真实算法：
  1. 重车路径安全规避 (A* + 限载约束)
  2. 多灾种仿真推演 (NetworkX 图论分析)
  3. 韧性评分计算

启动方式: python app.py
服务地址: http://localhost:5000
"""

from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # 允许跨域


# ==================== 辅助数据 ====================

# 安全推荐保通路径 (5个坐标点)
SAFE_PATH = [
    [29.5628, 106.5514],
    [29.5710, 106.5650],
    [29.5800, 106.5780],
    [29.5900, 106.5900],
    [29.6010, 106.6050],
]

# 常规最短路径 (7个坐标点，中间3段有阻断)
SHORT_PATH = [
    [29.5628, 106.5514],
    [29.5550, 106.5400],
    [29.5480, 106.5280],
    [29.5600, 106.5150],
    [29.5750, 106.5250],
    [29.5900, 106.5400],
    [29.6010, 106.6050],
]

# 阻断点位
BLOCK_POINTS = [
    {
        "description": "G75 兰海高速 K1054+200 桥面单幅承重超限",
        "lat": 29.5550,
        "lng": 106.5400,
    },
    {
        "description": "G93 成渝环线 K512+800 对桥梁影响较大",
        "lat": 29.5480,
        "lng": 106.5280,
    },
    {
        "description": "G50 沪渝高速 K1691+300 桥梁技术状况较差",
        "lat": 29.5600,
        "lng": 106.5150,
    },
]

# 方案对比卡片
PLAN_CARDS = [
    {
        "title": "安全推荐保通路",
        "tag": "推荐",
        "tagColor": "green",
        "length": "35.6km",
        "time": "42min",
        "limit": "全线限载55t",
        "risk": "低",
    },
    {
        "title": "常规最短路径",
        "tag": "有风险",
        "tagColor": "red",
        "length": "28.3km",
        "time": "31min",
        "limit": "多处≤40t",
        "risk": "高",
    },
]

# 灾害热力点
HEAT_POINTS = [
    {"lat": 29.5989, "lng": 106.5409, "intensity": 0.95},
    {"lat": 29.6130, "lng": 106.5780, "intensity": 0.75},
    {"lat": 29.5630, "lng": 106.5130, "intensity": 0.55},
    {"lat": 29.5500, "lng": 106.5950, "intensity": 0.35},
    {"lat": 29.6350, "lng": 106.5500, "intensity": 0.15},
]

# 受影响桥梁
AFFECTED_BRIDGES = [
    "BR_510100_0045", "BR_510100_0046",
    "BR_510100_0047", "BR_510100_0048",
]


# ==================== API 接口 ====================

@app.route("/api/calculate-route", methods=["POST"])
def calculate_route():
    """
    重车路径安全规避计算（占位）
    
    请求体: { weights: float, startLng: float, startLat: float, endLng: float, endLat: float, ... }
    响应: 安全路径 + 阻断标记 + 方案对比
    """
    # 打印接收到的参数（后续调试用）
    params = request.get_json(silent=True) or {}
    print(f"[Python] 收到路径计算请求: {params}")

    return jsonify({
        "safePath": SAFE_PATH,
        "shortPath": SHORT_PATH,
        "blockPoints": BLOCK_POINTS,
        "safeLength": "35.6km",
        "shortLength": "28.3km",
        "blockLength": "6.8km",
        "planCards": PLAN_CARDS,
    })


@app.route("/api/simulate-disaster", methods=["POST"])
def simulate_disaster():
    """
    多灾种仿真解算（占位）
    
    请求体: { disasterType: str, magnitude: float, depth: float, epicenterLat: float, epicenterLng: float, ... }
    响应: 热力影响点 + 受影响桥梁 + 韧性损失
    """
    params = request.get_json(silent=True) or {}
    print(f"[Python] 收到灾害仿真请求: {params}")

    return jsonify({
        "heatPoints": HEAT_POINTS,
        "affectedBridges": AFFECTED_BRIDGES,
        "loss": {
            "efficiencyLoss": "45%",
            "connectivity": "0.43",
            "isolatedNodes": [
                "G65包茂高速 K1635+200",
                "G5001绕城高速 K128+600",
            ],
        },
    })


@app.route("/api/health", methods=["GET"])
def health():
    """健康检查"""
    return jsonify({"status": "ok", "service": "python-algorithm-service"})


# ==================== 启动 ====================

if __name__ == "__main__":
    print("=" * 50)
    print("  🐍 Python 算法服务启动中...")
    print(f"  📡 API: http://localhost:5000")
    print("  📋 接口列表:")
    print("     POST /api/calculate-route   - 路径计算")
    print("     POST /api/simulate-disaster  - 灾害仿真")
    print("     GET  /api/health             - 健康检查")
    print("=" * 50)
    app.run(host="0.0.0.0", port=5000, debug=True)