#!/usr/bin/env python3
"""V1.3A 路网数据全面分析脚本"""

import json
import os
import sys
from collections import Counter, defaultdict

WORKSPACE = r'd:\LYC\Documents\Plant_v2'

def load_geojson(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def analyze_edges_district_fixed():
    """Task 1: 分析 chongqing_expressway_edges_district_fixed.geojson"""
    path = os.path.join(WORKSPACE, 'gaosu', 'data', 'chongqing_roadnet', 'chongqing_expressway_edges_district_fixed.geojson')
    data = load_geojson(path)
    features = data['features']
    
    print("=" * 70)
    print("一、EDGE 数据源分析 (chongqing_expressway_edges_district_fixed.geojson)")
    print("=" * 70)
    print(f"  Feature 总数: {len(features)}")
    print(f"  Geometry 类型: {features[0]['geometry']['type']}")
    
    # 收集所有 properties 字段
    all_keys = set()
    for f in features:
        all_keys.update(f['properties'].keys())
    all_keys = sorted(all_keys)
    
    print(f"\n  Properties 全部字段 ({len(all_keys)} 个):")
    
    # 字段统计
    field_stats = {}
    for key in all_keys:
        values = []
        non_null = 0
        types = set()
        for f in features:
            v = f['properties'].get(key)
            if v is not None:
                non_null += 1
                types.add(type(v).__name__)
                if len(values) < 5:
                    values.append(v)
        field_stats[key] = {
            'non_null': non_null,
            'null_count': len(features) - non_null,
            'types': types,
            'samples': values
        }
    
    # 检查关键字段
    key_fields = ['u', 'v', 'key', 'osmid', 'name', 'ref', 'highway', 'oneway', 
                  'lanes', 'maxspeed', 'length', 'bridge', 'tunnel', 
                  'district_name', 'district_adcode']
    
    print(f"\n  关键字段检查:")
    for kf in key_fields:
        if kf in field_stats:
            s = field_stats[kf]
            print(f"    {kf:20s}: 非空={s['non_null']:5d}, null={s['null_count']:5d}, 类型={s['types']}, 示例={s['samples'][:3]}")
        else:
            print(f"    {kf:20s}: *** 不存在 ***")
    
    # 所有字段详细输出
    print(f"\n  全部字段详细:")
    for key in all_keys:
        s = field_stats[key]
        print(f"    {key:25s}: 非空={s['non_null']:5d} | null={s['null_count']:5d} | 类型={s['types']}")
        if s['samples']:
            print(f"      示例: {s['samples'][:3]}")
    
    return features, field_stats

def analyze_nodes():
    """Task 2: 分析 Node 数据"""
    print("\n" + "=" * 70)
    print("二、NODE 数据源分析")
    print("=" * 70)
    
    # 检查 nodes.geojson
    nodes_path = os.path.join(WORKSPACE, 'public', 'data', 'roadnet', 'chongqing_expressway_nodes.geojson')
    if os.path.exists(nodes_path):
        data = load_geojson(nodes_path)
        features = data['features']
        print(f"  Node GeoJSON: {nodes_path}")
        print(f"  Feature 总数: {len(features)}")
        print(f"  Geometry 类型: {features[0]['geometry']['type']}")
        
        # 收集所有 properties 字段
        all_keys = set()
        for f in features:
            all_keys.update(f['properties'].keys())
        all_keys = sorted(all_keys)
        print(f"  Properties 字段: {all_keys}")
        
        # ID 和坐标检查
        node_ids = []
        coords = []
        for f in features:
            nid = f['properties'].get('osmid') or f['properties'].get('id') or f['id']
            node_ids.append(nid)
            geom = f['geometry']
            if geom and geom['coordinates']:
                coords.append(tuple(geom['coordinates'][:2]))
        
        print(f"  Node ID 数量: {len(node_ids)}")
        print(f"  Node ID 唯一数量: {len(set(node_ids))}")
        print(f"  重复 ID 数量: {len(node_ids) - len(set(node_ids))}")
        print(f"  坐标数量: {len(coords)}")
        print(f"  坐标唯一数量: {len(set(coords))}")
        
        # 字段详情
        for key in all_keys:
            non_null = sum(1 for f in features if f['properties'].get(key) is not None)
            samples = [f['properties'].get(key) for f in features[:5] if f['properties'].get(key) is not None]
            print(f"    {key:20s}: 非空={non_null:5d}, 示例={samples[:3]}")
        
        return features
    else:
        print(f"  Node GeoJSON 不存在: {nodes_path}")
        return None

def analyze_edge_uniqueness(features):
    """Task 3: Edge 唯一键分析"""
    print("\n" + "=" * 70)
    print("三、EDGE 唯一键分析")
    print("=" * 70)
    
    # u + v + key 组合
    uvk_tuples = []
    for f in features:
        p = f['properties']
        u = p.get('u')
        v = p.get('v')
        k = p.get('key')
        uvk_tuples.append((u, v, k))
    
    unique_uvk = len(set(uvk_tuples))
    print(f"  u + v + key 唯一组合数: {unique_uvk}")
    print(f"  总数: {len(features)}")
    print(f"  重复数量: {len(features) - unique_uvk}")
    
    # 找出重复
    uvk_counter = Counter(uvk_tuples)
    duplicates = {k: v for k, v in uvk_counter.items() if v > 1}
    if duplicates:
        print(f"  重复组合示例 (最多出现的):")
        for k, v in sorted(duplicates.items(), key=lambda x: -x[1])[:5]:
            print(f"    u={k[0]}, v={k[1]}, key={k[2]}: 出现 {v} 次")
    
    # 检查 feature id
    feature_ids = [f.get('id') for f in features]
    has_id = sum(1 for fid in feature_ids if fid is not None)
    print(f"\n  Feature 自带 id 数量: {has_id}/{len(features)}")
    
    # 检查 osmid
    osmids = [f['properties'].get('osmid') for f in features]
    has_osmid = sum(1 for o in osmids if o is not None)
    print(f"  osmid 非空数量: {has_osmid}/{len(features)}")
    
    # 检查 osmid 唯一性
    osmid_counter = Counter(osmids)
    osmid_duplicates = {k: v for k, v in osmid_counter.items() if v > 1 and k is not None}
    print(f"  osmid 唯一值数量: {len(set(o for o in osmids if o is not None))}")
    if osmid_duplicates:
        print(f"  osmid 重复: {len(osmid_duplicates)} 组")
        for k, v in sorted(osmid_duplicates.items(), key=lambda x: -x[1])[:5]:
            print(f"    osmid={k}: 出现 {v} 次")

def analyze_district(features):
    """Task 4: 行政区关联分析"""
    print("\n" + "=" * 70)
    print("四、行政区关联分析")
    print("=" * 70)
    
    district_values = [f['properties'].get('district_name') for f in features]
    non_null = sum(1 for d in district_values if d is not None and d != '')
    null_count = sum(1 for d in district_values if d is None or d == '')
    
    distinct_names = sorted(set(d for d in district_values if d is not None and d != ''))
    
    print(f"  district_name 非空: {non_null}/{len(features)}")
    print(f"  district_name null/空: {null_count}/{len(features)}")
    print(f"  distinct 原始名称 ({len(distinct_names)} 个):")
    for name in distinct_names:
        count = district_values.count(name)
        print(f"    {name}: {count} 条")
    
    # 找出 null 的 features
    null_indices = [i for i, d in enumerate(district_values) if d is None or d == '']
    if null_indices:
        print(f"\n  null district 的 feature 示例 (前5条):")
        for i in null_indices[:5]:
            f = features[i]
            p = f['properties']
            geom = f['geometry']
            coords = geom['coordinates']
            print(f"    [{i}] u={p.get('u')}, v={p.get('v')}, name={p.get('name')}, ref={p.get('ref')}")
            print(f"        geom coords 首点={coords[0][:2] if coords else 'N/A'}, 末点={coords[-1][:2] if coords else 'N/A'}")

def analyze_geometry(features):
    """Task 5: Geometry 与 length 分析"""
    print("\n" + "=" * 70)
    print("五、Geometry 与 length 分析")
    print("=" * 70)
    
    # 坐标范围
    all_lons = []
    all_lats = []
    for f in features:
        geom = f['geometry']
        if geom and geom['coordinates']:
            for coord in geom['coordinates']:
                if len(coord) >= 2:
                    all_lons.append(coord[0])
                    all_lats.append(coord[1])
    
    print(f"  坐标范围:")
    print(f"    经度 (lon): {min(all_lons):.6f} ~ {max(all_lons):.6f}")
    print(f"    纬度 (lat): {min(all_lats):.6f} ~ {max(all_lats):.6f}")
    print(f"  CRS: EPSG:4326 (WGS84) — GeoJSON 标准")
    
    # length 字段
    lengths = [f['properties'].get('length') for f in features]
    non_null_lengths = [l for l in lengths if l is not None]
    
    print(f"\n  length 字段:")
    print(f"    非空: {len(non_null_lengths)}/{len(features)}")
    print(f"    null: {len(features) - len(non_null_lengths)}/{len(features)}")
    
    if non_null_lengths:
        print(f"    最小值: {min(non_null_lengths):.2f}")
        print(f"    最大值: {max(non_null_lengths):.2f}")
        print(f"    总和: {sum(non_null_lengths):.2f}")
        print(f"    平均值: {sum(non_null_lengths)/len(non_null_lengths):.2f}")
        
        # 检查单位推断
        print(f"    单位推断: 最大值 {max(non_null_lengths):.2f}，如果为米则约 {max(non_null_lengths)/1000:.1f}km")
        print(f"    单位推断: 如果为公里则约 {max(non_null_lengths):.1f}km")
        
        # 简单 haversine 检查几条数据
        import math
        def haversine(lon1, lat1, lon2, lat2):
            R = 6371000
            phi1, phi2 = math.radians(lat1), math.radians(lat2)
            dphi = math.radians(lat2 - lat1)
            dlambda = math.radians(lon2 - lon1)
            a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
            return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1-a))
        
        print(f"\n    haversine 验证 (前5条):")
        for f in features[:5]:
            geom = f['geometry']
            coords = geom['coordinates']
            p = f['properties']
            if coords and len(coords) >= 2:
                calc_len = 0
                for i in range(len(coords)-1):
                    calc_len += haversine(coords[i][0], coords[i][1], coords[i+1][0], coords[i+1][1])
                reported = p.get('length', 0)
                ratio = calc_len / reported if reported else 0
                print(f"      u={p.get('u')}, v={p.get('v')}: haversine={calc_len:.1f}m, length={reported:.1f}, ratio={ratio:.3f}")

