'use strict';

/**
 * Convert a Neo4j value (Integer object or raw JS value) to a JS float.
 * Neo4j driver returns its own Integer type for integer properties;
 * this handles both gracefully.
 *
 * @param {*} val
 * @returns {number|null}
 */
function toFloat(val) {
  if (val === null || val === undefined) return null;
  return typeof val.toNumber === 'function' ? val.toNumber() : Number(val);
}

/**
 * Map a Neo4j record (with Area property aliases) to a plain JS object.
 *
 * @param {import('neo4j-driver').Record} r
 * @returns {{ areaId, name, latitude, longitude, aqi, geohash }}
 */
function toArea(r) {
  return {
    areaId:    r.get('areaId'),
    name:      r.get('name'),
    latitude:  toFloat(r.get('latitude')),
    longitude: toFloat(r.get('longitude')),
    aqi:       toFloat(r.get('aqi')),
    geohash:   r.get('geohash'),
  };
}

module.exports = { toFloat, toArea };
