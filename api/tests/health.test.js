'use strict';

const { test, describe } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const { app } = require('../server');

describe('Health and General API Endpoints', () => {
  test('GET /health returns 200 with status ok and timestamp', async () => {
    const res = await request(app).get('/health');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.body.status, 'ok');
    assert.ok(res.body.timestamp);
  });

  test('GET /unknown-route returns 404 with NOT_FOUND error', async () => {
    const res = await request(app).get('/api/v1/non-existent-endpoint');
    assert.strictEqual(res.status, 404);
    assert.strictEqual(res.body.error, 'NOT_FOUND');
  });
});
