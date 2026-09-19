'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { ADMIN_SECRET, getTestApiKey, teardown } = require('./helpers');
const { runWriteQuery } = require('../infra/neo4j');

describe('Routes & Eco-Pathfinding API', () => {
  let apiKey = null;

  before(async () => {
    apiKey = await getTestApiKey();
    // Ensure test corridor (Area 1 to Area 5) has healthy AQI (< 400) so strict checks pass deterministically
    await runWriteQuery(`
      MATCH (a:Area)
      WHERE a.areaId IN ['Area 1', 'Area 2', 'Area 3', 'Area 4', 'Area 5']
      SET a.aqi = 65
    `);
  });

  after(async () => {
    await teardown();
  });

  test('POST /api/v1/routes/find requires valid payload (400)', async () => {
    const res = await request(app)
      .post('/api/v1/routes/find')
      .set('X-API-Key', apiKey)
      .send({});

    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.body.error, 'VALIDATION_ERROR');
    assert.ok(Array.isArray(res.body.errors));
  });

  test('POST /api/v1/routes/find finds paths between Area 1 and Area 5 by areaIds (200)', async () => {
    const res = await request(app)
      .post('/api/v1/routes/find')
      .set('X-API-Key', apiKey)
      .send({
        originId: 'Area 1',
        destinationId: 'Area 5',
        k: 3,
        maxVariation: 0.30,
        aqiThreshold: 400,
      });

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.shortestDistance > 0);
    assert.ok(res.body.maxAllowedDistance >= res.body.shortestDistance);
    assert.ok(Array.isArray(res.body.paths));
    assert.ok(res.body.paths.length > 0);

    const firstPath = res.body.paths[0];
    assert.strictEqual(firstPath.rank, 1);
    assert.ok(firstPath.totalDistance > 0);
    assert.ok(Array.isArray(firstPath.nodes));
    assert.ok(firstPath.nodes.length >= 2);
    assert.strictEqual(firstPath.nodes[0].areaId, 'Area 1');
    assert.strictEqual(firstPath.nodes[firstPath.nodes.length - 1].areaId, 'Area 5');
    assert.ok(firstPath.nodes[0].name.length > 0);
  });

  test('POST /api/v1/routes/find resolves origin and destination by GPS coordinates (200)', async () => {
    // Area 1 centroid: 27.05, 76.12
    // Area 5 centroid: 27.05, 76.1608
    const res = await request(app)
      .post('/api/v1/routes/find')
      .set('X-API-Key', apiKey)
      .send({
        originLat: 27.0502,
        originLng: 76.1205,
        destLat: 27.0501,
        destLng: 76.1609,
        k: 2,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.resolvedOriginId, 'Area 1');
    assert.strictEqual(res.body.resolvedDestinationId, 'Area 5');
    assert.ok(res.body.paths.length > 0);
  });

  test('POST /api/v1/routes/find enforces strict vs soft AQI check based on softCheck flag', async () => {
    // Explicitly set Karol Bagh to severe AQI: 485
    await request(app)
      .patch('/api/v1/areas/aqi')
      .set('X-API-Key', apiKey)
      .set('X-Admin-Secret', ADMIN_SECRET)
      .send({
        latitude: 28.6446,
        longitude: 77.1909,
        aqi: 485,
      });

    // 1. Strict mode (softCheck: false, default) -> strictly excludes any path with AQI > 400
    const resStrict = await request(app)
      .post('/api/v1/routes/find')
      .set('X-API-Key', apiKey)
      .send({
        originId: 'Karol Bagh',
        destinationId: 'New Delhi',
        k: 2,
        aqiThreshold: 400,
        softCheck: false,
      });

    assert.strictEqual(resStrict.status, 200);
    assert.strictEqual(resStrict.body.softCheck, false);
    assert.strictEqual(resStrict.body.paths.length, 0, 'Should return 0 paths when softCheck=false and all paths cross node > 400 AQI');

    // 2. Soft mode (softCheck: true) -> returns paths but flags high AQI nodes
    const resSoft = await request(app)
      .post('/api/v1/routes/find')
      .set('X-API-Key', apiKey)
      .send({
        originId: 'Karol Bagh',
        destinationId: 'New Delhi',
        k: 2,
        aqiThreshold: 400,
        softCheck: true,
      });

    assert.strictEqual(resSoft.status, 200);
    assert.strictEqual(resSoft.body.softCheck, true);
    assert.ok(resSoft.body.paths.length > 0);
    assert.strictEqual(resSoft.body.paths[0].aqiHighFlag, true);
    assert.ok(resSoft.body.paths[0].highAqiNodes.includes('Karol Bagh'));

    // 3. Higher threshold (500) with strict mode -> Karol Bagh (485) is <= 500 so path is allowed
    const resHigherThreshold = await request(app)
      .post('/api/v1/routes/find')
      .set('X-API-Key', apiKey)
      .send({
        originId: 'Karol Bagh',
        destinationId: 'New Delhi',
        k: 2,
        aqiThreshold: 500,
        softCheck: false,
      });

    assert.strictEqual(resHigherThreshold.status, 200);
    assert.ok(resHigherThreshold.body.paths.length > 0);
    assert.strictEqual(resHigherThreshold.body.paths[0].aqiHighFlag, false);
  });
});
