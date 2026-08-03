# -*- coding: utf-8 -*-
"""
修复重庆高速/快速路网 district_name 归属问题

适用场景：
quality_report.md 中出现：
- district_count 很大，例如 154；
- road_length_by_district 中几乎全部里程归到“重庆市”；
- 说明空间连接匹配到了市级大面，而不是区县级面。

本脚本做什么：
1. 读取 data/chongqing_roadnet/chongqing_expressway_edges.geojson
2. 读取 data/chongqing_roadnet/chongqing_districts.geojson
3. 从 districts 中过滤出县级区划面，排除“重庆市”等大面
4. 对道路边的中点重新做空间连接
5. 同一条边如果匹配多个面，优先选择面积更小的区县面
6. 输出修正后的 edges GeoJSON、districts GeoJSON、统计 CSV、修正报告

运行：
python fix_roadnet_district_assignment.py

可选：
python fix_roadnet_district_assignment.py --mode auto
python fix_roadnet_district_assignment.py --mode current_37
python fix_roadnet_district_assignment.py --mode legacy_38
python fix_roadnet_district_assignment.py --overwrite

输出：
data/chongqing_roadnet/
├── chongqing_expressway_edges_district_fixed.geojson
├── chongqing_districts_county_fixed.geojson
├── road_length_by_district_fixed.csv
└── district_fix_report.md
"""

from __future__ import annotations

import argparse
import shutil
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple

import geopandas as gpd
import pandas as pd


DATA_DIR = Path("data/chongqing_roadnet")

EDGES_PATH = DATA_DIR / "chongqing_expressway_edges.geojson"
DISTRICTS_PATH = DATA_DIR / "chongqing_districts.geojson"

FIXED_EDGES_PATH = DATA_DIR / "chongqing_expressway_edges_district_fixed.geojson"
FIXED_DISTRICTS_PATH = DATA_DIR / "chongqing_districts_county_fixed.geojson"
FIXED_DISTRICT_LENGTH_CSV = DATA_DIR / "road_length_by_district_fixed.csv"
FIX_REPORT_PATH = DATA_DIR / "district_fix_report.md"

# 2026口径：重庆市辖37个区县（自治县），包括两江新区、25个区、8个县、4个自治县。
CURRENT_37_NAMES = {
    "两江新区",
    "万州区", "黔江区", "涪陵区", "渝中区", "大渡口区",
    "沙坪坝区", "九龙坡区", "南岸区", "北碚区", "巴南区",
    "长寿区", "江津区", "合川区", "永川区", "南川区",
    "綦江区", "大足区", "璧山区", "铜梁区", "潼南区",
    "荣昌区", "开州区", "梁平区", "武隆区",
    "城口县", "丰都县", "垫江县", "忠县", "云阳县",
    "奉节县", "巫山县", "巫溪县",
    "石柱土家族自治县", "秀山土家族苗族自治县",
    "酉阳土家族苗族自治县", "彭水苗族土家族自治县",
}

# 旧口径：38个区县（含江北区、渝北区，不含两江新区）。
LEGACY_38_NAMES = {
    "万州区", "黔江区", "涪陵区", "渝中区", "大渡口区",
    "江北区", "沙坪坝区", "九龙坡区", "南岸区", "北碚区",
    "渝北区", "巴南区", "长寿区", "江津区", "合川区",
    "永川区", "南川区", "綦江区", "大足区", "璧山区",
    "铜梁区", "潼南区", "荣昌区", "开州区", "梁平区",
    "武隆区",
    "城口县", "丰都县", "垫江县", "忠县", "云阳县",
    "奉节县", "巫山县", "巫溪县",
    "石柱土家族自治县", "秀山土家族苗族自治县",
    "酉阳土家族苗族自治县", "彭水苗族土家族自治县",
}


