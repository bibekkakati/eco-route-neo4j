'use strict';

const { validateApiKey, recordSession } = require('../service/apiKeyService');

/**
 * API Key authentication middleware.
 *
 * Reads the `X-API-Key` header, validates it against the SQLite store,
 * records a session row, and attaches `req.apiKey` to the request.
 *
 * Returns 401 if the key is missing or invalid.
 */
async function authenticate(req, res, next) {
  try {
    const rawKey = req.headers['x-api-key'];

    if (!rawKey) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Missing X-API-Key header.',
      });
    }

    const keyRecord = await validateApiKey(rawKey);

    if (!keyRecord) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid or revoked API key.',
      });
    }

    // Record the session asynchronously (don't block the request)
    recordSession(
      keyRecord.id,
      req.ip || req.socket?.remoteAddress,
      req.headers['user-agent']
    ).catch((err) => console.error('Session recording error:', err));

    req.apiKey = keyRecord;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Admin secret middleware — used only for key management endpoints.
 * Reads `X-Admin-Secret` and compares with ADMIN_SECRET env var.
 */
function adminAuth(req, res, next) {
  const secret = req.headers['x-admin-secret'];
  const expected = process.env.ADMIN_SECRET;

  if (!expected) {
    return res.status(500).json({
      error: 'SERVER_MISCONFIGURED',
      message: 'ADMIN_SECRET is not set.',
    });
  }

  if (!secret || secret !== expected) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid or missing X-Admin-Secret header.',
    });
  }

  next();
}

module.exports = { authenticate, adminAuth };
