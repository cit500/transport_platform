const API_ROOT = import.meta.env.VITE_API_ROOT || '/api';

export async function api(path, options = {}) {
    const response = await fetch(`${API_ROOT}${path}`, {
        ...options,
        headers: options.body ? { 'Content-Type': 'application/json', ...options.headers } : options.headers
    });
    if (!response.ok) {
        let message = `请求失败：${response.status}`;
        try { message = (await response.json()).message || message; } catch { /* response is not JSON */ }
        throw new Error(message);
    }
    if (response.status === 204) return null;
    return response.json();
}

export const adminApi = (path, options) => api(`/admin${path}`, options);
