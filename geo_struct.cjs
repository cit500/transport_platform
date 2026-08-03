const fs = require('fs');
const path = require('path');

var p1 = path.resolve(__dirname, 'public/data/roadnet/chongqing_districts.geojson');
var p2 = path.resolve(__dirname, 'gaosu/data/chongqing_roadnet/chongqing_districts_county_fixed.geojson');

var g1 = JSON.parse(fs.readFileSync(p1, 'utf8'));
var g2 = JSON.parse(fs.readFileSync(p2, 'utf8'));

var out = '';
function log(s) { out += s + '\n'; }

log('===== OLD =====');
var f = g1.features[0];
log('Feature 0 type: ' + (f.geometry && f.geometry.type));
log('Properties: ' + JSON.stringify(f.properties, null, 2));
var coords = f.geometry && f.geometry.coordinates;
log('coords array 0 length: ' + (coords ? coords.length : 'null'));
if (coords && coords.length > 0) {
    var p0 = coords[0];
    if (Array.isArray(p0)) {
        if (Array.isArray(p0[0])) {
            if (Array.isArray(p0[0][0])) {
                log('It is MultiPolygon (4 levels)');
                log('First Polygon ring size: ' + p0[0].length);
                log('First 2 coords of first ring: ' + JSON.stringify(p0[0].slice(0, 2)));
            } else {
                log('It is Polygon (3 levels)');
                log('Ring size: ' + p0.length);
                log('First 2 coords: ' + JSON.stringify(p0.slice(0, 2)));
            }
        } else log('Unexpected (2 levels): ' + JSON.stringify(p0));
    }
}
log('\n===== NEW =====');
var f2 = g2.features[0];
log('Feature 0 type: ' + (f2.geometry && f2.geometry.type));
log('Properties: ' + JSON.stringify(f2.properties, null, 2));
var coords2 = f2.geometry && f2.geometry.coordinates;
log('coords array 0 length: ' + (coords2 ? coords2.length : 'null'));
if (coords2 && coords2.length > 0) {
    var q0 = coords2[0];
    if (Array.isArray(q0)) {
        if (Array.isArray(q0[0])) {
            if (Array.isArray(q0[0][0])) {
                log('It is MultiPolygon (4 levels)');
                log('First Polygon ring size: ' + q0[0].length);
                log('First 2 coords of first ring: ' + JSON.stringify(q0[0].slice(0, 2)));
            } else {
                log('It is Polygon (3 levels)');
                log('Ring size: ' + q0.length);
                log('First 2 coords: ' + JSON.stringify(q0.slice(0, 2)));
            }
        } else log('Unexpected (2 levels): ' + JSON.stringify(q0));
    }
}

log('\n===== All NEW geometry types =====');
var types = {};
g2.features.forEach(function(feat) {
    var t = feat.geometry && feat.geometry.type;
    types[t] = (types[t] || 0) + 1;
});
log(JSON.stringify(types, null, 2));

log('\n===== All OLD geometry types =====');
var types2 = {};
g1.features.forEach(function(feat) {
    var t = feat.geometry && feat.geometry.type;
    types2[t] = (types2[t] || 0) + 1;
});
log(JSON.stringify(types2, null, 2));

fs.writeFileSync(path.join(__dirname, 'geo_struct.txt'), out);
console.log('Written');