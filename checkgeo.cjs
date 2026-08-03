process.chdir(__dirname);
const fs = require('fs');
const path = require('path');
const p = require.resolve('./package.json');
const root = path.dirname(p);
console.log('root:', root);

const g1 = JSON.parse(fs.readFileSync(path.join(root, 'public', 'data', 'roadnet', 'chongqing_districts.geojson'), 'utf8'));
const g2 = JSON.parse(fs.readFileSync(path.join(root, 'gaosu', 'data', 'chongqing_roadnet', 'chongqing_districts_county_fixed.geojson'), 'utf8'));

function getPropsNames(feat) {
    let p = feat.properties || {};
    return p.name || p.NAME || p.fullname || p.district_name || p.DIST_NAME || '???';
}

console.log('\n== OLD count =', g1.features.length);
console.log('OLD first 5 props:');
g1.features.slice(0, 5).forEach((f, i) => {
    const p = f.properties || {};
    const geomType = f.geometry ? f.geometry.type : 'N/A';
    const c = f.geometry && f.geometry.coordinates;
    let depth = 0; let cur = c;
    while (Array.isArray(cur) && cur.length > 0) { depth++; cur = cur[0]; }
    console.log(`  [${i}] name=${JSON.stringify(getPropsNames(f))}, geomType=${geomType}, depth=${depth}, propsKeys=${Object.keys(p)}`);
});
const oldNames = g1.features.map(getPropsNames);
console.log('\nALL OLD names: [' + oldNames.join(', ') + ']');

console.log('\n== NEW count =', g2.features.length);
console.log('NEW first 5 props:');
g2.features.slice(0, 5).forEach((f, i) => {
    const p = f.properties || {};
    const geomType = f.geometry ? f.geometry.type : 'N/A';
    const c = f.geometry && f.geometry.coordinates;
    let depth = 0; let cur = c;
    while (Array.isArray(cur) && cur.length > 0) { depth++; cur = cur[0]; }
    console.log(`  [${i}] name=${JSON.stringify(getPropsNames(f))}, geomType=${geomType}, depth=${depth}, propsKeys=${Object.keys(p)}`);
});
const newNames = g2.features.map(getPropsNames);
console.log('\nALL NEW names: [' + newNames.join(', ') + ']');

// Check geom types
const t1 = {}; g1.features.forEach(f => { const t = f.geometry && f.geometry.type; t1[t] = (t1[t]||0)+1; });
const t2 = {}; g2.features.forEach(f => { const t = f.geometry && f.geometry.type; t2[t] = (t2[t]||0)+1; });
console.log('\nOLD geom types:', t1);
console.log('NEW geom types:', t2);