#!/usr/bin/env python3
"""V1.3A 补充分析: Edge-Node 匹配 + Legacy 检查"""

import json
import os

WORKSPACE = r'd:\LYC\Documents\Plant_v2'

def load_geojson(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

# 1. Edge-Node 匹配
print("=" * 70)
print("补充A: Edge u/v 与 Node osmid 匹配度")
print("=" * 70)

edges_path = os.path.join(WORKSPACE, 'gaosu', 'data', 'chongqing_roadnet', 'chongqing_expressway_edges_district_fixed.geojson')
nodes_path = os.path.join(WORKSPACE, 'public', 'data', 'roadnet', 'chongqing_expressway_nodes.geojson')

edges = load_geojson(edges_path)
nodes = load_geojson(nodes_path)

node_osmids = set()
for n in nodes['features']:
    node_osmids.add(n['properties']['osmid'])

print(f"  Node osmid 集合大小: {len(node_osmids)}")

# Edge u 匹配
edge_u_set = set()
edge_v_set = set()
all_edge_nodes = set()
for e in edges['features']:
    p = e['properties']
    u = p['u']
    v = p['v']
    edge_u_set.add(u)
    edge_v_set.add(v)
    all_edge_nodes.add(u)
    all_edge_nodes.add(v)

print(f"  Edge 唯一 u 数量: {len(edge_u_set)}")
print(f"  Edge 唯一 v 数量: {len(edge_v_set)}")
print(f"  Edge u ∪ v 总节点: {len(all_edge_nodes)}")

# 匹配检查
u_in_nodes = edge_u_set & node_osmids
u_not_in_nodes = edge_u_set - node_osmids
v_in_nodes = edge_v_set & node_osmids
v_not_in_nodes = edge_v_set - node_osmids
all_in_nodes = all_edge_nodes & node_osmids
all_not_in_nodes = all_edge_nodes - node_osmids

print(f"\n  Edge u 匹配 Node: {len(u_in_nodes)}/{len(edge_u_set)} ({len(u_in_nodes)/len(edge_u_set)*100:.1f}%)")
print(f"  Edge u 未匹配: {len(u_not_in_nodes)}")
print(f"  Edge v 匹配 Node: {len(v_in_nodes)}/{len(edge_v_set)} ({len(v_in_nodes)/len(edge_v_set)*100:.1f}%)")
print(f"  Edge v 未匹配: {len(v_not_in_nodes)}")
print(f"  所有 Edge 节点匹配 Node: {len(all_in_nodes)}/{len(all_edge_nodes)} ({len(all_in_nodes)/len(all_edge_nodes)*100:.1f}%)")
print(f"  未匹配节点: {len(all_not_in_nodes)}")

if u_not_in_nodes:
    print(f"\n  未匹配的 u 节点 (前10):")
    for nid in sorted(u_not_in_nodes)[:10]:
        print(f"    {nid}")

# 2. district_name 全名到短名映射
print("\n" + "=" * 70)
print("补充B: district_name 全名 → 短名映射")
print("=" * 70)

district_names = set()
for e in edges['features']:
    dn = e['properties'].get('district_name')
    if dn:
        district_names.add(dn)

print(f"  原始 district_name distinct ({len(district_names)} 个):")
for name in sorted(district_names):
    print(f"    {name}")

# 3. 分析 composite highway 类型
print("\n" + "=" * 70)
print("补充C: composite highway 类型拆分")
print("=" * 70)

from collections import Counter
hw_counter = Counter()
for e in edges['features']:
    hw = e['properties'].get('highway', '')
    for part in hw.split(';'):
        hw_counter[part.strip()] += 1

print("  拆分后各类型数量:")
for hw, count in hw_counter.most_common():
    print(f"    {hw:25s}: {count}")

# 4. 分析 bridge 取值
print("\n" + "=" * 70)
print("补充D: bridge/tunnel 取值分析")
print("=" * 70)

bridge_counter = Counter()
tunnel_counter = Counter()
for e in edges['features']:
    b = e['properties'].get('bridge')
    t = e['properties'].get('tunnel')
    if b:
        for part in str(b).split(';'):
            bridge_counter[part.strip()] += 1
    if t:
        for part in str(t).split(';'):
            tunnel_counter[part.strip()] += 1

print("  bridge 拆分后:")
for bv, count in bridge_counter.most_common():
    print(f"    {bv:25s}: {count}")
print("  tunnel 拆分后:")
for tv, count in tunnel_counter.most_common():
    print(f"    {tv:25s}: {count}")

# 5. 统计 highway 主类型 (简化为4种)
print("\n" + "=" * 70)
print("补充E: highway 简化分类")
print("=" * 70)

simplified = Counter()
for e in edges['features']:
    hw = e['properties'].get('highway', '')
    parts = [p.strip() for p in hw.split(';')]
    if 'motorway' in parts or 'motorway_link' in parts:
        if 'motorway' in parts:
            simplified['motorway'] += 1
        else:
            simplified['motorway_link'] += 1
    elif 'trunk' in parts or 'trunk_link' in parts:
        if 'trunk' in parts:
            simplified['trunk'] += 1
        else:
            simplified['trunk_link'] += 1
    else:
        simplified[hw] += 1

for hw, count in simplified.most_common():
    print(f"    {hw:25s}: {count}")

# 6. Node 坐标范围
print("\n" + "=" * 70)
print("补充F: Node 坐标范围")
print("=" * 70)

xs = [n['properties']['x'] for n in nodes['features']]
ys = [n['properties']['y'] for n in nodes['features']]
print(f"  经度 (x/lon): {min(xs):.6f} ~ {max(xs):.6f}")
print(f"  纬度 (y/lat): {min(ys):.6f} ~ {max(ys):.6f}")

# 7. street_count 统计
print("\n  street_count 分布:")
sc_counter = Counter(n['properties']['street_count'] for n in nodes['features'])
for sc, count in sorted(sc_counter.items()):
    print(f"    street_count={sc}: {count} nodes")

print("\n分析完成")
