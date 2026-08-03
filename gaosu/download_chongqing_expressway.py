# -*- coding: utf-8 -*-
"""
下载重庆市全域高速/快速路网，并保存为本地 GIS 数据与 HTML 验证地图。

功能：
1. 从 OpenStreetMap 下载重庆市范围内的高速/快速路网
2. 转换为 node-edge 结构
3. 下载重庆区县行政边界
4. 给道路边绑定所属区县
5. 保存为 GraphML / GeoPackage / GeoJSON
6. 生成 folium HTML 地图用于人工验证

安装依赖：
pip install osmnx geopandas shapely folium pyogrio pandas networkx

运行：
python download_chongqing_expressway.py
"""

from pathlib import Path
import warnings

import osmnx as ox
import geopandas as gpd
import pandas as pd
import folium
from shapely.geometry import Point

warnings.filterwarnings("ignore", category=UserWarning)

# =========================
# 1. 基础参数
# =========================

PLACE_NAME = "Chongqing, China"

# 如果只要严格高速公路，改成：
# ROAD_FILTER = '["highway"~"motorway|motorway_link"]'
#
# 如果要“高速 + 城市快速路/高等级干线”，建议使用当前配置：
ROAD_FILTER = '["highway"~"motorway|motorway_link|trunk|trunk_link"]'

# 是否做严格区县切分。
# False：用道路中点判断所属区县，速度快，适合初步验证。
# True：用行政区边界切分道路，跨区县道路会被切成多段，速度较慢。
EXACT_SPLIT = False

OUT_DIR = Path("data/chongqing_roadnet")
OUT_DIR.mkdir(parents=True, exist_ok=True)

GRAPHML_PATH = OUT_DIR / "chongqing_expressway.graphml"
GPKG_PATH = OUT_DIR / "chongqing_expressway.gpkg"
EDGES_GEOJSON_PATH = OUT_DIR / "chongqing_expressway_edges.geojson"
NODES_GEOJSON_PATH = OUT_DIR / "chongqing_expressway_nodes.geojson"
DISTRICTS_GEOJSON_PATH = OUT_DIR / "chongqing_districts.geojson"
VERIFY_HTML_PATH = OUT_DIR / "verify_chongqing_expressway.html"

# OSMnx 设置
ox.settings.use_cache = True
ox.settings.log_console = True
ox.settings.timeout = 600
ox.settings.memory = 1024 * 1024 * 1024


# =========================
# 2. 工具函数
# =========================

