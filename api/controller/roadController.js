'use strict';

const {
  createRoad,
  createRoadsBulk,
  getRoadsByArea,
  getAllRoads,
  deleteRoad,
} = require('../service/roadService');

/**
 * POST /api/v1/roads
 * Create or update a single road between two areas.
 */
async function addRoad(req, res, next) {
  try {
    const { fromAreaId, toAreaId, distance } = req.body;
    const road = await createRoad(fromAreaId, toAreaId, distance);

    if (!road) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'One or both area nodes not found. Create the areas first.',
      });
    }

    return res.status(201).json({ road });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/roads/bulk
 * Bulk-create/upsert roads from a JSON array.
 * Body: { roads: [{ fromAreaId, toAreaId, distance }, ...] }
 */
async function addRoadsBulk(req, res, next) {
  try {
    const { roads } = req.body;
    const total = await createRoadsBulk(roads);

    return res.status(201).json({
      message: `${total} road(s) created/updated.`,
      total,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/roads
 * List all roads in the graph.
 */
async function listRoads(req, res, next) {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
    const roads = await getAllRoads(limit);
    return res.json({ count: roads.length, roads });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/roads/:areaId
 * List all roads connected to a specific area.
 */
async function listRoadsByArea(req, res, next) {
  try {
    const { areaId } = req.params;
    const roads = await getRoadsByArea(areaId);
    return res.json({ areaId, count: roads.length, roads });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/roads
 * Delete a road between two areas.
 * Body: { fromAreaId, toAreaId }
 */
async function removeRoad(req, res, next) {
  try {
    const { fromAreaId, toAreaId } = req.body;
    const deleted = await deleteRoad(fromAreaId, toAreaId);

    if (!deleted) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: 'No road found between the specified areas.',
      });
    }

    return res.json({ message: 'Road deleted.', fromAreaId, toAreaId });
  } catch (err) {
    next(err);
  }
}

module.exports = { addRoad, addRoadsBulk, listRoads, listRoadsByArea, removeRoad };
