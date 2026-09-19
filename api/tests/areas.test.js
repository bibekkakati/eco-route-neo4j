'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { getTestApiKey, teardown } = require('./helpers');
const { deleteArea } = require('../service/areaService');

describe('Areas Management & Spatial Lookups API', () => {
  let apiKey = null;
  const testAreaId = 'TEST_NODE_AREAS_01';

  before(async () => {
    apiKey = await getTestApiKey();
    await deleteArea(testAreaId);
  });

  after(async () => {
    await deleteArea(testAreaId);
    await deleteArea('TEST_BULK_A');
    await deleteArea('TEST_BULK_B');
    await teardown();
  });

  test('POST /api/v1/areas creates an area with auto-computed geohash (201)', async () => {
    const res = await request(app)
      .post('/api/v1/areas')
      .set('X-API-Key', apiKey)
      .send({
        areaId: testAreaId,
        name: 'Test Area Center',
        latitude: 25.5000,
        longitude: 85.0000,
        aqi: 150,
      });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.area);
    assert.strictEqual(res.body.area.areaId, testAreaId);
    assert.strictEqual(res.body.area.name, 'Test Area Center');
    assert.strictEqual(res.body.area.aqi, 150);
    assert.ok(res.body.area.geohash);
  });

  test('GET /api/v1/areas/:areaId returns the area with geohash (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/areas/${testAreaId}`)
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.area.areaId, testAreaId);
    assert.ok(res.body.area.geohash);
  });

  test('GET /api/v1/areas/:areaId returns 404 for nonexistent area', async () => {
    const res = await request(app)
      .get('/api/v1/areas/UNKNOWN_AREA_XYZ')
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'NOT_FOUND');
  });

  test('POST /api/v1/areas/batch returns multiple areas in a single call (200)', async () => {
    const res = await request(app)
      .post('/api/v1/areas/batch')
      .set('X-API-Key', apiKey)
      .send({ areaIds: [testAreaId, 'UNKNOWN_NONEXISTENT_XYZ'] });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.count, 1);
    assert.strictEqual(res.body.areas[0].areaId, testAreaId);
  });

  test('GET /api/v1/areas/batch?ids=... supports query params (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/areas/batch?ids=${testAreaId}`)
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.count, 1);
    assert.strictEqual(res.body.areas[0].areaId, testAreaId);
  });

  test('GET /api/v1/areas/lookup/coordinates matches area within 1 km via geohash (200)', async () => {
    // Query with ~50m offset from (25.5000, 85.0000): 25.5003, 85.0003
    const resNear = await request(app)
      .get('/api/v1/areas/lookup/coordinates?lat=25.5003&lng=85.0003')
      .set('X-API-Key', apiKey);

    assert.strictEqual(resNear.status, 200);
    assert.ok(resNear.body.area);
    assert.strictEqual(resNear.body.area.areaId, testAreaId);
  });

  test('GET /api/v1/areas/lookup/coordinates returns 404 when no area within 1 km', async () => {
    const res = await request(app)
      .get('/api/v1/areas/lookup/coordinates?lat=0.0&lng=0.0')
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'NOT_FOUND');
  });

  test('PATCH /api/v1/areas/aqi updates AQI by coordinates via geohash matching (200)', async () => {
    const res = await request(app)
      .patch('/api/v1/areas/aqi')
      .set('X-API-Key', apiKey)
      .send({
        latitude: 25.5002,
        longitude: 85.0002,
        aqi: 388,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.matchedAreaId, testAreaId);
    assert.strictEqual(res.body.aqi, 388);

    // Verify node in Neo4j reflects updated AQI
    const verifyRes = await request(app)
      .get(`/api/v1/areas/${testAreaId}`)
      .set('X-API-Key', apiKey);

    assert.strictEqual(verifyRes.body.area.aqi, 388);
  });

  test('POST /api/v1/areas/aqi/bulk bulk-updates AQI from coordinate readings (200)', async () => {
    const res = await request(app)
      .post('/api/v1/areas/aqi/bulk')
      .set('X-API-Key', apiKey)
      .send({
        updates: [
          { latitude: 28.6139, longitude: 77.2090, aqi: 175 },
        ],
      });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.total >= 1);
  });

  test('PATCH /api/v1/areas/:areaId recalculates geohash when lat/lng change (200)', async () => {
    // Update coordinates to Connaught Place: 28.6315, 77.2167 (geohash: 'ttnfvh')
    const res = await request(app)
      .patch(`/api/v1/areas/${testAreaId}`)
      .set('X-API-Key', apiKey)
      .send({
        name: 'Relocated Area',
        latitude: 28.6315,
        longitude: 77.2167,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.area.name, 'Relocated Area');
    assert.strictEqual(res.body.area.geohash, 'ttnfvh');
  });

  test('POST /api/v1/areas/bulk imports multiple areas with geohashes (201)', async () => {
    const res = await request(app)
      .post('/api/v1/areas/bulk')
      .set('X-API-Key', apiKey)
      .send({
        areas: [
          { areaId: 'TEST_BULK_A', name: 'Bulk Node A', latitude: 28.50, longitude: 77.10 },
          { areaId: 'TEST_BULK_B', name: 'Bulk Node B', latitude: 28.51, longitude: 77.11 },
        ],
      });

    assert.strictEqual(res.status, 201);
    assert.strictEqual(res.body.total, 2);
  });

  test('DELETE /api/v1/areas/:areaId removes the area (200)', async () => {
    const res = await request(app)
      .delete(`/api/v1/areas/${testAreaId}`)
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message, `Area '${testAreaId}' deleted.`);

    // Confirm it's gone
    const checkRes = await request(app)
      .get(`/api/v1/areas/${testAreaId}`)
      .set('X-API-Key', apiKey);

    assert.strictEqual(checkRes.status, 404);
  });
});
