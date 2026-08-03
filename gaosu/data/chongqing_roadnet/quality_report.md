# 重庆高速/快速路网离线数据质量检查报告

- 生成时间：2026-07-05 18:57:28
- 数据目录：`data\chongqing_roadnet`
- 总体结论：**✅ PASS**

## 1. 关键指标

- `edge_count`：11742
- `node_count`：8488
- `district_count`：154
- `length_attr_km`：24904.918
- `length_geom_km`：28779.632
- `length_diff_rate`：13.46%
- `missing_district_count`：6
- `missing_district_rate`：0.05%
- `grid_district_count`：0
- `midpoint_outside_rate`：0.05%
- `unexpected_highway_count`：0
- `unexpected_highway_rate`：0.00%
- `motorway_series_count`：6994
- `trunk_series_count`：4748
- `graph_nodes`：8488
- `graph_edges`：11742
- `weak_component_count`：20
- `largest_weak_component_ratio`：98.92%

## 2. 检查项明细

| 状态 | 检查项 | 当前值 | 标准 | 建议 |
|---|---|---|---|---|
| ✅ PASS | 文件存在性：graphml | data\chongqing_roadnet\chongqing_expressway.graphml / 12.84 MB | 文件必须存在且大小大于 0 | 如果失败，先重新运行 download_chongqing_expressway.py |
| ✅ PASS | 文件存在性：gpkg | data\chongqing_roadnet\chongqing_expressway.gpkg / 10.22 MB | 文件必须存在且大小大于 0 | 如果失败，先重新运行 download_chongqing_expressway.py |
| ✅ PASS | 文件存在性：edges | data\chongqing_roadnet\chongqing_expressway_edges.geojson / 13.41 MB | 文件必须存在且大小大于 0 | 如果失败，先重新运行 download_chongqing_expressway.py |
| ✅ PASS | 文件存在性：nodes | data\chongqing_roadnet\chongqing_expressway_nodes.geojson / 1.56 MB | 文件必须存在且大小大于 0 | 如果失败，先重新运行 download_chongqing_expressway.py |
| ✅ PASS | 文件存在性：districts | data\chongqing_roadnet\chongqing_districts.geojson / 1.98 MB | 文件必须存在且大小大于 0 | 如果失败，先重新运行 download_chongqing_expressway.py |
| ✅ PASS | 文件存在性：html | data\chongqing_roadnet\verify_chongqing_expressway.html / 15.78 MB | 文件必须存在且大小大于 0 | 如果失败，先重新运行 download_chongqing_expressway.py |
| ✅ PASS | edges 字段完整性 | 缺失：无 | 应包含 u/v/key/osmid/name/highway/ref/length/district_name 等核心字段 | 如果失败，检查下载脚本 keep_useful_edge_columns() 是否被修改 |
| ✅ PASS | nodes 字段完整性 | 缺失：无 | 应包含 osmid/x/y/street_count 等核心字段 | 如果失败，检查下载脚本 keep_useful_node_columns() 是否被修改 |
| ✅ PASS | districts 字段完整性 | 缺失：无 | 应包含 district_name/district_adcode | 如果失败，检查区县边界清洗逻辑 |
| ✅ PASS | edges 坐标系 | EPSG:4326 | 前端 Leaflet 使用建议为 EPSG:4326 / WGS84 / CRS84 | 如果不是 WGS84，请在导出 GeoJSON 前统一 to_crs('EPSG:4326') |
| ✅ PASS | nodes 坐标系 | EPSG:4326 | 前端 Leaflet 使用建议为 EPSG:4326 / WGS84 / CRS84 | 如果不是 WGS84，请在导出 GeoJSON 前统一 to_crs('EPSG:4326') |
| ✅ PASS | districts 坐标系 | EPSG:4326 | 前端 Leaflet 使用建议为 EPSG:4326 / WGS84 / CRS84 | 如果不是 WGS84，请在导出 GeoJSON 前统一 to_crs('EPSG:4326') |
| ✅ PASS | edges 空几何 | empty=0, null=0, total=11742 | 正常应为 0 | 如果失败，删除空几何或回到下载阶段检查 OSM 要素 |
| ✅ PASS | edges 无效几何 | invalid=0, rate=0.0000% | 建议低于 0.10% | 少量无效几何可用 make_valid 修复；大量无效说明数据清洗有问题 |
| ✅ PASS | edges 几何类型 | {'LineString': 11742} | 期望类型：LineString, MultiLineString | 如果出现 GeometryCollection 或其他类型，正式接入前建议过滤或拆分 |
| ✅ PASS | nodes 空几何 | empty=0, null=0, total=8488 | 正常应为 0 | 如果失败，删除空几何或回到下载阶段检查 OSM 要素 |
| ✅ PASS | nodes 无效几何 | invalid=0, rate=0.0000% | 建议低于 0.10% | 少量无效几何可用 make_valid 修复；大量无效说明数据清洗有问题 |
| ✅ PASS | nodes 几何类型 | {'Point': 8488} | 期望类型：Point | 如果出现 GeometryCollection 或其他类型，正式接入前建议过滤或拆分 |
| ✅ PASS | districts 空几何 | empty=0, null=0, total=154 | 正常应为 0 | 如果失败，删除空几何或回到下载阶段检查 OSM 要素 |
| ✅ PASS | districts 无效几何 | invalid=0, rate=0.0000% | 建议低于 0.10% | 少量无效几何可用 make_valid 修复；大量无效说明数据清洗有问题 |
| ✅ PASS | districts 几何类型 | {'Polygon': 147, 'MultiPolygon': 7} | 期望类型：Polygon, MultiPolygon | 如果出现 GeometryCollection 或其他类型，正式接入前建议过滤或拆分 |
| ✅ PASS | 路网边数量 | 11742 | edges 数量必须大于 0 | 如果为 0，说明路网未成功下载或 GeoJSON 读取失败 |
| ✅ PASS | 路网节点数量 | 8488 | nodes 数量必须大于 0 | 如果为 0，说明节点文件未成功导出 |
| ✅ PASS | 区县数量 | 154 | 建议不少于 30 个；真实区县边界通常接近 38，网格备用通常接近 36 | 如果显著偏少，说明 Overpass 行政边界下载或清洗过滤有问题 |
| ✅ PASS | 路网总里程 | length字段=24904.92 km, 几何估算=28779.63 km, 差异=13.46% | 用于排除明显下载失败，建议高于 1000.0 km | 若远低于预期，检查 ROAD_FILTER 是否只保留了极少道路 |
| ✅ PASS | 道路区县归属缺失率 | 6/11742 = 0.05% | 建议低于 1.00% | 如果偏高，优先检查区县边界是否使用了网格备用、坐标系是否一致、道路是否位于边界外 |
| ✅ PASS | 区县边界是否为真实行政区 | 网格区县数量=0 | 正式平台接入前建议使用真实区县边界，不建议用网格备用方案 | 如果出现网格_，说明下载脚本使用了备用网格方案，需要重新下载真实区县边界 |
| ✅ PASS | 道路中点落入区县边界抽样检查 | 1/2000 = 0.05% | 建议低于 3.00% | 如果偏高，说明区县边界覆盖不完整或道路边界外截断较多 |
| ✅ PASS | 道路等级过滤结果 | 非 motorway/trunk 系列边数=0/11742 = 0.00% | 当前下载目标应主要为 motorway/motorway_link/trunk/trunk_link | 如果非目标等级偏多，检查 ROAD_FILTER 或 highway 字段字符串化结果 |
| ✅ PASS | 高速与快速路分层可用性 | motorway系列=6994, trunk系列=4748 | 如果平台要区分高速与快速路，两类最好都有数据；只做严格高速则 trunk 为 0 也可以 | 后续接入 Plant_v2 时建议 motorway 与 trunk 做成两个逻辑图层 |
| ✅ PASS | GraphML 与 GeoJSON 数量对照 | GraphML nodes=8488, edges=11742 / GeoJSON nodes=8488, edges=11742 | GraphML 和 GeoJSON 数量不必完全一致，但不能为空 | 如果差异极大，检查导出逻辑是否发生过滤 |
| ✅ PASS | 路网弱连通性 | 连通分量数=20, 最大分量节点占比=98.92%, Top5=[8396, 50, 8, 2, 2] | 建议最大弱连通子图占比高于 70% | 如果偏低，可能是路网被过度截断、仅保留高速导致多孤立组件，路径规划需只在最大连通子图或分区图中执行 |

