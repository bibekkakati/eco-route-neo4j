'use strict';

/**
 * Normalize a string for case-insensitive prefix matching.
 * Lowercases and trims whitespace.
 *
 * @param {string} str
 * @returns {string}
 */
function normalize(str) {
  return str.toLowerCase().trim();
}

/**
 * Encode an area into a Redis sorted-set member string.
 * Format: "<normalizedName>|||<areaId>|||<originalName>"
 *
 * The leading normalizedName drives the lex sort; the rest is payload
 * recovered on decode without an extra Redis lookup.
 *
 * @param {{ areaId: string|number, name: string }} area
 * @returns {string}
 */
function encodeMember(area) {
  return `${normalize(area.name)}|||${area.areaId}|||${area.name}`;
}

/**
 * Decode a Redis sorted-set member back into a result object.
 *
 * @param {string} member
 * @returns {{ areaId: string, name: string }}
 */
function decodeMember(member) {
  const [, areaIdStr, originalName] = member.split('|||');
  return { areaId: areaIdStr, name: originalName };
}

module.exports = { normalize, encodeMember, decodeMember };
