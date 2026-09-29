<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import L from 'leaflet';
import { mapConfig } from '../config/map.js';
import { createBaseLayers } from '../services/mapProvider.js';

const props = defineProps({
    regions: Object,
    regionDetails: { type: Array, default: () => [] },
    roads: Object,
    assets: { type: Array, default: () => [] },
    roadResults: { type: Array, default: () => [] },
    defaultLayerVisibility: {
        type: Object,
        default: () => ({ regions: true, roads: true, assets: true })
    },
    defaultBase: { type: String, default: 'satellite' },
    decoratedRegions: { type: Boolean, default: false },
    outlineRegions: { type: Boolean, default: false },
    regionIndicator: { type: String, default: 'resilienceIndex' },
    showRegionLabels: { type: Boolean, default: false },
    center: { type: Array, default: () => [30.2, 107.5] },
    zoom: { type: Number, default: 8 },
    className: { type: String, default: 'heavy-map' }
});
const emit = defineEmits(['region-click', 'asset-click']);
const element = ref();
let map;
let regionLayer;
let regionSvgRenderer;
let regionLabelLayer;
let regionLabelEntries = [];
let roadLayer;
let assetLayer;
let routeLayer;
let baseLayer;
let satellite;
let electronic;
let selectedRegionName = '';
let initialRegionFit = false;
const layerVisibility = {
    regions: props.defaultLayerVisibility.regions !== false,
    roads: props.defaultLayerVisibility.roads !== false,
    assets: props.defaultLayerVisibility.assets !== false
};

const escapeHtml = (value) => String(value ?? '-').replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
const numberText = (value, digits = 0, suffix = '') => value != null && value !== '' && Number.isFinite(Number(value)) ? `${Number(value).toFixed(digits)}${suffix}` : '-';
function regionDetail(feature) {
    const properties = feature.properties || {};
    return props.regionDetails.find((item) =>
        (properties.regionCode && item.regionCode === properties.regionCode) ||
        item.regionName === (properties.regionName || properties.name || properties.NAME)
    ) || properties;
}
function metricColor(value) {
    if (value == null || value === '') return props.decoratedRegions ? '#124766' : '#526f84';
    const score = Number(value);
    if (!Number.isFinite(score)) return props.decoratedRegions ? '#124766' : '#526f84';
    const normalized = Math.max(0, Math.min(100, score));
    const stops = normalized <= 50
        ? [[239, 107, 117], [246, 200, 95], normalized / 50]
        : [[246, 200, 95], [57, 200, 137], (normalized - 50) / 50];
    const [start, end, ratio] = stops;
    const rgb = start.map((channel, index) => Math.round(channel + (end[index] - channel) * ratio));
    return `rgb(${rgb.join(',')})`;
}
function regionStyle(feature) {
    const name = feature.properties?.regionName || feature.properties?.name || feature.properties?.NAME;
    const selected = name === selectedRegionName;
    const detail = regionDetail(feature);
    const value = detail[props.regionIndicator];
    return {
        className: props.decoratedRegions ? 'district-region-shape' : '',
        color: props.decoratedRegions ? (selected ? '#d8fbff' : '#50d7f3') : (selected ? '#15191d' : '#3c444b'),
        weight: selected ? 2.6 : props.decoratedRegions ? 1.45 : 1.15,
        opacity: .96,
        fillColor: metricColor(value),
        fillOpacity: props.outlineRegions ? 0 : props.decoratedRegions ? (selected ? .95 : .83) : (selected ? .72 : .56)
    };
}
function popupContent(feature) {
    const item = regionDetail(feature);
    const name = item.regionName || feature.properties?.regionName || '行政区';
    return `<div class="region-map-popup"><strong>${escapeHtml(name)}</strong><div><span>韧性指数</span><b>${numberText(item.resilienceIndex, 1, ' 分')}</b></div><div><span>路网连通度</span><b>${numberText(item.connectivityScore, 1, ' 分')}</b></div><div><span>灾害恢复能力</span><b>${numberText(item.recoveryCapacity, 1, ' 分')}</b></div></div>`;
}

function refreshRegionLabels() {
    if (!map || !regionLabelLayer || !map.hasLayer(regionLabelLayer)) return;
    const occupied = [];
    for (const entry of regionLabelEntries) {
        const icon = entry.marker.getElement();
        if (!icon) continue;
        const point = map.latLngToContainerPoint(entry.position);
        const width = entry.name.length > 5 ? 110 : 82;
        const box = { left: point.x + 19, right: point.x + 19 + width, top: point.y - 37, bottom: point.y - 8 };
        const inView = box.right > 0 && box.left < map.getSize().x && box.bottom > 0 && box.top < map.getSize().y;
        const crowded = occupied.some((other) => box.left < other.right && box.right > other.left && box.top < other.bottom && box.bottom > other.top);
        icon.classList.toggle('is-label-suppressed', !inView || crowded);
        if (inView && !crowded) occupied.push(box);
    }
}

