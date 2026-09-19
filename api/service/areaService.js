'use strict';

const { runQuery, runWriteQuery } = require('../infra/neo4j');
const { toFloat, toArea } = require('../utils/neo4j');
const { encode, getNeighbors, haversineDistanceKm } = require('../utils/geohash');

/**
 * Fetch all area nodes from Neo4j.
 */
async function getAreas() {
  const records = await runQuery(`
    MATCH (a:Area)
    RETURN
      a.areaId    AS areaId,
      a.name      AS name,
      a.latitude  AS latitude,
      a.longitude AS longitude,
      a.aqi       AS aqi,
      a.geohash   AS geohash
    ORDER BY a.areaId
  `);

  return records.map(toArea);
}

/**
 * Fetch a single area by its areaId.
 */
async function getAreaById(areaId) {
  const records = await runQuery(
    `
    MATCH (a:Area {areaId: $areaId})
    RETURN
      a.areaId    AS areaId,
      a.name      AS name,
      a.latitude  AS latitude,
      a.longitude AS longitude,
      a.aqi       AS aqi,
      a.geohash   AS geohash
    `,
    { areaId }
  );

  if (!records.length) return null;
  return toArea(records[0]);
}

/**
 * Find an area node by coordinates using geohash (~1 km radius matching).
 *
 * Strategy:
 *   1. Encode incoming (lat, lon) to precision-6 geohash (~1.2 km x 0.6 km cell).
 *   2. Attempt exact match on a.geohash = $hash.
 *   3. If not found, check the 8 neighboring cells to handle points near cell boundaries.
 *   4. Pick the closest candidate node within maxDistanceKm (default 1.0 km).
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} [maxDistanceKm=1.0]
 * @returns {Promise<object|null>} Matched area or null
 */
async function findAreaByCoordinates(latitude, longitude, maxDistanceKm = 1.0) {
  const hash = encode(latitude, longitude);

  // 1. Direct cell match
  const directRecords = await runQuery(
    `
    MATCH (a:Area {geohash: $hash})
    RETURN
      a.areaId    AS areaId,
      a.name      AS name,
      a.latitude  AS latitude,
      a.longitude AS longitude,
      a.aqi       AS aqi,
      a.geohash   AS geohash
    LIMIT 1
    `,
    { hash }
  );

  if (directRecords.length) {
    return toArea(directRecords[0]);
  }

  // 2. Neighboring cells match (boundary safety within ~1 km)
  const candidateCells = getNeighbors(hash);
  const neighborRecords = await runQuery(
    `
    MATCH (a:Area)
    WHERE a.geohash IN $candidateCells
    RETURN
      a.areaId    AS areaId,
      a.name      AS name,
      a.latitude  AS latitude,
      a.longitude AS longitude,
      a.aqi       AS aqi,
      a.geohash   AS geohash
    `,
    { candidateCells }
  );

  if (!neighborRecords.length) return null;

  const candidates = neighborRecords.map(toArea);
  // Sort candidates by Haversine distance to target coordinates
  candidates.sort((a, b) => {
    const distA = haversineDistanceKm(latitude, longitude, a.latitude, a.longitude);
    const distB = haversineDistanceKm(latitude, longitude, b.latitude, b.longitude);
    return distA - distB;
  });

  const closest = candidates[0];
  const closestDistance = haversineDistanceKm(latitude, longitude, closest.latitude, closest.longitude);

  if (closestDistance <= maxDistanceKm) {
    return closest;
  }

  return null;
}

/**
 * Create or update a single area node (MERGE on areaId — idempotent).
 * Automatically computes geohash from latitude and longitude if not supplied.
 *
 * @param {{ areaId: string|number, name: string, latitude: number, longitude: number, aqi?: number, geohash?: string }} area
 * @returns {Promise<object>} The created/merged area
 */
async function createArea(area) {
  const resolvedGeohash =
    area.geohash ||
    (area.latitude != null && area.longitude != null
      ? encode(area.latitude, area.longitude)
      : null);

  const records = await runWriteQuery(
    `
    MERGE (a:Area {areaId: $areaId})
    SET
      a.name      = $name,
      a.latitude  = $latitude,
      a.longitude = $longitude,
      a.aqi       = $aqi,
      a.geohash   = $geohash
    RETURN
      a.areaId    AS areaId,
      a.name      AS name,
      a.latitude  AS latitude,
      a.longitude AS longitude,
      a.aqi       AS aqi,
      a.geohash   AS geohash
    `,
    {
      areaId:    area.areaId,
      name:      area.name,
      latitude:  area.latitude,
      longitude: area.longitude,
      aqi:       area.aqi ?? null,
      geohash:   resolvedGeohash,
    }
  );

  return toArea(records[0]);
}

/**
 * Bulk-create/upsert area nodes efficiently using UNWIND.
 * Automatically computes geohash for any node missing it.
 * Safe to re-run — uses MERGE on areaId.
 *
 * @param {Array<{ areaId, name, latitude, longitude, aqi?, geohash? }>} areas
 * @returns {Promise<number>} Count of nodes created/merged
 */