def analyze_highway_types(features):
    """Task 6: 道路类型统计"""
    print("\n" + "=" * 70)
    print("六、道路类型统计")
    print("=" * 70)
    
    highway_values = [f['properties'].get('highway') for f in features]
    highway_counter = Counter(highway_values)
    
    print(f"  highway 类型分布:")
    for hw, count in highway_counter.most_common():
        print(f"    {str(hw):25s}: {count}")
    
    # 各类型 length 总和
    print(f"\n  highway 各类型 length 总和:")
    hw_lengths = defaultdict(float)
    hw_counts = defaultdict(int)
    for f in features:
        hw = f['properties'].get('highway', 'unknown')
        l = f['properties'].get('length', 0) or 0
        hw_lengths[hw] += l
        hw_counts[hw] += 1
    
    for hw in sorted(hw_lengths.keys()):
        print(f"    {str(hw):25s}: 长度={hw_lengths[hw]:.1f}m ({hw_lengths[hw]/1000:.1f}km), 条数={hw_counts[hw]}")
    
    # bridge / tunnel 统计
    print(f"\n  bridge 字段:")
    bridge_values = [f['properties'].get('bridge') for f in features]
    bridge_counter = Counter(str(b) for b in bridge_values)
    for bv, count in bridge_counter.most_common():
        print(f"    {str(bv):20s}: {count}")
    
    print(f"\n  tunnel 字段:")
    tunnel_values = [f['properties'].get('tunnel') for f in features]
    tunnel_counter = Counter(str(t) for t in tunnel_values)
    for tv, count in tunnel_counter.most_common():
        print(f"    {str(tv):20s}: {count}")

