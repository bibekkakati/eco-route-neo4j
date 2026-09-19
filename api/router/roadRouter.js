'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');
const { addRoad, addRoadsBulk, listRoads, listRoadsByArea, removeRoad } = require('../controller/roadController');

const router = Router();

// ── Validation schemas ────────────────────────────────────────────────────────

const roadSchema = z.object({
  fromAreaId: z.union([z.string().min(1), z.number()]),
  toAreaId:   z.union([z.string().min(1), z.number()]),
  distance:   z.number({ required_error: 'distance is required' }).positive('distance must be positive'),
});

const bulkRoadSchema = z.object({
  roads: z.array(roadSchema).min(1, 'roads array must not be empty'),
});

const deleteRoadSchema = z.object({
  fromAreaId: z.union([z.string().min(1), z.number()]),
  toAreaId:   z.union([z.string().min(1), z.number()]),
});

// ── All road routes require a valid API key ───────────────────────────────────
router.use(authenticate);

// ── Read routes ───────────────────────────────────────────────────────────────

/**
 * GET /api/v1/roads
 * List all roads in the graph.
 */
router.get('/', listRoads);

/**
 * GET /api/v1/roads/:areaId
 * List all roads connected to a specific area.
 */
router.get('/:areaId', listRoadsByArea);

// ── Write routes ─────────────────────────────────────────────────────────────

/**
 * POST /api/v1/roads
 * Create or update a single road between two areas.
 */
router.post('/', validate(roadSchema), addRoad);

/**
 * POST /api/v1/roads/bulk
 * Bulk-create/upsert roads from a JSON array.
 */
router.post('/bulk', validate(bulkRoadSchema), addRoadsBulk);

/**
 * DELETE /api/v1/roads
 * Delete a road between two areas.
 */
router.delete('/', validate(deleteRoadSchema), removeRoad);

module.exports = router;