## 3. 道路等级里程统计

| highway_group   |   edge_count |   length_km |
|:----------------|-------------:|------------:|
| trunk           |         2881 |   12638.478 |
| motorway        |         2909 |    9559.088 |
| motorway_link   |         4085 |    2211.745 |
| trunk_link      |         1867 |     495.607 |

## 4. 区县道路里程 Top 20

| district_name   |   motorway |   motorway_link |     trunk |   trunk_link |   total_length_km |
|:----------------|-----------:|----------------:|----------:|-------------:|------------------:|
| 重庆市          |   9514.105 |        2211.745 | 12638.478 |      495.607 |         24859.935 |
| 未匹配          |     44.983 |           0.000 |     0.000 |        0.000 |            44.983 |

## 5. 问题样本

|           u |           v |   key | osmid                                                                                                                                                                                                                                                                                   | name              | ref     | highway   |    length | district_name   | problem               |
|------------:|------------:|------:|:----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|:------------------|:--------|:----------|----------:|:----------------|:----------------------|
|  5355406288 |  5354994009 |     0 | 554936064;554936067;554936069;989041086;989041087;989041090;989041091;989041220;989041095;989041096;989041225;989041223;989041229;989041230;989041231;989041234;989041236;989041239;989041240;554936025;554979676;554979679;554979681;554979683;554979685;554979686;554936037;554936044 | 恩广高速          | G5012   | motorway  | 14763.3   |                 | district_name_missing |
| 12182948321 | 12459161505 |     0 | 1346905313;1346905315;1346905317;1346905319;1316245425;1346905304;1459340286                                                                                                                                                                                                            | 武道高速          | S27;S31 | motorway  |  9617.83  |                 | district_name_missing |
| 12459161483 | 12182948355 |     0 | 1346905314;1346905316;1346905318;1346905320;1316245423;1346905303;1459340285                                                                                                                                                                                                            | 武道高速          | S27;S31 | motorway  |  9447.09  |                 | district_name_missing |
|   841524177 |  4862494726 |     0 | 494491160;1006172044;1006172043;236763428                                                                                                                                                                                                                                               | 沪蓉高速          | G42     | motorway  |  8727.79  |                 | district_name_missing |
|  5151243701 |  5151243714 |     0 | 530483864;530483865;1251660533;530483862                                                                                                                                                                                                                                                | 银昆高速;伏龙大桥 | G85     | motorway  |  1748.53  |                 | district_name_missing |
|  3538968349 |  5576907652 |     0 | 347655813                                                                                                                                                                                                                                                                               | 成渝环线高速      | G93     | motorway  |   678.173 |                 | district_name_missing |

## 6. 给 ChatGPT 的回传建议

请将以下文件或内容回传：
- `quality_report.md` 的全文或截图
- `quality_report.json`
- 如果有 WARN/FAIL，再附上 `edge_problem_samples.csv`

判断标准建议：
- 没有 FAIL；
- 区县归属缺失率小于 1%；
- 区县边界不是 `网格_` 备用方案；
- motorway/trunk 分布符合预期；
- 最大弱连通子图占比不低于 70%，或者能解释为高速边界截断/匝道导致。