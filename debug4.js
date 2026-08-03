import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

var geoPath = path.join(__dirname, 'gaosu/data/chongqing_roadnet/chongqing_districts_county_fixed.geojson');
var geoJson = JSON.parse(fs.readFileSync(geoPath, 'utf8'));

var lines = [];
lines.push('GeoJSON type: ' + geoJson.type);
lines.push('Features count: ' + geoJson.features.length);
lines.push('\nFirst 3 features detail:');
geoJson.features.slice(0, 3).forEach(function(f, i) {
    lines.push('\n--- Feature ' + i + ' ---');
    lines.push('  properties: ' + JSON.stringify(f.properties));
    lines.push('  geometry type: ' + (f.geometry && f.geometry.type));
    var coords = f.geometry && f.geometry.coordinates;
    var flatPts = [];
    function flatten(c) {
        if (!c) return;
        if (typeof c[0] === 'number') flatPts.push(c);
        else c.forEach(flatten);
    }
    flatten(coords);
    lines.push('  total points: ' + flatPts.length);
    if (flatPts.length > 0) {
        var xs = flatPts.map(p => p[0]);
        var ys = flatPts.map(p => p[1]);
        lines.push('  lng range: ' + Math.min(...xs) + ' ~ ' + Math.max(...xs));
        lines.push('  lat range: ' + Math.min(...ys) + ' ~ ' + Math.max(...ys));
    }
});

lines.push('\n=== 检查有没有 feature 是空 geometry ===');
var emptyCount = 0;
geoJson.features.forEach(function(f, i) {
    var coords = f.geometry && f.geometry.coordinates;
    if (!coords || (Array.isArray(coords) && coords.length === 0)) {
        lines.push('  EMPTY [' + i + ']: ' + JSON.stringify(f.properties));
        emptyCount++;
    }
});
lines.push('Empty features: ' + emptyCount);
lines.push('\n=== All district names ===');
geoJson.features.forEach(function(f, i) {
    lines.push('  [' + i + '] ' + (f.properties && f.properties.district_name || f.properties && f.properties.name || 'NO NAME'));
});

fs.writeFileSync(path.join(__dirname, 'debug_output.txt'), lines.join('\n'), 'utf8');
console.log('Output written to debug_output.txt');