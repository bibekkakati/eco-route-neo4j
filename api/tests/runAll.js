'use strict';

process.env.NODE_ENV = 'test';
process.env.ENABLE_AQI_WORKER = 'false';

const { teardown } = require('./helpers');
const { run } = require('node:test');
const { spec } = require('node:test/reporters');
const path = require('path');

const testFiles = [
  path.join(__dirname, 'health.test.js'),
  path.join(__dirname, 'auth.test.js'),
  path.join(__dirname, 'autocomplete.test.js'),
  path.join(__dirname, 'areas.test.js'),
  path.join(__dirname, 'roads.test.js'),
  path.join(__dirname, 'routes.test.js'),
];

console.log('🧪 Running Eco-Route Test Suite…\n');

let hasFailed = false;

const testStream = run({ files: testFiles });

testStream.on('test:fail', () => {
  hasFailed = true;
});

testStream.compose(spec).pipe(process.stdout);

testStream.on('end', async () => {
  console.log('\n🧹 Cleaning up test connections…');
  await teardown();
  process.exit(hasFailed ? 1 : 0);
});