def analyze_other_geojson():
    """检查其他 GeoJSON 文件"""
    print("\n" + "=" * 70)
    print("补充: 其他数据文件分析")
    print("=" * 70)
    
    # public/data/roadnet/ 原始 edges
    edges_path = os.path.join(WORKSPACE, 'public', 'data', 'roadnet', 'chongqing_expressway_edges.geojson')
    if os.path.exists(edges_path):
        data = load_geojson(edges_path)
        features = data['features']
        print(f"  原始 Edges GeoJSON: {len(features)} 条")
        all_keys = set()
        for f in features:
            all_keys.update(f['properties'].keys())
        print(f"  Properties 字段: {sorted(all_keys)}")
        
        # 对比 district_fixed 版本
        fixed_path = os.path.join(WORKSPACE, 'gaosu', 'data', 'chongqing_roadnet', 'chongqing_expressway_edges_district_fixed.geojson')
        fixed_data = load_geojson(fixed_path)
        fixed_keys = set()
        for f in fixed_data['features']:
            fixed_keys.update(f['properties'].keys())
        
        diff_keys = fixed_keys - all_keys
        if diff_keys:
            print(f"  district_fixed 比原始多出的字段: {sorted(diff_keys)}")
    
    # GraphML
    graphml_path = os.path.join(WORKSPACE, 'backend', 'src', 'main', 'resources', 'data', 'roadnet', 'chongqing_expressway.graphml')
    if os.path.exists(graphml_path):
        size = os.path.getsize(graphml_path)
        print(f"  GraphML 文件: {graphml_path}")
        print(f"  大小: {size:,} bytes ({size/1024/1024:.1f} MB)")
        # 读取前几行看看结构
        with open(graphml_path, 'r', encoding='utf-8') as f:
            lines = [f.readline() for _ in range(20)]
        print(f"  前20行:")
        for line in lines:
            if line.strip():
                print(f"    {line.rstrip()[:120]}")

def main():
    print("V1.3A 路网数据全面分析")
    print("时间:", __import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S'))
    print()
    
    # Task 1
    features, field_stats = analyze_edges_district_fixed()
    
    # Task 2
    analyze_nodes()
    
    # Task 3
    analyze_edge_uniqueness(features)
    
    # Task 4
    analyze_district(features)
    
    # Task 5
    analyze_geometry(features)
    
    # Task 6
    analyze_highway_types(features)
    
    # 补充
    analyze_other_geojson()
    
    print("\n" + "=" * 70)
    print("分析完成")
    print("=" * 70)

if __name__ == '__main__':
    main()
