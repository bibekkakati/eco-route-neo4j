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
 * @param {number} [opts.maxVariation=0.30]
 * @param {number} [opts.aqiThreshold=400]
 */
async function getTopKPaths(originId, destId, opts = {}) {
  const k = opts.k ?? DEFAULT_K;
  const maxVariation = opts.maxVariation ?? DEFAULT_MAX_VARIATION;
  const aqiThreshold = opts.aqiThreshold ?? DEFAULT_AQI_THRESHOLD;
  const softCheck = Boolean(opts.softCheck ?? false);

  // Step 1: find the shortest path distance and hop count
  const shortestRecords = await runQuery(
    `
    MATCH (origin:Area {areaId: $originId}), (dest:Area {areaId: $destId})
    MATCH path = shortestPath((origin)-[:ROAD*..30]-(dest))
    RETURN
      length(path) AS hopCount,
      reduce(d = 0, r IN relationships(path) | d + r.distance) AS shortestDistance
    LIMIT 1
    `,
    { originId, destId }
  );

  if (!shortestRecords.length) {
    return { paths: [], message: 'No path found between the specified areas.' };
  }

  const shortestDistance = toFloat(shortestRecords[0].get('shortestDistance'));
  const hopCount = toFloat(shortestRecords[0].get('hopCount')) || 1;
  const maxAllowedDistance = shortestDistance * (1 + maxVariation);
  const maxHops = Math.min(Math.ceil(hopCount * 1.5) + 2, 25);

  // Step 2: enumerate candidate paths within the allowed distance range
  // If softCheck is false, strictly filter out any path where ANY node exceeds aqiThreshold.
  // If softCheck is true, include them but flag them as high AQI.
  const candidateRecords = await runQuery(
    `
    MATCH (origin:Area {areaId: $originId}), (dest:Area {areaId: $destId})
    MATCH path = (origin)-[:ROAD*..${maxHops}]-(dest)
    WITH
      path,
      nodes(path)        AS areaNodes,
      relationships(path) AS roads,
      reduce(d = 0, r IN relationships(path) | d + r.distance) AS totalDistance
    WHERE totalDistance <= $maxAllowedDistance
      AND ($softCheck = true OR ALL(n IN areaNodes WHERE coalesce(n.aqi, 0) <= $aqiThreshold))
    WITH
      path,
      areaNodes,
      roads,
      totalDistance,
      reduce(s = 0.0, n IN areaNodes | s + coalesce(n.aqi, 0)) / size(areaNodes) AS avgAqi,
      [n IN areaNodes WHERE n.aqi > $aqiThreshold | n.areaId] AS highAqiNodes
    RETURN
      [n IN areaNodes | {
        areaId:    n.areaId,
        name:      n.name,
        latitude:  n.latitude,
        longitude: n.longitude,
        aqi:       n.aqi
      }]                AS pathNodes,
      [r IN roads | {
        distance: r.distance
      }]                AS pathEdges,
      totalDistance,
      avgAqi,
      highAqiNodes
    ORDER BY (totalDistance + avgAqi * 100)
    LIMIT $k
    `,
    {
      originId,
      destId,
      maxAllowedDistance,
      aqiThreshold,
      softCheck,
      k: neo4j.int(k),
    }
  );

  const paths = candidateRecords.map((r, idx) => {
    const pathNodes = r.get('pathNodes');
    const pathEdges = r.get('pathEdges');
    const totalDistance = toFloat(r.get('totalDistance'));
    const avgAqi = toFloat(r.get('avgAqi'));
    const highAqiNodes = r.get('highAqiNodes') || [];

    const nodes = pathNodes.map((n) => ({
      areaId: n.areaId,
      name: n.name,
      latitude: toFloat(n.latitude),
      longitude: toFloat(n.longitude),
      aqi: toFloat(n.aqi),
    }));

    const edges = pathEdges.map((e) => ({
      distance: toFloat(e.distance),
    }));

    return {
      rank: idx + 1,
      nodes,
      edges,
      totalDistance,
      avgAqi: Math.round(avgAqi * 10) / 10,
      score: Math.round(computeScore(totalDistance, avgAqi) * 10) / 10,
      aqiHighFlag: highAqiNodes.length > 0,
      highAqiNodes,
    };
  });

  return {
    shortestDistance,
    maxAllowedDistance: Math.round(maxAllowedDistance * 10) / 10,
    aqiThreshold,
    softCheck,
    paths,
  };
}

module.exports = { getTopKPaths };
