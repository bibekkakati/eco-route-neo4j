'use strict';

const fs = require('fs');
const path = require('path');

const GRID_FILE = path.join(__dirname, 'ncr_grid_1km.json');
const GEONAMES_ALL_FILE = '/Users/bibek/.gemini/antigravity-ide/brain/655521d3-d1cf-42a9-b708-90d0276dfdea/scratch/all/IN.txt';
const GEONAMES_POSTAL_FILE = '/Users/bibek/.gemini/antigravity-ide/brain/655521d3-d1cf-42a9-b708-90d0276dfdea/scratch/postal/IN.txt';

// Haversine formula
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Remove diacritics
function cleanName(str) {
  if (!str) return '';
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

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

// Generate automated sectors for Dwarka, Rohini, Gurgaon, and Noida
for (let s = 1; s <= 24; s++) {
  const lat = 28.55 + ((s % 5) * 0.015);
  const lng = 77.02 + (Math.floor(s / 5) * 0.012);
  URBAN_ANCHORS.push({ name: `Sector ${s}, Dwarka, South West Delhi`, lat, lng });
}
for (let s = 1; s <= 30; s++) {
  const lat = 28.70 + ((s % 6) * 0.012);
  const lng = 77.08 + (Math.floor(s / 6) * 0.014);
  URBAN_ANCHORS.push({ name: `Sector ${s}, Rohini, North West Delhi`, lat, lng });
}
for (let s = 1; s <= 115; s++) {
  const lat = 28.37 + ((s % 12) * 0.012);
  const lng = 76.96 + (Math.floor(s / 12) * 0.014);
  URBAN_ANCHORS.push({ name: `Sector ${s}, Gurgaon`, lat, lng });
}
for (let s = 1; s <= 150; s++) {
  const lat = 28.47 + ((s % 15) * 0.011);
  const lng = 77.31 + (Math.floor(s / 15) * 0.012);
  URBAN_ANCHORS.push({ name: `Sector ${s}, Noida`, lat, lng });
}

async function buildReferenceDataset() {
  console.log('Loading reference datasets...');
  const places = [];

  // Add Urban Anchors first (priority)
  for (const a of URBAN_ANCHORS) {
    places.push({
      name: a.name,
      lat: a.lat,
      lng: a.lng,
      isUrban: true,
      weight: 10,
    });
  }

  // Load GeoNames Populated Places
  if (fs.existsSync(GEONAMES_ALL_FILE)) {
    const lines = fs.readFileSync(GEONAMES_ALL_FILE, 'utf8').split('\n');
    for (const line of lines) {
      const p = line.split('\t');
      if (p.length >= 10) {
        const rawName = cleanName(p[1]);
        const lat = parseFloat(p[4]);
        const lng = parseFloat(p[5]);
        const fclass = p[6];
        if (lat >= 27.0 && lat <= 29.55 && lng >= 76.05 && lng <= 78.55) {
          if (fclass === 'P' || fclass === 'A' || fclass === 'L') {
            places.push({
              name: rawName,
              lat,
              lng,
              isUrban: false,
              weight: fclass === 'P' ? 3 : 1,
            });
          }
        }
      }
    }
  }

  // Load Postal places (has district info)
  if (fs.existsSync(GEONAMES_POSTAL_FILE)) {
    const lines = fs.readFileSync(GEONAMES_POSTAL_FILE, 'utf8').split('\n');
    for (const line of lines) {
      const p = line.split('\t');
      if (p.length >= 11) {
        const rawName = cleanName(p[2]);
        const district = cleanName(p[5]);
        const lat = parseFloat(p[9]);
        const lng = parseFloat(p[10]);
        if (lat >= 27.0 && lat <= 29.55 && lng >= 76.05 && lng <= 78.55) {
          const fullName = district && district !== rawName ? `${rawName}, ${district}` : rawName;
          places.push({
            name: fullName,
            lat,
            lng,
            isUrban: false,
            weight: 5,
          });
        }
      }
    }
  }

  console.log(`Loaded ${places.length.toLocaleString()} reference place points.`);
  return places;
}

function buildSpatialGrid(places, cellSize = 0.05) {
  const grid = new Map();
  for (const p of places) {
    const gx = Math.floor(p.lat / cellSize);
    const gy = Math.floor(p.lng / cellSize);
    const key = `${gx}:${gy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(p);
  }
  return { grid, cellSize };
}

function findNearestPlace(lat, lng, spatialGrid) {
  const { grid, cellSize } = spatialGrid;
  const gx = Math.floor(lat / cellSize);
  const gy = Math.floor(lng / cellSize);

  let best = null;
  let bestScore = Infinity;

  // Search expanding grid rings: 1 (5km), 2 (10km), 3 (15km)
  for (let r = 0; r <= 3; r++) {
    for (let dx = -r; dx <= r; dx++) {
      for (let dy = -r; dy <= r; dy++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const key = `${gx + dx}:${gy + dy}`;
        const cell = grid.get(key);
        if (cell) {
          for (const p of cell) {
            const dist = distanceKm(lat, lng, p.lat, p.lng);
            // Effective cost considers distance and weight
            const score = dist / (p.weight || 1);
            if (score < bestScore) {
              bestScore = score;
              best = { ...p, actualDist: dist };
            }
          }
        }
      }
    }
    if (best && best.actualDist <= (r + 1) * cellSize * 111) break;
  }

  return best;
}

// Directional naming helper for disambiguation
function getDirection(fromLat, fromLng, toLat, toLng) {
  const dLat = toLat - fromLat;
  const dLng = toLng - fromLng;
  if (Math.abs(dLat) < 0.003 && Math.abs(dLng) < 0.003) return '';
  const angle = Math.atan2(dLat, dLng) * 180 / Math.PI;
  if (angle >= -22.5 && angle < 22.5) return 'East';
  if (angle >= 22.5 && angle < 67.5) return 'North East';
  if (angle >= 67.5 && angle < 112.5) return 'North';
  if (angle >= 112.5 && angle < 157.5) return 'North West';
  if (angle >= 157.5 || angle < -157.5) return 'West';
  if (angle >= -157.5 && angle < -112.5) return 'South West';
  if (angle >= -112.5 && angle < -67.5) return 'South';
  if (angle >= -67.5 && angle < -22.5) return 'South East';
  return '';
}

async function run() {
  console.log(`\n======================================================`);
  console.log(` Generating Real Geographic Names for NCR Grid Areas`);
  console.log(`======================================================\n`);

  const places = await buildReferenceDataset();
  const spatialGrid = buildSpatialGrid(places, 0.05);

  console.log(`Reading existing grid file: ${GRID_FILE}`);
  const areas = JSON.parse(fs.readFileSync(GRID_FILE, 'utf8'));
  console.log(`Total grid areas to process: ${areas.length.toLocaleString()}`);

  // Pass 1: find nearest base place for each area and track frequencies
  console.log('Pass 1: Matching nearest base places...');
  const matchedBaseNames = [];
  const baseNameCounts = new Map();

  for (let i = 0; i < areas.length; i++) {
    const a = areas[i];
    const nearest = findNearestPlace(a.latitude, a.longitude, spatialGrid);
    const baseName = nearest ? nearest.name : `NCR Grid Point ${i + 1}`;
    matchedBaseNames.push(baseName);
    baseNameCounts.set(baseName, (baseNameCounts.get(baseName) || 0) + 1);

    if ((i + 1) % 15000 === 0 || i === areas.length - 1) {
      const pct = (((i + 1) / areas.length) * 100).toFixed(1);
      process.stdout.write(`\r  [Pass 1] Matched ${(i + 1).toLocaleString()}/${areas.length.toLocaleString()} (${pct}%)`);
    }
  }

  // Pass 2: assign final names. If multiple areas share the same base name, assign suffix A1, A2, A3...
  console.log('\nPass 2: Assigning unique suffixes (A1, A2, A3...) for shared names...');
  const occurrenceTracker = new Map();
  const updatedAreas = [];

  for (let i = 0; i < areas.length; i++) {
    const a = areas[i];
    const areaId = a.areaId || a.name || `Area ${i + 1}`;
    const baseName = matchedBaseNames[i];
    const totalCount = baseNameCounts.get(baseName);

    let finalName = baseName;
    if (totalCount > 1) {
      const occ = (occurrenceTracker.get(baseName) || 0) + 1;
      occurrenceTracker.set(baseName, occ);
      if (baseName.includes(',')) {
        const [place, region] = baseName.split(/,(.+)/);
        finalName = `${place.trim()} - A${occ}, ${region.trim()}`;
      } else {
        finalName = `${baseName} - A${occ}`;
      }
    }

    updatedAreas.push({
      areaId,
      name: finalName,
      latitude: a.latitude,
      longitude: a.longitude,
    });

    if ((i + 1) % 15000 === 0 || i === areas.length - 1) {
      const pct = (((i + 1) / areas.length) * 100).toFixed(1);
      process.stdout.write(`\r  [Pass 2] Suffixing ${(i + 1).toLocaleString()}/${areas.length.toLocaleString()} (${pct}%)`);
    }
  }

  console.log('\n\nWriting updated data back to ncr_grid_1km.json...');
  fs.writeFileSync(GRID_FILE, JSON.stringify(updatedAreas, null, 2), 'utf8');
  console.log(`Successfully updated ${updatedAreas.length.toLocaleString()} areas in ${GRID_FILE}`);

  console.log('\nSample generated areas:');
  const samples = [0, 500, 1000, 15000, 25000, 35000, 45000, 60000];
  for (const s of samples) {
    if (updatedAreas[s]) {
      console.log(`  [${updatedAreas[s].areaId}] ${updatedAreas[s].name} (${updatedAreas[s].latitude}, ${updatedAreas[s].longitude})`);
    }
  }
}

if (require.main === module) {
  run().catch((err) => {
    console.error('Error generating names:', err);
    process.exit(1);
  });
}

module.exports = { run };
