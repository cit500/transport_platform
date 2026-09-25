export const mapConfig = Object.freeze({
    provider: 'BIGEMAP',
    baseUrl: import.meta.env.VITE_BIGEMAP_URL || 'http://127.0.0.1:9000',
    token: import.meta.env.VITE_BIGEMAP_TOKEN || '',
    layers: Object.freeze({
        satellite: import.meta.env.VITE_BIGEMAP_SATELLITE_LAYER || 'bigemap.7f604xec',
        electronic: import.meta.env.VITE_BIGEMAP_ELECTRONIC_LAYER || 'bigemap.7lurvljd'
    }),
    minZoom: 7,
    maxZoom: 18
});
