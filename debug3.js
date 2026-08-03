import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

var geoPath = path.join(__dirname, 'gaosu/data/chongqing_roadnet/chongqing_districts_county_fixed.geojson');
var geoJson = JSON.parse(fs.readFileSync(geoPath, 'utf8'));

console.log('GeoJSON type:', geoJson.type);
console.log('Features count:', geoJson.features.length);
console.log('\nFirst 3 features detail:');
geoJson.features.slice(0, 3).forEach(function(f, i) {
    console.log('\n--- Feature ' + i + ' ---');
    console.log('  properties:', JSON.stringify(f.properties));
    console.log('  geometry type:', f.geometry && f.geometry.type);
    var coords = f.geometry && f.geometry.coordinates;
    var flatPts = [];
    function flatten(c) {
        if (!c) return;
        if (typeof c[0] === 'number') flatPts.push(c);
        else c.forEach(flatten);
    }
    flatten(coords);
    console.log('  total points:', flatPts.length);
    if (flatPts.length > 0) {
        var xs = flatPts.map(p => p[0]);
        var ys = flatPts.map(p => p[1]);
        console.log('  lng range:', Math.min(...xs), '~', Math.max(...xs));
        console.log('  lat range:', Math.min(...ys), '~', Math.max(...ys));
    }
});

console.log('\n=== 检查有没有 feature 是空 geometry ===');
var emptyCount = 0;
geoJson.features.forEach(function(f, i) {
    var coords = f.geometry && f.geometry.coordinates;
    if (!coords || (Array.isArray(coords) && coords.length === 0)) {
        console.log('  EMPTY [' + i + ']:', f.properties);
        emptyCount++;
    }
});
console.log('Empty features:', emptyCount);