def ensure_crs(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    if gdf.crs is None:
        return gdf.set_crs("EPSG:4326", allow_override=True)
    return gdf.to_crs("EPSG:4326")


def norm_name(x) -> str:
    if pd.isna(x):
        return ""
    return str(x).strip()


def highway_group(value) -> str:
    s = "" if pd.isna(value) else str(value)
    if "motorway_link" in s:
        return "motorway_link"
    if "motorway" in s:
        return "motorway"
    if "trunk_link" in s:
        return "trunk_link"
    if "trunk" in s:
        return "trunk"
    return s or "unknown"


def choose_mode(districts: gpd.GeoDataFrame, mode: str) -> Tuple[str, set, Dict[str, int]]:
    names = set(districts["district_name_clean"].dropna().astype(str).tolist())

    current_hit = len(names & CURRENT_37_NAMES)
    legacy_hit = len(names & LEGACY_38_NAMES)

    stats = {
        "current_37_hit": current_hit,
        "legacy_38_hit": legacy_hit,
    }

    if mode == "current_37":
        return mode, CURRENT_37_NAMES, stats
    if mode == "legacy_38":
        return mode, LEGACY_38_NAMES, stats
    if mode != "auto":
        raise ValueError("--mode 只能是 auto / current_37 / legacy_38")

    # 自动选择命中数量更多的一套。
    # 如果当前口径和旧口径命中差不多，优先 current_37。
    if current_hit >= legacy_hit:
        return "current_37", CURRENT_37_NAMES, stats
    return "legacy_38", LEGACY_38_NAMES, stats


def filter_county_districts(districts: gpd.GeoDataFrame, mode: str) -> Tuple[gpd.GeoDataFrame, str, Dict[str, int]]:
    if "district_name" not in districts.columns:
        raise ValueError("districts 缺少 district_name 字段")

    districts = districts.copy()
    districts["district_name_clean"] = districts["district_name"].apply(norm_name)

    selected_mode, whitelist, hit_stats = choose_mode(districts, mode)

    # 白名单优先：避免“重庆市”大面、邻近地市、重复市县级面进入。
    filtered = districts[districts["district_name_clean"].isin(whitelist)].copy()

    # 如果白名单命中过少，做一个保守兜底：排除重庆市，仅保留典型县级名称。
    if len(filtered) < 25:
        mask = (
            districts["district_name_clean"].str.endswith(("区", "县", "自治县"))
            & (districts["district_name_clean"] != "重庆市")
            & (~districts["district_name_clean"].str.startswith("网格_"))
        )
        filtered = districts[mask].copy()
        selected_mode = f"{selected_mode}_fallback_suffix_filter"

    # 同名多面去重：保留面积最大的那个面。
    # 注意这里是每个区县自己的最大几何，不是全市大面。
    work = filtered.to_crs("EPSG:3857").copy()
    work["__area_m2"] = work.geometry.area
    work = work.sort_values("__area_m2", ascending=False)
    work = work.drop_duplicates(subset=["district_name_clean"], keep="first").copy()
    work = work.drop(columns=["__area_m2"]).to_crs("EPSG:4326")

    work["district_name"] = work["district_name_clean"]
    if "district_adcode" not in work.columns:
        work["district_adcode"] = None

    return work[["district_name", "district_adcode", "geometry"]].copy(), selected_mode, hit_stats


def assign_district_smallest_polygon(edges: gpd.GeoDataFrame, districts: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    edges = edges.copy()
    edges["__edge_index"] = range(len(edges))

    edges_proj = edges.to_crs("EPSG:3857")
    districts_proj = districts.to_crs("EPSG:3857").copy()
    districts_proj["__district_area_m2"] = districts_proj.geometry.area

    midpoints = edges_proj.copy()
    midpoints["geometry"] = midpoints.geometry.interpolate(0.5, normalized=True)

    # 删除 midpoints 中已有的 district 列，避免 sjoin 后列名冲突（出现 _left/_right 后缀）
    for col in ["district_name", "district_adcode"]:
        if col in midpoints.columns:
            midpoints = midpoints.drop(columns=[col])

    joined = gpd.sjoin(
        midpoints,
        districts_proj[["district_name", "district_adcode", "__district_area_m2", "geometry"]],
        how="left",
        predicate="within",
    )

    # 一条边如果匹配多个面，选择面积更小的面，防止又被大范围面覆盖。
    joined = joined.sort_values(["__edge_index", "__district_area_m2"], ascending=[True, True])
    joined = joined.drop_duplicates(subset=["__edge_index"], keep="first")

    joined = joined.set_index("__edge_index").reindex(edges["__edge_index"])

    edges["district_name"] = joined["district_name"].values
    edges["district_adcode"] = joined["district_adcode"].values

    edges = edges.drop(columns=["__edge_index"])
    return edges


def calculate_length_by_district(edges: gpd.GeoDataFrame) -> pd.DataFrame:
    work = edges.copy()
    work["district_name"] = work["district_name"].fillna("未匹配").replace("", "未匹配")
    work["highway_group"] = work["highway"].apply(highway_group) if "highway" in work.columns else "unknown"

    if "length" in work.columns:
        work["length_km"] = pd.to_numeric(work["length"], errors="coerce").fillna(0) / 1000.0
    else:
        work["length_km"] = work.to_crs("EPSG:3857").geometry.length / 1000.0

    pivot = work.pivot_table(
        index="district_name",
        columns="highway_group",
        values="length_km",
        aggfunc="sum",
        fill_value=0,
    ).reset_index()

    numeric_cols = [c for c in pivot.columns if c != "district_name"]
    pivot["total_length_km"] = pivot[numeric_cols].sum(axis=1)
    return pivot.sort_values("total_length_km", ascending=False)


def write_report(
    mode_used: str,
    hit_stats: Dict[str, int],
    raw_district_count: int,
    fixed_district_count: int,
    missing_count: int,
    missing_rate: float,
    assigned_unique_count: int,
    chongqing_length_km: float,
    total_length_km: float,
    length_by_district: pd.DataFrame,
):
    lines = []
    lines.append("# 重庆高速路网区县归属修正报告\n")
    lines.append(f"- 生成时间：{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    lines.append(f"- 使用模式：`{mode_used}`")
    lines.append(f"- current_37 命中数：{hit_stats.get('current_37_hit')}")
    lines.append(f"- legacy_38 命中数：{hit_stats.get('legacy_38_hit')}")
    lines.append(f"- 原始 district 面数量：{raw_district_count}")
    lines.append(f"- 修正后县级 district 面数量：{fixed_district_count}")
    lines.append(f"- 实际分配到的区县数量：{assigned_unique_count}")
    lines.append(f"- 未匹配边数：{missing_count}")
    lines.append(f"- 未匹配率：{missing_rate:.2%}")
    lines.append(f"- 分配到“重庆市”的里程：{chongqing_length_km:.3f} km")
    lines.append(f"- 总里程：{total_length_km:.3f} km")
    lines.append("")
    lines.append("## 判断")
    if fixed_district_count >= 30 and assigned_unique_count >= 20 and missing_rate < 0.01 and chongqing_length_km < total_length_km * 0.05:
        lines.append("✅ 区县归属修正基本可用，可以进入 Plant_v2 接入准备。")
    else:
        lines.append("⚠️ 区县归属仍需检查。重点看是否仍大量归到“重庆市”，或修正后区县数量过少。")
    lines.append("")
    lines.append("## 区县道路里程 Top 30")
    lines.append(length_by_district.head(30).to_markdown(index=False, floatfmt=".3f"))

    FIX_REPORT_PATH.write_text("\n".join(lines), encoding="utf-8")


def main():
    global DATA_DIR, EDGES_PATH, DISTRICTS_PATH, FIXED_EDGES_PATH, FIXED_DISTRICTS_PATH, FIXED_DISTRICT_LENGTH_CSV, FIX_REPORT_PATH

    parser = argparse.ArgumentParser(description="修复重庆高速/快速路网 district_name 归属")
    parser.add_argument("--data-dir", default=str(DATA_DIR), help="数据目录，默认 data/chongqing_roadnet")
    parser.add_argument("--mode", default="auto", choices=["auto", "current_37", "legacy_38"], help="区县口径")
    parser.add_argument("--overwrite", action="store_true", help="用修正后的 edges 覆盖原 chongqing_expressway_edges.geojson，覆盖前会备份")
    args = parser.parse_args()

    DATA_DIR = Path(args.data_dir)
    EDGES_PATH = DATA_DIR / "chongqing_expressway_edges.geojson"
    DISTRICTS_PATH = DATA_DIR / "chongqing_districts.geojson"
    FIXED_EDGES_PATH = DATA_DIR / "chongqing_expressway_edges_district_fixed.geojson"
    FIXED_DISTRICTS_PATH = DATA_DIR / "chongqing_districts_county_fixed.geojson"
    FIXED_DISTRICT_LENGTH_CSV = DATA_DIR / "road_length_by_district_fixed.csv"
    FIX_REPORT_PATH = DATA_DIR / "district_fix_report.md"

    print("\n========== 重庆高速路网区县归属修正 ==========")
    print(f"数据目录：{DATA_DIR}")

    edges = ensure_crs(gpd.read_file(EDGES_PATH))
    districts_raw = ensure_crs(gpd.read_file(DISTRICTS_PATH))

    print(f"读取 edges：{len(edges)} 条")
    print(f"读取 districts：{len(districts_raw)} 个面")

    districts_fixed, mode_used, hit_stats = filter_county_districts(districts_raw, args.mode)

    print(f"模式：{mode_used}")
    print(f"current_37 命中数：{hit_stats.get('current_37_hit')}")
    print(f"legacy_38 命中数：{hit_stats.get('legacy_38_hit')}")
    print(f"修正后县级区划面：{len(districts_fixed)} 个")
    print("区县名称：")
    print("、".join(sorted(districts_fixed["district_name"].tolist())))

    if len(districts_fixed) < 25:
        print("\n⚠️ 修正后区县面少于 25 个，可能原始 districts 文件不包含足够县级边界。")
        print("仍会继续输出结果，但建议回到下载脚本阶段重新获取区县边界。")

    edges_fixed = assign_district_smallest_polygon(edges, districts_fixed)

    missing_mask = edges_fixed["district_name"].isna() | (edges_fixed["district_name"].astype(str).str.strip() == "")
    missing_count = int(missing_mask.sum())
    missing_rate = missing_count / len(edges_fixed) if len(edges_fixed) else 1.0

    length_by_district = calculate_length_by_district(edges_fixed)
    total_length_km = float(length_by_district["total_length_km"].sum()) if len(length_by_district) else 0.0
    cq_row = length_by_district[length_by_district["district_name"] == "重庆市"]
    chongqing_length_km = float(cq_row["total_length_km"].sum()) if len(cq_row) else 0.0
    assigned_unique_count = int(edges_fixed["district_name"].dropna().nunique())

    print(f"\n未匹配边数：{missing_count}/{len(edges_fixed)} = {missing_rate:.2%}")
    print(f"实际分配到的区县数量：{assigned_unique_count}")
    print(f"分配到“重庆市”的里程：{chongqing_length_km:.3f} km")

    print("\n保存修正结果 ...")
    edges_fixed.to_file(FIXED_EDGES_PATH, driver="GeoJSON")
    districts_fixed.to_file(FIXED_DISTRICTS_PATH, driver="GeoJSON")
    length_by_district.to_csv(FIXED_DISTRICT_LENGTH_CSV, index=False, encoding="utf-8-sig")

    write_report(
        mode_used=mode_used,
        hit_stats=hit_stats,
        raw_district_count=len(districts_raw),
        fixed_district_count=len(districts_fixed),
        missing_count=missing_count,
        missing_rate=missing_rate,
        assigned_unique_count=assigned_unique_count,
        chongqing_length_km=chongqing_length_km,
        total_length_km=total_length_km,
        length_by_district=length_by_district,
    )

    print(f"修正 edges：{FIXED_EDGES_PATH}")
    print(f"修正 districts：{FIXED_DISTRICTS_PATH}")
    print(f"区县里程统计：{FIXED_DISTRICT_LENGTH_CSV}")
    print(f"修正报告：{FIX_REPORT_PATH}")

    if args.overwrite:
        backup_path = EDGES_PATH.with_suffix(".geojson.bak")
        shutil.copy2(EDGES_PATH, backup_path)
        shutil.copy2(FIXED_EDGES_PATH, EDGES_PATH)
        print(f"\n已覆盖原 edges 文件，原文件备份为：{backup_path}")

    print("\n完成。请打开 district_fix_report.md 查看修正后是否还大量归到“重庆市”。")


if __name__ == "__main__":
    main()