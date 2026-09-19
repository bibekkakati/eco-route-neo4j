'use strict';

require('dotenv').config();

const { runQuery, runWriteQuery } = require('../infra/neo4j');
const { haversineDistanceKm } = require('../utils/geohash');

// Key urban landmarks and sectors across Delhi NCR with high-priority weighting
const URBAN_ANCHORS = [
  // Delhi core & hubs
  { name: 'Connaught Place, Central Delhi', lat: 28.6315, lng: 77.2167 },
  { name: 'Karol Bagh, Central Delhi', lat: 28.6514, lng: 77.1907 },
  { name: 'Chandni Chowk, North Delhi', lat: 28.6506, lng: 77.2303 },
  { name: 'Lajpat Nagar, South Delhi', lat: 28.5700, lng: 77.2400 },
  { name: 'Hauz Khas, South Delhi', lat: 28.5494, lng: 77.2001 },
  { name: 'Saket, South Delhi', lat: 28.5244, lng: 77.2100 },
  { name: 'Vasant Kunj, South West Delhi', lat: 28.5200, lng: 77.1500 },
  { name: 'Chanakyapuri, New Delhi', lat: 28.5900, lng: 77.1900 },
  { name: 'India Gate, New Delhi', lat: 28.6129, lng: 77.2295 },
  { name: 'Aerocity, South West Delhi', lat: 28.5500, lng: 77.1200 },
  { name: 'IGI Airport T3, South West Delhi', lat: 28.5562, lng: 77.0999 },
  { name: 'Janakpuri, West Delhi', lat: 28.6219, lng: 77.0878 },
  { name: 'Rajouri Garden, West Delhi', lat: 28.6470, lng: 77.1200 },
  { name: 'Paschim Vihar, West Delhi', lat: 28.6690, lng: 77.1000 },
  { name: 'Punjabi Bagh, West Delhi', lat: 28.6680, lng: 77.1300 },
  { name: 'Mayur Vihar Phase 1, East Delhi', lat: 28.6050, lng: 77.2950 },
  { name: 'Preet Vihar, East Delhi', lat: 28.6400, lng: 77.2950 },
  { name: 'Laxmi Nagar, East Delhi', lat: 28.6310, lng: 77.2770 },
  { name: 'Shahdara, East Delhi', lat: 28.6730, lng: 77.2890 },
  { name: 'Dilshad Garden, North East Delhi', lat: 28.6850, lng: 77.3150 },
  { name: 'Civil Lines, North Delhi', lat: 28.6800, lng: 77.2200 },
  { name: 'Pitampura, North West Delhi', lat: 28.6990, lng: 77.1380 },

  // Gurgaon Hubs & Sectors
  { name: 'Cyber City, DLF Phase 2, Gurgaon', lat: 28.4950, lng: 77.0890 },
  { name: 'Cyber Hub, Gurgaon', lat: 28.4980, lng: 77.0880 },
  { name: 'DLF Phase 1, Golf Course Road, Gurgaon', lat: 28.4770, lng: 77.0980 },
  { name: 'DLF Phase 3, Gurgaon', lat: 28.4980, lng: 77.1050 },
  { name: 'DLF Phase 4, Gurgaon', lat: 28.4680, lng: 77.0880 },
  { name: 'DLF Phase 5, Golf Course Road, Gurgaon', lat: 28.4550, lng: 77.0990 },
  { name: 'Sector 29, City Centre, Gurgaon', lat: 28.4680, lng: 77.0650 },
  { name: 'Sector 14, Old Gurgaon', lat: 28.4750, lng: 77.0450 },
  { name: 'Sector 21, Palam Vihar, Gurgaon', lat: 28.5100, lng: 77.0500 },
  { name: 'Sector 23, Palam Vihar, Gurgaon', lat: 28.5050, lng: 77.0400 },
  { name: 'Sector 43, Sushant Lok, Gurgaon', lat: 28.4600, lng: 77.0800 },
  { name: 'Sector 54, Golf Course Road, Gurgaon', lat: 28.4450, lng: 77.1100 },
  { name: 'Sector 56, Gurgaon', lat: 28.4300, lng: 77.1050 },
  { name: 'Sector 57, Sushant Lok 3, Gurgaon', lat: 28.4250, lng: 77.0900 },
  { name: 'Sector 47, Sohna Road, Gurgaon', lat: 28.4250, lng: 77.0450 },
  { name: 'Sector 48, Sohna Road, Gurgaon', lat: 28.4200, lng: 77.0350 },
  { name: 'Sector 49, Sohna Road, Gurgaon', lat: 28.4100, lng: 77.0450 },
  { name: 'Sector 50, Nirvana Country, Gurgaon', lat: 28.4150, lng: 77.0650 },
  { name: 'Sector 65, Golf Course Ext Road, Gurgaon', lat: 28.3950, lng: 77.0750 },
  { name: 'Sector 66, Golf Course Ext Road, Gurgaon', lat: 28.3880, lng: 77.0600 },
  { name: 'Sector 82, New Gurgaon', lat: 28.3850, lng: 76.9650 },
  { name: 'Sector 83, New Gurgaon', lat: 28.3750, lng: 76.9750 },
  { name: 'Manesar Industrial Area, Gurgaon', lat: 28.3550, lng: 76.9350 },
  { name: 'IMT Manesar Sector 1, Gurgaon', lat: 28.3650, lng: 76.9150 },

  // Noida Hubs & Sectors
  { name: 'Sector 18, Atta Market, Noida', lat: 28.5700, lng: 77.3220 },
  { name: 'Sector 16, Film City, Noida', lat: 28.5780, lng: 77.3150 },
  { name: 'Sector 15, Noida', lat: 28.5850, lng: 77.3100 },
  { name: 'Sector 25, Noida', lat: 28.5830, lng: 77.3380 },
  { name: 'Sector 29, Noida', lat: 28.5680, lng: 77.3350 },
  { name: 'Sector 34, Noida', lat: 28.5850, lng: 77.3600 },
  { name: 'Sector 50, Noida', lat: 28.5720, lng: 77.3700 },
  { name: 'Sector 52, Noida', lat: 28.5880, lng: 77.3750 },
  { name: 'Sector 62, IT Hub, Noida', lat: 28.6250, lng: 77.3650 },
  { name: 'Sector 63, Electronic City, Noida', lat: 28.6280, lng: 77.3800 },
  { name: 'Sector 75, Noida', lat: 28.5780, lng: 77.3880 },
  { name: 'Sector 76, Noida', lat: 28.5680, lng: 77.3850 },
  { name: 'Sector 128, Jaypee Greens, Noida Expressway', lat: 28.5280, lng: 77.3650 },
  { name: 'Sector 135, Noida Expressway', lat: 28.5050, lng: 77.3950 },
  { name: 'Sector 137, Noida Expressway', lat: 28.5150, lng: 77.4080 },
  { name: 'Sector 142, Advant Navis, Noida Expressway', lat: 28.4980, lng: 77.4200 },
  { name: 'Sector 150, Noida Expressway', lat: 28.4550, lng: 77.4750 },

  // Greater Noida
  { name: 'Pari Chowk, Greater Noida', lat: 28.4680, lng: 77.5050 },
  { name: 'Alpha 1, Greater Noida', lat: 28.4800, lng: 77.5100 },
  { name: 'Beta 1, Greater Noida', lat: 28.4750, lng: 77.5180 },
  { name: 'Gamma 1, Greater Noida', lat: 28.4880, lng: 77.5150 },
  { name: 'Delta 1, Greater Noida', lat: 28.4950, lng: 77.5250 },
  { name: 'Knowledge Park II, Greater Noida', lat: 28.4600, lng: 77.4950 },
  { name: 'Knowledge Park III, Greater Noida', lat: 28.4720, lng: 77.4900 },
  { name: 'Noida Extension, Gaur City 1, Greater Noida West', lat: 28.6080, lng: 77.4250 },
  { name: 'Noida Extension, Gaur City 2, Greater Noida West', lat: 28.6150, lng: 77.4350 },

  // Ghaziabad
  { name: 'Indirapuram, Ghaziabad', lat: 28.6400, lng: 77.3700 },
  { name: 'Vaishali, Ghaziabad', lat: 28.6450, lng: 77.3400 },
  { name: 'Kaushambi, Ghaziabad', lat: 28.6460, lng: 77.3200 },
  { name: 'Vasundhara, Ghaziabad', lat: 28.6650, lng: 77.3600 },
  { name: 'Raj Nagar Extension, Ghaziabad', lat: 28.7100, lng: 77.4250 },
  { name: 'Crossings Republik, Ghaziabad', lat: 28.6300, lng: 77.4400 },
  { name: 'Kavi Nagar, Ghaziabad', lat: 28.6750, lng: 77.4500 },

  // Faridabad
  { name: 'Sector 15, Faridabad', lat: 28.4000, lng: 77.3100 },
  { name: 'Sector 16, Faridabad', lat: 28.4100, lng: 77.3200 },
  { name: 'Sector 21C, Faridabad', lat: 28.4350, lng: 77.3000 },
  { name: 'NIT 1, Faridabad', lat: 28.3950, lng: 77.2950 },
  { name: 'NIT 5, Faridabad', lat: 28.3900, lng: 77.3050 },
  { name: 'Greater Faridabad, Sector 81', lat: 28.3950, lng: 77.3600 },
  { name: 'Greater Faridabad, Sector 86', lat: 28.4150, lng: 77.3750 },
  { name: 'Badarpur Border, Faridabad', lat: 28.4950, lng: 77.3000 },

  // Dwarka Sectors
  { name: 'Dwarka Sector 6, South West Delhi', lat: 28.5850, lng: 77.0650 },
  { name: 'Dwarka Sector 10, South West Delhi', lat: 28.5800, lng: 77.0550 },
  { name: 'Dwarka Sector 12, South West Delhi', lat: 28.5920, lng: 77.0420 },
  { name: 'Dwarka Sector 14, South West Delhi', lat: 28.6010, lng: 77.0250 },
  { name: 'Dwarka Sector 21, South West Delhi', lat: 28.5520, lng: 77.0580 },

  // Rohini Sectors
  { name: 'Rohini Sector 7, North West Delhi', lat: 28.7050, lng: 77.1250 },
  { name: 'Rohini Sector 9, North West Delhi', lat: 28.7180, lng: 77.1250 },
  { name: 'Rohini Sector 13, North West Delhi', lat: 28.7250, lng: 77.1350 },
  { name: 'Rohini Sector 15, North West Delhi', lat: 28.7350, lng: 77.1300 },
  { name: 'Rohini Sector 24, North West Delhi', lat: 28.7250, lng: 77.0900 },
];

