'use strict';

const neo4j = require('neo4j-driver');

let _driver = null;

/**
 * Returns (and lazily creates) the Neo4j driver singleton.
 */
function getDriver() {
  if (_driver) return _driver;

  const { GRAPH_DATABASE_URL, GRAPH_DATABASE_USERNAME, GRAPH_DATABASE_PASSWORD } = process.env;

  if (!GRAPH_DATABASE_URL || !GRAPH_DATABASE_USERNAME || !GRAPH_DATABASE_PASSWORD) {
    throw new Error('Missing Neo4j connection environment variables.');
  }

  _driver = neo4j.driver(
    GRAPH_DATABASE_URL,
    neo4j.auth.basic(GRAPH_DATABASE_USERNAME, GRAPH_DATABASE_PASSWORD),
    {
      maxConnectionPoolSize: 20,
      connectionAcquisitionTimeout: 10_000,
    }
  );

  return _driver;
}

/**
 * Run a read Cypher query and return all records.
 * @param {string} cypher
 * @param {object} params
 * @returns {Promise<import('neo4j-driver').Record[]>}
 */
async function runQuery(cypher, params = {}) {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}

/**
 * Run a write Cypher query.
 * @param {string} cypher
 * @param {object} params
 * @returns {Promise<import('neo4j-driver').Record[]>}
 */
async function runWriteQuery(cypher, params = {}) {
  const driver = getDriver();
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.run(cypher, params);
    return result.records;
  } finally {
    await session.close();
  }
}

/**
 * Ensure constraints and indexes exist in Neo4j.
 */
async function initNeo4jSchema() {
  await runWriteQuery(`
    CREATE CONSTRAINT area_id_unique IF NOT EXISTS
    FOR (a:Area) REQUIRE a.areaId IS UNIQUE
  `);
  await runWriteQuery(`
    CREATE INDEX area_geohash_index IF NOT EXISTS
    FOR (a:Area) ON (a.geohash)
  `);
}

/**
 * Verify the driver can reach Neo4j and initialize schema constraints/indexes.
 */
async function verifyConnectivity() {
  const driver = getDriver();
  await driver.verifyConnectivity();
  await initNeo4jSchema();
  console.log('Neo4j connected and schema constraints/indexes verified.');
}

/**
 * Gracefully close the driver (call on server shutdown).
 */
async function closeDriver() {
  if (_driver) {
    await _driver.close();
    _driver = null;
  }
}

module.exports = { getDriver, runQuery, runWriteQuery, initNeo4jSchema, verifyConnectivity, closeDriver };

