import apiClient from './api';

/**
 * Autocomplete search for areas backed by Redis Sorted Set.
 * @param {string} q
 * @param {number} limit
 */
export async function searchAreas(q, limit = 8) {
  if (!q || !q.trim()) return [];
  const res = await apiClient.get('/areas/search', {
    params: { q: q.trim(), limit },
  });
  return res.data?.results || [];
}

/**
 * Find top-K eco-friendly paths between origin and destination.
 * @param {object} params
 * @param {string} params.originId
 * @param {string} params.destinationId
 * @param {number} [params.originLat]
 * @param {number} [params.originLng]
 * @param {number} [params.destLat]
 * @param {number} [params.destLng]
 * @param {boolean} [params.softCheck=false]
 * @param {number} [params.k=3]
 * @param {number} [params.maxVariation=0.30]
 * @param {number} [params.aqiThreshold=400]
 */
export async function findRoutes(params) {
  const res = await apiClient.post('/routes/find', params);
  return res.data;
}

/**
 * Get single area details by ID.
 * @param {string} areaId
 */
export async function getArea(areaId) {
  const res = await apiClient.get(`/areas/${encodeURIComponent(areaId)}`);
  return res.data;
}

/**
 * Get multiple area details by IDs in a single request (batch polling).
 * Reduces N HTTP roundtrips down to 1 single call.
 * @param {string[]} areaIds
 * @returns {Promise<Array<object>>}
 */
export async function getAreasBatch(areaIds) {
  if (!areaIds || areaIds.length === 0) return [];
  const res = await apiClient.post('/areas/batch', { areaIds });
  return res.data?.areas || [];
}

/**
 * Match area node by incoming GPS coordinates (~1km radius geohash matching).
 */
export async function lookupCoordinates(latitude, longitude, maxDistanceKm = 1.0) {
  const res = await apiClient.get('/areas/lookup/coordinates', {
    params: { latitude, longitude, maxDistanceKm },
  });
  return res.data;
}

/**
 * Update an area's AQI by GPS coordinates.
 */
export async function patchAreaAqi(latitude, longitude, aqi) {
  const res = await apiClient.patch('/areas/aqi', { latitude, longitude, aqi });
  return res.data;
}

/**
 * Bulk-update AQI readings by coordinates.
 */
export async function bulkPatchAqi(updates) {
  const res = await apiClient.post('/areas/aqi/bulk', { updates });
  return res.data;
}

/**
 * Health check.
 */
export async function getHealth() {
  const base = apiClient.defaults.baseURL.replace('/api/v1', '');
  const res = await apiClient.get(`${base}/health`);
  return res.data;
}