function addRegionLabel(feature, layer, name) {
    const centerLatitude = Number(feature.properties?.centerLatitude);
    const centerLongitude = Number(feature.properties?.centerLongitude);
    const position = feature.properties?.centerLatitude != null && feature.properties?.centerLongitude != null
        && Number.isFinite(centerLatitude) && Number.isFinite(centerLongitude)
        ? L.latLng(centerLatitude, centerLongitude) : layer.getBounds().getCenter();
    const detail = regionDetail(feature);
    const metric = props.regionIndicator ? detail[props.regionIndicator] : null;
    const value = metric == null ? '' : `<em>${numberText(metric, 1)}</em>`;
    const icon = L.divIcon({
        className: 'district-label-marker',
        html: `<span class="district-pin"></span><span class="district-leader"></span><span class="district-label">${escapeHtml(name)}${value}</span>`,
        iconSize: [1, 1], iconAnchor: [0, 0]
    });
    const marker = L.marker(position, { icon, interactive: false, keyboard: false });
    marker.addTo(regionLabelLayer);
    regionLabelEntries.push({ marker, position, name });
}

function fitRegions() {
    if (map && regionLayer?.getBounds().isValid()) {
        map.fitBounds(regionLayer.getBounds(), { padding: [36, 38], maxZoom: 8 });
    }
}

function renderRegions() {
    if (!map || !props.regions) return;
    regionLayer?.remove();
    regionLabelLayer?.remove();
    regionLabelLayer = props.decoratedRegions ? L.layerGroup() : null;
    regionLabelEntries = [];
    regionLayer = L.geoJSON(props.regions, {
        renderer: regionSvgRenderer || undefined,
        style: regionStyle,
        onEachFeature(feature, layer) {
            const name = feature.properties?.regionName || feature.properties?.name || feature.properties?.NAME;
            if (name && props.decoratedRegions && props.showRegionLabels) addRegionLabel(feature, layer, name);
            if (name && !props.decoratedRegions) layer.bindTooltip(name, props.showRegionLabels ? {
                permanent: true,
                direction: 'center',
                className: 'region-name-label'
            } : undefined);
            layer.bindPopup(popupContent(feature), { closeButton: true, maxWidth: 260 });
            layer.on({
                mouseover() {
                    layer.setStyle(props.decoratedRegions
                        ? { color: '#e0fbff', weight: 2.8, fillOpacity: .98 }
                        : { color: '#20262b', weight: 2.3, fillOpacity: props.outlineRegions ? 0 : .68 });
                    layer.getElement()?.classList.add('is-region-hovered');
                    regionLabelEntries.find((entry) => entry.name === name)?.marker.getElement()?.classList.add('is-label-highlight');
                },
                mouseout() {
                    layer.setStyle(regionStyle(feature));
                    layer.getElement()?.classList.remove('is-region-hovered');
                    regionLabelEntries.find((entry) => entry.name === name)?.marker.getElement()?.classList.remove('is-label-highlight');
                },
                click() {
                    selectRegion(name);
                    emit('region-click', { name, feature, details: regionDetail(feature), layer });
                }
            });
        }
    });
    if (layerVisibility.regions) {
        regionLayer.addTo(map);
        regionLabelLayer?.addTo(map);
        if (props.decoratedRegions && !initialRegionFit && regionLayer.getBounds().isValid()) {
            fitRegions();
            initialRegionFit = true;
        }
        requestAnimationFrame(refreshRegionLabels);
    }
}

function renderRoads() {
    if (!map || !props.roads) return;
    roadLayer?.remove();
    const resultMap = new Map(props.roadResults.map((item) => [Number(item.roadEdgeId || item.id), item]));
    roadLayer = L.geoJSON(props.roads, {
        style(feature) {
            const row = resultMap.get(Number(feature.properties?.id));
            const status = row?.status || row?.passabilityStatus;
            const colors = { BLOCKED: '#ff5669', CONDITIONAL: '#efd253', REDUCED: '#ff9748', PASS: '#35da87' };
            return { color: colors[status] || '#2d84af', weight: row ? 2.8 : 1.2, opacity: row ? .9 : .48 };
        }
    });
    if (layerVisibility.roads) roadLayer.addTo(map);
}

