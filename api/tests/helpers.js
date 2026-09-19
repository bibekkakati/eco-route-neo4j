'use strict';

require('dotenv').config();

const { createApiKey } = require('../service/apiKeyService');
const { closeDriver } = require('../infra/neo4j');
const { closeRedis } = require('../infra/redis');

// Run migrations on require
require('../db/migrate');

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin-3456khd6779-456hj77';

let _cachedTestApiKey = null;

/**
 * Get or create a valid API key for testing
 */
async function getTestApiKey() {
  if (_cachedTestApiKey) return _cachedTestApiKey;
  const keyRecord = await createApiKey(`Test-Key-${Date.now()}`);
  _cachedTestApiKey = keyRecord.rawKey;
  return _cachedTestApiKey;
}

/**
 * Cleanly close all connections after all tests finish
 */
async function teardown() {
  await Promise.allSettled([closeDriver(), closeRedis()]);
}

module.exports = {
  ADMIN_SECRET,
  getTestApiKey,
  teardown,
};
