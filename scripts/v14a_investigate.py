#!/usr/bin/env python3
"""V1.4A: 桥隧数据链调查脚本"""

import json
import os
from collections import Counter, defaultdict

WORKSPACE = r'd:\LYC\Documents\Plant_v2'

def load_geojson(path):
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

# ============================================================
# 1. 调查 road_edges bridge/tunnel 候选
# ============================================================
print("=" * 70)
print("一、road_edges 桥隧候选特征分析")
print("=" * 70)

edges_path = os.path.join(WORKSPACE, 'gaosu', 'data', 'chongqing_roadnet', 'chongqing_expressway_edges_district_fixed.geojson')
edges = load_geojson(edges_path)
features = edges['features']

bridge_edges = [f for f in features if f['properties'].get('bridge')]
tunnel_edges = [f for f in features if f['properties'].get('tunnel')]

print(f"  总 Edge: {len(features)}")
print(f"  is_bridge (bridge 非空): {len(bridge_edges)}")
print(f"  is_tunnel (tunnel 非空): {len(tunnel_edges)}")

# Bridge edge 分析
print(f"\n--- Bridge Edge 分析 ---")
bridge_names = [f['properties'].get('name') for f in bridge_edges if f['properties'].get('name')]
bridge_refs = [f['properties'].get('ref') for f in bridge_edges if f['properties'].get('ref')]
bridge_with_name = len(bridge_names)
bridge_with_ref = len(bridge_refs)
print(f"  name 非空: {bridge_with_name}/{len(bridge_edges)} ({bridge_with_name/len(bridge_edges)*100:.1f}%)")
print(f"  ref 非空: {bridge_with_ref}/{len(bridge_edges)} ({bridge_with_ref/len(bridge_edges)*100:.1f}%)")

# Bridge name 同名分组
bridge_name_groups = Counter(bridge_names)
print(f"  唯一 name 数: {len(bridge_name_groups)}")
print(f"  name 出现 ≥2次 的组: {sum(1 for v in bridge_name_groups.values() if v >= 2)}")
print(f"  name 示例 (前10):")
for name, count in bridge_name_groups.most_common(10):
    print(f"    {name}: {count} 条")

# Bridge ref 分布
bridge_ref_counter = Counter(bridge_refs)
print(f"\n  ref 分布:")
for ref, count in bridge_ref_counter.most_common(10):
    print(f"    {ref}: {count} 条")

# Tunnel edge 分析
print(f"\n--- Tunnel Edge 分析 ---")
tunnel_names = [f['properties'].get('name') for f in tunnel_edges if f['properties'].get('name')]
tunnel_refs = [f['properties'].get('ref') for f in tunnel_edges if f['properties'].get('ref')]
tunnel_with_name = len(tunnel_names)
tunnel_with_ref = len(tunnel_refs)
print(f"  name 非空: {tunnel_with_name}/{len(tunnel_edges)} ({tunnel_with_name/len(tunnel_edges)*100:.1f}%)")
print(f"  ref 非空: {tunnel_with_ref}/{len(tunnel_edges)} ({tunnel_with_ref/len(tunnel_edges)*100:.1f}%)")

tunnel_name_groups = Counter(tunnel_names)
print(f"  唯一 name 数: {len(tunnel_name_groups)}")
print(f"  name 出现 ≥2次 的组: {sum(1 for v in tunnel_name_groups.values() if v >= 2)}")
print(f"  name 示例 (前10):")
for name, count in tunnel_name_groups.most_common(10):
    print(f"    {name}: {count} 条")

tunnel_ref_counter = Counter(tunnel_refs)
print(f"\n  ref 分布:")
for ref, count in tunnel_ref_counter.most_common(10):
    print(f"    {ref}: {count} 条")

# ============================================================
# 2. 双向 Edge 统计
# ============================================================
print("\n" + "=" * 70)
print("二、双向 Edge 统计")
print("=" * 70)

edge_pairs = set()
for f in features:
    p = f['properties']
    u, v = p['u'], p['v']
    edge_pairs.add((u, v))

