'use strict';

const { Router } = require('express');
const { authenticate, adminAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');
const {
  listAreas,
  getArea,
  getAreaByCoords,
  addArea,
  addAreasBulk,
  patchArea,
  patchAreaAqiByCoords,
  syncAqiByCoordsBulk,
  removeArea,
} = require('../controller/areaController');
const { searchAreas, syncIndex } = require('../controller/searchController');

const router = Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const areaSchema = z.object({
  areaId:    z.union([z.string().min(1), z.number()]),
  name:      z.string().min(1, 'name is required'),
  latitude:  z.number({ required_error: 'latitude is required' }),
  longitude: z.number({ required_error: 'longitude is required' }),
  aqi:       z.number().min(0).max(1000).optional(),
  geohash:   z.string().optional(),
});

const bulkSchema = z.object({
  areas: z.array(areaSchema).min(1, 'areas array must not be empty'),
});

const aqiByCoordsSchema = z.object({
  latitude:  z.number({ required_error: 'latitude is required' }),
  longitude: z.number({ required_error: 'longitude is required' }),
  aqi:       z.number({ required_error: 'aqi is required' }).min(0).max(1000),
});

const bulkAqiByCoordsSchema = z.object({
  updates: z.array(aqiByCoordsSchema).min(1, 'updates array must not be empty'),
});

const areaUpdateSchema = z.object({
  name:      z.string().min(1).optional(),
  latitude:  z.number().optional(),
  longitude: z.number().optional(),
  aqi:       z.number().min(0).max(1000).optional(),
  geohash:   z.string().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided for update' }
);

// ── All area routes require a valid API key ───────────────────────────────────
router.use(authenticate);

// ── Read routes (placed before parameterised /:areaId) ─────────────────────────

/**
 * GET /api/v1/areas
 * List all neighborhood area nodes with current AQI.
 */
router.get('/', listAreas);

/**
 * GET /api/v1/areas/search?q=<prefix>&limit=<n>
 * Autocomplete area name search backed by Redis.
 */
router.get('/search', searchAreas);

/**
 * GET /api/v1/areas/lookup/coordinates?lat=...&lng=...&maxDistanceKm=...
 * Match area node by incoming coordinates using geohash (~1 km radius).
 */
router.get('/lookup/coordinates', getAreaByCoords);

// ── Write routes (admin only) ─────────────────────────────────────────────────

/**
 * POST /api/v1/areas
 * Create or update a single area node (auto-computes precision-6 geohash).
 */
router.post('/', adminAuth, validate(areaSchema), addArea);

/**
 * POST /api/v1/areas/bulk
 * Bulk-create/upsert area nodes from a JSON array (auto-computes geohashes).
 */
router.post('/bulk', adminAuth, validate(bulkSchema), addAreasBulk);

/**
 * POST /api/v1/areas/sync-index
 * Re-index all Neo4j areas into Redis.
 */
router.post('/sync-index', adminAuth, syncIndex);

/**
 * PATCH /api/v1/areas/aqi
 * PATCH /api/v1/areas/aqi/by-coordinates
 * Update an area's AQI by coordinates using geohash matching (~1 km radius).
 * Body: { latitude, longitude, aqi }
 */
router.patch('/aqi', adminAuth, validate(aqiByCoordsSchema), patchAreaAqiByCoords);
router.patch('/aqi/by-coordinates', adminAuth, validate(aqiByCoordsSchema), patchAreaAqiByCoords);

/**
 * POST /api/v1/areas/aqi/bulk
 * POST /api/v1/areas/aqi/bulk-coordinates
 * Bulk-update AQI values by coordinates using geohash matching (~1 km radius).
 * Body: { updates: [{ latitude, longitude, aqi }, ...] }
 */
router.post('/aqi/bulk', adminAuth, validate(bulkAqiByCoordsSchema), syncAqiByCoordsBulk);
router.post('/aqi/bulk-coordinates', adminAuth, validate(bulkAqiByCoordsSchema), syncAqiByCoordsBulk);

// ── Parameterised routes ──────────────────────────────────────────────────────

/**
 * GET /api/v1/areas/:areaId
 * Get a single area by ID.
 */
router.get('/:areaId', getArea);

/**
 * PATCH /api/v1/areas/:areaId
 * Update area details (auto-recalculates geohash if coordinates change).
 */
router.patch('/:areaId', adminAuth, validate(areaUpdateSchema), patchArea);

/**
 * DELETE /api/v1/areas/:areaId
 * Delete an area node and all its road relationships.
 */
router.delete('/:areaId', adminAuth, removeArea);

module.exports = router;
