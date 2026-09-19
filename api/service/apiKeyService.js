'use strict';

const { v4: uuidv4 } = require('uuid');
const { db } = require('../infra/sqlite');
const { apiKeys, authSessions } = require('../db/schema');
const { eq, and } = require('drizzle-orm');
const { hashKey, generateRawKey } = require('../utils/crypto');

const SESSION_DURATION_HOURS = 24;


/**
 * Create a new API key. Returns the raw key ONCE — it is not stored.
 */
async function createApiKey(name) {
  const rawKey = generateRawKey();
  const id = uuidv4();
  const now = new Date().toISOString();

  db.insert(apiKeys).values({
    id,
    name,
    keyHash: hashKey(rawKey),
    prefix: rawKey.slice(0, 8),
    isActive: true,
    createdAt: now,
    lastUsedAt: null,
  }).run();

  return { id, name, rawKey, prefix: rawKey.slice(0, 8), createdAt: now };
}

/**
 * Validate a raw API key. Returns the key record if valid, null otherwise.
 */
async function validateApiKey(rawKey) {
  if (!rawKey) return null;
  const hash = hashKey(rawKey);

  const rows = db
    .select()
    .from(apiKeys)
    .where(and(eq(apiKeys.keyHash, hash), eq(apiKeys.isActive, true)))
    .all();

  if (!rows.length) return null;
  return rows[0];
}

/**
 * Record an auth session and update last_used_at on the key.
 */
async function recordSession(apiKeyId, ipAddress, userAgent) {
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DURATION_HOURS * 3600 * 1000);

  db.insert(authSessions).values({
    id: uuidv4(),
    apiKeyId,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    ipAddress: ipAddress || null,
    userAgent: userAgent || null,
  }).run();

  db.update(apiKeys)
    .set({ lastUsedAt: now.toISOString() })
    .where(eq(apiKeys.id, apiKeyId))
    .run();
}

/**
 * List all API keys (never returns hashes).
 */
async function listApiKeys() {
  return db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      prefix: apiKeys.prefix,
      isActive: apiKeys.isActive,
      createdAt: apiKeys.createdAt,
      lastUsedAt: apiKeys.lastUsedAt,
    })
    .from(apiKeys)
    .all();
}

/**
 * Revoke (soft-delete) an API key by id.
 */
async function revokeApiKey(id) {
  const result = db
    .update(apiKeys)
    .set({ isActive: false })
    .where(eq(apiKeys.id, id))
    .run();

  return result.changes > 0;
}

module.exports = {
  createApiKey,
  validateApiKey,
  recordSession,
  listApiKeys,
  revokeApiKey,
};
