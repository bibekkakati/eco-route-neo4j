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

module.exports = { authenticate };
