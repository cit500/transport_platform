# -*- coding: utf-8 -*-
"""
重庆高速/快速路网离线数据质量检查脚本

用途：
1. 不重新下载 OSM 数据，只读取 gaosu/data/chongqing_roadnet 下的离线成果
2. 检查 GraphML / GPKG / GeoJSON / HTML 是否齐全
3. 检查边、节点、区县边界的字段、坐标系、几何有效性、区县归属、路网连通性
4. 输出 Markdown / JSON / CSV 报告，便于复制回传给 ChatGPT 继续判断是否可接入 Plant_v2

运行位置：
建议放在 gaosu/ 目录下，与 download_chongqing_expressway.py 同级运行。

安装依赖：
pip install geopandas shapely pandas networkx osmnx pyogrio

运行：
python roadnet_quality_check.py

可选：
python roadnet_quality_check.py --data-dir data/chongqing_roadnet
python roadnet_quality_check.py --max-sample 2000
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import traceback
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Tuple

import pandas as pd

try:
    import geopandas as gpd
except Exception as exc:
    print("缺少 geopandas，请先运行：pip install geopandas shapely pyogrio pandas networkx osmnx")
    raise exc

try:
    import networkx as nx
except Exception:
    nx = None

try:
    import osmnx as ox
except Exception:
    ox = None


# =========================
# 1. 可调整阈值
# =========================

THRESHOLDS = {
    # 区县归属缺失率。初步验证建议小于 1%
    "max_missing_district_rate": 0.01,

    # 无效几何比例。正常应接近 0
    "max_invalid_geometry_rate": 0.001,

    # 空几何比例。正常应为 0
    "max_empty_geometry_rate": 0.0,

    # 最大弱连通子图占比。高速路网可能因边界截断/匝道产生小组件，初步建议大于 70%
    "min_largest_weak_component_ratio": 0.70,

    # 区县数量下限。重庆实际区县数量口径可能因两江新区等统计方式略有差异；
    # OSM 如果真实下载区县边界，通常应接近 38。若为网格备用方案，也会接近 36。
    "min_district_count": 30,

    # 路网总里程下限，仅用于排除明显下载失败，不作为正式评估标准。
    "min_total_length_km": 1000.0,

    # 允许道路中点超出重庆区县边界的比例。边界截断、边界附近道路可能导致少量偏差。
    "max_midpoint_outside_district_rate": 0.03,
}


EXPECTED_FILES = {
    "graphml": "chongqing_expressway.graphml",
    "gpkg": "chongqing_expressway.gpkg",
    "edges": "chongqing_expressway_edges.geojson",
    "nodes": "chongqing_expressway_nodes.geojson",
    "districts": "chongqing_districts.geojson",
    "html": "verify_chongqing_expressway.html",
}

REQUIRED_EDGE_COLUMNS = [
    "u", "v", "key", "osmid", "name", "highway", "ref",
    "oneway", "lanes", "maxspeed", "length",
    "bridge", "tunnel", "district_name", "district_adcode",
]

REQUIRED_NODE_COLUMNS = ["osmid", "x", "y", "street_count"]

REQUIRED_DISTRICT_COLUMNS = ["district_name", "district_adcode"]

EXPECTED_HIGHWAY_KEYWORDS = ["motorway", "motorway_link", "trunk", "trunk_link"]


# =========================
# 2. 通用工具
# =========================

def now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def file_size_mb(path: Path) -> float:
    return path.stat().st_size / 1024 / 1024 if path.exists() else 0.0


def safe_float(x: Any, default: float = 0.0) -> float:
    try:
        if pd.isna(x):
            return default
        return float(x)
    except Exception:
        return default


def pass_warn_fail(
    condition_pass: bool,
    condition_warn: bool = False,
) -> str:
    if condition_pass:
        return "PASS"
    if condition_warn:
        return "WARN"
    return "FAIL"


def add_check(
    checks: List[Dict[str, Any]],
    item: str,
    status: str,
    value: Any,
    standard: str,
    suggestion: str = "",
):
    checks.append({
        "item": item,
        "status": status,
        "value": value,
        "standard": standard,
        "suggestion": suggestion,
    })


def status_icon(status: str) -> str:
    return {
        "PASS": "✅",
        "WARN": "⚠️",
        "FAIL": "❌",
        "SKIP": "⏭️",
    }.get(status, "")


def normalize_highway(value: Any) -> str:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return ""
    return str(value)


def highway_group(value: Any) -> str:
    s = normalize_highway(value)
    if "motorway_link" in s:
        return "motorway_link"
    if "motorway" in s:
        return "motorway"
    if "trunk_link" in s:
        return "trunk_link"
    if "trunk" in s:
        return "trunk"
    return s if s else "unknown"


def read_vector(path: Path, label: str) -> gpd.GeoDataFrame:
    try:
        gdf = gpd.read_file(path)
        return gdf
    except Exception as exc:
        raise RuntimeError(f"读取 {label} 失败：{path}\n{exc}") from exc


def ensure_crs(gdf: gpd.GeoDataFrame, fallback: str = "EPSG:4326") -> gpd.GeoDataFrame:
    if gdf.crs is None:
        return gdf.set_crs(fallback, allow_override=True)
    return gdf


def projected_length_km(gdf: gpd.GeoDataFrame) -> float:
    """
    计算几何长度。EPSG:3857 在大范围会有一定误差，但用于质量检查足够。
    正式里程统计可换成本地等距投影。
    """
    if len(gdf) == 0:
        return 0.0
    return float(gdf.to_crs("EPSG:3857").geometry.length.sum() / 1000.0)


def existing_length_km(edges: gpd.GeoDataFrame) -> float:
    if "length" not in edges.columns:
        return 0.0
    return float(edges["length"].apply(safe_float).sum() / 1000.0)


def geom_basic_stats(gdf: gpd.GeoDataFrame) -> Dict[str, Any]:
    total = len(gdf)
    empty_count = int(gdf.geometry.is_empty.sum()) if total else 0
    na_count = int(gdf.geometry.isna().sum()) if total else 0

    try:
        invalid_count = int((~gdf.geometry.is_valid).sum()) if total else 0
    except Exception:
        invalid_count = -1

    geom_types = gdf.geometry.geom_type.value_counts(dropna=False).to_dict() if total else {}

    return {
        "total": total,
        "empty_count": empty_count,
        "na_count": na_count,
        "invalid_count": invalid_count,
        "empty_rate": empty_count / total if total else None,
        "na_rate": na_count / total if total else None,
        "invalid_rate": invalid_count / total if total and invalid_count >= 0 else None,
        "geom_types": geom_types,
    }


# =========================
# 3. 核心检查
# =========================

def check_files(data_dir: Path, checks: List[Dict[str, Any]]) -> Dict[str, Path]:
    paths = {k: data_dir / v for k, v in EXPECTED_FILES.items()}

    for label, path in paths.items():
        exists = path.exists()
        size = file_size_mb(path)
        status = "PASS" if exists and size > 0 else "FAIL"
        add_check(
            checks,
            f"文件存在性：{label}",
            status,
            f"{path} | {size:.2f} MB",
            "文件必须存在且大小大于 0",
            "如果失败，先重新运行 download_chongqing_expressway.py"
        )

    return paths


def check_schema(
    edges: gpd.GeoDataFrame,
    nodes: gpd.GeoDataFrame,
    districts: gpd.GeoDataFrame,
    checks: List[Dict[str, Any]]
):
    edge_missing_cols = [c for c in REQUIRED_EDGE_COLUMNS if c not in edges.columns]
    node_missing_cols = [c for c in REQUIRED_NODE_COLUMNS if c not in nodes.columns]
    district_missing_cols = [c for c in REQUIRED_DISTRICT_COLUMNS if c not in districts.columns]

    add_check(
        checks,
        "edges 字段完整性",
        "PASS" if not edge_missing_cols else "FAIL",
        "缺失：" + ("无" if not edge_missing_cols else ", ".join(edge_missing_cols)),
        "应包含 u/v/key/osmid/name/highway/ref/length/district_name 等核心字段",
        "如果失败，检查下载脚本 keep_useful_edge_columns() 是否被修改"
    )

    add_check(
        checks,
        "nodes 字段完整性",
        "PASS" if not node_missing_cols else "FAIL",
        "缺失：" + ("无" if not node_missing_cols else ", ".join(node_missing_cols)),
        "应包含 osmid/x/y/street_count 等核心字段",
        "如果失败，检查下载脚本 keep_useful_node_columns() 是否被修改"
    )

    add_check(
        checks,
        "districts 字段完整性",
        "PASS" if not district_missing_cols else "FAIL",
        "缺失：" + ("无" if not district_missing_cols else ", ".join(district_missing_cols)),
        "应包含 district_name/district_adcode",
        "如果失败，检查区县边界清洗逻辑"
    )


def check_crs(
    edges: gpd.GeoDataFrame,
    nodes: gpd.GeoDataFrame,
    districts: gpd.GeoDataFrame,
    checks: List[Dict[str, Any]]
):
    for label, gdf in [("edges", edges), ("nodes", nodes), ("districts", districts)]:
        crs = str(gdf.crs) if gdf.crs else "None"
        # GeoJSON 常见读入后可能显示 EPSG:4326 或 OGC:CRS84，二者都可接受
        ok = ("4326" in crs) or ("CRS84" in crs)
        add_check(
            checks,
            f"{label} 坐标系",
            "PASS" if ok else "WARN",
            crs,
            "前端 Leaflet 使用建议为 EPSG:4326 / WGS84 / CRS84",
            "如果不是 WGS84，请在导出 GeoJSON 前统一 to_crs('EPSG:4326')"
        )


def check_geometry(gdf: gpd.GeoDataFrame, label: str, expected_types: Tuple[str, ...], checks: List[Dict[str, Any]]) -> Dict[str, Any]:
    stats = geom_basic_stats(gdf)

    invalid_rate = stats["invalid_rate"] if stats["invalid_rate"] is not None else 1.0
    empty_rate = stats["empty_rate"] if stats["empty_rate"] is not None else 1.0

    add_check(
        checks,
        f"{label} 空几何",
        "PASS" if stats["empty_count"] == 0 and stats["na_count"] == 0 else "FAIL",
        f"empty={stats['empty_count']}, null={stats['na_count']}, total={stats['total']}",
        "正常应为 0",
        "如果失败，删除空几何或回到下载阶段检查 OSM 要素"
    )

    add_check(
        checks,
        f"{label} 无效几何",
        "PASS" if invalid_rate <= THRESHOLDS["max_invalid_geometry_rate"] else "WARN",
        f"invalid={stats['invalid_count']}, rate={invalid_rate:.4%}",
        f"建议低于 {THRESHOLDS['max_invalid_geometry_rate']:.2%}",
        "少量无效几何可用 make_valid 修复；大量无效说明数据清洗有问题"
    )

    geom_types = set(stats["geom_types"].keys())
    unexpected = sorted([t for t in geom_types if t not in expected_types])
    add_check(
        checks,
        f"{label} 几何类型",
        "PASS" if not unexpected else "WARN",
        stats["geom_types"],
        f"期望类型：{', '.join(expected_types)}",
        "如果出现 GeometryCollection 或其他类型，正式接入前建议过滤或拆分"
    )

    return stats


def check_counts_and_lengths(
    edges: gpd.GeoDataFrame,
    nodes: gpd.GeoDataFrame,
    districts: gpd.GeoDataFrame,
    checks: List[Dict[str, Any]]
) -> Dict[str, Any]:
    geom_km = projected_length_km(edges)
    attr_km = existing_length_km(edges)
    district_count = int(districts["district_name"].nunique()) if "district_name" in districts.columns else 0

    add_check(
        checks,
        "路网边数量",
        "PASS" if len(edges) > 0 else "FAIL",
        len(edges),
        "edges 数量必须大于 0",
        "如果为 0，说明路网未成功下载或 GeoJSON 读取失败"
    )

    add_check(
        checks,
        "路网节点数量",
        "PASS" if len(nodes) > 0 else "FAIL",
        len(nodes),
        "nodes 数量必须大于 0",
        "如果为 0，说明节点文件未成功导出"
    )

    add_check(
        checks,
        "区县数量",
        "PASS" if district_count >= THRESHOLDS["min_district_count"] else "WARN",
        district_count,
        f"建议不少于 {THRESHOLDS['min_district_count']} 个；真实区县边界通常接近 38，网格备用通常接近 36",
        "如果显著偏少，说明 Overpass 行政边界下载或清洗过滤有问题"
    )

    # length 字段与几何长度可能因投影误差/方向边重复有所差异，只给 WARN
    length_diff_rate = abs(attr_km - geom_km) / geom_km if geom_km > 0 else 1.0

    add_check(
        checks,
        "路网总里程",
        "PASS" if max(attr_km, geom_km) >= THRESHOLDS["min_total_length_km"] else "WARN",
        f"length字段={attr_km:.2f} km, 几何估算={geom_km:.2f} km, 差异={length_diff_rate:.2%}",
        f"用于排除明显下载失败，建议高于 {THRESHOLDS['min_total_length_km']} km",
        "若远低于预期，检查 ROAD_FILTER 是否只保留了极少道路"
    )

    return {
        "edge_count": len(edges),
        "node_count": len(nodes),
        "district_count": district_count,
        "length_attr_km": attr_km,
        "length_geom_km": geom_km,
        "length_diff_rate": length_diff_rate,
    }


def check_district_assignment(
    edges: gpd.GeoDataFrame,
    districts: gpd.GeoDataFrame,
    checks: List[Dict[str, Any]],
    max_sample: int = 2000,
) -> Dict[str, Any]:
    result = {
        "missing_district_count": None,
        "missing_district_rate": None,
        "grid_district_count": None,
        "midpoint_outside_rate": None,
        "mismatch_sample_count": None,
    }

    if "district_name" not in edges.columns:
        add_check(
            checks,
            "道路区县归属字段",
            "FAIL",
            "edges 缺少 district_name",
            "每条边应具有 district_name 字段",
            "检查 keep_useful_edge_columns() 与 assign_district_by_midpoint()"
        )
        return result

    missing = int(edges["district_name"].isna().sum() + (edges["district_name"].astype(str).str.strip() == "").sum())
    total = len(edges)
    missing_rate = missing / total if total else 1.0

    result["missing_district_count"] = missing
    result["missing_district_rate"] = missing_rate

    add_check(
        checks,
        "道路区县归属缺失率",
        "PASS" if missing_rate <= THRESHOLDS["max_missing_district_rate"] else "WARN",
        f"{missing}/{total} = {missing_rate:.2%}",
        f"建议低于 {THRESHOLDS['max_missing_district_rate']:.2%}",
        "如果偏高，优先检查区县边界是否使用了网格备用、坐标系是否一致、道路是否位于边界外"
    )

    if "district_name" in districts.columns:
        grid_count = int(districts["district_name"].astype(str).str.startswith("网格_").sum())
        result["grid_district_count"] = grid_count
        add_check(
            checks,
            "区县边界是否为真实行政区",
            "WARN" if grid_count > 0 else "PASS",
            f"网格区县数量={grid_count}",
            "正式平台接入前建议使用真实区县边界，不建议用网格备用方案",
            "如果出现网格_，说明下载脚本使用了备用网格方案，需要重新下载真实区县边界"
        )

    # 抽样检查：道路中点是否落在任意区县面内
    try:
        sample = edges.copy()
        if len(sample) > max_sample:
            sample = sample.sample(max_sample, random_state=42)

        sample_proj = sample.to_crs("EPSG:3857")
        districts_proj = districts.to_crs("EPSG:3857")
        mid = sample_proj.copy()
        mid["geometry"] = mid.geometry.interpolate(0.5, normalized=True)

        joined = gpd.sjoin(
            mid,
            districts_proj[["district_name", "geometry"]],
            how="left",
            predicate="within"
        )
        # 去重，避免边界重叠
        joined = joined[~joined.index.duplicated(keep="first")]

        outside = int(joined["index_right"].isna().sum())
        outside_rate = outside / len(joined) if len(joined) else 1.0
        result["midpoint_outside_rate"] = outside_rate

        add_check(
            checks,
            "道路中点落入区县边界抽样检查",
            "PASS" if outside_rate <= THRESHOLDS["max_midpoint_outside_district_rate"] else "WARN",
            f"{outside}/{len(joined)} = {outside_rate:.2%}",
            f"建议低于 {THRESHOLDS['max_midpoint_outside_district_rate']:.2%}",
            "如果偏高，说明区县边界覆盖不完整或道路边界外截断较多"
        )
    except Exception as exc:
        add_check(
            checks,
            "道路中点落入区县边界抽样检查",
            "SKIP",
            str(exc)[:200],
            "能完成抽样空间连接检查更好",
            "一般是空间索引或几何问题，可先忽略但建议修复"
        )

    return result


def check_highway_distribution(
    edges: gpd.GeoDataFrame,
    checks: List[Dict[str, Any]]
) -> Tuple[pd.DataFrame, Dict[str, Any]]:
    if "highway" not in edges.columns:
        add_check(
            checks,
            "道路等级字段",
            "FAIL",
            "缺少 highway",
            "应保留 OSM highway 字段",
            "检查 keep_useful_edge_columns()"
        )
        return pd.DataFrame(), {}

    work = edges.copy()
    work["highway_group"] = work["highway"].apply(highway_group)
    if "length" in work.columns:
        work["length_m_num"] = work["length"].apply(safe_float)
    else:
        work["length_m_num"] = work.to_crs("EPSG:3857").geometry.length

    summary = (
        work.groupby("highway_group", dropna=False)
        .agg(edge_count=("highway_group", "size"), length_km=("length_m_num", lambda s: float(s.sum() / 1000.0)))
        .reset_index()
        .sort_values("length_km", ascending=False)
    )

    total = int(summary["edge_count"].sum())
    expected_count = int(summary[summary["highway_group"].isin(EXPECTED_HIGHWAY_KEYWORDS)]["edge_count"].sum())
    unexpected_count = total - expected_count
    unexpected_rate = unexpected_count / total if total else 1.0

    add_check(
        checks,
        "道路等级过滤结果",
        "PASS" if unexpected_rate <= 0.02 else "WARN",
        f"非 motorway/trunk 系列边数={unexpected_count}/{total} = {unexpected_rate:.2%}",
        "当前下载目标应主要为 motorway/motorway_link/trunk/trunk_link",
        "如果非目标等级偏多，检查 ROAD_FILTER 或 highway 字段字符串化结果"
    )

    motorway_count = int(summary[summary["highway_group"].isin(["motorway", "motorway_link"])]["edge_count"].sum())
    trunk_count = int(summary[summary["highway_group"].isin(["trunk", "trunk_link"])]["edge_count"].sum())

    add_check(
        checks,
        "高速与快速路分层可用性",
        "PASS" if motorway_count > 0 and trunk_count > 0 else "WARN",
        f"motorway系列={motorway_count}, trunk系列={trunk_count}",
        "如果平台要区分高速与快速路，两类最好都有数据；只做严格高速则 trunk 为 0 也可以",
        "后续接入 Plant_v2 时建议 motorway 与 trunk 做成两个逻辑图层"
    )

    return summary, {
        "unexpected_highway_count": unexpected_count,
        "unexpected_highway_rate": unexpected_rate,
        "motorway_series_count": motorway_count,
        "trunk_series_count": trunk_count,
    }


def check_connectivity(
    graphml_path: Path,
    edges: gpd.GeoDataFrame,
    nodes: gpd.GeoDataFrame,
    checks: List[Dict[str, Any]]
) -> Dict[str, Any]:
    result = {
        "graph_loaded": False,
        "graph_nodes": None,
        "graph_edges": None,
        "weak_component_count": None,
        "largest_weak_component_ratio": None,
    }

    if not graphml_path.exists():
        add_check(
            checks,
            "GraphML 连通性检查",
            "SKIP",
            "GraphML 文件不存在",
            "建议保留 GraphML 用于路径分析",
            "重新运行下载脚本生成 graphml"
        )
        return result

    if nx is None:
        add_check(
            checks,
            "GraphML 连通性检查",
            "SKIP",
            "未安装 networkx",
            "安装 networkx 后可检查路网连通性",
            "pip install networkx"
        )
        return result

    try:
        if ox is not None:
            G = ox.load_graphml(str(graphml_path))
        else:
            G = nx.read_graphml(str(graphml_path))

        result["graph_loaded"] = True
        result["graph_nodes"] = G.number_of_nodes()
        result["graph_edges"] = G.number_of_edges()

        if G.number_of_nodes() == 0:
            add_check(
                checks,
                "GraphML 节点数量",
                "FAIL",
                0,
                "GraphML 节点数必须大于 0",
                "重新生成 graphml"
            )
            return result

        if G.is_directed():
            components = list(nx.weakly_connected_components(G))
        else:
            components = list(nx.connected_components(G))

        sizes = sorted([len(c) for c in components], reverse=True)
        largest_ratio = sizes[0] / G.number_of_nodes() if sizes else 0.0

        result["weak_component_count"] = len(components)
        result["largest_weak_component_ratio"] = largest_ratio

        add_check(
            checks,
            "GraphML 与 GeoJSON 数量对照",
            "PASS" if G.number_of_nodes() > 0 and G.number_of_edges() > 0 else "FAIL",
            f"GraphML nodes={G.number_of_nodes()}, edges={G.number_of_edges()} | GeoJSON nodes={len(nodes)}, edges={len(edges)}",
            "GraphML 和 GeoJSON 数量不必完全一致，但不能为空",
            "如果差异极大，检查导出逻辑是否发生过滤"
        )

        add_check(
            checks,
            "路网弱连通性",
            "PASS" if largest_ratio >= THRESHOLDS["min_largest_weak_component_ratio"] else "WARN",
            f"连通分量数={len(components)}, 最大分量节点占比={largest_ratio:.2%}, Top5={sizes[:5]}",
            f"建议最大弱连通子图占比高于 {THRESHOLDS['min_largest_weak_component_ratio']:.0%}",
            "如果偏低，可能是路网被过度截断、仅保留高速导致多孤立组件，路径规划需只在最大连通子图或分区图中执行"
        )

    except Exception as exc:
        add_check(
            checks,
            "GraphML 连通性检查",
            "SKIP",
            str(exc)[:300],
            "能读取 GraphML 并计算连通分量",
            "若失败，检查 osmnx/networkx 版本或 GraphML 文件完整性"
        )

    return result


def create_length_by_district(edges: gpd.GeoDataFrame) -> pd.DataFrame:
    work = edges.copy()
    work["district_name"] = work.get("district_name", pd.Series(["未知"] * len(work))).fillna("未匹配")
    work["highway_group"] = work.get("highway", pd.Series(["unknown"] * len(work))).apply(highway_group)

    if "length" in work.columns:
        work["length_km"] = work["length"].apply(safe_float) / 1000.0
    else:
        work["length_km"] = work.to_crs("EPSG:3857").geometry.length / 1000.0

    pivot = (
        work.pivot_table(
            index="district_name",
            columns="highway_group",
            values="length_km",
            aggfunc="sum",
            fill_value=0
        )
        .reset_index()
    )
    numeric_cols = [c for c in pivot.columns if c != "district_name"]
    pivot["total_length_km"] = pivot[numeric_cols].sum(axis=1)
    pivot = pivot.sort_values("total_length_km", ascending=False)
    return pivot


def find_problem_samples(edges: gpd.GeoDataFrame, max_rows: int = 100) -> pd.DataFrame:
    cols = [c for c in ["u", "v", "key", "osmid", "name", "ref", "highway", "length", "district_name"] if c in edges.columns]
    problems = []

    if "district_name" in edges.columns:
        missing = edges[edges["district_name"].isna() | (edges["district_name"].astype(str).str.strip() == "")]
        if len(missing) > 0:
            tmp = missing[cols].head(max_rows).copy()
            tmp["problem"] = "district_name_missing"
            problems.append(tmp)

    try:
        invalid = edges[~edges.geometry.is_valid]
        if len(invalid) > 0:
            tmp = invalid[cols].head(max_rows).copy()
            tmp["problem"] = "invalid_geometry"
            problems.append(tmp)
    except Exception:
        pass

    empty = edges[edges.geometry.isna() | edges.geometry.is_empty]
    if len(empty) > 0:
        tmp = empty[cols].head(max_rows).copy()
        tmp["problem"] = "empty_geometry"
        problems.append(tmp)

    if "highway" in edges.columns:
        work = edges.copy()
        work["highway_group"] = work["highway"].apply(highway_group)
        unexpected = work[~work["highway_group"].isin(EXPECTED_HIGHWAY_KEYWORDS)]
        if len(unexpected) > 0:
            tmp = unexpected[cols + ["highway_group"]].head(max_rows).copy()
            tmp["problem"] = "unexpected_highway"
            problems.append(tmp)

    if problems:
        return pd.concat(problems, ignore_index=True).head(max_rows)

    return pd.DataFrame(columns=cols + ["problem"])


# =========================
# 4. 报告输出
# =========================

def overall_status(checks: List[Dict[str, Any]]) -> str:
    statuses = [c["status"] for c in checks]
    if "FAIL" in statuses:
        return "FAIL"
    if "WARN" in statuses:
        return "WARN"
    return "PASS"


def generate_markdown_report(
    output_path: Path,
    checks: List[Dict[str, Any]],
    metrics: Dict[str, Any],
    highway_summary: pd.DataFrame,
    district_length: pd.DataFrame,
    problem_samples: pd.DataFrame,
    data_dir: Path,
):
    status = overall_status(checks)

    lines = []
    lines.append("# 重庆高速/快速路网离线数据质量检查报告\n")
    lines.append(f"- 生成时间：{now_str()}")
    lines.append(f"- 数据目录：`{data_dir}`")
    lines.append(f"- 总体结论：**{status_icon(status)} {status}**")
    lines.append("")
    lines.append("## 1. 关键指标\n")

    key_order = [
        "edge_count", "node_count", "district_count",
        "length_attr_km", "length_geom_km", "length_diff_rate",
        "missing_district_count", "missing_district_rate",
        "grid_district_count", "midpoint_outside_rate",
        "unexpected_highway_count", "unexpected_highway_rate",
        "motorway_series_count", "trunk_series_count",
        "graph_nodes", "graph_edges",
        "weak_component_count", "largest_weak_component_ratio",
    ]

    for k in key_order:
        if k not in metrics:
            continue
        v = metrics[k]
        if isinstance(v, float):
            if "rate" in k or "ratio" in k:
                lines.append(f"- `{k}`：{v:.2%}")
            else:
                lines.append(f"- `{k}`：{v:.3f}")
        else:
            lines.append(f"- `{k}`：{v}")

    lines.append("\n## 2. 检查项明细\n")
    lines.append("| 状态 | 检查项 | 当前值 | 标准 | 建议 |")
    lines.append("|---|---|---|---|---|")
    for c in checks:
        lines.append(
            f"| {status_icon(c['status'])} {c['status']} | "
            f"{str(c['item']).replace('|', '/')} | "
            f"{str(c['value']).replace('|', '/')} | "
            f"{str(c['standard']).replace('|', '/')} | "
            f"{str(c['suggestion']).replace('|', '/')} |"
        )

    lines.append("\n## 3. 道路等级里程统计\n")
    if len(highway_summary) > 0:
        lines.append(highway_summary.to_markdown(index=False, floatfmt=".3f"))
    else:
        lines.append("无道路等级统计。")

    lines.append("\n## 4. 区县道路里程 Top 20\n")
    if len(district_length) > 0:
        lines.append(district_length.head(20).to_markdown(index=False, floatfmt=".3f"))
    else:
        lines.append("无区县里程统计。")

    lines.append("\n## 5. 问题样本\n")
    if len(problem_samples) > 0:
        lines.append(problem_samples.head(30).to_markdown(index=False))
    else:
        lines.append("未发现需要抽样列出的明显问题。")

    lines.append("\n## 6. 给 ChatGPT 的回传建议\n")
    lines.append("请将以下文件或内容回传：")
    lines.append("- `quality_report.md` 的全文或截图")
    lines.append("- `quality_report.json`")
    lines.append("- 如果有 WARN/FAIL，再附上 `edge_problem_samples.csv`")
    lines.append("")
    lines.append("判断标准建议：")
    lines.append("- 没有 FAIL；")
    lines.append("- 区县归属缺失率小于 1%；")
    lines.append("- 区县边界不是 `网格_` 备用方案；")
    lines.append("- motorway/trunk 分布符合预期；")
    lines.append("- 最大弱连通子图占比不低于 70%，或者能解释为高速边界截断/匝道导致。")

    output_path.write_text("\n".join(lines), encoding="utf-8")


def save_json_report(output_path: Path, checks: List[Dict[str, Any]], metrics: Dict[str, Any], data_dir: Path):
    payload = {
        "generated_at": now_str(),
        "data_dir": str(data_dir),
        "overall_status": overall_status(checks),
        "thresholds": THRESHOLDS,
        "metrics": metrics,
        "checks": checks,
    }
    output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


# =========================
# 5. 主程序
# =========================

def main():
    parser = argparse.ArgumentParser(description="重庆高速/快速路网离线数据质量检查")
    parser.add_argument(
        "--data-dir",
        default="data/chongqing_roadnet",
        help="路网数据目录，默认 data/chongqing_roadnet"
    )
    parser.add_argument(
        "--max-sample",
        type=int,
        default=2000,
        help="空间抽样检查最大边数，默认 2000"
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    report_md = data_dir / "quality_report.md"
    report_json = data_dir / "quality_report.json"
    highway_csv = data_dir / "road_length_by_highway.csv"
    district_csv = data_dir / "road_length_by_district.csv"
    problems_csv = data_dir / "edge_problem_samples.csv"

    checks: List[Dict[str, Any]] = []
    metrics: Dict[str, Any] = {}

    print("\n========== 重庆高速/快速路网离线数据质量检查 ==========")
    print(f"数据目录：{data_dir}")

    try:
        paths = check_files(data_dir, checks)

        print("\n[1/7] 读取 GeoJSON / GPKG / GraphML 产物 ...")
        edges = read_vector(paths["edges"], "edges")
        nodes = read_vector(paths["nodes"], "nodes")
        districts = read_vector(paths["districts"], "districts")

        edges = ensure_crs(edges)
        nodes = ensure_crs(nodes)
        districts = ensure_crs(districts)

        print(f"edges={len(edges)}, nodes={len(nodes)}, districts={len(districts)}")

        print("\n[2/7] 检查字段与坐标系 ...")
        check_schema(edges, nodes, districts, checks)
        check_crs(edges, nodes, districts, checks)

        print("\n[3/7] 检查几何质量 ...")
        metrics["edges_geometry"] = check_geometry(edges, "edges", ("LineString", "MultiLineString"), checks)
        metrics["nodes_geometry"] = check_geometry(nodes, "nodes", ("Point",), checks)
        metrics["districts_geometry"] = check_geometry(districts, "districts", ("Polygon", "MultiPolygon"), checks)

        print("\n[4/7] 检查数量、里程、区县数量 ...")
        metrics.update(check_counts_and_lengths(edges, nodes, districts, checks))

        print("\n[5/7] 检查区县归属 ...")
        metrics.update(check_district_assignment(edges, districts, checks, max_sample=args.max_sample))

        print("\n[6/7] 检查道路等级分布与连通性 ...")
        highway_summary, highway_metrics = check_highway_distribution(edges, checks)
        metrics.update(highway_metrics)
        metrics.update(check_connectivity(paths["graphml"], edges, nodes, checks))

        print("\n[7/7] 生成统计表与报告 ...")
        district_length = create_length_by_district(edges)
        problem_samples = find_problem_samples(edges)

        highway_summary.to_csv(highway_csv, index=False, encoding="utf-8-sig")
        district_length.to_csv(district_csv, index=False, encoding="utf-8-sig")
        problem_samples.to_csv(problems_csv, index=False, encoding="utf-8-sig")

        generate_markdown_report(
            output_path=report_md,
            checks=checks,
            metrics=metrics,
            highway_summary=highway_summary,
            district_length=district_length,
            problem_samples=problem_samples,
            data_dir=data_dir,
        )
        save_json_report(report_json, checks, metrics, data_dir)

        status = overall_status(checks)

        print("\n========== 检查完成 ==========")
        print(f"总体状态：{status_icon(status)} {status}")
        print(f"Markdown 报告：{report_md}")
        print(f"JSON 报告：{report_json}")
        print(f"道路等级统计：{highway_csv}")
        print(f"区县里程统计：{district_csv}")
        print(f"问题样本：{problems_csv}")

        print("\n建议回传给 ChatGPT：")
        print("1. quality_report.md 全文")
        print("2. quality_report.json")
        print("3. 如果存在 WARN/FAIL，再附 edge_problem_samples.csv 前几十行")

        if status == "PASS":
            print("\n结论：当前数据质量基本满足接入 Plant_v2 的前置条件。")
        elif status == "WARN":
            print("\n结论：当前数据可进入平台展示验证，但建议先查看 WARN 项，尤其是区县边界、缺失归属和连通性。")
        else:
            print("\n结论：存在 FAIL 项，建议修复后再接入 Plant_v2。")

    except Exception as exc:
        print("\n❌ 检查过程中发生错误：")
        print(str(exc))
        print("\n详细 traceback：")
        print(traceback.format_exc())
        sys.exit(1)


if __name__ == "__main__":
    main()
