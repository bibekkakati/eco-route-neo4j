'use strict';

const { getRedisClient } = require('../infra/redis');
const { normalize, encodeMember, decodeMember } = require('../utils/search');

/**
 * Redis key for the autocomplete sorted set.
 *
 * Strategy: Sorted Set with all scores = 0.
 * Members are stored as:  "<lowercase_name>|||<areaId>|||<original_name>"
 *
 * ZRANGEBYLEX then does efficient prefix matching:
 *   ZRANGEBYLEX areas:autocomplete "[<prefix>" "[<prefix>\xff"
 *
 * This gives O(log N + M) lookups where M = number of matches.
 */
const AUTOCOMPLETE_KEY = 'areas:autocomplete';

/**
 * Re-index an array of areas into Redis for autocomplete.
 * Replaces the entire set atomically using chunks.
 *
 * @param {Array<{areaId: string|number, name: string}>} areas
 */
async function indexAreas(areas) {
  if (!areas || areas.length === 0) return;

  const redis = getRedisClient();

  // Atomically delete the old key first
  await redis.del(AUTOCOMPLETE_KEY);

  const BATCH_SIZE = 5000;
  for (let i = 0; i < areas.length; i += BATCH_SIZE) {
    const chunk = areas.slice(i, i + BATCH_SIZE);
    const pipeline = redis.pipeline();

    for (const area of chunk) {
      if (!area.name) continue;
      pipeline.zadd(AUTOCOMPLETE_KEY, 0, encodeMember(area));
    }

    await pipeline.exec();
  }

  console.log(`Indexed ${areas.length} areas in Redis autocomplete.`);
}

/**
 * Add or update specific areas in the existing Redis autocomplete index (without clearing existing).
 *
 * @param {Array<{areaId: string|number, name: string}>} areas
 */
async function addAreasToIndex(areas) {
  if (!areas || areas.length === 0) return;

  const redis = getRedisClient();
  const pipeline = redis.pipeline();

  for (const area of areas) {
    if (!area.name) continue;
    pipeline.zadd(AUTOCOMPLETE_KEY, 0, encodeMember(area));
  }

  await pipeline.exec();
}

/**
 * Search areas by name prefix.
 *
 * @param {string} prefix  — the partial name typed by the user
 * @param {number} limit   — max results (default 10)
 * @returns {Promise<Array<{areaId: string, name: string}>>}
 */
async function searchAreasByPrefix(prefix, limit = 10) {
  if (!prefix || prefix.trim().length === 0) return [];

  const redis = getRedisClient();
  const norm = normalize(prefix);

  // Lex range: from "[<norm>" to "[<norm>\xff" (0xff = highest byte, acts as wildcard end)
  const members = await redis.zrangebylex(
    AUTOCOMPLETE_KEY,
    `[${norm}`,
    `[${norm}\xff`,
    'LIMIT', 0, limit
  );

  return members.map(decodeMember);
}

/**
 * Return the total number of indexed areas.
 */
async function getIndexedCount() {
  const redis = getRedisClient();
  return redis.zcard(AUTOCOMPLETE_KEY);
}

module.exports = { indexAreas, addAreasToIndex, searchAreasByPrefix, getIndexedCount };
