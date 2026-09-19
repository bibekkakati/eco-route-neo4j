'use strict';

const neo4j = require('neo4j-driver');
const { runQuery, runWriteQuery } = require('../infra/neo4j');
const { toFloat } = require('../utils/neo4j');

/**
 * Create or update a ROAD relationship between two Area nodes.
 * Uses MERGE so re-importing the same road is idempotent.
 *
 * @param {string|number} fromAreaId
 * @param {string|number} toAreaId
 * @param {number} distance — weight in km (or metres, your choice of unit)
 * @returns {Promise<object>}
 */
async function createRoad(fromAreaId, toAreaId, distance) {
  const records = await runWriteQuery(
    `
    MATCH (a:Area {areaId: $fromAreaId}), (b:Area {areaId: $toAreaId})
    MERGE (a)-[r:ROAD]-(b)
    SET r.distance = $distance
    RETURN
      a.areaId AS fromAreaId,
      b.areaId AS toAreaId,
      r.distance AS distance
    `,
    { fromAreaId, toAreaId, distance }
  );

  if (!records.length) return null;
  return toRoad(records[0]);
}

/**
 * Bulk-create/upsert ROAD relationships from a JSON array.
 * Each item: { fromAreaId, toAreaId, distance }
 *
 * @param {Array<{ fromAreaId, toAreaId, distance }>} roads
 * @returns {Promise<number>} count of relationships created/updated
 */
async function createRoadsBulk(roads) {
  if (!roads || roads.length === 0) return 0;

  const records = await runWriteQuery(
    `
    UNWIND $roads AS row
    MATCH (a:Area {areaId: row.fromAreaId}), (b:Area {areaId: row.toAreaId})
    MERGE (a)-[r:ROAD]-(b)
    SET r.distance = row.distance
    RETURN count(r) AS total
    `,
    {
      roads: roads.map((r) => ({
        fromAreaId: r.fromAreaId,
        toAreaId:   r.toAreaId,
        distance:   r.distance,
      })),
    }
  );

  return toFloat(records[0]?.get('total')) ?? 0;
}

/**
 * Get all roads (relationships) connected to a given area.
 *
 * @param {string|number} areaId
 * @returns {Promise<Array<{ fromAreaId, toAreaId, distance }>>}
 */
async function getRoadsByArea(areaId) {
  const records = await runQuery(
    `
    MATCH (a:Area {areaId: $areaId})-[r:ROAD]-(b:Area)
    RETURN
      a.areaId   AS fromAreaId,
      b.areaId   AS toAreaId,
      r.distance AS distance
    ORDER BY r.distance
    `,
    { areaId }
  );

  return records.map(toRoad);
}

/**
 * Get roads in the graph with configurable limit.
 *
 * @param {number} [limit=100]
 * @returns {Promise<Array<{ fromAreaId, toAreaId, distance }>>}
 */
async function getAllRoads(limit = 100) {
  const records = await runQuery(
    `
    MATCH (a:Area)-[r:ROAD]->(b:Area)
    RETURN
      a.areaId   AS fromAreaId,
      b.areaId   AS toAreaId,
      r.distance AS distance
    LIMIT $limit
    `,
    { limit: neo4j.int(limit) }
  );

  return records.map(toRoad);
}

/**
 * Delete a road between two areas.
 *
 * @param {string|number} fromAreaId
 * @param {string|number} toAreaId
 * @returns {Promise<boolean>} true if road existed and was deleted
 */
async function deleteRoad(fromAreaId, toAreaId) {
  const records = await runWriteQuery(
    `
    MATCH (a:Area {areaId: $fromAreaId})-[r:ROAD]-(b:Area {areaId: $toAreaId})
    DELETE r
    RETURN count(r) AS deleted
    `,
    { fromAreaId, toAreaId }
  );

  return (toFloat(records[0]?.get('deleted')) ?? 0) > 0;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toRoad(r) {
  return {
    fromAreaId: r.get('fromAreaId'),
    toAreaId:   r.get('toAreaId'),
    distance:   toFloat(r.get('distance')),
  };
}

module.exports = {
  createRoad,
  createRoadsBulk,
  getRoadsByArea,
  getAllRoads,
  deleteRoad,
};
