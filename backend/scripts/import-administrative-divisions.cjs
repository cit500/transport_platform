/**
 * 行政区划可重复导入工具
 *
 * 功能：
 *   fixed GeoJSON → 读取 37 Feature → 映射 canonical/display → Geometry处理
 *   → division_key → aliases → Upsert → 校验
 *
 * 使用：
 *   node backend/scripts/import-administrative-divisions.cjs
 *
 * 特性：
 *   - Upsert 模式：division_key 已存在则更新，不存在则插入
 *   - division_id / division_key 保持稳定
 *   - 名称映射配置集中管理
 *   - 自动校验 37 区完整性
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ============================================================
// 配置
// ============================================================

const PROJECT_ROOT = path.resolve(__dirname, '../..');
const GEOJSON_PATH = path.join(PROJECT_ROOT, 'gaosu/data/chongqing_roadnet/chongqing_districts_county_fixed.geojson');
const MYSQL_BIN = 'C:\\Program Files\\MySQL\\MySQL Server 8.0\\bin\\mysql.exe';

/**
 * 37 区显式名称映射（canonical_name → 配置）
 * 不依赖字符串 replace 自动生成
 */
const DIVISION_MAP = {
  '渝中区':            { display: '渝中区',           key: '500103', type: 'district' },
  '万州区':            { display: '万州区',           key: '500101', type: 'district' },
  '涪陵区':            { display: '涪陵区',           key: '500102', type: 'district' },
  '南岸区':            { display: '南岸区',           key: '500108', type: 'district' },
  '沙坪坝区':          { display: '沙坪坝区',         key: '500106', type: 'district' },
  '九龙坡区':          { display: '九龙坡区',         key: '500107', type: 'district' },
  '巴南区':            { display: '巴南区',           key: '500113', type: 'district' },
  '大渡口区':          { display: '大渡口区',         key: '500104', type: 'district' },
  '北碚区':            { display: '北碚区',           key: '500109', type: 'district' },
  '綦江区':            { display: '綦江区',           key: '500110', type: 'district' },
  '江津区':            { display: '江津区',           key: '500116', type: 'district' },
  '永川区':            { display: '永川区',           key: '500118', type: 'district' },
  '合川区':            { display: '合川区',           key: '500117', type: 'district' },
  '大足区':            { display: '大足区',           key: '500111', type: 'district' },
  '璧山区':            { display: '璧山区',           key: '500120', type: 'district' },
  '铜梁区':            { display: '铜梁区',           key: '500151', type: 'district' },
  '潼南区':            { display: '潼南区',           key: '500152', type: 'district' },
  '荣昌区':            { display: '荣昌区',           key: '500153', type: 'district' },
  '南川区':            { display: '南川区',           key: '500119', type: 'district' },
  '长寿区':            { display: '长寿区',           key: '500115', type: 'district' },
  '开州区':            { display: '开州区',           key: '500154', type: 'district' },
  '梁平区':            { display: '梁平区',           key: '500155', type: 'district' },
  '武隆区':            { display: '武隆区',           key: '500156', type: 'district' },
  '黔江区':            { display: '黔江区',           key: '500114', type: 'district' },
  '城口县':            { display: '城口县',           key: '500229', type: 'county' },
  '丰都县':            { display: '丰都县',           key: '500230', type: 'county' },
  '垫江县':            { display: '垫江县',           key: '500231', type: 'county' },
  '忠县':              { display: '忠县',             key: '500233', type: 'county' },
  '云阳县':            { display: '云阳县',           key: '500235', type: 'county' },
  '奉节县':            { display: '奉节县',           key: '500236', type: 'county' },
  '巫山县':            { display: '巫山县',           key: '500237', type: 'county' },
  '巫溪县':            { display: '巫溪县',           key: '500238', type: 'county' },
  '石柱土家族自治县':  { display: '石柱县',           key: '500240', type: 'county' },
  '秀山土家族苗族自治县': { display: '秀山县',       key: '500241', type: 'county' },
  '酉阳土家族苗族自治县': { display: '酉阳县',       key: '500242', type: 'county' },
  '彭水苗族土家族自治县': { display: '彭水县',       key: '500243', type: 'county' },
  '两江新区':          { display: '两江新区',         key: '500190', type: 'special' },
};

