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
let roadLayer;
let assetLayer;
let routeLayer;
let baseLayer;
let satellite;
let electronic;
let selectedRegionName = '';
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
    if (value == null || value === '') return '#526f84';
    const score = Number(value);
    if (!Number.isFinite(score)) return '#526f84';
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
        color: selected ? '#15191d' : '#3c444b',
        weight: selected ? 2.6 : 1.15,
        opacity: .96,
        fillColor: metricColor(value),
        fillOpacity: props.outlineRegions ? 0 : (selected ? .72 : .56)
    };
}
function popupContent(feature) {
    const item = regionDetail(feature);
    const name = item.regionName || feature.properties?.regionName || '行政区';
    return `<div class="region-map-popup"><strong>${escapeHtml(name)}</strong><div><span>韧性指数</span><b>${numberText(item.resilienceIndex, 1, ' 分')}</b></div><div><span>路网连通度</span><b>${numberText(item.connectivityScore, 1, ' 分')}</b></div><div><span>灾害恢复能力</span><b>${numberText(item.recoveryCapacity, 1, ' 分')}</b></div></div>`;
}

function renderRegions() {
    if (!map || !props.regions) return;
    regionLayer?.remove();
    regionLayer = L.geoJSON(props.regions, {
        style: regionStyle,
        onEachFeature(feature, layer) {
            const name = feature.properties?.regionName || feature.properties?.name || feature.properties?.NAME;
            if (name) layer.bindTooltip(name, props.showRegionLabels ? {
                permanent: true,
                direction: 'center',
                className: 'region-name-label'
            } : undefined);
            layer.bindPopup(popupContent(feature), { closeButton: true, maxWidth: 260 });
            layer.on({
                mouseover() { layer.setStyle({ color: '#20262b', weight: 2.3, fillOpacity: props.outlineRegions ? 0 : .68 }); },
                mouseout() { layer.setStyle(regionStyle(feature)); },
                click() {
                    selectRegion(name);
                    emit('region-click', { name, feature, details: regionDetail(feature), layer });
                }
            });
        }
    });
    if (layerVisibility.regions) regionLayer.addTo(map);
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
    map = L.map(element.value, { zoomControl: false, attributionControl: false, preferCanvas: true, minZoom: mapConfig.minZoom, maxZoom: mapConfig.maxZoom }).setView(props.center, props.zoom);
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
});
onBeforeUnmount(() => { map?.remove(); map = null; });
watch(() => props.regions, renderRegions, { deep: true });
watch(() => props.regionDetails, renderRegions, { deep: true });
watch(() => props.showRegionLabels, renderRegions);
watch(() => [props.outlineRegions, props.regionIndicator], () => {
    regionLayer?.eachLayer((item) => item.setStyle(regionStyle(item.feature)));
});
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
}
defineExpose({ zoomIn: () => map?.zoomIn(), zoomOut: () => map?.zoomOut(), reset: () => map?.setView(props.center, props.zoom), setBase, drawRoutes, focus, toggleLayer, selectRegion });
</script>

<template><div ref="element" :class="className"></div></template>
