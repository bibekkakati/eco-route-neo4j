'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { getDriver, runWriteQuery, runQuery, initNeo4jSchema, closeDriver } = require('../infra/neo4j');
const { encode } = require('../utils/geohash');
const { toFloat } = require('../utils/neo4j');

const GRID_FILE = path.join(__dirname, 'ncr_grid_1km.json');
const NEIGHBORS_FILE = path.join(__dirname, 'ncr_neighbors_1km.json');

const BATCH_SIZE_AREAS = 2000;
const BATCH_SIZE_ROADS = 2500;

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remSec}s` : `${seconds}s`;
}

/**
 * Seed Area nodes from ncr_grid_1km.json
 */
async function seedAreas() {
  console.log(`\n📦 Reading areas file: ${GRID_FILE}`);
  if (!fs.existsSync(GRID_FILE)) {
    throw new Error(`Areas file not found: ${GRID_FILE}`);
  }

  const rawData = fs.readFileSync(GRID_FILE, 'utf8');
  const areas = JSON.parse(rawData);
  const total = areas.length;
  console.log(`Found ${total.toLocaleString()} areas to insert.\n`);

  const startTime = Date.now();
  let inserted = 0;

  for (let i = 0; i < total; i += BATCH_SIZE_AREAS) {
    const chunk = areas.slice(i, i + BATCH_SIZE_AREAS);
    const batch = chunk.map((item) => ({
      areaId:    item.areaId || item.name,
      name:      item.name,
      latitude:  item.latitude,
      longitude: item.longitude,
      geohash:   encode(item.latitude, item.longitude, 6),
      aqi:       null,
    }));

    await runWriteQuery(
      `
      UNWIND $batch AS row
      MERGE (a:Area {areaId: row.areaId})
      SET
        a.name      = row.name,
        a.latitude  = row.latitude,
        a.longitude = row.longitude,
        a.geohash   = row.geohash,
        a.aqi       = coalesce(a.aqi, row.aqi)
      `,
      { batch }
    );

    inserted += chunk.length;
    const pct = ((inserted / total) * 100).toFixed(1);
    const elapsed = Date.now() - startTime;
    const rate = Math.round((inserted / (elapsed / 1000)));
    process.stdout.write(`\r  [Areas] ${inserted.toLocaleString()}/${total.toLocaleString()} (${pct}%) — ${rate} nodes/s`);
  }

  console.log(`\n✅ Finished inserting ${total.toLocaleString()} areas in ${formatDuration(Date.now() - startTime)}.`);

  // Sync Redis autocomplete index with the updated names
  console.log(`🔍 Synchronizing Redis autocomplete index with updated area names…`);
  try {
    const { indexAreas } = require('../service/searchService');
    await indexAreas(areas.map((a) => ({ areaId: a.areaId || a.name, name: a.name })));
    console.log(`✅ Redis autocomplete index synchronized with ${total.toLocaleString()} areas.`);
  } catch (err) {
    console.warn(`⚠️ Warning: Failed to sync Redis autocomplete index:`, err.message);
  }
}

/**
 * Seed ROAD relationships from ncr_neighbors_1km.json
 */
async function seedRoads() {
  console.log(`\n🛣️  Reading roads file: ${NEIGHBORS_FILE}`);
  if (!fs.existsSync(NEIGHBORS_FILE)) {
    throw new Error(`Roads file not found: ${NEIGHBORS_FILE}`);
  }

  const rawData = fs.readFileSync(NEIGHBORS_FILE, 'utf8');
  const roads = JSON.parse(rawData);
  const total = roads.length;
  console.log(`Found ${total.toLocaleString()} roads to insert.\n`);

  const startTime = Date.now();
  let inserted = 0;

  for (let i = 0; i < total; i += BATCH_SIZE_ROADS) {
    const chunk = roads.slice(i, i + BATCH_SIZE_ROADS);
    const batch = chunk.map((item) => ({
      from:        item.from,
      to:          item.to,
      distance_km: item.distance_km,
    }));

    await runWriteQuery(
      `
      UNWIND $batch AS row
      MATCH (a:Area {areaId: row.from})
      MATCH (b:Area {areaId: row.to})
      MERGE (a)-[r:ROAD]->(b)
      SET r.distance = row.distance_km
      `,
      { batch }
    );

    inserted += chunk.length;
    const pct = ((inserted / total) * 100).toFixed(1);
    const elapsed = Date.now() - startTime;
    const rate = Math.round((inserted / (elapsed / 1000)));
    process.stdout.write(`\r  [Roads] ${inserted.toLocaleString()}/${total.toLocaleString()} (${pct}%) — ${rate} roads/s`);
  }

  console.log(`\n✅ Finished inserting ${total.toLocaleString()} roads in ${formatDuration(Date.now() - startTime)}.`);
}

/**
 * Verify graph counts
 */
async function verifyGraph() {
  console.log('\n🔍 Verifying graph data in Neo4j…');

  const areaRes = await runQuery('MATCH (a:Area) RETURN count(a) AS total');
  const roadRes = await runQuery('MATCH ()-[r:ROAD]->() RETURN count(r) AS total');

  const totalAreas = toFloat(areaRes[0]?.get('total')) || 0;
  const totalRoads = toFloat(roadRes[0]?.get('total')) || 0;

  console.log(`   📊 Total Area nodes:  ${totalAreas.toLocaleString()}`);
  console.log(`   📊 Total Road edges:  ${totalRoads.toLocaleString()}`);

  // Test a sample area query
  const sample = await runQuery(
    `
    MATCH (a:Area {areaId: 'Area 1'})-[r:ROAD]-(b:Area)
    RETURN a.name AS origin, collect({ to: b.name, distance: r.distance }) AS neighbors
    LIMIT 1
    `
  );

  if (sample.length) {
    const neighbors = sample[0].get('neighbors');
    console.log(`   🔗 'Area 1' connected to ${neighbors.length} neighbor(s):`, neighbors);
  }
}

async function run() {
  const overallStart = Date.now();

  try {
    console.log('🚀 Starting Eco-Route Neo4j database seeding…');

    // 1. Verify schema & indexes
    console.log('\n📋 Ensuring constraints and indexes exist…');
    await initNeo4jSchema();
    console.log('   - Constraint: Area.areaId IS UNIQUE (online)');
    console.log('   - Index: Area.geohash (online)');

    // Parse CLI flags
    const args = process.argv.slice(2);
    const areasOnly = args.includes('--areas-only');
    const roadsOnly = args.includes('--roads-only');

    if (!roadsOnly) {
      await seedAreas();
    }

    if (!areasOnly) {
      await seedRoads();
    }

    // Verification
    await verifyGraph();

    console.log(`\n🎉 Seeding complete in ${formatDuration(Date.now() - overallStart)}!`);
  } catch (err) {
    console.error('\n❌ Seeding failed:', err);
    process.exitCode = 1;
  } finally {
    const { closeRedis } = require('../infra/redis');
    await closeRedis();
    await closeDriver();
  }
}

if (require.main === module) {
  run();
}

module.exports = { seedAreas, seedRoads, verifyGraph };