async function createAreasBulk(areas) {
  if (!areas || areas.length === 0) return 0;

  const records = await runWriteQuery(
    `
    UNWIND $areas AS row
    MERGE (a:Area {areaId: row.areaId})
    SET
      a.name      = row.name,
      a.latitude  = row.latitude,
      a.longitude = row.longitude,
      a.aqi       = row.aqi,
      a.geohash   = row.geohash
    RETURN count(a) AS total
    `,
    {
      areas: areas.map((a) => ({
        areaId:    a.areaId,
        name:      a.name,
        latitude:  a.latitude,
        longitude: a.longitude,
        aqi:       a.aqi ?? null,
        geohash:   a.geohash || (a.latitude != null && a.longitude != null ? encode(a.latitude, a.longitude) : null),
      })),
    }
  );

  return toFloat(records[0]?.get('total')) ?? 0;
}

/**
 * Update an existing area's properties.
 * If latitude or longitude is updated, geohash is automatically recalculated.
 *
 * @param {string|number} areaId
 * @param {{ name?: string, latitude?: number, longitude?: number, aqi?: number, geohash?: string }} fields
 * @returns {Promise<object|null>} Updated area or null if not found
 */
async function updateArea(areaId, fields) {
  const existing = await getAreaById(areaId);
  if (!existing) return null;

  const newLat = fields.latitude !== undefined ? fields.latitude : existing.latitude;
  const newLon = fields.longitude !== undefined ? fields.longitude : existing.longitude;
  const newName = fields.name !== undefined ? fields.name : existing.name;
  const newAqi = fields.aqi !== undefined ? fields.aqi : existing.aqi;

  let newGeohash = fields.geohash;
  if (!newGeohash && newLat != null && newLon != null) {
    newGeohash = encode(newLat, newLon);
  }

  const records = await runWriteQuery(
    `
    MATCH (a:Area {areaId: $areaId})
    SET
      a.name      = $name,
      a.latitude  = $latitude,
      a.longitude = $longitude,
      a.aqi       = $aqi,
      a.geohash   = $geohash
    RETURN
      a.areaId    AS areaId,
      a.name      AS name,
      a.latitude  AS latitude,
      a.longitude AS longitude,
      a.aqi       AS aqi,
      a.geohash   AS geohash
    `,
    {
      areaId,
      name:      newName,
      latitude:  newLat,
      longitude: newLon,
      aqi:       newAqi,
      geohash:   newGeohash,
    }
  );

  return records.length ? toArea(records[0]) : null;
}

/**
 * Update AQI for an area located near the given coordinates using geohash matching (1 km radius).
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} aqi
 * @returns {Promise<object|null>} Updated area or null if no area found within 1 km
 */
async function updateAreaAqiByCoordinates(latitude, longitude, aqi) {
  const matched = await findAreaByCoordinates(latitude, longitude);
  if (!matched) return null;

  await runWriteQuery(
    `
    MATCH (a:Area {areaId: $areaId})
    SET a.aqi = $aqi
    RETURN a.areaId AS areaId
    `,
    { areaId: matched.areaId, aqi }
  );

  return { ...matched, aqi };
}

/**
 * Bulk-update AQI values by coordinates using geohash matching.
 * Maps each incoming coordinate to its precision-6 geohash (~1 km cell)
 * and updates matching Neo4j Area nodes in a single query.
 *
 * @param {Array<{ latitude: number, longitude: number, aqi: number }>} updates
 * @returns {Promise<number>} Count of updated area nodes
 */
async function updateAreasAqiByCoordinatesBulk(updates) {
  if (!updates || updates.length === 0) return 0;

  const payload = updates.map((u) => ({
    geohash: encode(u.latitude, u.longitude),
    aqi:     u.aqi,
  }));

  const records = await runWriteQuery(
    `
    UNWIND $payload AS row
    MATCH (a:Area {geohash: row.geohash})
    SET a.aqi = row.aqi
    RETURN count(a) AS total
    `,
    { payload }
  );

  return toFloat(records[0]?.get('total')) ?? 0;
}

/**
 * Delete an area node and all its road relationships by areaId.
 *
 * @param {string|number} areaId
 * @returns {Promise<boolean>} true if the node existed and was deleted
 */
async function deleteArea(areaId) {
  const records = await runWriteQuery(
    `
    MATCH (a:Area {areaId: $areaId})
    DETACH DELETE a
    RETURN count(a) AS deleted
    `,
    { areaId }
  );

  return (toFloat(records[0]?.get('deleted')) ?? 0) > 0;
}

module.exports = {
  getAreas,
  getAreaById,
  findAreaByCoordinates,
  createArea,
  createAreasBulk,
  updateArea,
  updateAreaAqiByCoordinates,
  updateAreasAqiByCoordinatesBulk,
  deleteArea,
};
