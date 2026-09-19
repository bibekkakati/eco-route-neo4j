'use strict';

const geohash = require('ngeohash');

// Precision 6 corresponds to ~1.2 km x 0.6 km bounding box (±0.6 km radius),
// which accurately models a 1 km radius neighborhood node.
const DEFAULT_GEOHASH_PRECISION = 6;

/**
 * Encode latitude and longitude into a geohash string.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} [precision=6]
 * @returns {string}
 */
function encode(latitude, longitude, precision = DEFAULT_GEOHASH_PRECISION) {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    throw new TypeError('Latitude and longitude must be numbers');
  }
  return geohash.encode(latitude, longitude, precision);
}

/**
 * Decode a geohash string into latitude and longitude center point.
 *
 * @param {string} hash
 * @returns {{ latitude: number, longitude: number }}
 */
function decode(hash) {
  return geohash.decode(hash);
}

/**
 * Get the geohash cell plus its 8 immediate neighboring cells (9 cells total).
 * Used for boundary-safe spatial matching within ~1 km radius.
 *
 * @param {string} hash
 * @returns {string[]}
 */
function getNeighbors(hash) {
  const neighbors = geohash.neighbors(hash);
  return [hash, ...neighbors];
}

/**
 * Calculate the great-circle distance between two coordinates in kilometers using the Haversine formula.
 *
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} distance in km
 */
function haversineDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

module.exports = {
  DEFAULT_GEOHASH_PRECISION,
  encode,
  decode,
  getNeighbors,
  haversineDistanceKm,
};
