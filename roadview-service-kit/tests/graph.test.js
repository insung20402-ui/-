'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../shared/graph.js');
const X = require('../shared/exif.js');
const withExif = require('./make-exif.js');

const A = { lat: 37.5665, lon: 126.978 };

test('distance and bearing agree with offset()', () => {
  const b = G.offset(A, 90, 100);
  assert.ok(Math.abs(G.distance(A, b) - 100) < 0.01);
  assert.ok(G.angDiff(G.bearing(A, b), 90) < 0.01);
  const c = G.offset(A, 0, 50);
  assert.ok(G.angDiff(G.bearing(A, c), 0) < 0.01);
});

test('links: a straight road links neighbours both ways, nothing further', () => {
  const nodes = [0, 1, 2, 3].map((i) => ({ id: 'n' + i, ...G.offset(A, 90, i * 20) }));
  const l = G.buildLinks(nodes, { maxM: 30 });
  assert.deepEqual(l.n0.map((x) => x.target), ['n1']);
  assert.deepEqual(l.n1.map((x) => x.target).sort(), ['n0', 'n2']);
  assert.ok(G.angDiff(l.n1.find((x) => x.target === 'n2').heading, 90) < 0.1);
  assert.ok(G.angDiff(l.n1.find((x) => x.target === 'n0').heading, 270) < 0.1);
});

test('links are symmetric even when a closer neighbour hides the far one', () => {
  const nodes = [{ id: 'a', ...A }, { id: 'b', ...G.offset(A, 90, 10) }, { id: 'c', ...G.offset(A, 92, 25) }];
  const l = G.buildLinks(nodes, { maxM: 60 });
  nodes.forEach((n) => l[n.id].forEach((x) => assert.ok(l[x.target].some((y) => y.target === n.id), n.id + '->' + x.target)));
});

test('a crossroads yields four arrows', () => {
  const nodes = [{ id: 'c', ...A }];
  [0, 90, 180, 270].forEach((h) => nodes.push({ id: 'h' + h, ...G.offset(A, h, 20) }));
  assert.equal(G.buildLinks(nodes, { maxM: 30 }).c.length, 4);
});

test('nearest honours the radius', () => {
  const nodes = [{ id: 'a', ...A }, { id: 'b', ...G.offset(A, 0, 80) }];
  assert.equal(G.nearest(nodes, A.lat, A.lon, 50).node.id, 'a');
  assert.equal(G.nearest(nodes, ...Object.values(G.offset(A, 0, 200)), 50), null);
});

test('cluster: flat photos at one spot merge, 360 photos and far photos stay apart, no-GPS is unplaced', () => {
  const p = (kind, pos) => ({ kind, gps: pos });
  const r = G.cluster([
    p('flat', A), p('flat', G.offset(A, 10, 2)), p('flat', G.offset(A, 200, 3)),
    p('equirect', A), p('flat', G.offset(A, 0, 40)), { kind: 'flat' }
  ], 5);
  assert.deepEqual(r.groups.map((g) => g.photos.length), [3, 1, 1]);
  assert.equal(r.unplaced.length, 1);
});

test('interpolate spreads points evenly and faces the travel direction', () => {
  const e = G.offset(A, 45, 100), pts = G.interpolate(A, e, 5);
  assert.equal(pts.length, 5);
  assert.ok(Math.abs(G.distance(pts[0], pts[1]) - 25) < 0.5);
  assert.ok(G.angDiff(pts[2].heading, 45) < 0.1);
  assert.equal(G.interpolate(A, e, 1).length, 1);
});

test('exif: GPS position, direction and focal length survive a round trip', () => {
  const jpeg = withExif(Buffer.from([0xFF, 0xD8, 0xFF, 0xDA]), { focal35: 24, lat: 37.5665, lon: -126.978, dir: 123.4 });
  const e = X.parse(jpeg.buffer.slice(jpeg.byteOffset, jpeg.byteOffset + jpeg.length));
  assert.equal(e.focalLength35, 24);
  assert.ok(Math.abs(e.gps.lat - 37.5665) < 1e-4 && Math.abs(e.gps.lon + 126.978) < 1e-4);
  assert.ok(Math.abs(e.gps.heading - 123.4) < 0.01);
});

test('cluster: a drive (same heading every few metres) stays separate nodes; a walk-around (different headings) merges', () => {
  const drive = [0, 3, 6].map((m) => ({ kind: 'flat', gps: G.offset(A, 90, m), heading: 90 }));
  assert.equal(G.cluster(drive, 5).groups.length, 3);
  const around = [0, 90, 180, 270].map((h) => ({ kind: 'flat', gps: G.offset(A, 90, 1), heading: h }));
  assert.equal(G.cluster(around, 5).groups.length, 1);
  const unknown = [0, 1].map(() => ({ kind: 'flat', gps: A }));
  assert.equal(G.cluster(unknown, 5).groups.length, 1);
});
