"""
路网数据导出脚本
从 MySQL 数据库导出路网节点和边数据为 CSV 和 JSON 格式
"""

import mysql.connector
import json
import csv
import os
from datetime import datetime

# 数据库配置（可通过环境变量覆盖）
DB_CONFIG = {
    'host': os.getenv('PLANT_DB_HOST', 'localhost'),
    'port': int(os.getenv('PLANT_DB_PORT', '3306')),
    'user': os.getenv('PLANT_DB_USERNAME', 'root'),
    'password': os.getenv('PLANT_DB_PASSWORD', 'root'),
    'database': os.getenv('PLANT_DB_NAME', 'transport_resilience_v2'),
    'charset': 'utf8mb4'
}

# 输出目录默认位于项目根目录，可通过 PLANT_EXPORT_DIR 覆盖。
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUTPUT_DIR = os.getenv('PLANT_EXPORT_DIR', os.path.join(PROJECT_ROOT, 'exports'))
os.makedirs(OUTPUT_DIR, exist_ok=True)


def get_connection():
    """获取数据库连接"""
    return mysql.connector.connect(**DB_CONFIG)


def export_nodes_to_csv():
    """导出节点数据为 CSV"""
    print("正在导出节点数据到 CSV...")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            id,
            node_type,
            street_count,
            ST_X(geom) as longitude,
            ST_Y(geom) as latitude
        FROM road_node
        ORDER BY id
    """)

    nodes = cursor.fetchall()
    output_file = os.path.join(OUTPUT_DIR, 'road_nodes.csv')

    with open(output_file, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=['id', 'node_type', 'street_count', 'longitude', 'latitude'])
        writer.writeheader()
        writer.writerows(nodes)

    print(f"✓ 节点数据已导出: {output_file} ({len(nodes)} 条记录)")
    cursor.close()
    conn.close()
    return nodes


def export_edges_to_csv():
    """导出边数据为 CSV"""
    print("正在导出边数据到 CSV...")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            e.id,
            e.from_node_id,
            e.to_node_id,
            e.road_name,
            e.road_ref,
            e.road_class,
            e.one_way,
            e.lane_count,
            e.design_speed_kmh,
            e.length_m,
            e.region_code,
            ST_AsText(e.geom) as geometry
        FROM road_edge e
        ORDER BY e.id
    """)

    edges = cursor.fetchall()
    output_file = os.path.join(OUTPUT_DIR, 'road_edges.csv')

    with open(output_file, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=[
            'id', 'from_node_id', 'to_node_id',
            'road_name', 'road_ref', 'road_class', 'one_way',
            'lane_count', 'design_speed_kmh', 'length_m',
            'region_code', 'geometry'
        ])
        writer.writeheader()
        writer.writerows(edges)

    print(f"✓ 边数据已导出: {output_file} ({len(edges)} 条记录)")
    cursor.close()
    conn.close()
    return edges


def export_nodes_to_json():
    """导出节点数据为 JSON"""
    print("正在导出节点数据到 JSON...")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            id,
            node_type,
            street_count,
            ST_X(geom) as longitude,
            ST_Y(geom) as latitude
        FROM road_node
        ORDER BY id
    """)

    nodes = cursor.fetchall()
    output_file = os.path.join(OUTPUT_DIR, 'road_nodes.json')

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(nodes, f, ensure_ascii=False, indent=2, default=str)

    print(f"✓ 节点数据已导出: {output_file} ({len(nodes)} 条记录)")
    cursor.close()
    conn.close()
    return nodes


def export_edges_to_json():
    """导出边数据为 JSON"""
    print("正在导出边数据到 JSON...")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            e.id,
            e.from_node_id,
            e.to_node_id,
            e.road_name,
            e.road_ref,
            e.road_class,
            e.one_way,
            e.lane_count,
            e.design_speed_kmh,
            e.length_m,
            e.region_code,
            ST_AsText(e.geom) as geometry
        FROM road_edge e
        ORDER BY e.id
    """)

    edges = cursor.fetchall()
    output_file = os.path.join(OUTPUT_DIR, 'road_edges.json')

    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(edges, f, ensure_ascii=False, indent=2, default=str)

    print(f"✓ 边数据已导出: {output_file} ({len(edges)} 条记录)")
    cursor.close()
    conn.close()
    return edges


