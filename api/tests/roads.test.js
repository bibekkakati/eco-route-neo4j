'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');
const { getTestApiKey, teardown } = require('./helpers');
const { createArea, deleteArea } = require('../service/areaService');

describe('Roads Management API', () => {
  let apiKey = null;
  const nodeA = 'TEST_ROAD_NODE_A';
  const nodeB = 'TEST_ROAD_NODE_B';

  before(async () => {
    apiKey = await getTestApiKey();

    // Create 2 test nodes to link with roads
    await createArea({ areaId: nodeA, name: 'Road Node A', latitude: 28.60, longitude: 77.20 });
    await createArea({ areaId: nodeB, name: 'Road Node B', latitude: 28.61, longitude: 77.21 });
  });

  after(async () => {
    await deleteArea(nodeA);
    await deleteArea(nodeB);
    await teardown();
  });

  test('POST /api/v1/roads creates a road relationship (201)', async () => {
    const res = await request(app)
      .post('/api/v1/roads')
      .set('X-API-Key', apiKey)
      .send({
        fromAreaId: nodeA,
        toAreaId: nodeB,
        distance: 1.45,
      });

    assert.strictEqual(res.status, 201);
    assert.ok(res.body.road);
    assert.strictEqual(res.body.road.distance, 1.45);
  });

  test('GET /api/v1/roads lists all roads in graph (200)', async () => {
    const res = await request(app)
      .get('/api/v1/roads')
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 200);
    assert.ok(res.body.count > 0);
    assert.ok(Array.isArray(res.body.roads));
  });

  test('GET /api/v1/roads/:areaId lists roads connected to specific area (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/roads/${nodeA}`)
      .set('X-API-Key', apiKey);

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.areaId, nodeA);
    assert.ok(res.body.count >= 1);
    assert.strictEqual(res.body.roads[0].toAreaId, nodeB);
    assert.strictEqual(res.body.roads[0].distance, 1.45);
  });

  test('DELETE /api/v1/roads removes road relationship (200)', async () => {
    const res = await request(app)
      .delete('/api/v1/roads')
      .set('X-API-Key', apiKey)
      .send({
        fromAreaId: nodeA,
        toAreaId: nodeB,
      });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.message, 'Road deleted.');

    // Confirm road is removed
    const listRes = await request(app)
      .get(`/api/v1/roads/${nodeA}`)
      .set('X-API-Key', apiKey);

    assert.strictEqual(listRes.body.count, 0);
  });
});
