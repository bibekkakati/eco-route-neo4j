'use strict';

const { createApiKey, listApiKeys, revokeApiKey } = require('../service/apiKeyService');

/**
 * POST /api/v1/auth/keys
 * Create a new API key. Requires X-Admin-Secret header.
 * Returns the raw key once — it cannot be retrieved again.
 */
async function createKey(req, res, next) {
  try {
    const { name } = req.body;
    const result = await createApiKey(name);

    return res.status(201).json({
      message: 'API key created. Store the rawKey securely — it will not be shown again.',
      id: result.id,
      name: result.name,
      rawKey: result.rawKey,
      prefix: result.prefix,
      createdAt: result.createdAt,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/v1/auth/keys
 * List all API keys (hashes are never returned).
 */
async function listKeys(req, res, next) {
  try {
    const keys = await listApiKeys();
    return res.json({ keys });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/v1/auth/keys/:id
 * Revoke (soft-delete) an API key.
 */
async function revokeKey(req, res, next) {
  try {
    const { id } = req.params;
    const revoked = await revokeApiKey(id);

    if (!revoked) {
      return res.status(404).json({ error: 'NOT_FOUND', message: `API key '${id}' not found.` });
    }

    return res.json({ message: `API key '${id}' revoked successfully.` });
  } catch (err) {
    next(err);
  }
}

module.exports = { createKey, listKeys, revokeKey };
