import L from 'leaflet';
import { mapConfig } from '../config/map.js';

export function bigemapTileUrl(layerId) {
    const token = mapConfig.token ? `?access_token=${encodeURIComponent(mapConfig.token)}` : '';
    return `${mapConfig.baseUrl}/${layerId}/tiles/{z}/{x}/{y}.png${token}`;
}

export function createBaseLayers() {
    const options = { maxZoom: mapConfig.maxZoom };
    return {
        satellite: L.tileLayer(bigemapTileUrl(mapConfig.layers.satellite), { ...options, opacity: .84 }),
        electronic: L.tileLayer(bigemapTileUrl(mapConfig.layers.electronic), { ...options, opacity: .88 })
    };
}
