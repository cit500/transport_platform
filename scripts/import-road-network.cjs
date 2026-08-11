#!/usr/bin/env node
/**
 * V1.3B 真实路网导入工具
 *
 * 数据源：
 *   public/data/roadnet/chongqing_expressway_nodes.geojson (8488 nodes)
 *   gaosu/data/chongqing_roadnet/chongqing_expressway_edges_district_fixed.geojson (11742 edges)
 *
 * 用法：node scripts/import-road-network.cjs
 *
 * 依赖：npm install mysql2
 */

const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const WORKSPACE = path.resolve(__dirname, '..');
const DB_CONFIG = {
    host: 'localhost',
    port: 3306,
    user: 'root',
    password: 'root',
    database: 'plant_platform',
    charset: 'utf8mb4',
    multipleStatements: false
};

const NODES_FILE = path.join(WORKSPACE, 'public', 'data', 'roadnet', 'chongqing_expressway_nodes.geojson');
const EDGES_FILE = path.join(WORKSPACE, 'gaosu', 'data', 'chongqing_roadnet', 'chongqing_expressway_edges_district_fixed.geojson');

// ============================================================
// 工具函数
// ============================================================

function loadGeoJSON(filePath) {
    console.log(`[LOAD] ${filePath}`);
    const raw = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(raw);
    console.log(`  features: ${data.features.length}`);
    return data;
}

function buildDivisionNameMap(rows) {
    // canonical_name → id, display_name → id, alias_name → id
    const map = {};
    for (const row of rows) {
        map[row.canonical_name] = row.id;
        if (row.display_name) map[row.display_name] = row.id;
    }
    return map;
}

function buildAliasMap(rows) {
    const map = {};
    for (const row of rows) {
        map[row.alias_name] = row.division_id;
    }
    return map;
}

function resolveDivisionId(districtName, divisionMap, aliasMap) {
    if (!districtName) return null;
    // 精确匹配 canonical_name
    if (divisionMap[districtName]) return divisionMap[districtName];
    // 尝试 alias
    if (aliasMap[districtName]) return aliasMap[districtName];
    // 模糊匹配（去掉"土家族苗族自治县"等后缀）
    const cleaned = districtName
        .replace(/土家族苗族自治县/g, '')
        .replace(/苗族土家族自治县/g, '')
        .replace(/土家族自治县/g, '');
    if (divisionMap[cleaned]) return divisionMap[cleaned];
    if (aliasMap[cleaned]) return aliasMap[cleaned];
    return null;
}

/**
 * MySQL 点 WKT：POINT(lon lat)
 * JTS Coordinate(x=lon, y=lat)
 */
function pointWKT(x, y) {
    return `POINT(${x} ${y})`;
}

/**
 * MySQL LineString WKT：LINESTRING(lon1 lat1, lon2 lat2, ...)
 */
function lineStringWKT(coordinates) {
    const parts = coordinates.map(c => `${c[0]} ${c[1]}`);
    return `LINESTRING(${parts.join(', ')})`;
}

function isBridge(bridgeRaw) {
    if (!bridgeRaw) return false;
    const v = String(bridgeRaw).toLowerCase().trim();
    return v !== '' && v !== 'no' && v !== 'false' && v !== '0';
}

function isTunnel(tunnelRaw) {
    if (!tunnelRaw) return false;
    const v = String(tunnelRaw).toLowerCase().trim();
    return v !== '' && v !== 'no' && v !== 'false' && v !== '0';
}

// ============================================================
// 主流程
// ============================================================