const DEFAULT_INTERVAL_MS = parseInt(process.env.AQI_WORKER_INTERVAL_MS, 10) || 5000;

let _workerTimer = null;
let _cachedAnchorGroups = null;
let _isProcessing = false;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Resolve the 97 URBAN_ANCHORS to their matching Area nodes in Neo4j.
 * Caches the resolved mapping in memory for fast updates on every tick.
 */
async function getOrInitAnchorGroups(forceRefresh = false) {
  if (_cachedAnchorGroups && !forceRefresh) {
    return _cachedAnchorGroups;
  }

  // Fetch candidate areas in Delhi NCR bounding box
  const records = await runQuery(`
    MATCH (a:Area)
    WHERE a.latitude >= 28.30 AND a.latitude <= 28.76
      AND a.longitude >= 76.90 AND a.longitude <= 77.55
    RETURN a.areaId AS areaId, a.name AS name, a.latitude AS latitude, a.longitude AS longitude
  `);

  const allAreas = records.map((r) => ({
    areaId:    r.get('areaId'),
    name:      r.get('name'),
    latitude:  r.get('latitude'),
    longitude: r.get('longitude'),
  }));

  const groups = [];
  for (const anchor of URBAN_ANCHORS) {
    const base = anchor.name.split(',')[0].trim();
    // Match by name prefix
    let matched = allAreas.filter((a) => a.name.includes(base));

    // If no direct name match, match by nearest coordinates (within 2.5 km)
    if (!matched.length) {
      let closest = null;
      let minDist = 999;
      for (const a of allAreas) {
        const d = haversineDistanceKm(anchor.lat, anchor.lng, a.latitude, a.longitude);
        if (d < minDist) {
          minDist = d;
          closest = a;
        }
      }
      if (closest && minDist <= 2.5) {
        matched = [closest];
      }
    }

    groups.push({
      anchorName: anchor.name,
      baseName:   base,
      lat:        anchor.lat,
      lng:        anchor.lng,
      nodeIds:    matched.map((m) => m.areaId),
      nodeNames:  matched.map((m) => m.name),
    });
  }

  _cachedAnchorGroups = groups;
  return _cachedAnchorGroups;
}