def stringify_complex_columns(gdf: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    GeoJSON / GeoPackage 不适合直接保存 list/dict 类型字段。
    OSM 的 name/ref/highway 有时是 list，这里统一转为字符串。
    """
    gdf = gdf.copy()
    for col in gdf.columns:
        if col == "geometry":
            continue

        def convert_value(x):
            if isinstance(x, (list, tuple, set)):
                return ";".join(map(str, x))
            if isinstance(x, dict):
                return str(x)
            return x

        gdf[col] = gdf[col].apply(convert_value)
    return gdf


def keep_useful_edge_columns(edges: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    """
    保留后续平台更可能用到的路网字段。
    """
    useful_cols = [
        "u", "v", "key",
        "osmid", "name", "highway", "ref",
        "oneway", "lanes", "maxspeed", "length",
        "bridge", "tunnel",
        "district_name", "district_adcode",
        "geometry",
    ]

    for col in useful_cols:
        if col not in edges.columns:
            edges[col] = None

    return edges[useful_cols].copy()


def keep_useful_node_columns(nodes: gpd.GeoDataFrame) -> gpd.GeoDataFrame:
    useful_cols = ["osmid", "x", "y", "street_count", "geometry"]

    nodes = nodes.copy()
    if "osmid" not in nodes.columns:
        nodes["osmid"] = nodes.index

    for col in useful_cols:
        if col not in nodes.columns:
            nodes[col] = None

    return nodes[useful_cols].copy()


def clean_districts(
    districts: gpd.GeoDataFrame,
    place_polygon=None
) -> gpd.GeoDataFrame:
    """
    清理 OSM 行政区边界结果，只保留面要素。
    过滤条件：
    - 只保留 Polygon / MultiPolygon
    - 只保留区县级（以"区""县""市""自治县"结尾）
    - 可选：仅保留在 place_polygon 范围内的区域
    - 去重
    """
    districts = districts.copy()
    districts = districts.reset_index()

    districts = districts[
        districts.geometry.geom_type.isin(["Polygon", "MultiPolygon"])
    ].copy()

    if "name" not in districts.columns:
        raise ValueError("行政区边界数据中没有 name 字段，请检查 OSM 下载结果。")

    districts = districts[districts["name"].notna()].copy()

    # 过滤：只保留中国区县级单位（以 区/县/市/自治县 结尾）
    districts["district_name"] = districts["name"].astype(str)
    level6_mask = districts["district_name"].str.endswith(("区", "县", "市", "自治县"))
    districts = districts[level6_mask].copy()

    # 空间过滤：只保留几何中心在重庆市范围内的区域
    if place_polygon is not None:
        centroids = districts.geometry.centroid
        districts = districts[centroids.within(place_polygon)].copy()

    if "adcode" in districts.columns:
        districts["district_adcode"] = districts["adcode"]
    elif "ref" in districts.columns:
        districts["district_adcode"] = districts["ref"]
    else:
        districts["district_adcode"] = None

    districts = districts[["district_name", "district_adcode", "geometry"]].copy()

    # 避免重复名称（OSM 可能同时返回 relation 和 way）
    districts = districts.drop_duplicates(subset=["district_name"]).copy()

    # 重置索引，确保唯一性
    districts = districts.reset_index(drop=True)

    return districts


def assign_district_by_midpoint(
    edges: gpd.GeoDataFrame,
    districts: gpd.GeoDataFrame
) -> gpd.GeoDataFrame:
    """
    简单版：用每条道路几何的中点判断所属区县。
    """
    edges = edges.copy()
    districts = districts.copy()

    # 用投影坐标计算 representative point / centroid 更稳定
    work_crs = "EPSG:3857"
    edges_proj = edges.to_crs(work_crs)
    districts_proj = districts.to_crs(work_crs)

    midpoint_gdf = edges_proj.copy()
    midpoint_gdf["geometry"] = midpoint_gdf.geometry.interpolate(
        0.5, normalized=True
    )

    joined = gpd.sjoin(
        midpoint_gdf,
        districts_proj[["district_name", "district_adcode", "geometry"]],
        how="left",
        predicate="within"
    )

    # 解决 sjoin 因重叠面导致行数增多的问题：按原始索引去重，保留第一个匹配
    joined = joined[~joined.index.duplicated(keep="first")]

    edges["district_name"] = joined["district_name"].values
    edges["district_adcode"] = joined["district_adcode"].values

    return edges


def split_edges_by_district(
    edges: gpd.GeoDataFrame,
    districts: gpd.GeoDataFrame
) -> gpd.GeoDataFrame:
    """
    严谨版：用行政区面切分道路中心线。
    一条跨区县道路会被切为多条区县内线段。
    """
    edges_proj = edges.to_crs("EPSG:3857")
    districts_proj = districts.to_crs("EPSG:3857")

    # overlay 会保留相交后的几何
    split = gpd.overlay(
        edges_proj,
        districts_proj[["district_name", "district_adcode", "geometry"]],
        how="intersection",
        keep_geom_type=True,
        make_valid=True
    )

    split = split.to_crs("EPSG:4326")
    return split


def make_verify_map(
    edges: gpd.GeoDataFrame,
    nodes: gpd.GeoDataFrame,
    districts: gpd.GeoDataFrame,
    output_html: Path
):
    """
    生成本地 HTML 地图，用于验证路网位置、区县归属、属性弹窗。
    """
    center_lat = 29.5630
    center_lon = 106.5516

    m = folium.Map(
        location=[center_lat, center_lon],
        zoom_start=8,
        tiles="CartoDB positron",
        control_scale=True
    )

    # 区县边界
    folium.GeoJson(
        districts.to_json(),
        name="重庆区县边界",
        style_function=lambda feature: {
            "fillColor": "#00000000",
            "color": "#666666",
            "weight": 1,
            "fillOpacity": 0.02,
        },
        tooltip=folium.GeoJsonTooltip(
            fields=["district_name"],
            aliases=["区县："],
            sticky=False
        )
    ).add_to(m)

    # 按道路等级显示不同线宽
    def edge_style(feature):
        highway = str(feature["properties"].get("highway", ""))

        if "motorway" in highway:
            return {"color": "#e74c3c", "weight": 3.5, "opacity": 0.9}
        if "trunk" in highway:
            return {"color": "#f39c12", "weight": 2.8, "opacity": 0.85}

        return {"color": "#2980b9", "weight": 2, "opacity": 0.7}

    popup_fields = [
        "name", "ref", "highway", "length",
        "district_name", "oneway", "maxspeed", "lanes"
    ]

    existing_popup_fields = [c for c in popup_fields if c in edges.columns]

    folium.GeoJson(
        edges.to_json(),
        name="高速/快速路网",
        style_function=edge_style,
        tooltip=folium.GeoJsonTooltip(
            fields=[c for c in ["name", "ref", "highway", "district_name"] if c in edges.columns],
            aliases=["名称：", "编号：", "道路等级：", "所属区县："][:len([c for c in ["name", "ref", "highway", "district_name"] if c in edges.columns])],
            sticky=True
        ),
        popup=folium.GeoJsonPopup(
            fields=existing_popup_fields,
            labels=True
        )
    ).add_to(m)

    # 节点抽样显示，避免太密
    node_sample = nodes.copy()
    if len(node_sample) > 800:
        node_sample = node_sample.sample(800, random_state=42)

    node_layer = folium.FeatureGroup(name="路网节点抽样")
    for _, row in node_sample.iterrows():
        if row.geometry is None:
            continue
        folium.CircleMarker(
            location=[row.geometry.y, row.geometry.x],
            radius=2,
            weight=0,
            fill=True,
            fill_opacity=0.5,
            popup=f"osmid: {row.get('osmid', '')}"
        ).add_to(node_layer)

    node_layer.add_to(m)

    folium.LayerControl(collapsed=False).add_to(m)

    m.save(str(output_html))


# =========================
# 3. 主流程
# =========================

def _download_districts_fallback(place_name: str) -> gpd.GeoDataFrame | None:
    """
    尝试从 Overpass 下载区县边界。
    使用多个端点 + 短超时快速尝试，全部失败则返回 None。
    """
    district_tags = {
        "boundary": "administrative",
        "admin_level": "6"
    }

    endpoints = [
        "https://overpass.kumi.systems/api/interpreter",
        "https://overpass-api.de/api/interpreter",
        "https://overpass.openstreetmap.ie/api/interpreter",
    ]

    original_timeout = ox.settings.timeout

    # 检查当前 osmnx 版本是否支持切换 endpoint
    has_endpoint_setting = hasattr(ox.settings, 'overpass_endpoint')
    if has_endpoint_setting:
        original_endpoint = ox.settings.overpass_endpoint

    # 区县边界用短超时，快速失败
    ox.settings.timeout = 60

    import time
    for ep_idx, endpoint in enumerate(endpoints):
        if has_endpoint_setting:
            ox.settings.overpass_endpoint = endpoint
        print(f"  尝试端点 [{ep_idx+1}/{len(endpoints)}]: {endpoint}")
        for attempt in range(1, 3):
            try:
                raw = ox.features_from_place(place_name, tags=district_tags)
                if has_endpoint_setting:
                    ox.settings.overpass_endpoint = original_endpoint
                ox.settings.timeout = original_timeout
                print(f"  ✅ 成功从 {endpoint} 获取区县边界！")
                return raw
            except Exception as e:
                err = str(e)[:80]
                print(f"    第 {attempt} 次失败: {err}")
                if attempt < 2:
                    time.sleep(5)
        print(f"  ⏩ 端点 {endpoint} 不可用")

    if has_endpoint_setting:
        ox.settings.overpass_endpoint = original_endpoint
    ox.settings.timeout = original_timeout

    print("\n  ⚠️ 所有 Overpass 端点均无法连接，将无区县数据继续。")
    return None


def _build_grid_districts(place_polygon, n_splits: int = 6) -> gpd.GeoDataFrame:
    """
    如果无法从 OSM 下载区县边界，按经纬度网格划分近似区县。
    n_splits=6 将重庆划分为 6x6=36 个网格，接近真实区县数(38)。
    """
    from shapely.geometry import box
    minx, miny, maxx, maxy = place_polygon.bounds
    x_step = (maxx - minx) / n_splits
    y_step = (maxy - miny) / n_splits

    rows = []
    for i in range(n_splits):
        for j in range(n_splits):
            cell = box(
                minx + i * x_step, miny + j * y_step,
                minx + (i + 1) * x_step, miny + (j + 1) * y_step
            ).intersection(place_polygon)
            if cell.is_empty:
                continue
            rows.append({
                "district_name": f"网格_{i+1}_{j+1}",
                "district_adcode": None,
                "geometry": cell
            })

    return gpd.GeoDataFrame(rows, crs="EPSG:4326", geometry="geometry")


def main():
    print("\n[1/6] 下载重庆高速/快速路网 ...")

    G = ox.graph_from_place(
        PLACE_NAME,
        network_type="drive",
        custom_filter=ROAD_FILTER,
        simplify=True,
        retain_all=True,
        truncate_by_edge=True
    )

    print(f"路网下载完成：节点数={len(G.nodes)}, 边数={len(G.edges)}")

    print("\n[2/6] 转换为 GeoDataFrame ...")
    nodes, edges = ox.graph_to_gdfs(
        G,
        nodes=True,
        edges=True,
        node_geometry=True,
        fill_edge_geometry=True
    )

    nodes = nodes.reset_index()
    edges = edges.reset_index()

    nodes = keep_useful_node_columns(nodes)
    edges = stringify_complex_columns(edges)

    print("\n[3/6] 下载重庆区县边界 ...")
    districts_raw = _download_districts_fallback(PLACE_NAME)

    if districts_raw is not None:
        # 获取重庆市边界多边形，用于过滤其他省份的区县
        place_gdf = ox.geocode_to_gdf(PLACE_NAME)
        place_poly = place_gdf.geometry.union_all()
        districts = clean_districts(districts_raw, place_polygon=place_poly)
        print(f"区县边界下载完成：{len(districts)} 个面要素")
        names = sorted(districts["district_name"].dropna().unique().tolist())
        print("区县名称：")
        print("、".join(names))
    else:
        print("\n  使用备用方案：生成近似网格区县 ...")
        place_gdf = ox.geocode_to_gdf(PLACE_NAME)
        place_poly = place_gdf.geometry.union_all()
        districts = _build_grid_districts(place_poly, n_splits=6)
        print(f"生成网格区县：{len(districts)} 个网格面")

    print("\n[4/6] 绑定道路所属区县 ...")

    if len(districts) > 0:
        if EXACT_SPLIT:
            print("使用严格切分方式：道路跨区县会被切分为多段。")
            edges_with_district = split_edges_by_district(edges, districts)
        else:
            print("使用中点归属方式：每条边按中点所在区县赋值。")
            edges_with_district = assign_district_by_midpoint(edges, districts)
    else:
        print("无区县数据，跳过绑定。")
        edges_with_district = edges.copy()
        edges_with_district["district_name"] = None
        edges_with_district["district_adcode"] = None

    edges_with_district = stringify_complex_columns(edges_with_district)
    edges_with_district = keep_useful_edge_columns(edges_with_district)

    missing_count = edges_with_district["district_name"].isna().sum()
    print(f"区县归属完成：未匹配区县的道路边数 = {missing_count} / 总边数 = {len(edges_with_district)}")

    print("\n[5/6] 保存本地数据 ...")

    # 确保输出目录存在
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # 保存 GraphML，保留图拓扑
    ox.save_graphml(G, filepath=str(GRAPHML_PATH))

    # 保存 GeoPackage
    nodes.to_crs("EPSG:4326").to_file(GPKG_PATH, layer="nodes", driver="GPKG")
    edges_with_district.to_crs("EPSG:4326").to_file(GPKG_PATH, layer="edges", driver="GPKG")
    districts.to_crs("EPSG:4326").to_file(GPKG_PATH, layer="districts", driver="GPKG")

    # 保存 GeoJSON，供前端 Leaflet 使用
    edges_with_district.to_crs("EPSG:4326").to_file(EDGES_GEOJSON_PATH, driver="GeoJSON")
    nodes.to_crs("EPSG:4326").to_file(NODES_GEOJSON_PATH, driver="GeoJSON")
    districts.to_crs("EPSG:4326").to_file(DISTRICTS_GEOJSON_PATH, driver="GeoJSON")

    print(f"GraphML: {GRAPHML_PATH}")
    print(f"GeoPackage: {GPKG_PATH}")
    print(f"Edges GeoJSON: {EDGES_GEOJSON_PATH}")
    print(f"Nodes GeoJSON: {NODES_GEOJSON_PATH}")
    print(f"Districts GeoJSON: {DISTRICTS_GEOJSON_PATH}")

    print("\n[6/6] 生成 HTML 可视化验证地图 ...")
    make_verify_map(
        edges=edges_with_district.to_crs("EPSG:4326"),
        nodes=nodes.to_crs("EPSG:4326"),
        districts=districts.to_crs("EPSG:4326"),
        output_html=VERIFY_HTML_PATH
    )

    print(f"验证地图已生成：{VERIFY_HTML_PATH}")

    print("\n✅ 全部完成！建议打开 verify_chongqing_expressway.html 检查：")
    print("1. 路网是否覆盖重庆全域")
    print("2. 红色 motorway 是否基本对应高速")
    print("3. 橙色 trunk 是否需要保留")
    print(f"4. 区县数据来源：{'OSM 真实区县边界' if districts_raw is not None else '近似网格划分（备用方案）'}")
    print("5. 道路弹窗中的 district_name 是否合理")
    print("6. 是否存在大量未匹配区县的道路")


if __name__ == "__main__":
    main()