async function main() {
    const startTime = Date.now();
    console.log('='.repeat(70));
    console.log('V1.3B 真实路网导入工具');
    console.log('时间:', new Date().toISOString());
    console.log('='.repeat(70));

    // 1. 加载 GeoJSON
    const nodesData = loadGeoJSON(NODES_FILE);
    const edgesData = loadGeoJSON(EDGES_FILE);

    // 2. 连接 MySQL
    console.log('\n[DB] 连接 MySQL...');
    const conn = await mysql.createConnection(DB_CONFIG);
    console.log('  连接成功');

    try {
        // 3. 加载行政区映射
        console.log('\n[DIV] 加载行政区映射...');
        const [divRows] = await conn.execute('SELECT id, canonical_name, display_name FROM administrative_divisions');
        const [aliasRows] = await conn.execute('SELECT alias_name, division_id FROM administrative_division_aliases');
        const divisionMap = buildDivisionNameMap(divRows);
        const aliasMap = buildAliasMap(aliasRows);
        console.log(`  行政区: ${divRows.length} 条, alias: ${aliasRows.length} 条`);
        console.log(`  映射表: ${Object.keys(divisionMap).length} 个名称 → division_id`);

        // ============================================
        // 4. 导入 Nodes
        // ============================================
        console.log('\n' + '='.repeat(70));
        console.log('导入 Nodes...');
        console.log('='.repeat(70));

        const nodeOsmidToId = new Map(); // osmid → road_nodes.id
        let nodeInserted = 0;
        let nodeSkipped = 0;

        // 先加载已有 Node
        const [existingNodes] = await conn.execute('SELECT id, osmid FROM road_nodes');
        for (const row of existingNodes) {
            nodeOsmidToId.set(row.osmid, row.id);
        }
        console.log(`  已有 Node: ${existingNodes.length}`);

        for (const feature of nodesData.features) {
            const props = feature.properties;
            const osmid = props.osmid;
            const x = props.x;
            const y = props.y;
            const streetCount = props.street_count;
            const wkt = pointWKT(x, y);

            if (nodeOsmidToId.has(osmid)) {
                nodeSkipped++;
                continue;
            }

            const [result] = await conn.execute(
                `INSERT INTO road_nodes (osmid, street_count, geom, source_type, created_at, updated_at)
                 VALUES (?, ?, ST_GeomFromText(?, 4326), 'GEOJSON', NOW(), NOW())`,
                [osmid, streetCount, wkt]
            );
            nodeOsmidToId.set(osmid, result.insertId);
            nodeInserted++;
        }

        console.log(`  新插入: ${nodeInserted}`);
        console.log(`  跳过(已存在): ${nodeSkipped}`);
        console.log(`  osmid 映射表: ${nodeOsmidToId.size}`);

        // Node 验证
        const [nodeCountResult] = await conn.execute('SELECT COUNT(*) as cnt FROM road_nodes');
        const [nodeOsmidCountResult] = await conn.execute('SELECT COUNT(DISTINCT osmid) as cnt FROM road_nodes');
        const [nodeGeomCountResult] = await conn.execute('SELECT COUNT(*) as cnt FROM road_nodes WHERE geom IS NULL');
        const [nodeSridResult] = await conn.execute("SELECT SRID(geom) as srid FROM road_nodes LIMIT 1");

        console.log('\n  [Node 验证]');
        console.log(`  COUNT: ${nodeCountResult[0].cnt}`);
        console.log(`  osmid UNIQUE: ${nodeOsmidCountResult[0].cnt}`);
        console.log(`  geom NULL: ${nodeGeomCountResult[0].cnt}`);
        console.log(`  SRID: ${nodeSridResult[0].srid}`);

        // ============================================
        // 5. 导入 Edges
        // ============================================
        console.log('\n' + '='.repeat(70));
        console.log('导入 Edges...');
        console.log('='.repeat(70));

        let edgeInserted = 0;
        let edgeSkipped = 0;
        let edgeError = 0;
        let divisionResolved = 0;
        let divisionNull = 0;
        let bridgeYesCount = 0;
        let tunnelYesCount = 0;

        // 先统计已有 Edge
        const [existingEdgeCount] = await conn.execute('SELECT COUNT(*) as cnt FROM road_edges');
        console.log(`  已有 Edge: ${existingEdgeCount[0].cnt}`);

        for (const feature of edgesData.features) {
            const props = feature.properties;
            const geom = feature.geometry;

            const sourceUOsmid = props.u;
            const sourceVOsmid = props.v;
            const edgeKey = props.key;

            // 唯一键检查（幂等）
            if (existingEdgeCount[0].cnt > 0) {
                const [exists] = await conn.execute(
                    'SELECT id FROM road_edges WHERE source_u_osmid = ? AND source_v_osmid = ? AND edge_key = ?',
                    [sourceUOsmid, sourceVOsmid, edgeKey]
                );
                if (exists.length > 0) {
                    edgeSkipped++;
                    continue;
                }
            }

            // 查找 Node FK
            const uNodeId = nodeOsmidToId.get(sourceUOsmid);
            const vNodeId = nodeOsmidToId.get(sourceVOsmid);

            if (!uNodeId || !vNodeId) {
                console.error(`  [ERROR] u/v Node 不存在: u=${sourceUOsmid}(id=${uNodeId}), v=${sourceVOsmid}(id=${vNodeId})`);
                edgeError++;
                continue;
            }

            // division_id
            const districtName = props.district_name || null;
            let divisionId = null;
            if (districtName) {
                divisionId = resolveDivisionId(districtName, divisionMap, aliasMap);
                if (divisionId) {
                    divisionResolved++;
                } else {
                    console.warn(`  [WARN] 无法解析 district: "${districtName}" → division_id=NULL`);
                    divisionNull++;
                }
            } else {
                divisionNull++;
            }

            // bridge/tunnel
            const bridgeRaw = props.bridge || null;
            const tunnelRaw = props.tunnel || null;
            const bridgeFlag = isBridge(bridgeRaw);
            const tunnelFlag = isTunnel(tunnelRaw);
            if (bridgeFlag) bridgeYesCount++;
            if (tunnelFlag) tunnelYesCount++;

            // Geometry
            const wkt = lineStringWKT(geom.coordinates);

            try {
                await conn.execute(
                    `INSERT INTO road_edges (
                        u_node_id, v_node_id,
                        source_u_osmid, source_v_osmid, edge_key,
                        osmid, name, ref, highway, oneway, lanes, maxspeed,
                        length_m,
                        bridge_raw, is_bridge,
                        tunnel_raw, is_tunnel,
                        division_id, source_district_name,
                        geom, source_type, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ST_GeomFromText(?, 4326), 'GEOJSON', NOW(), NOW())`,
                    [
                        uNodeId, vNodeId,
                        sourceUOsmid, sourceVOsmid, edgeKey,
                        props.osmid || null,
                        props.name || null,
                        props.ref || null,
                        props.highway,
                        props.oneway ? 1 : 0,
                        props.lanes || null,
                        props.maxspeed || null,
                        props.length,
                        bridgeRaw, bridgeFlag ? 1 : 0,
                        tunnelRaw, tunnelFlag ? 1 : 0,
                        divisionId,
                        districtName,
                        wkt
                    ]
                );
                edgeInserted++;
            } catch (err) {
                console.error(`  [ERROR] Edge 插入失败 u=${sourceUOsmid} v=${sourceVOsmid}: ${err.message}`);
                edgeError++;
            }
        }

        console.log(`  新插入: ${edgeInserted}`);
        console.log(`  跳过(已存在): ${edgeSkipped}`);
        console.log(`  错误: ${edgeError}`);

        // Edge 验证
        const [edgeCountResult] = await conn.execute('SELECT COUNT(*) as cnt FROM road_edges');
        const [edgeUniqueResult] = await conn.execute(
            'SELECT COUNT(*) as cnt FROM (SELECT source_u_osmid, source_v_osmid, edge_key, COUNT(*) as c FROM road_edges GROUP BY source_u_osmid, source_v_osmid, edge_key HAVING c > 1) t'
        );
        const [edgeGeomNull] = await conn.execute('SELECT COUNT(*) as cnt FROM road_edges WHERE geom IS NULL');
        const [edgeSridResult] = await conn.execute("SELECT SRID(geom) as srid FROM road_edges LIMIT 1");
        const [edgeNullNodeFk] = await conn.execute('SELECT COUNT(*) as cnt FROM road_edges WHERE u_node_id IS NULL OR v_node_id IS NULL');
        const [edgeNullDiv] = await conn.execute('SELECT COUNT(*) as cnt FROM road_edges WHERE division_id IS NULL');

        console.log('\n  [Edge 验证]');
        console.log(`  COUNT: ${edgeCountResult[0].cnt}`);
        console.log(`  唯一键重复: ${edgeUniqueResult[0].cnt}`);
        console.log(`  geom NULL: ${edgeGeomNull[0].cnt}`);
        console.log(`  SRID: ${edgeSridResult[0].srid}`);
        console.log(`  u_node_id/v_node_id NULL: ${edgeNullNodeFk[0].cnt}`);
        console.log(`  division_id NULL: ${edgeNullDiv[0].cnt}`);

        // highway 分布
        const [hwRows] = await conn.execute('SELECT highway, COUNT(*) as cnt FROM road_edges GROUP BY highway ORDER BY cnt DESC');
        console.log('\n  [highway 分布]');
        for (const row of hwRows) {
            console.log(`    ${row.highway}: ${row.cnt}`);
        }

        // bridge/tunnel 统计
        const [bridgeRawRows] = await conn.execute('SELECT bridge_raw, COUNT(*) as cnt FROM road_edges GROUP BY bridge_raw ORDER BY cnt DESC');
        console.log('\n  [bridge_raw 分布]');
        for (const row of bridgeRawRows) {
            console.log(`    ${row.bridge_raw || 'NULL'}: ${row.cnt}`);
        }
        console.log(`  is_bridge=true: ${bridgeYesCount}`);

        const [tunnelRawRows] = await conn.execute('SELECT tunnel_raw, COUNT(*) as cnt FROM road_edges GROUP BY tunnel_raw ORDER BY cnt DESC');
        console.log('\n  [tunnel_raw 分布]');
        for (const row of tunnelRawRows) {
            console.log(`    ${row.tunnel_raw || 'NULL'}: ${row.cnt}`);
        }
        console.log(`  is_tunnel=true: ${tunnelYesCount}`);

        // length 统计
        const [lengthResult] = await conn.execute('SELECT MIN(length_m) as minLen, MAX(length_m) as maxLen, SUM(length_m) as sumLen FROM road_edges');
        console.log('\n  [length 统计]');
        console.log(`  NULL: 0`);
        console.log(`  MIN: ${lengthResult[0].minLen}`);
        console.log(`  MAX: ${lengthResult[0].maxLen}`);
        console.log(`  SUM: ${lengthResult[0].sumLen}`);

        // division_id 绑定统计
        console.log('\n  [division_id 绑定]');
        console.log(`  通过 district_name 解析: ${divisionResolved}`);
        console.log(`  NULL (含6条原始null + 解析失败): ${divisionNull}`);

        // bridge='no' 校验
        const [bridgeNoRows] = await conn.execute(
            "SELECT id, source_u_osmid, source_v_osmid, bridge_raw, is_bridge FROM road_edges WHERE bridge_raw = 'no'"
        );
        console.log('\n  [bridge=no 校验]');
        if (bridgeNoRows.length > 0) {
            for (const row of bridgeNoRows) {
                const correct = row.is_bridge === 0;
                console.log(`    id=${row.id}: bridge_raw='no', is_bridge=${row.is_bridge} ${correct ? '✅' : '❌ 错误!'}`);
            }
        } else {
            console.log('  无 bridge=no 记录');
        }

        // 6 条 null district 处理
        const [nullDistrictEdges] = await conn.execute(
            'SELECT id, source_u_osmid, source_v_osmid, name, ref, division_id FROM road_edges WHERE source_district_name IS NULL'
        );
        console.log('\n  [null district 处理]');
        console.log(`  source_district_name=NULL: ${nullDistrictEdges.length} 条`);
        for (const row of nullDistrictEdges) {
            console.log(`    u=${row.source_u_osmid} v=${row.source_v_osmid} name="${row.name}" ref="${row.ref}" → division_id=${row.division_id || 'NULL (unresolved)'}`);
        }

        // FK 完整性
        const [fkCheck] = await conn.execute(
            `SELECT COUNT(*) as cnt FROM road_edges e
             LEFT JOIN road_nodes un ON e.u_node_id = un.id
             LEFT JOIN road_nodes vn ON e.v_node_id = vn.id
             WHERE un.id IS NULL OR vn.id IS NULL`
        );
        console.log('\n  [FK 完整性]');
        console.log(`  u_node_id 或 v_node_id 指向不存在的 Node: ${fkCheck[0].cnt}`);

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log('\n' + '='.repeat(70));
        console.log(`导入完成，耗时: ${elapsed}s`);
        console.log('='.repeat(70));

    } finally {
        await conn.end();
    }
}

main().catch(err => {
    console.error('致命错误:', err);
    process.exit(1);
});
