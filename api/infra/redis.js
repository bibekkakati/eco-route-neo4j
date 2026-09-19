'use strict';

const Redis = require('ioredis');

let _client = null;

/**
 * Returns (and lazily creates) the ioredis singleton.
 * Reads REDIS_URL from environment.
 */
function getRedisClient() {
  if (_client) return _client;

  const url = process.env.REDIS_URL;
  if (!url) throw new Error('REDIS_URL environment variable is not set.');

  _client = new Redis(url, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: false,
  });

  _client.on('connect', () => console.log('Redis connected.'));
  _client.on('error', (err) => console.error('[Redis Error]', err.message));

  return _client;
}

/**
 * Gracefully close the Redis connection (call on server shutdown).
 */
async function closeRedis() {
  if (_client) {
    await _client.quit();
    _client = null;
  }
}

module.exports = { getRedisClient, closeRedis };