/**
 * Execute a single AQI update cycle exclusively for URBAN_ANCHORS:
 * - AQI range: 300 – 500
 * - 65% weightage for 300 – 400 AQI
 * - 35% weightage for 401 – 500 AQI
 *
 * @returns {Promise<object>}
 */
async function syncAnchorAqi() {
  const groups = await getOrInitAnchorGroups();
  if (!groups || groups.length === 0) return { updatedNodes: 0 };

  const startTime = Date.now();
  const timestamp = new Date().toLocaleTimeString();

  // Shuffle anchor locations to randomly select distributions
  const shuffled = shuffle(groups);
  const count300_400 = Math.round(groups.length * 0.65); // 65% weightage (~63 locations)

  const locations300_400 = shuffled.slice(0, count300_400);
  const locations400_500 = shuffled.slice(count300_400); // 35% weightage (~34 locations)

  const updates = [];
  const samples300_400 = [];
  const samples400_500 = [];

  // 65% weightage: AQI 300–400
  for (const loc of locations300_400) {
    const aqi = randomInt(300, 400);
    for (const areaId of loc.nodeIds) {
      updates.push({ areaId, aqi });
    }
    samples300_400.push(`${loc.baseName}: ${aqi}`);
  }

  // 35% weightage: AQI 401–500 (triggers AQI > 400 reroute alert)
  for (const loc of locations400_500) {
    const aqi = randomInt(401, 500);
    for (const areaId of loc.nodeIds) {
      updates.push({ areaId, aqi });
    }
    samples400_500.push(`${loc.baseName}: ${aqi}`);
  }

  // Update Neo4j nodes in a single batch query
  let totalUpdated = 0;
  if (updates.length > 0) {
    const res = await runWriteQuery(
      `
      UNWIND $updates AS row
      MATCH (a:Area {areaId: row.areaId})
      SET a.aqi = row.aqi
      RETURN count(a) AS total
      `,
      { updates }
    );
    totalUpdated = res[0]?.get('total')?.toInt ? res[0].get('total').toInt() : Number(res[0]?.get('total')) || updates.length;
  }

  const durationMs = Date.now() - startTime;
  console.log(`\n⏱️  [${timestamp}] AQI Worker: Synchronized ${groups.length} Urban Anchors (${totalUpdated} graph nodes) in ${durationMs}ms`);
  console.log(`   🟡 65% Weightage (300–400 AQI): ${locations300_400.length} locations (e.g. ${samples300_400.slice(0, 4).join(', ')})`);
  console.log(`   🔴 35% Weightage (401–500 AQI): ${locations400_500.length} locations (e.g. ${samples400_500.slice(0, 4).join(', ')})`);

  return {
    updatedLocations: groups.length,
    updatedNodes: totalUpdated,
    count300_400: locations300_400.length,
    count400_500: locations400_500.length,
    durationMs,
  };
}

