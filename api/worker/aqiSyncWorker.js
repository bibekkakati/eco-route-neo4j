'use strict';

require('dotenv').config();

const { runQuery } = require('../infra/neo4j');
const { updateAreasAqiByCoordinatesBulk } = require('../service/areaService');

// Zone definitions and AQI ranges
const ZONES = {
  GREEN: {
    key: 'GREEN',
    name: 'Green Zone (Good / Safe)',
    badge: '🟢',
    range: '35 – 95',
    min: 35,
    max: 95,
    ratio: 0.35, // 35% of the 50% pool (~10,962 areas)
    description: 'Clean air. Safe for delivery riders.',
  },
  RED: {
    key: 'RED',
    name: 'Red Zone (Severe / High Alert)',
    badge: '🔴',
    range: '405 – 495',
    min: 405,
    max: 495,
    ratio: 0.25, // 25% of the 50% pool (~7,830 areas)
    description: 'Hazardous air (> 400 AQI). Triggers AQI_HIGH warning flag.',
  },
  YELLOW: {
    key: 'YELLOW',
    name: 'Yellow Zone (Moderate Pollution)',
    badge: '🟡',
    range: '120 – 290',
    min: 120,
    max: 290,
    ratio: 0.40, // 40% of the 50% pool (~12,528 areas)
    description: 'Moderate pollution. Penalized during eco-friendly routing.',
  },
};

// 30-second cycle order: Green -> Red -> Yellow -> repeat
const CYCLE_SEQUENCE = [ZONES.GREEN.key, ZONES.RED.key, ZONES.YELLOW.key];

let _workerTimer = null;
let _currentCycleIndex = 0;
let _cachedAreasPool = null;
let _isProcessing = false;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Load and partition 50% of the areas into Green, Red, and Yellow zone pools.
 */
async function getOrInitZonePools(forceRefresh = false) {
  if (_cachedAreasPool && !forceRefresh) {
    return _cachedAreasPool;
  }

  const records = await runQuery(`
    MATCH (a:Area)
    RETURN
      a.areaId    AS areaId,
      a.name      AS name,
      a.latitude  AS latitude,
      a.longitude AS longitude
  `);

  if (!records.length) {
    throw new Error('No Area nodes found in Neo4j database. Seed data first.');
  }

  const allAreas = records.map((r) => ({
    areaId:    r.get('areaId'),
    name:      r.get('name'),
    latitude:  r.get('latitude'),
    longitude: r.get('longitude'),
  }));

  // Shuffle and pick 50%
  shuffle(allAreas);
  const targetCount = Math.round(allAreas.length * 0.50);
  const selected = allAreas.slice(0, targetCount);

  // Partition the 50% sample into Green (35%), Red (25%), and Yellow (40%)
  const greenCount = Math.round(selected.length * ZONES.GREEN.ratio);
  const redCount = Math.round(selected.length * ZONES.RED.ratio);

  _cachedAreasPool = {
    totalGraphNodes: allAreas.length,
    totalSampled:    selected.length,
    [ZONES.GREEN.key]:  selected.slice(0, greenCount),
    [ZONES.RED.key]:    selected.slice(greenCount, greenCount + redCount),
    [ZONES.YELLOW.key]: selected.slice(greenCount + redCount),
  };

  return _cachedAreasPool;
}

/**
 * Process a single zone update by coordinates.
 *
 * @param {'GREEN'|'RED'|'YELLOW'} zoneKey
 * @returns {Promise<object>}
 */
