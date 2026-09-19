'use strict';

const {
  getAreas,
  getAreaById,
  getAreasByIds,
  findAreaByCoordinates,
  createArea,
  createAreasBulk,
  updateArea,
  updateAreaAqiByCoordinates,
  updateAreasAqiByCoordinatesBulk,
  deleteArea,
} = require('../service/areaService');
const { indexAreas, addAreasToIndex } = require('../service/searchService');

/**
 * GET /api/v1/areas
 * Returns all area nodes with their current AQI, lat/lon, and geohash.
 */
async function listAreas(req, res, next) {
  try {
    const areas = await getAreas();
    return res.json({ count: areas.length, areas });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/areas/batch
 * GET /api/v1/areas/batch?ids=id1,id2
 * Fetch multiple area nodes by an array of areaIds in a single request.
 */
async function getAreasBatch(req, res, next) {
  try {
    let areaIds = req.body?.areaIds;
    if (!areaIds && req.query.ids) {
      areaIds = req.query.ids.split(',').map((s) => s.trim()).filter(Boolean);
    }

    if (!Array.isArray(areaIds) || areaIds.length === 0) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'areaIds array in JSON body or comma-separated ids in query param is required.',
      });
    }

    const areas = await getAreasByIds(areaIds);
    return res.json({ count: areas.length, areas });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/areas/:areaId
 * Returns a single area node by its areaId.
 */
async function getArea(req, res, next) {
  try {
    const { areaId } = req.params;
    const area = await getAreaById(areaId);

    if (!area) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Area with id '${areaId}' not found.`,
      });
    }

    return res.json({ area });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/areas/lookup/coordinates?lat=...&lng=...&maxDistanceKm=...
 * Find area matching the coordinates using geohash (~1 km radius matching).
 */
async function getAreaByCoords(req, res, next) {
  try {
    const lat = parseFloat(req.query.lat);
    const lng = parseFloat(req.query.lng);
    const maxDist = req.query.maxDistanceKm ? parseFloat(req.query.maxDistanceKm) : 1.0;

    if (isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'lat and lng query parameters must be valid numbers.',
      });
    }

    const area = await findAreaByCoordinates(lat, lng, maxDist);
    if (!area) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `No area node found within ${maxDist} km of (${lat}, ${lng}).`,
      });
    }

    return res.json({ area });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/areas
 * Create or update a single area node.
 * Geohash is automatically computed from latitude/longitude if omitted.
 * Also updates the Redis autocomplete index for the new entry.
 */
async function addArea(req, res, next) {
  try {
    const area = await createArea(req.body);

    // Keep Redis index in sync
    addAreasToIndex([area]).catch((err) =>
      console.error('Redis index update error:', err.message)
    );

    return res.status(201).json({ area });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/areas/bulk
 * Bulk-create/upsert area nodes from a JSON array.
 * Geohash is automatically computed for each node.
 * Re-indexes all areas in Redis after import.
 */
async function addAreasBulk(req, res, next) {
  try {
    const { areas } = req.body;
    const total = await createAreasBulk(areas);

    // Re-index everything in Redis after bulk import
    getAreas()
      .then((all) => indexAreas(all))
      .catch((err) => console.error('Redis bulk index error:', err.message));

    return res.status(201).json({
      message: `${total} area(s) created/updated.`,
      total,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/areas/:areaId
 * Update an existing area's properties (name, lat, lon).
 * Automatically recalculates geohash if latitude and longitude change.
 */
async function patchArea(req, res, next) {
  try {
    const { areaId } = req.params;
    const updated = await updateArea(areaId, req.body);

    if (!updated) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Area with id '${areaId}' not found.`,
      });
    }

    // Keep Redis search index updated
    addAreasToIndex([updated]).catch((err) =>
      console.error('Redis index update error:', err.message)
    );

    return res.json({ message: 'Area updated successfully.', area: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/v1/areas/aqi
 * Update the AQI value of an area using incoming latitude and longitude.
 * Matches the node via precision-6 geohash (~1 km radius matching).
 */
async function patchAreaAqiByCoords(req, res, next) {
  try {
    const { latitude, longitude, aqi } = req.body;
    const updatedArea = await updateAreaAqiByCoordinates(latitude, longitude, aqi);

    if (!updatedArea) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `No area found matching coordinates (${latitude}, ${longitude}) within 1 km geohash radius.`,
      });
    }

    return res.json({
      message: 'AQI updated by coordinates.',
      matchedAreaId: updatedArea.areaId,
      name: updatedArea.name,
      geohash: updatedArea.geohash,
      aqi,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/areas/aqi/bulk
 * Bulk update AQI values by coordinates using geohash matching.
 * Body: { updates: [{ latitude, longitude, aqi }, ...] }
 */
async function syncAqiByCoordsBulk(req, res, next) {
  try {
    const { updates } = req.body;
    const total = await updateAreasAqiByCoordinatesBulk(updates);

    return res.json({
      message: `${total} area(s) AQI updated via geohash coordinate matching.`,
      total,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/areas/:areaId
 * Delete an area node and all its road relationships.
 */
async function removeArea(req, res, next) {
  try {
    const { areaId } = req.params;
    const deleted = await deleteArea(areaId);

    if (!deleted) {
      return res.status(404).json({
        error: 'NOT_FOUND',
        message: `Area with id '${areaId}' not found.`,
      });
    }

    return res.json({ message: `Area '${areaId}' deleted.` });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listAreas,
  getArea,
  getAreasBatch,
  getAreaByCoords,
  addArea,
  addAreasBulk,
  patchArea,
  patchAreaAqiByCoords,
  syncAqiByCoordsBulk,
  removeArea,
};
