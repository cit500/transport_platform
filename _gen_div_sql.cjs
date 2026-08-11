const fs = require('fs');
const geo = JSON.parse(fs.readFileSync('gaosu/data/chongqing_roadnet/chongqing_districts_county_fixed.geojson', 'utf8'));

const DIVISION_MAP = {
  '渝中区':          { display: '渝中区',         key: '500103', type: 'district' },
  '万州区':          { display: '万州区',         key: '500101', type: 'district' },
  '涪陵区':          { display: '涪陵区',         key: '500102', type: 'district' },
  '南岸区':          { display: '南岸区',         key: '500108', type: 'district' },
  '沙坪坝区':        { display: '沙坪坝区',       key: '500106', type: 'district' },
  '九龙坡区':        { display: '九龙坡区',       key: '500107', type: 'district' },
  '巴南区':          { display: '巴南区',         key: '500113', type: 'district' },
  '大渡口区':        { display: '大渡口区',       key: '500104', type: 'district' },
  '北碚区':          { display: '北碚区',         key: '500109', type: 'district' },
  '綦江区':          { display: '綦江区',         key: '500110', type: 'district' },
  '江津区':          { display: '江津区',         key: '500116', type: 'district' },
  '永川区':          { display: '永川区',         key: '500118', type: 'district' },
  '合川区':          { display: '合川区',         key: '500117', type: 'district' },
  '大足区':          { display: '大足区',         key: '500111', type: 'district' },
  '璧山区':          { display: '璧山区',         key: '500120', type: 'district' },
  '铜梁区':          { display: '铜梁区',         key: '500151', type: 'district' },
  '潼南区':          { display: '潼南区',         key: '500152', type: 'district' },
  '荣昌区':          { display: '荣昌区',         key: '500153', type: 'district' },
  '南川区':          { display: '南川区',         key: '500119', type: 'district' },
  '长寿区':          { display: '长寿区',         key: '500115', type: 'district' },
  '开州区':          { display: '开州区',         key: '500154', type: 'district' },
  '梁平区':          { display: '梁平区',         key: '500155', type: 'district' },
  '武隆区':          { display: '武隆区',         key: '500156', type: 'district' },
  '黔江区':          { display: '黔江区',         key: '500114', type: 'district' },
  '城口县':          { display: '城口县',         key: '500229', type: 'county' },
  '丰都县':          { display: '丰都县',         key: '500230', type: 'county' },
  '垫江县':          { display: '垫江县',         key: '500231', type: 'county' },
  '忠县':            { display: '忠县',           key: '500233', type: 'county' },
  '云阳县':          { display: '云阳县',         key: '500235', type: 'county' },
  '奉节县':          { display: '奉节县',         key: '500236', type: 'county' },
  '巫山县':          { display: '巫山县',         key: '500237', type: 'county' },
  '巫溪县':          { display: '巫溪县',         key: '500238', type: 'county' },
  '石柱土家族自治县': { display: '石柱县',         key: '500240', type: 'county' },
  '秀山土家族苗族自治县': { display: '秀山县',   key: '500241', type: 'county' },
  '酉阳土家族苗族自治县': { display: '酉阳县',   key: '500242', type: 'county' },
  '彭水苗族土家族自治县': { display: '彭水县',   key: '500243', type: 'county' },
  '两江新区':        { display: '两江新区',       key: '500190', type: 'special' },
};

const ALIASES = [
  { alias: '酉阳县',        canonical: '酉阳土家族苗族自治县', type: 'short' },
  { alias: '石柱县',        canonical: '石柱土家族自治县',     type: 'short' },
  { alias: '秀山县',        canonical: '秀山土家族苗族自治县', type: 'short' },
  { alias: '彭水县',        canonical: '彭水苗族土家族自治县', type: 'short' },
  { alias: '江北区',        canonical: '两江新区',             type: 'legacy' },
  { alias: '渝北区',        canonical: '两江新区',             type: 'legacy' },
];

function coordsToWKT(geometry) {
  if (!geometry || !geometry.coordinates) return null;
  const type = geometry.type;
  if (type === 'Polygon') {
    return 'POLYGON(' + ringToWKT(geometry.coordinates[0]) +
      (geometry.coordinates.length > 1
        ? geometry.coordinates.slice(1).map(r => ',' + ringToWKT(r)).join('')
        : '') + ')';
  }
  if (type === 'MultiPolygon') {
    return 'MULTIPOLYGON(' + geometry.coordinates.map(poly =>
      '(' + poly.map(ring => ringToWKT(ring)).join(',') + ')'
    ).join(',') + ')';
  }
  return null;
}

function ringToWKT(coords) {
  // MySQL ST_GeomFromText(SRID 4326) expects (lat, lon) order
  // GeoJSON uses (lon, lat) order, so we swap: c[1]=lat, c[0]=lon
  return '(' + coords.map(c => c[1] + ' ' + c[0]).join(',') + ','
    + coords[0][1] + ' ' + coords[0][0] + ')';
}

let divisionSQL = [];
let aliasSQL = [];

geo.features.forEach((f) => {
  const raw = f.properties.district_name;
  const mapping = DIVISION_MAP[raw];
  if (!mapping) return;
  const wkt = coordsToWKT(f.geometry);
  if (!wkt) return;
  const isActive = (raw === '江北区' || raw === '渝北区') ? 'FALSE' : 'TRUE';
  divisionSQL.push(
    `('${mapping.key}', '${raw}', '${mapping.display}', '${mapping.type}', ST_GeomFromText('${wkt}', 4326), ${isActive})`
  );
});

ALIASES.forEach(a => {
  const mapping = DIVISION_MAP[a.canonical];
  if (!mapping) return;
  aliasSQL.push(`('${a.alias}', (SELECT id FROM administrative_divisions WHERE division_key = '${mapping.key}'), '${a.type}')`);
});

const sql = [
  'DELETE FROM administrative_division_aliases;',
  'DELETE FROM administrative_divisions;',
  '',
  'INSERT INTO administrative_divisions (division_key, canonical_name, display_name, division_type, geom, is_active) VALUES',
  divisionSQL.join(',\n') + ';',
  '',
  'INSERT INTO administrative_division_aliases (alias_name, division_id, alias_type) VALUES',
  aliasSQL.join(',\n') + ';',
].join('\n');

fs.writeFileSync('_div_insert.sql', sql, 'utf8');
console.log('SQL written, size:', sql.length, 'bytes, lines:', sql.split('\n').length);
