'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { ADMIN_SECRET, teardown } = require('./helpers');

describe('Auth & API Key Management', () => {
  let createdKeyId = null;
  let createdRawKey = null;

  test('POST /api/v1/auth/keys fails without X-Admin-Secret (401)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/keys')
      .send({ name: 'Unauthorized Key' });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'UNAUTHORIZED');
  });

  test('POST /api/v1/auth/keys fails with wrong X-Admin-Secret (401)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/keys')
      .set('X-Admin-Secret', 'invalid-secret-xyz')
      .send({ name: 'Unauthorized Key' });

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'UNAUTHORIZED');
  });

  test('POST /api/v1/auth/keys creates a key with valid X-Admin-Secret (201)', async () => {
    const res = await request(app)
      .post('/api/v1/auth/keys')
      .set('X-Admin-Secret', ADMIN_SECRET)
      .send({ name: 'Test Key 1' });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.id);
    assert.ok(res.body.rawKey);
    assert.strictEqual(res.body.name, 'Test Key 1');
    assert.ok(res.body.prefix);

    createdKeyId = res.body.id;
    createdRawKey = res.body.rawKey;
  });

  test('GET /api/v1/auth/keys lists all API keys without hashes (200)', async () => {
    const res = await request(app)
      .get('/api/v1/auth/keys')
      .set('X-Admin-Secret', ADMIN_SECRET);

    assert.strictEqual(res.status, 200);
    assert.ok(Array.isArray(res.body.keys));
    assert.ok(res.body.keys.length > 0);

    const found = res.body.keys.find((k) => k.id === createdKeyId);
    assert.ok(found);
    assert.strictEqual(found.keyHash, undefined); // hash must not be exposed
    assert.strictEqual(found.name, 'Test Key 1');
  });

  test('Protected route fails without X-API-Key (401)', async () => {
    const res = await request(app).get('/api/v1/areas');
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'UNAUTHORIZED');
  });

  test('Protected route fails with invalid X-API-Key (401)', async () => {
    const res = await request(app)
      .get('/api/v1/areas')
      .set('X-API-Key', 'fake_key_1234567890');

    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.body.error, 'UNAUTHORIZED');
  });

  test('Protected route succeeds with valid X-API-Key (200)', async () => {
    const res = await request(app)
      .get('/api/v1/areas/Area%201')
      .set('X-API-Key', createdRawKey);

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.area);
    assert.strictEqual(res.body.area.areaId, 'Area 1');
  });

  test('DELETE /api/v1/auth/keys/:id revokes the key (200)', async () => {
    const res = await request(app)
      .delete(`/api/v1/auth/keys/${createdKeyId}`)
      .set('X-Admin-Secret', ADMIN_SECRET);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message, `API key '${createdKeyId}' revoked successfully.`);

    // Revoked key should no longer authenticate
    const authRes = await request(app)
      .get('/api/v1/areas/Area%201')
      .set('X-API-Key', createdRawKey);

    assert.strictEqual(authRes.status, 401);
  });

  after(async () => {
    await teardown();
  });
});
