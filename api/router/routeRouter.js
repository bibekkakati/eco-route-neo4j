'use strict';

const { Router } = require('express');
const { authenticate } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');
const { findRoutes } = require('../controller/routeController');

const router = Router();

// Zod schema for route-finding request body
// Supports either node IDs (originId/destinationId) OR GPS coordinates (originLat/originLng, destLat/destLng)
const findRoutesSchema = z
  .object({
    originId:      z.union([z.string(), z.number()]).optional(),
    destinationId: z.union([z.string(), z.number()]).optional(),
    originLat:     z.number().optional(),
    originLng:     z.number().optional(),
    destLat:       z.number().optional(),
    destLng:       z.number().optional(),
    k:             z.number().int().min(1).max(10).optional().default(5),
    maxVariation:  z.number().min(0).max(2).optional().default(0.30),
    aqiThreshold:  z.number().min(0).max(1000).optional().default(400),
    softCheck:     z.boolean().optional().default(false),
    softAqiCheck:  z.boolean().optional(),
  })
  .refine(
    (data) => data.originId !== undefined || (data.originLat !== undefined && data.originLng !== undefined),
    { message: 'Either originId OR (originLat and originLng) must be provided' }
  )
  .refine(
    (data) => data.destinationId !== undefined || (data.destLat !== undefined && data.destLng !== undefined),
    { message: 'Either destinationId OR (destLat and destLng) must be provided' }
  );

// All route endpoints require a valid API key
router.use(authenticate);

/**
 * POST /api/v1/routes/find
 * Find top-K eco-friendly delivery paths between two areas or coordinates.
 */
router.post('/find', validate(findRoutesSchema), findRoutes);

module.exports = router;