async function processZone(zoneKey) {
  const zone = ZONES[zoneKey];
  const pools = await getOrInitZonePools();
  const targetAreas = pools[zoneKey] || [];

  const timestamp = new Date().toLocaleTimeString();
  console.log(`\n⏱️  [${timestamp}] AQI Worker: Processing ${zone.badge} ${zone.name.toUpperCase()}`);
  console.log(`   Range: ${zone.range} AQI | Areas to update: ${targetAreas.length.toLocaleString()}`);

  const updates = targetAreas.map((item) => {
    // Add tiny GPS sensor jitter (±0.0002° ~ 15m) to test precision-6 geohash matching
    const jitterLat = (Math.random() - 0.5) * 0.0002;
    const jitterLng = (Math.random() - 0.5) * 0.0002;
    return {
      latitude:  item.latitude + jitterLat,
      longitude: item.longitude + jitterLng,
      aqi:       randomInt(zone.min, zone.max),
    };
  });

  const startTime = Date.now();
  const BATCH_SIZE = 2500;
  let totalUpdated = 0;

  for (let i = 0; i < updates.length; i += BATCH_SIZE) {
    const chunk = updates.slice(i, i + BATCH_SIZE);
    const count = await updateAreasAqiByCoordinatesBulk(chunk);
    totalUpdated += count;
  }

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`   ✅ Successfully updated ${totalUpdated.toLocaleString()} nodes in ${elapsedSec}s via geohash coordinate matching.`);

  // Print sample updated landmarks
  const sampleLandmarks = targetAreas.filter((a) => !a.name.startsWith('Area ')).slice(0, 4);
  const sampleAreas = targetAreas.filter((a) => a.name.startsWith('Area ')).slice(0, 3);
  const samples = [...sampleLandmarks, ...sampleAreas].slice(0, 5);

  if (samples.length > 0) {
    const sampleDetails = samples.map((s) => `${s.name}`).join(', ');
    console.log(`   📍 Samples in this zone: ${sampleDetails}`);
  }

  return {
    zone: zoneKey,
    updatedCount: totalUpdated,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Execute the next step in the 30-second cycle:
 *   Tick 1 (30s): Green Zone
 *   Tick 2 (60s): Red Zone
 *   Tick 3 (90s): Yellow Zone
 *   Repeat...
 */
async function tick() {
  if (_isProcessing) {
    console.warn('⚠️ [AQI Worker] Previous tick still in progress. Skipping this cycle.');
    return;
  }

  _isProcessing = true;
  const zoneKey = CYCLE_SEQUENCE[_currentCycleIndex % CYCLE_SEQUENCE.length];
  _currentCycleIndex++;

  try {
    await processZone(zoneKey);
    const nextZoneKey = CYCLE_SEQUENCE[_currentCycleIndex % CYCLE_SEQUENCE.length];
    const nextZone = ZONES[nextZoneKey];
    console.log(`   ⏳ Next scheduled zone in 30s: ${nextZone.badge} ${nextZone.name}`);
  } catch (err) {
    console.error('❌ [AQI Worker] Error during zone sync:', err.message);
  } finally {
    _isProcessing = false;
  }
}

/**
 * Start the background AQI sync worker (runs every 30 seconds).
 *
 * @param {number} [intervalMs=30000] - Interval between zone updates (default 30,000ms = 30s)
 */
function startAqiWorker(intervalMs = 30000) {
  if (_workerTimer) {
    console.log('AQI Worker already running.');
    return;
  }

  console.log(`🚀 [AQI Worker] Started. Cycle interval: ${intervalMs / 1000}s`);
  console.log(`   Cycle order: 🟢 Green (first 30s) ➔ 🔴 Red (next 30s) ➔ 🟡 Yellow (next 30s) ➔ repeat`);

  // Pre-load pools in background
  getOrInitZonePools()
    .then((pools) => {
      console.log(`   Pool initialized: ${pools.totalSampled.toLocaleString()} areas (50% sample) partitioned into Green, Red, and Yellow zones.`);
    })
    .catch((err) => console.error('   Failed to pre-cache AQI zone pools:', err.message));

  _workerTimer = setInterval(tick, intervalMs);
}

/**
 * Stop the background AQI sync worker cleanly.
 */
function stopAqiWorker() {
  if (_workerTimer) {
    clearInterval(_workerTimer);
    _workerTimer = null;
    console.log('🛑 [AQI Worker] Stopped.');
  }
}

// Standalone CLI execution: node worker/aqiSyncWorker.js
if (require.main === module) {
  startAqiWorker(30000);

  const shutdown = () => {
    stopAqiWorker();
    const { closeDriver } = require('../infra/neo4j');
    closeDriver().then(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = {
  startAqiWorker,
  stopAqiWorker,
  processZone,
  getOrInitZonePools,
  ZONES,
};