/**
 * Worker tick handler.
 */
async function tick() {
  if (_isProcessing) {
    console.warn('⚠️ [AQI Worker] Previous tick still in progress. Skipping cycle.');
    return;
  }

  _isProcessing = true;
  try {
    await syncAnchorAqi();
  } catch (err) {
    console.error('❌ [AQI Worker] Error updating urban anchor AQI:', err.message);
  } finally {
    _isProcessing = false;
  }
}

/**
 * Start the background AQI sync worker.
 *
 * @param {number} [intervalMs] - Interval between updates in ms (default 5,000ms = 5s, configurable via AQI_WORKER_INTERVAL_MS)
 */
function startAqiWorker(intervalMs = DEFAULT_INTERVAL_MS) {
  if (_workerTimer) {
    console.log('AQI Worker already running.');
    return;
  }

  console.log(`🚀 [AQI Worker] Started for ${URBAN_ANCHORS.length} Urban Anchor Locations.`);
  console.log(`   Cycle interval: ${intervalMs / 1000}s`);
  console.log(`   Rule: AQI 300–500 (65% in 300–400, 35% in 401–500).`);

  // Pre-initialize anchor groups and run first immediate sync
  getOrInitAnchorGroups()
    .then((groups) => {
      console.log(`   Resolved ${groups.length} Urban Anchors to Neo4j graph nodes.`);
      return syncAnchorAqi();
    })
    .catch((err) => console.error('   Failed to initialize AQI worker:', err.message));

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
  startAqiWorker(DEFAULT_INTERVAL_MS);

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
  syncAnchorAqi,
  getOrInitAnchorGroups,
  URBAN_ANCHORS,
  DEFAULT_INTERVAL_MS,
};
