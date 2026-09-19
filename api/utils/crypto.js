'use strict';

const crypto = require('crypto');

/**
 * Compute SHA-256 hex digest of a string.
 * Used to store API key hashes — raw keys are never saved.
 *
 * @param {string} rawKey
 * @returns {string} hex-encoded SHA-256 hash
 */
function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Generate a cryptographically random API key.
 * Format: `ecr_<48 random hex chars>` (~52 chars total)
 *
 * @returns {string}
 */
function generateRawKey() {
  return `ecr_${crypto.randomBytes(24).toString('hex')}`;
}

module.exports = { hashKey, generateRawKey };
