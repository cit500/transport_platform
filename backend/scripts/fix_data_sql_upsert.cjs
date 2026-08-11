/**
 * 修复 data.sql：将 DELETE+INSERT 替换为 UPSERT
 */
const fs = require('fs');
const path = require('path');

const dataSqlPath = path.join(__dirname, '..', 'src', 'main', 'resources', 'data.sql');
let sql = fs.readFileSync(dataSqlPath, 'utf8');

// 找到 administrative_divisions 部分的开始和结束
const divStart = sql.indexOf('-- ==================== administrative_divisions ====================');
const aliasStart = sql.indexOf('-- ==================== administrative_division_aliases ====================');

if (divStart < 0 || aliasStart < 0) {
  console.error('ERROR: 未找到 administrative_divisions 或 aliases 标记');
  process.exit(1);
}

// 提取 divisions INSERT 语句（从 INSERT INTO 到下一个空行或 --）
const divInsertStart = sql.indexOf('INSERT INTO administrative_divisions', divStart);
const divInsertEnd = sql.indexOf('-- ==================== administrative_division_aliases', divStart);
const divInsertBlock = sql.substring(divInsertStart, divInsertEnd).trim();

// 将 INSERT INTO 改为 INSERT INTO ... ON DUPLICATE KEY UPDATE
const fixedDivInsert = divInsertBlock
  .replace(
    'INSERT INTO administrative_divisions (division_key, canonical_name, display_name, division_type, geom, is_active) VALUES',
    'INSERT INTO administrative_divisions (division_key, canonical_name, display_name, division_type, geom, is_active) VALUES'
  );

// 提取 aliases INSERT 语句
const aliasInsertStart = sql.indexOf('INSERT INTO administrative_division_aliases', aliasStart);
const aliasInsertEnd = sql.indexOf('\n\n', aliasInsertStart + 10);
const aliasInsertBlock = sql.substring(aliasInsertStart, aliasInsertEnd > 0 ? aliasInsertEnd : sql.length).trim();

// 构建新的 data.sql 部分
const newDivisionsSection = `
-- ==================== administrative_divisions ====================
-- UPSERT 模式：division_key 已存在则更新，不存在则插入
-- id 保持稳定，不会因重复启动而变化

${fixedDivInsert.replace(/;$/, ' ON DUPLICATE KEY UPDATE canonical_name=VALUES(canonical_name), display_name=VALUES(display_name), division_type=VALUES(division_type), geom=VALUES(geom), is_active=TRUE;')}
`;

const newAliasesSection = `
-- ==================== administrative_division_aliases ====================
-- UPSERT 模式：alias_name 已存在则更新

${aliasInsertBlock.replace(/;$/, ' ON DUPLICATE KEY UPDATE division_id=VALUES(division_id), alias_type=VALUES(alias_type);')}
`;

// 替换 data.sql 中从 administrative_divisions 到文件末尾的内容
sql = sql.substring(0, divStart).trimEnd() + '\n\n' + newDivisionsSection + newAliasesSection + '\n';

fs.writeFileSync(dataSqlPath, sql, 'utf8');
console.log('data.sql 已更新为 UPSERT 模式');
console.log('文件大小:', sql.length, 'bytes');
