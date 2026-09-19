'use strict';

const { searchAreasByPrefix, indexAreas, getIndexedCount } = require('../service/searchService');
const { getAreas } = require('../service/areaService');

/**
 * GET /api/v1/areas/search?q=<prefix>&limit=<n>
 *
 * Returns area name suggestions that start with `q`.
 * Query params:
 *   q      {string}  — required, the search prefix (min 1 char)
 *   limit  {number}  — optional, max results (default 10, max 50)
 */
async function searchAreas(req, res, next) {
  try {
    const q = (req.query.q || '').trim();
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);

    if (!q) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Query parameter `q` is required.',
      });
    }

    const results = await searchAreasByPrefix(q, limit);

    return res.json({
      query: q,
      count: results.length,
      results,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/v1/areas/sync-index
 * (Admin only — requires X-Admin-Secret)
 *
 * Re-indexes all areas from Neo4j into Redis.
 * Useful after bulk area data updates.
 */
async function syncIndex(req, res, next) {
  try {
    const areas = await getAreas();
    await indexAreas(areas);
    const count = await getIndexedCount();

    return res.json({
      message: 'Area search index synced successfully.',
      indexedCount: count,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { searchAreas, syncIndex };