/**
 * 别名定义
 */
const ALIASES = [
  { alias: '酉阳县',  canonical: '酉阳土家族苗族自治县',     type: 'short' },
  { alias: '石柱县',  canonical: '石柱土家族自治县',         type: 'short' },
  { alias: '秀山县',  canonical: '秀山土家族苗族自治县',     type: 'short' },
  { alias: '彭水县',  canonical: '彭水苗族土家族自治县',     type: 'short' },
  { alias: '江北区',  canonical: '两江新区',                 type: 'legacy' },
  { alias: '渝北区',  canonical: '两江新区',                 type: 'legacy' },
];

// ============================================================
// 工具函数
// ============================================================

function mysqlExec(sql) {
  const tmpFile = path.join(PROJECT_ROOT, '_tmp_import.sql');
  fs.writeFileSync(tmpFile, sql, 'utf8');
  try {
    const result = execSync(`"${MYSQL_BIN}" -u root -proot --default-character-set=utf8mb4 plant_platform < "${tmpFile}"`, {
      encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe']
    });
    return { ok: true, output: result };
  } catch (e) {
    return { ok: false, error: e.stderr || e.message };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (e) {}
  }
}

function mysqlQuery(sql) {
  const r = mysqlExec(sql);
  return r.ok ? r.output : null;
}

function ringToWKT(coords) {
  // MySQL SRID 4326 expects (lat, lon) order
  return '(' + coords.map(c => c[1] + ' ' + c[0]).join(',') + ','
    + coords[0][1] + ' ' + coords[0][0] + ')';
}

function coordsToWKT(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  if (geometry.type === 'Polygon') {
    return 'POLYGON(' + ringToWKT(geometry.coordinates[0]) +
      (geometry.coordinates.length > 1
        ? geometry.coordinates.slice(1).map(r => ',' + ringToWKT(r)).join('')
        : '') + ')';
  }
  if (geometry.type === 'MultiPolygon') {
    return 'MULTIPOLYGON(' + geometry.coordinates.map(poly =>
      '(' + poly.map(ring => ringToWKT(ring)).join(',') + ')'
    ).join(',') + ')';
  }
  return null;
}

