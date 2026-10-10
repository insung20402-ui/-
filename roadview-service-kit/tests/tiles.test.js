'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../shared/tiles.js');

test('pyramid doubles each level and ends at full resolution', () => {
  const p = T.plan(4096, 512);
  assert.deepEqual(p.levels.map((l) => [l.cols, l.rows]), [[2, 1], [4, 2], [8, 4]]);
  assert.equal(p.width, 4096);
});
test('tile paths embed the revision', () => {
  assert.equal(T.path('p1', 'r3', 2, 5, 1), '/tiles/p1/r3/2/5_1.jpg');
  assert.notEqual(T.path('p1', 'r3', 2, 5, 1), T.path('p1', 'r4', 2, 5, 1));
});
test('only tiles near the view heading are requested', () => {
  const p = T.plan(4096, 512);
  const v = T.visible(p, 2, 0, 75, 1.5);
  assert.ok(v.length > 0 && v.length < 8 * 4);
  assert.ok(v.every((t) => t.z === 2));
});
test('server maps urls to files and rejects traversal', () => {
  const { resolve } = require('../server/tile-server.js');
  assert.ok(resolve('/tiles/p1/r1/0/0_0.jpg').endsWith('p1/r1/0/0_0.jpg'));
  assert.equal(resolve('/tiles/../../etc/passwd'), null);
});
