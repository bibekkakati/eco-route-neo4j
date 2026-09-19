'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { ADMIN_SECRET, getTestApiKey, teardown } = require('./helpers');
const { indexAreas } = require('../service/searchService');

describe('Redis Autocomplete Search API', () => {
  let apiKey = null;

  before(async () => {
    apiKey = await getTestApiKey();

    // Seed mock areas into Redis autocomplete index for isolated deterministic testing
    await indexAreas([
      { areaId: 'TEST_CP', name: 'Connaught Place' },
      { areaId: 'TEST_CP_INNER', name: 'Connaught Place Inner Circle' },
      { areaId: 'TEST_DWARKA', name: 'Dwarka Sector 10' },
      { areaId: 'TEST_DWARKA_MOR', name: 'Dwarka Mor' },
      { areaId: 'TEST_SAKET', name: 'Saket District Centre' },
      { areaId: 'TEST_NOIDA', name: 'Noida Sector 18' },
    ]);
  });

  test('GET /api/v1/areas/search requires authentication (401)', async () => {
    const res = await request(app).get('/api/v1/areas/search?q=con');
    assert.strictEqual(res.status, 401);
  });

  test('GET /api/v1/areas/search requires query parameter q (400)', async () => {
    const res = await request(app)
      .get('/api/v1/areas/search')
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'VALIDATION_ERROR');
  });

  test('GET /api/v1/areas/search returns prefix matching results (200)', async () => {
    const res = await request(app)
      .get('/api/v1/areas/search?q=con')
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.query, 'con');
    assert.ok(res.body.count >= 2);
    assert.ok(Array.isArray(res.body.results));

    const names = res.body.results.map((r) => r.name);
    assert.ok(names.includes('Connaught Place'));
    assert.ok(names.includes('Connaught Place Inner Circle'));
  });

  test('GET /api/v1/areas/search is case-insensitive (200)', async () => {
    const res = await request(app)
      .get('/api/v1/areas/search?q=DWAR')
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.count >= 2);
    const names = res.body.results.map((r) => r.name);
    assert.ok(names.includes('Dwarka Sector 10'));
    assert.ok(names.includes('Dwarka Mor'));
  });

  test('GET /api/v1/areas/search respects the limit parameter (200)', async () => {
    const res = await request(app)
      .get('/api/v1/areas/search?q=con&limit=1')
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.results.length, 1);
  });

  test('GET /api/v1/areas/search returns empty list for non-matching query (200)', async () => {
    const res = await request(app)
      .get('/api/v1/areas/search?q=zzzznonexistent')
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.count, 0);
    assert.deepStrictEqual(res.body.results, []);
  });

  test('POST /api/v1/areas/sync-index requires admin secret (401)', async () => {
    const res = await request(app)
      .post('/api/v1/areas/sync-index')
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 401);
  });

  test('POST /api/v1/areas/sync-index syncs Redis from Neo4j (200)', async () => {
    const res = await request(app)
      .post('/api/v1/areas/sync-index')
      .set('X-API-Key', apiKey)
      .set('X-Admin-Secret', ADMIN_SECRET);

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.indexedCount >= 6);
    assert.strictEqual(res.body.message, 'Area search index synced successfully.');
  });

  after(async () => {
    await teardown();
  });
});