reverse_pairs = set()
for (u, v) in edge_pairs:
    if (v, u) in edge_pairs:
        reverse_pairs.add((min(u,v), max(u,v)))

print(f"  单向 pair 总数: {len(edge_pairs)}")
print(f"  双向 pair 总数: {len(reverse_pairs)}")

# Bridge edge 双向统计
bridge_edge_pairs = set()
for f in bridge_edges:
    p = f['properties']
    bridge_edge_pairs.add((p['u'], p['v']))

bridge_reverse = set()
for (u, v) in bridge_edge_pairs:
    if (v, u) in bridge_edge_pairs:
        bridge_reverse.add((min(u,v), max(u,v)))

print(f"  Bridge Edge pair 总数: {len(bridge_edge_pairs)}")
print(f"  Bridge Edge 双向 pair: {len(bridge_reverse)}")

tunnel_edge_pairs = set()
for f in tunnel_edges:
    p = f['properties']
    tunnel_edge_pairs.add((p['u'], p['v']))

tunnel_reverse = set()
for (u, v) in tunnel_edge_pairs:
    if (v, u) in tunnel_edge_pairs:
        tunnel_reverse.add((min(u,v), max(u,v)))

print(f"  Tunnel Edge pair 总数: {len(tunnel_edge_pairs)}")
print(f"  Tunnel Edge 双向 pair: {len(tunnel_reverse)}")

# ============================================================
# 3. Bridge/Tunnel 候选案例
# ============================================================
print("\n" + "=" * 70)
print("三、Bridge/Tunnel 候选案例 (前10组)")
print("=" * 70)

# 按 name 分组，找出连续 bridge edge 组
bridge_by_name = defaultdict(list)
for f in bridge_edges:
    name = f['properties'].get('name', '')
    if name:
        bridge_by_name[name].append(f)

print("\n--- Bridge 候选案例 ---")
for name, edges_list in sorted(bridge_by_name.items(), key=lambda x: -len(x[1]))[:10]:
    refs = set(e['properties'].get('ref', '') for e in edges_list)
    districts = set(e['properties'].get('district_name', '') for e in edges_list)
    total_len = sum(e['properties'].get('length', 0) for e in edges_list)
    print(f"  [{name}]")
    print(f"    Edge 数: {len(edges_list)}, refs: {refs}, districts: {districts}")
    print(f"    总长度: {total_len/1000:.1f} km")

tunnel_by_name = defaultdict(list)
for f in tunnel_edges:
    name = f['properties'].get('name', '')
    if name:
        tunnel_by_name[name].append(f)

print("\n--- Tunnel 候选案例 ---")
for name, edges_list in sorted(tunnel_by_name.items(), key=lambda x: -len(x[1]))[:10]:
    refs = set(e['properties'].get('ref', '') for e in edges_list)
    districts = set(e['properties'].get('district_name', '') for e in edges_list)
    total_len = sum(e['properties'].get('length', 0) for e in edges_list)
    print(f"  [{name}]")
    print(f"    Edge 数: {len(edges_list)}, refs: {refs}, districts: {districts}")
    print(f"    总长度: {total_len/1000:.1f} km")

# ============================================================
# 4. Mock 数据统计
# ============================================================
print("\n" + "=" * 70)
print("四、Mock 桥隧数据统计")
print("=" * 70)

mock_path = os.path.join(WORKSPACE, 'src', 'data', 'mockData.js')
with open(mock_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Count bridgeArchives entries
import re
bridge_matches = re.findall(r"uuid: 'BR_\d+_\d+'", content)
print(f"  bridgeArchives 条目数: {len(bridge_matches)}")

# Count bridge vs tunnel
bridge_count = content.count("asset_type: 'bridge'")
tunnel_count = content.count("asset_type: 'tunnel'")
print(f"  bridge 类型: {bridge_count}")
print(f"  tunnel 类型: {tunnel_count}")

print("\n调查完成")