function renderAssets() {
    if (!map) return;
    assetLayer?.clearLayers();
    assetLayer ||= L.layerGroup();
    props.assets.forEach((asset) => {
        if (asset.latitude == null || asset.longitude == null) return;
        const icon = L.divIcon({ className: 'heavy-asset-marker-wrap', html: `<span class="asset-marker status-${asset.status || 'PENDING_DATA'}">${asset.assetType === 'BRIDGE' ? '桥' : '隧'}</span>`, iconSize: [19, 19], iconAnchor: [10, 10] });
        const marker = L.marker([Number(asset.latitude), Number(asset.longitude)], { icon }).addTo(assetLayer);
        marker.bindTooltip(String(asset.assetName || asset.name || '交通设施'));
        marker.on('click', () => emit('asset-click', asset));
    });
    if (layerVisibility.assets && !map.hasLayer(assetLayer)) assetLayer.addTo(map);
}

onMounted(() => {
    map = L.map(element.value, { zoomControl: false, attributionControl: false, preferCanvas: true, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom, zoomSnap: props.decoratedRegions ? .25 : 1 }).setView(props.center, props.zoom);
    regionSvgRenderer = props.decoratedRegions ? L.svg({ padding: .2 }) : null;
    ({ satellite, electronic } = createBaseLayers());
    baseLayer = null;
    if (!['administrative', 'none'].includes(props.defaultBase)) {
        baseLayer = props.defaultBase === 'electronic' ? electronic : satellite;
        baseLayer.addTo(map);
    }
    assetLayer = L.layerGroup();
    if (layerVisibility.assets) assetLayer.addTo(map);
    routeLayer = L.layerGroup().addTo(map);
    renderRegions(); renderRoads(); renderAssets();
    map.on('zoomend moveend', refreshRegionLabels);
    map.on('resize', () => {
        if (props.decoratedRegions && layerVisibility.regions && regionLayer?.getBounds().isValid()) {
            fitRegions();
        }
        refreshRegionLabels();
    });
});
onBeforeUnmount(() => { map?.remove(); map = null; });
watch(() => props.regions, renderRegions, { deep: true });
watch(() => props.regionDetails, renderRegions, { deep: true });
watch(() => props.showRegionLabels, renderRegions);
watch(() => [props.outlineRegions, props.regionIndicator], renderRegions);
watch(() => [props.roads, props.roadResults], renderRoads, { deep: true });
watch(() => props.assets, renderAssets, { deep: true });

function setBase(type) {
    if (!map) return;
    if (baseLayer && map.hasLayer(baseLayer)) map.removeLayer(baseLayer);
    if (type === 'administrative' || type === 'none') { baseLayer = null; return; }
    const next = type === 'electronic' ? electronic : satellite;
    if (next) { next.addTo(map); baseLayer = next; }
}
function drawRoutes(paths = []) {
    routeLayer.clearLayers();
    paths.forEach((item) => L.polyline(item.points, item.style).addTo(routeLayer));
    const points = paths.flatMap((item) => item.points || []);
    if (points.length) map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 13 });
}
function focus(lat, lng, zoom = 13) { map?.flyTo([Number(lat), Number(lng)], zoom, { duration: .5 }); }
function reset() {
    if (props.decoratedRegions && layerVisibility.regions) fitRegions();
    else map?.setView(props.center, props.zoom);
}
function selectRegion(name) {
    selectedRegionName = name || null;
    regionLayer?.eachLayer((item) => item.setStyle(regionStyle(item.feature)));
    if (!name) map?.closePopup();
}
function toggleLayer(name, show) {
    const layer = { regions: regionLayer, roads: roadLayer, assets: assetLayer }[name];
    if (!layer) return;
    layerVisibility[name] = show;
    if (show) layer.addTo(map); else map.removeLayer(layer);
    if (name === 'regions' && regionLabelLayer) {
        if (show) { regionLabelLayer.addTo(map); requestAnimationFrame(refreshRegionLabels); }
        else map.removeLayer(regionLabelLayer);
    }
    if (name === 'regions' && show && props.decoratedRegions && !initialRegionFit) {
        fitRegions();
        initialRegionFit = true;
    }
}
defineExpose({ zoomIn: () => map?.zoomIn(), zoomOut: () => map?.zoomOut(), reset, setBase, drawRoutes, focus, toggleLayer, selectRegion });
</script>

<template><div ref="element" :class="className"></div></template>