def export_geojson():
    """导出为 GeoJSON 格式（适用于地图可视化）"""
    print("正在导出 GeoJSON...")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    # 导出节点 GeoJSON
    cursor.execute("""
        SELECT
            id, node_type, street_count,
            ST_X(geom) as lng, ST_Y(geom) as lat
        FROM road_node
    """)
    nodes = cursor.fetchall()

    nodes_geojson = {
        "type": "FeatureCollection",
        "name": "road_nodes",
        "features": [
            {
                "type": "Feature",
                "properties": {
                    "id": node['id'],
                    "node_type": node['node_type'],
                    "street_count": node['street_count']
                },
                "geometry": {
                    "type": "Point",
                    "coordinates": [float(node['lng']), float(node['lat'])]
                }
            }
            for node in nodes
        ]
    }

    # 导出边 GeoJSON
    cursor.execute("""
        SELECT
            id, from_node_id, to_node_id,
            road_name, road_ref, road_class, one_way,
            length_m, region_code,
            ST_AsText(geom) as wkt
        FROM road_edge
    """)
    edges = cursor.fetchall()

    edges_geojson = {
        "type": "FeatureCollection",
        "name": "road_edges",
        "features": []
    }

    for edge in edges:
        try:
            # 解析 WKT LINESTRING
            wkt = edge['wkt']
            # 处理 LINESTRING(...) 格式（可能有或没有空格）
            coords_str = wkt.replace('LINESTRING(', '').replace('LINESTRING (', '').rstrip(')')
            coords = []
            for pair in coords_str.split(','):
                parts = pair.strip().split()
                if len(parts) == 2:
                    coords.append([float(parts[0]), float(parts[1])])

            if not coords:
                print(f"  ⚠ 跳过边 {edge['id']}: 无法解析坐标")
                continue

            edges_geojson["features"].append({
                "type": "Feature",
                "properties": {
                    "id": edge['id'],
                    "from_node_id": edge['from_node_id'],
                    "to_node_id": edge['to_node_id'],
                    "road_name": edge['road_name'],
                    "road_ref": edge['road_ref'],
                    "road_class": edge['road_class'],
                    "one_way": bool(edge['one_way']),
                    "length_m": float(edge['length_m']),
                    "region_code": edge['region_code']
                },
                "geometry": {
                    "type": "LineString",
                    "coordinates": coords
                }
            })
        except Exception as e:
            print(f"  ⚠ 跳过边 {edge['id']}: {e}")

    # 保存文件
    nodes_file = os.path.join(OUTPUT_DIR, 'road_nodes.geojson')
    edges_file = os.path.join(OUTPUT_DIR, 'road_edges.geojson')

    with open(nodes_file, 'w', encoding='utf-8') as f:
        json.dump(nodes_geojson, f, ensure_ascii=False, indent=2)

    with open(edges_file, 'w', encoding='utf-8') as f:
        json.dump(edges_geojson, f, ensure_ascii=False, indent=2)

    print(f"✓ 节点 GeoJSON 已导出: {nodes_file} ({len(nodes)} 条记录)")
    print(f"✓ 边 GeoJSON 已导出: {edges_file} ({len(edges_geojson['features'])} 条记录)")

    cursor.close()
    conn.close()


def export_graph_for_analysis():
    """导出适用于图分析的简化格式（邻接表）"""
    print("正在导出图分析数据...")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    cursor.execute("""
        SELECT
            from_node_id,
            to_node_id,
            length_m,
            road_class,
            one_way
        FROM road_edge
        WHERE road_class IN ('motorway', 'trunk', 'primary')
        ORDER BY from_node_id
    """)

    edges = cursor.fetchall()

    # 构建邻接表
    graph = {}
    for edge in edges:
        from_node = str(edge['from_node_id'])
        to_node = str(edge['to_node_id'])
        weight = float(edge['length_m'])

        if from_node not in graph:
            graph[from_node] = []

        graph[from_node].append({
            "to": to_node,
            "weight": weight,
            "road_class": edge['road_class'],
            "one_way": bool(edge['one_way'])
        })

    output_file = os.path.join(OUTPUT_DIR, 'road_graph.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump({
            "node_count": len(graph),
            "edge_count": len(edges),
            "adjacency_list": graph
        }, f, ensure_ascii=False, indent=2)

    print(f"✓ 图分析数据已导出: {output_file}")
    print(f"  节点数: {len(graph)}")
    print(f"  边数: {len(edges)}")

    cursor.close()
    conn.close()


def export_statistics():
    """导出路网统计信息"""
    print("正在导出统计信息...")
    conn = get_connection()
    cursor = conn.cursor(dictionary=True)

    stats = {}

    # 基本统计
    cursor.execute("SELECT COUNT(*) as count FROM road_node")
    stats['node_count'] = cursor.fetchone()['count']

    cursor.execute("SELECT COUNT(*) as count FROM road_edge")
    stats['edge_count'] = cursor.fetchone()['count']

    # 按道路等级统计
    cursor.execute("""
        SELECT road_class, COUNT(*) as count,
               ROUND(SUM(length_m)/1000, 2) as total_length_km
        FROM road_edge
        GROUP BY road_class
        ORDER BY count DESC
    """)
    stats['by_road_class'] = cursor.fetchall()

    # 按区域统计
    cursor.execute("""
        SELECT r.region_code, r.region_name,
               COUNT(e.id) as edge_count,
               ROUND(SUM(e.length_m)/1000, 2) as total_length_km
        FROM region r
        LEFT JOIN road_edge e ON e.region_code = r.region_code
        GROUP BY r.region_code, r.region_name
        ORDER BY edge_count DESC
    """)
    stats['by_region'] = cursor.fetchall()

    output_file = os.path.join(OUTPUT_DIR, 'road_network_statistics.json')
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(stats, f, ensure_ascii=False, indent=2, default=str)

    print(f"✓ 统计信息已导出: {output_file}")

    cursor.close()
    conn.close()


def main():
    """主函数"""
    print("=" * 60)
    print("路网数据导出工具")
    print(f"导出时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"输出目录: {OUTPUT_DIR}")
    print("=" * 60)
    print()

    try:
        # 导出 CSV
        export_nodes_to_csv()
        export_edges_to_csv()
        print()

        # 导出 JSON
        export_nodes_to_json()
        export_edges_to_json()
        print()

        # 导出 GeoJSON
        export_geojson()
        print()

        # 导出图分析数据
        export_graph_for_analysis()
        print()

        # 导出统计信息
        export_statistics()
        print()

        print("=" * 60)
        print("✓ 所有数据导出完成！")
        print("=" * 60)

    except mysql.connector.Error as err:
        print(f"✗ 数据库错误: {err}")
        print("请检查数据库连接配置是否正确")
    except Exception as e:
        print(f"✗ 导出失败: {e}")
        import traceback
        traceback.print_exc()


if __name__ == '__main__':
    main()
