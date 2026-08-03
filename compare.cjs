const fs = require('fs');
const path = require('path');

var p1 = path.resolve(__dirname, 'public/data/roadnet/chongqing_districts.geojson');
var p2 = path.resolve(__dirname, 'gaosu/data/chongqing_roadnet/chongqing_districts_county_fixed.geojson');

var g1 = JSON.parse(fs.readFileSync(p1, 'utf8'));
var g2 = JSON.parse(fs.readFileSync(p2, 'utf8'));

var lines = [];
lines.push('===== OLD (public/data/roadnet/chongqing_districts.geojson) =====');
lines.push('type: ' + g1.type + ', features: ' + g1.features.length);
lines.push('First 5 feature properties:');
g1.features.slice(0, 5).forEach(function(f, i) {
    lines.push('  [' + i + '] ' + JSON.stringify(f.properties));
});
lines.push('First feature geometry type: ' + (g1.features[0].geometry && g1.features[0].geometry.type));
lines.push('First feature geometry.coordinates depth: ' + JSON.stringify(getDepth(g1.features[0].geometry && g1.features[0].geometry.coordinates)));

lines.push('\n===== NEW (gaosu/data/chongqing_roadnet/chongqing_districts_county_fixed.geojson) =====');
lines.push('type: ' + g2.type + ', features: ' + g2.features.length);
lines.push('First 5 feature properties:');
g2.features.slice(0, 5).forEach(function(f, i) {
    lines.push('  [' + i + '] ' + JSON.stringify(f.properties));
});
lines.push('First feature geometry type: ' + (g2.features[0].geometry && g2.features[0].geometry.type));
lines.push('First feature geometry.coordinates depth: ' + JSON.stringify(getDepth(g2.features[0].geometry && g2.features[0].geometry.coordinates)));

lines.push('\n===== All OLD names =====');
var oldNames = g1.features.map(function(f){return (f.properties && (f.properties.name || f.properties.NAME || f.properties.district_name)) || '?';});
lines.push(oldNames.join(', '));

lines.push('\n===== All NEW names =====');
var newNames = g2.features.map(function(f){return (f.properties && (f.properties.name || f.properties.NAME || f.properties.district_name)) || '?';});
lines.push(newNames.join(', '));

fs.writeFileSync(path.join(__dirname, 'geojson_compare.txt'), lines.join('\n'));
console.log('Done -> geojson_compare.txt');

function getDepth(arr) {
    if (!arr) return 0;
    var d = 0;
    var cur = arr;
    while (Array.isArray(cur) && cur.length > 0) {
        d++;
        cur = cur[0];
    }
    return d;
}