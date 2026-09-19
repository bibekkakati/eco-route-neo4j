'use strict';

const { Router } = require('express');
const { adminAuth } = require('../middleware/auth');
const { validate, z } = require('../middleware/validate');
const { createKey, listKeys, revokeKey } = require('../controller/apiKeyController');

const router = Router();

const createKeySchema = z.object({
  name: z.string().min(1, 'name is required').max(100),
});

/**
 * POST /api/v1/auth/keys
 * Create a new API key. Protected by X-Admin-Secret.
 */
router.post('/keys', adminAuth, validate(createKeySchema), createKey);

/**
 * GET /api/v1/auth/keys
 * List all keys. Protected by X-Admin-Secret.
 */
router.get('/keys', adminAuth, listKeys);

/**
 * DELETE /api/v1/auth/keys/:id
 * Revoke a key. Protected by X-Admin-Secret.
 */
router.delete('/keys/:id', adminAuth, revokeKey);

module.exports = router;