function escapeSql(s) {
  if (s === null || s === undefined) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

// ============================================================
// 主逻辑
// ============================================================

function main() {
  console.log('=== 行政区划导入工具 ===\n');

  // 1. 读取 GeoJSON
  console.log('1. 读取 GeoJSON...');
  const geo = JSON.parse(fs.readFileSync(GEOJSON_PATH, 'utf8'));
  console.log(`   Feature 数量: ${geo.features.length}`);

  // 2. 验证 GeoJSON Feature 数量
  if (geo.features.length !== 37) {
    console.error(`   ❌ GeoJSON Feature 数量不是 37，终止导入`);
    process.exit(1);
  }

  // 3. 检查所有 Feature 都有映射
  console.log('\n2. 检查名称映射...');
  let missingMapping = 0;
  geo.features.forEach(f => {
    const name = f.properties.district_name;
    if (!DIVISION_MAP[name]) {
      console.error(`   ❌ 缺少映射: ${name}`);
      missingMapping++;
    }
  });
  if (missingMapping > 0) {
    console.error(`   有 ${missingMapping} 个 Feature 缺少映射，终止导入`);
    process.exit(1);
  }
  console.log('   所有 37 个 Feature 都有名称映射');

  // 4. 构建 Upsert SQL
  console.log('\n3. 构建 Upsert SQL...');
  const sqls = [];

  // Upsert divisions
  geo.features.forEach(f => {
    const name = f.properties.district_name;
    const m = DIVISION_MAP[name];
    const wkt = coordsToWKT(f.geometry);
    if (!wkt) {
      console.error(`   ❌ ${name}: geometry 为空`);
      return;
    }

    sqls.push(
      `INSERT INTO administrative_divisions (division_key, canonical_name, display_name, division_type, geom, is_active) VALUES ` +
      `(${escapeSql(m.key)}, ${escapeSql(name)}, ${escapeSql(m.display)}, ${escapeSql(m.type)}, ST_GeomFromText(${escapeSql(wkt)}, 4326), TRUE) ` +
      `ON DUPLICATE KEY UPDATE canonical_name=VALUES(canonical_name), display_name=VALUES(display_name), division_type=VALUES(division_type), geom=VALUES(geom), is_active=TRUE;`
    );
  });

  // Upsert aliases
  ALIASES.forEach(a => {
    const m = DIVISION_MAP[a.canonical];
    if (!m) return;
    sqls.push(
      `INSERT INTO administrative_division_aliases (alias_name, division_id, alias_type) VALUES ` +
      `(${escapeSql(a.alias)}, (SELECT id FROM administrative_divisions WHERE division_key = ${escapeSql(m.key)}), ${escapeSql(a.type)}) ` +
      `ON DUPLICATE KEY UPDATE division_id=VALUES(division_id), alias_type=VALUES(alias_type);`
    );
  });

  console.log(`   SQL 语句数: ${sqls.length} (${geo.features.length} divisions + ${ALIASES.length} aliases)`);

  // 5. 执行
  console.log('\n4. 执行 Upsert...');
  let success = 0, failed = 0;
  const fullSql = sqls.join('\n');
  const result = mysqlExec(fullSql);
  if (result.ok) {
    console.log('   ✅ 所有 SQL 执行成功');
    success = sqls.length;
  } else {
    console.error(`   ❌ SQL 执行失败: ${result.error.substring(0, 200)}`);
    failed = sqls.length;
  }

  // 6. 校验
  console.log('\n5. 校验...');
  const divCount = mysqlQuery('SELECT COUNT(*) as cnt FROM administrative_divisions');
  const aliasCount = mysqlQuery('SELECT COUNT(*) as cnt FROM administrative_division_aliases');
  const divNum = divCount ? parseInt(divCount.match(/\d+/)?.[0] || '0') : 0;
  const aliasNum = aliasCount ? parseInt(aliasCount.match(/\d+/)?.[0] || '0') : 0;

  const divOk = divNum === 37;
  const aliasOk = aliasNum >= 6;
  console.log(`   divisions: ${divNum} ${divOk ? '✅' : '❌'}`);
  console.log(`   aliases:   ${aliasNum} ${aliasOk ? '✅' : '❌'}`);

  // 校验所有 alias_name 唯一
  const aliasDup = mysqlQuery('SELECT COUNT(DISTINCT alias_name) as u, COUNT(*) as t FROM administrative_division_aliases');
  const adm = aliasDup?.match(/(\d+)\s+(\d+)/);
  const aliasUniqueOk = adm && adm[1] === adm[2];
  console.log(`   alias 唯一性: ${aliasUniqueOk ? '✅' : '❌'}`);

  // 校验所有 division_key 唯一
  const keyDup = mysqlQuery('SELECT COUNT(DISTINCT division_key) as u, COUNT(*) as t FROM administrative_divisions');
  const kdm = keyDup?.match(/(\d+)\s+(\d+)/);
  const keyUniqueOk = kdm && kdm[1] === kdm[2];
  console.log(`   division_key 唯一性: ${keyUniqueOk ? '✅' : '❌'}`);

  // 校验 Geometry
  const nullGeom = mysqlQuery('SELECT COUNT(*) as cnt FROM administrative_divisions WHERE geom IS NULL');
  const ng = nullGeom ? parseInt(nullGeom.match(/\d+/)?.[0] || '-1') : -1;
  console.log(`   Geometry 完整性: ${ng === 0 ? '✅' : '❌ (NULL: ' + ng + ')'}`);

  const allOk = divOk && aliasOk && aliasUniqueOk && keyUniqueOk && ng === 0;
  console.log(`\n=== 导入完成: ${allOk ? '✅ 全部通过' : '❌ 存在问题'} ===`);
  process.exit(allOk ? 0 : 1);
}

main();
