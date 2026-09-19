'use strict';

const { test, describe, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { getTestApiKey, teardown } = require('./helpers');

describe('API Key Authentication', () => {
  let apiKey = null;

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
    apiKey = await getTestApiKey();
    const res = await request(app)
      .get('/api/v1/areas/Area%201')
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.area);
    assert.strictEqual(res.body.area.areaId, 'Area 1');
  });

  after(async () => {
    await teardown();
  });
});
