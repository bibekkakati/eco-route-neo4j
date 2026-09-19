'use strict';

const { getTopKPaths } = require('../service/graphService');
const { findAreaByCoordinates } = require('../service/areaService');

/**
 * POST /api/v1/routes/find
 *
 * Body:
 *   originId?        {string|number} — areaId of start node
 *   destinationId?   {string|number} — areaId of end node
 *   originLat?       {number}        — GPS latitude of start point (matched via geohash 1km radius)
 *   originLng?       {number}        — GPS longitude of start point
 *   destLat?         {number}        — GPS latitude of destination (matched via geohash 1km radius)
 *   destLng?         {number}        — GPS longitude of destination
 *   k?               {number}        — number of paths (default 5, max 10)
 *   maxVariation?    {number}        — allowed distance overhead (default 0.30 = 30%)
 *   aqiThreshold?    {number}        — AQI_HIGH flag threshold (default 400)
 *   softCheck?       {boolean}       — true: soft warning flag; false: strictly exclude paths with AQI > aqiThreshold (default false)
 */
async function findRoutes(req, res, next) {
  try {
    let {
      originId,
      destinationId,
      originLat,
      originLng,
      destLat,
      destLng,
      k,
      maxVariation,
      aqiThreshold,
      softCheck,
      softAqiCheck,
    } = req.body;

    const resolvedSoftCheck = Boolean(softCheck ?? softAqiCheck ?? false);

    // Resolve origin from coordinates if originId not given
    if (!originId && originLat !== undefined && originLng !== undefined) {
      const originArea = await findAreaByCoordinates(originLat, originLng);
      if (!originArea) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: `No neighborhood area node found within 1 km geohash radius of origin (${originLat}, ${originLng}).`,
        });
      }
      originId = originArea.areaId;
    }

    // Resolve destination from coordinates if destinationId not given
    if (!destinationId && destLat !== undefined && destLng !== undefined) {
      const destArea = await findAreaByCoordinates(destLat, destLng);
      if (!destArea) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: `No neighborhood area node found within 1 km geohash radius of destination (${destLat}, ${destLng}).`,
        });
      }
      destinationId = destArea.areaId;
    }

    const result = await getTopKPaths(originId, destinationId, {
      k,
      maxVariation,
      aqiThreshold,
      softCheck: resolvedSoftCheck,
    });

    return res.json({
      resolvedOriginId: originId,
      resolvedDestinationId: destinationId,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { findRoutes };
