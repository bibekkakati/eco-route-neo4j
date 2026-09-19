'use strict';

const neo4j = require('neo4j-driver');
const { runQuery } = require('../infra/neo4j');
const { toFloat } = require('../utils/neo4j');

const DEFAULT_K = 5;
const DEFAULT_MAX_VARIATION = 0.40; // percent
const DEFAULT_AQI_THRESHOLD = 400;


/**
 * Build a composite weight for a path:
 *   score = totalDistance + (avgAqi * aqiWeight)
 * This lets us rank paths that balance both distance and air quality.
 */
function computeScore(totalDistance, avgAqi, aqiWeight = 100) {
  return totalDistance + avgAqi * aqiWeight;
}

/**
 * Find the top-K eco-friendly paths between two area nodes.
 *
 * Strategy:
 *   1. Use allShortestPaths as baseline, then expand up to (1 + maxVariation) * shortest distance.
 *   2. Score each path: composite(distance, avgAqi).
 *   3. Flag paths where any node AQI > aqiThreshold with AQI_HIGH.
 *   4. Return top K sorted by composite score.
 *
 *
 * @param {string|number} originId
 * @param {string|number} destId
 * @param {object} opts
 * @param {number} [opts.k=5]
 * @param {number} [opts.maxVariation=0.40]
 * @param {number} [opts.aqiThreshold=400]
 */
async function getTopKPaths(originId, destId, opts = {}) {
  const k = opts.k ?? DEFAULT_K;
  const maxVariation = opts.maxVariation ?? DEFAULT_MAX_VARIATION;
  const aqiThreshold = opts.aqiThreshold ?? DEFAULT_AQI_THRESHOLD;
  const softCheck = Boolean(opts.softCheck ?? false);

  // If softCheck is false, strictly exclude any paths containing nodes with AQI > aqiThreshold
  const strictFilter = !softCheck ? 'WHERE ALL(n IN nodes(path) WHERE coalesce(n.aqi, 0) <= $aqiThreshold)' : '';

  // Step 1: Find baseline shortest path (optionally constrained by AQI threshold)
  const baselineQuery = `
    MATCH (origin:Area {areaId: $originId}), (dest:Area {areaId: $destId})
    MATCH path = shortestPath((origin)-[:ROAD*..40]-(dest))
    ${strictFilter}
    RETURN
      [n IN nodes(path) | {
        areaId:    n.areaId,
        name:      n.name,
        latitude:  n.latitude,
        longitude: n.longitude,
        aqi:       n.aqi
      }] AS pathNodes,
      [r IN relationships(path) | {
        distance: r.distance
      }] AS pathEdges,
      reduce(d = 0.0, r IN relationships(path) | d + r.distance) AS totalDistance,
      reduce(s = 0.0, n IN nodes(path) | s + coalesce(n.aqi, 0)) / size(nodes(path)) AS avgAqi,
      [n IN nodes(path) WHERE n.aqi > $aqiThreshold | n.areaId] AS highAqiNodes
    LIMIT 1
  `;

  const baselineRecords = await runQuery(baselineQuery, { originId, destId, aqiThreshold });

  if (!baselineRecords.length) {
    return {
      shortestDistance: 0,
      maxAllowedDistance: 0,
      aqiThreshold,
      softCheck,
      paths: [],
      message: 'No path found between the specified areas satisfying criteria.'
    };
  }

  const parseRecord = (rec) => {
    const rawNodes = rec.get('pathNodes');
    const rawEdges = rec.get('pathEdges');
    const totalDistance = toFloat(rec.get('totalDistance'));
    const avgAqi = toFloat(rec.get('avgAqi'));
    const highAqiNodes = rec.get('highAqiNodes') || [];

    const nodes = rawNodes.map((n) => ({
      areaId: n.areaId,
      name: n.name,
      latitude: toFloat(n.latitude),
      longitude: toFloat(n.longitude),
      aqi: toFloat(n.aqi),
    }));

    const edges = rawEdges.map((e) => ({
      distance: toFloat(e.distance),
    }));

    return {
      nodes,
      edges,
      totalDistance,
      avgAqi: Math.round(avgAqi * 10) / 10,
      score: Math.round(computeScore(totalDistance, avgAqi) * 10) / 10,
      aqiHighFlag: highAqiNodes.length > 0,
      highAqiNodes,
    };
  };

  const primaryPath = parseRecord(baselineRecords[0]);
  const shortestDistance = primaryPath.totalDistance;
  const maxAllowedDistance = shortestDistance * (1 + maxVariation);

  const candidatePaths = [primaryPath];
  const primaryNodeIds = primaryPath.nodes.map((n) => n.areaId);

  // Step 2: For k > 1, find diverse alternative corridors using waypoint deviation
  if (k > 1 && primaryNodeIds.length > 2) {
    const fractions = [0.5, 0.33, 0.67, 0.25, 0.75, 0.4, 0.6];
    for (const frac of fractions) {
      if (candidatePaths.length >= k) break;
      const idx = Math.floor(primaryNodeIds.length * frac);
      if (idx <= 0 || idx >= primaryNodeIds.length - 1) continue;
      const excludeId = primaryNodeIds[idx];

      const altFilter = !softCheck
        ? 'WHERE NONE(n IN nodes(path) WHERE n.areaId = $excludeId) AND ALL(n IN nodes(path) WHERE coalesce(n.aqi, 0) <= $aqiThreshold)'
        : 'WHERE NONE(n IN nodes(path) WHERE n.areaId = $excludeId)';

      const altQuery = `
        MATCH (origin:Area {areaId: $originId}), (dest:Area {areaId: $destId})
        MATCH path = shortestPath((origin)-[:ROAD*..40]-(dest))
        ${altFilter}
        RETURN
          [n IN nodes(path) | {
            areaId:    n.areaId,
            name:      n.name,
            latitude:  n.latitude,
            longitude: n.longitude,
            aqi:       n.aqi
          }] AS pathNodes,
          [r IN relationships(path) | {
            distance: r.distance
          }] AS pathEdges,
          reduce(d = 0.0, r IN relationships(path) | d + r.distance) AS totalDistance,
          reduce(s = 0.0, n IN nodes(path) | s + coalesce(n.aqi, 0)) / size(nodes(path)) AS avgAqi,
          [n IN nodes(path) WHERE n.aqi > $aqiThreshold | n.areaId] AS highAqiNodes
        LIMIT 1
      `;

      try {
        const altRecords = await runQuery(altQuery, { originId, destId, excludeId, aqiThreshold });
        if (altRecords.length) {
          const candidate = parseRecord(altRecords[0]);
          if (candidate.totalDistance <= maxAllowedDistance) {
            const sig = candidate.nodes.map((n) => n.areaId).join('|');
            const alreadyExists = candidatePaths.some((p) => p.nodes.map((n) => n.areaId).join('|') === sig);
            if (!alreadyExists) {
              candidatePaths.push(candidate);
            }
          }
        }
      } catch (err) {
        // Skip branch if failed
      }
    }
  }

  // Sort candidate paths by score (composite of distance & air quality)
  candidatePaths.sort((a, b) => a.score - b.score);

  const paths = candidatePaths.slice(0, k).map((p, idx) => ({
    rank: idx + 1,
    ...p,
  }));

  return {
    shortestDistance,
    maxAllowedDistance: Math.round(maxAllowedDistance * 10) / 10,
    aqiThreshold,
    softCheck,
    paths,
  };
}

module.exports = { getTopKPaths };
