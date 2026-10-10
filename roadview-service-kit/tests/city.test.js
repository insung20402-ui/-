'use strict';
// Data-layer tests for shared/city.js. Run: node --test roadview-mock/tests/
// Expectations come from the module's stated intent, not from its current output.
const test = require('node:test');
const assert = require('node:assert/strict');

const CITY_PATH = require.resolve('../shared/city.js');
const RV = require(CITY_PATH);

const EPS = 1e-6;
const ROAD_SPEC = {
  ew0: { count: 33, years: [2023, 2025, 2026] },
  ew1: { count: 33, years: [2023, 2026] },
  ew2: { count: 33, years: [2025, 2026] },
  ns0: { count: 25, years: [2023, 2025, 2026] },
  ns1: { count: 25, years: [2023, 2025, 2026] },
  ns2: { count: 25, years: [2026] }
};

const byId = new Map(RV.nodes.map((n) => [n.id, n]));
const stepLinks = (n) => n.links.filter((l) => l.kind === 'step');
const jumpLinks = (n) => n.links.filter((l) => l.kind === 'jump');
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const angDiff = (a, b) => Math.abs(((a - b) % 360 + 540) % 360 - 180);
// Compass bearing (0 = north, clockwise) from a to b, in local meters.
const bearing = (a, b) => ((Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI) % 360 + 360) % 360;
// Is there a capture point at (x, y)? Derived from the road spec, not from links.
function coveredBy(x, y) {
  return RV.nodes.some((n) => Math.abs(n.x - x) < EPS && Math.abs(n.y - y) < EPS);
}
function haversineM(a, b) {
  const R = 6371008.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function latLonAt(x, y) { return RV.toLatLon(x, y); }
function reachable(startId, edgesOf) {
  const seen = new Set([startId]);
  const queue = [startId];
  while (queue.length) {
    const id = queue.pop();
    for (const next of edgesOf(id)) {
      if (!seen.has(next)) { seen.add(next); queue.push(next); }
    }
  }
  return seen;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- roads / nodes
test('roads: 6 roads with the expected node counts and capture years', () => {
  assert.equal(RV.roads.length, 6);
  for (const road of RV.roads) {
    const spec = ROAD_SPEC[road.id];
    assert.ok(spec, 'unexpected road ' + road.id);
    const own = RV.nodes.filter((n) => n.roadId === road.id);
    assert.equal(own.length, spec.count, road.id + ' node count');
    assert.deepEqual(road.years, spec.years, road.id + ' years');
    for (const n of own) assert.deepEqual(n.years, spec.years, n.id + ' years');
  }
  assert.equal(RV.nodes.length, 3 * 33 + 3 * 25);
});

test('nodes: unique ids, getNode lookup, sequential seq', () => {
  assert.equal(byId.size, RV.nodes.length);
  for (const n of RV.nodes) assert.equal(RV.getNode(n.id), n);
  assert.equal(RV.getNode('nope-000'), null);
  for (const road of RV.roads) {
    const own = RV.nodes.filter((n) => n.roadId === road.id);
    own.forEach((n, i) => assert.equal(n.seq, i, n.id + ' seq'));
  }
});

test('nodes: 10 m spacing along each road, axis-aligned, inside the 320x240 grid', () => {
  for (const road of RV.roads) {
    const own = RV.nodes.filter((n) => n.roadId === road.id);
    for (let i = 1; i < own.length; i++) {
      assert.ok(Math.abs(dist(own[i - 1], own[i]) - 10) < EPS, own[i].id + ' spacing');
    }
    const sameX = own.every((n) => Math.abs(n.x - own[0].x) < EPS);
    const sameY = own.every((n) => Math.abs(n.y - own[0].y) < EPS);
    assert.ok(sameX !== sameY, road.id + ' must be axis-aligned');
    for (const n of own) {
      assert.ok(n.x >= -EPS && n.x <= 320 + EPS && n.y >= -EPS && n.y <= 240 + EPS, n.id + ' in grid');
    }
  }
});

test('nodes: lat/lon spacing is ~10 m on the real globe (independent haversine check)', () => {
  for (const road of RV.roads) {
    const own = RV.nodes.filter((n) => n.roadId === road.id);
    for (let i = 1; i < own.length; i++) {
      const d = haversineM(own[i - 1], own[i]);
      assert.ok(Math.abs(d - 10) < 0.1, own[i].id + ' haversine spacing ' + d);
    }
  }
});

test('nodes: every capture year is a known vintage', () => {
  const vintages = RV.VINTAGES.map((v) => v.year);
  assert.deepEqual(vintages, [2023, 2025, 2026]);
  for (const n of RV.nodes) {
    assert.ok(n.years.length > 0, n.id + ' has no years');
    for (const y of n.years) assert.ok(vintages.includes(y), n.id + ' year ' + y);
  }
});

// ---------------------------------------------------------------- projection
test('toLatLon/toXY: round trip in both directions', () => {
  for (const [x, y] of [[0, 0], [320, 240], [160, 120], [-46.5, 286.25], [13.37, -7.5]]) {
    const ll = RV.toLatLon(x, y);
    const p = RV.toXY(ll.lat, ll.lon);
    assert.ok(Math.abs(p.x - x) < EPS && Math.abs(p.y - y) < EPS, `xy ${x},${y} -> ${p.x},${p.y}`);
    const ll2 = RV.toLatLon(p.x, p.y);
    assert.ok(Math.abs(ll2.lat - ll.lat) < 1e-12 && Math.abs(ll2.lon - ll.lon) < 1e-12);
  }
});

test('toLatLon: origin maps to (0,0); x is east, y is north', () => {
  assert.deepEqual(RV.toLatLon(0, 0), { lat: RV.ORIGIN.lat, lon: RV.ORIGIN.lon });
  const o = RV.toXY(RV.ORIGIN.lat, RV.ORIGIN.lon);
  assert.equal(o.x, 0);
  assert.equal(o.y, 0);
  const east = RV.toLatLon(100, 0), north = RV.toLatLon(0, 100);
  assert.ok(east.lon > RV.ORIGIN.lon && east.lat === RV.ORIGIN.lat);
  assert.ok(north.lat > RV.ORIGIN.lat && north.lon === RV.ORIGIN.lon);
});

test('nodes: stored lat/lon agree with stored x/y', () => {
  for (const n of RV.nodes) {
    const p = RV.toXY(n.lat, n.lon);
    assert.ok(Math.abs(p.x - n.x) < EPS && Math.abs(p.y - n.y) < EPS, n.id);
  }
});

// ---------------------------------------------------------------- graph
test('links: every link target exists and is not the node itself', () => {
  for (const n of RV.nodes) {
    for (const l of n.links) {
      assert.ok(l.kind === 'step' || l.kind === 'jump', n.id + ' link kind ' + l.kind);
      assert.ok(byId.has(l.target), n.id + ' -> missing ' + l.target);
      assert.notEqual(l.target, n.id);
    }
  }
});

test('links: heading and distanceMeters match the geometry', () => {
  for (const n of RV.nodes) {
    for (const l of n.links) {
      const t = byId.get(l.target);
      assert.ok(l.heading >= 0 && l.heading < 360, n.id + ' heading range');
      assert.ok(angDiff(l.heading, bearing(n, t)) < 1e-6, `${n.id}->${t.id} heading ${l.heading}`);
      assert.ok(Math.abs(l.distanceMeters - dist(n, t)) < EPS, `${n.id}->${t.id} distance`);
    }
  }
});

test('links: step links are ~10 m', () => {
  for (const n of RV.nodes) {
    for (const l of stepLinks(n)) {
      assert.ok(Math.abs(l.distanceMeters - 10) <= 0.5, `${n.id}->${l.target} ${l.distanceMeters}`);
    }
  }
});

test('links: no two step links from one node point the same way', () => {
  for (const n of RV.nodes) {
    const s = stepLinks(n);
    for (let i = 0; i < s.length; i++) {
      for (let j = i + 1; j < s.length; j++) {
        assert.ok(angDiff(s[i].heading, s[j].heading) >= 5,
          `${n.id}: ${s[i].target} and ${s[j].target} share heading ${s[i].heading}`);
      }
    }
    assert.equal(new Set(s.map((l) => l.target)).size, s.length, n.id + ' duplicate step target');
  }
});

test('links: step count equals the number of directions that have a capture point 10 m away', () => {
  for (const n of RV.nodes) {
    const expected = [[10, 0], [-10, 0], [0, 10], [0, -10]]
      .filter(([dx, dy]) => coveredBy(n.x + dx, n.y + dy)).length;
    assert.equal(stepLinks(n).length, expected, n.id + ' step link count');
  }
});

test('links: mid-road node has 2 step links (prev/next on its own road)', () => {
  for (const id of ['ew0-008', 'ew1-005', 'ew2-024', 'ns0-006', 'ns1-018', 'ns2-006']) {
    const n = byId.get(id);
    const s = stepLinks(n);
    assert.equal(s.length, 2, id);
    const ids = RV.getRoad(n.roadId).nodeIds;
    assert.deepEqual(s.map((l) => l.target).sort(), [ids[n.seq - 1], ids[n.seq + 1]].sort(), id);
  }
});

test('links: the 4-way intersection (160,120) has 4 step links on both co-located nodes', () => {
  for (const id of ['ew1-016', 'ns1-012']) {
    const n = byId.get(id);
    assert.ok(Math.abs(n.x - 160) < EPS && Math.abs(n.y - 120) < EPS);
    const headings = stepLinks(n).map((l) => Math.round(l.heading)).sort((a, b) => a - b);
    assert.deepEqual(headings, [0, 90, 180, 270], id);
  }
});

test('links: corner nodes have 2 step links, T-junction nodes have 3', () => {
  for (const id of ['ew0-000', 'ns0-000', 'ew0-032', 'ns2-000', 'ew2-000', 'ns0-024', 'ew2-032', 'ns2-024']) {
    assert.equal(stepLinks(byId.get(id)).length, 2, id + ' (corner)');
  }
  for (const id of ['ew0-016', 'ns1-000', 'ew1-000', 'ns0-012', 'ew1-032', 'ns2-012', 'ew2-016', 'ns1-024']) {
    assert.equal(stepLinks(byId.get(id)).length, 3, id + ' (T-junction)');
  }
});

test('links: at an intersection each crossing road is entered at its first node (10 m up it)', () => {
  const n = byId.get('ew1-016');
  const targets = stepLinks(n).map((l) => l.target).sort();
  assert.deepEqual(targets, ['ew1-015', 'ew1-017', 'ns1-011', 'ns1-013']);
});

test('links: step links are symmetric by position (reverse link lands where A stands)', () => {
  // By design the way back may land on the co-located node of the crossing road (see city.js graph comment).
  for (const a of RV.nodes) {
    for (const l of stepLinks(a)) {
      const b = byId.get(l.target);
      const back = stepLinks(b).find((r) => dist(byId.get(r.target), a) < EPS);
      assert.ok(back, `${a.id}->${b.id}: nothing leads back to (${a.x},${a.y})`);
      assert.ok(Math.abs(angDiff(l.heading, back.heading) - 180) < 1e-6);
    }
  }
});

test('graph: no node is isolated (out-degree and in-degree >= 1 via step links)', () => {
  const inDeg = new Map(RV.nodes.map((n) => [n.id, 0]));
  for (const n of RV.nodes) {
    assert.ok(stepLinks(n).length >= 1, n.id + ' has no outgoing step link');
    for (const l of stepLinks(n)) inDeg.set(l.target, inDeg.get(l.target) + 1);
  }
  const orphans = [...inDeg].filter(([, d]) => d === 0).map(([id]) => id);
  assert.deepEqual(orphans, [], 'nodes no step link leads to');
});

test('graph: whole graph is connected via step links (forward and backward from any start)', () => {
  const fwd = new Map(RV.nodes.map((n) => [n.id, stepLinks(n).map((l) => l.target)]));
  const rev = new Map(RV.nodes.map((n) => [n.id, []]));
  for (const [id, targets] of fwd) for (const t of targets) rev.get(t).push(id);
  for (const start of ['ew0-000', 'ns2-024', 'ew1-016', 'ns1-012']) {
    assert.equal(reachable(start, (id) => fwd.get(id)).size, RV.nodes.length, 'forward from ' + start);
    assert.equal(reachable(start, (id) => rev.get(id)).size, RV.nodes.length, 'backward to ' + start);
  }
});

test('links: jump links go exactly 50 m along the same road, to seq +/- 5', () => {
  for (const n of RV.nodes) {
    const ids = RV.getRoad(n.roadId).nodeIds;
    const expected = [n.seq - 5, n.seq + 5].filter((s) => s >= 0 && s < ids.length).map((s) => ids[s]);
    const jumps = jumpLinks(n);
    assert.deepEqual(jumps.map((l) => l.target).sort(), expected.sort(), n.id + ' jump targets');
    for (const l of jumps) {
      const t = byId.get(l.target);
      assert.equal(t.roadId, n.roadId);
      assert.ok(Math.abs(l.distanceMeters - 50) < EPS, `${n.id}->${t.id} ${l.distanceMeters}`);
      assert.ok(Math.abs(dist(n, t) - 50) < EPS);
      const back = jumpLinks(t).find((r) => r.target === n.id);
      assert.ok(back, `${t.id} has no jump back to ${n.id}`);
      assert.ok(Math.abs(angDiff(l.heading, back.heading) - 180) < 1e-6);
    }
  }
  assert.equal(jumpLinks(byId.get('ew0-000')).length, 1);
  assert.equal(jumpLinks(byId.get('ew0-004')).length, 1);
  assert.equal(jumpLinks(byId.get('ew0-005')).length, 2);
  assert.equal(jumpLinks(byId.get('ns0-024')).length, 1);
});

// ---------------------------------------------------------------- findNearest
test('findNearest: hit returns the nearest node and its distance', () => {
  const q = latLonAt(83, 2); // 3.6 m from ew0-008 (80,0), 7.3 m from ew0-009
  const hit = RV.findNearest(q.lat, q.lon, 30);
  assert.ok(hit);
  assert.equal(hit.node.id, 'ew0-008');
  assert.ok(Math.abs(hit.distanceM - Math.hypot(3, 2)) < 1e-4);
  // brute-force cross-check on a few arbitrary points
  for (const [x, y] of [[41, 117], [158, 77], [301, 236], [77, 66]]) {
    const ll = latLonAt(x, y);
    const best = Math.min(...RV.nodes.map((n) => Math.hypot(n.x - x, n.y - y)));
    const got = RV.findNearest(ll.lat, ll.lon, 1000);
    assert.ok(Math.abs(got.distanceM - best) < 1e-4, `(${x},${y})`);
  }
});

test('findNearest: exact node position is a hit at distance ~0, even with radius 0 at the origin', () => {
  const n = byId.get('ns1-007');
  const hit = RV.findNearest(n.lat, n.lon, 1);
  assert.equal(hit.node.id, 'ns1-007');
  assert.ok(hit.distanceM < 1e-6);
  const origin = RV.findNearest(RV.ORIGIN.lat, RV.ORIGIN.lon, 0);
  assert.ok(origin, 'radius 0 on a node must still hit');
  assert.equal(origin.distanceM, 0);
});

test('findNearest: miss returns null', () => {
  const mid = latLonAt(80, 60); // middle of the SW block: 60 m from any road
  assert.equal(RV.findNearest(mid.lat, mid.lon, 30), null);
  const far = latLonAt(5000, 5000);
  assert.equal(RV.findNearest(far.lat, far.lon, 100), null);
});

test('findNearest: radius boundary is inclusive', () => {
  // Due south of the origin, so the distance to (0,0) is exactly |y| with x === 0.
  const lat = RV.ORIGIN.lat - 0.0003, lon = RV.ORIGIN.lon;
  const p = RV.toXY(lat, lon);
  assert.equal(p.x, 0);
  const d = Math.abs(p.y);
  assert.ok(d > 30 && d < 40);
  const at = RV.findNearest(lat, lon, d);
  assert.ok(at, 'distance === radius must hit');
  assert.equal(at.distanceM, d);
  assert.ok(Math.abs(at.node.x) < EPS && Math.abs(at.node.y) < EPS);
  assert.equal(RV.findNearest(lat, lon, d - 1e-6), null);
  assert.ok(RV.findNearest(lat, lon, d + 1e-6));
});

test('findNearest: year filter restricts to nodes captured that year', () => {
  const q = latLonAt(320, 50); // on ns2 (2026 only); nearest 2023 node is the ew0 end, 50 m away
  assert.equal(RV.findNearest(q.lat, q.lon, 20).node.id, 'ns2-005');
  assert.equal(RV.findNearest(q.lat, q.lon, 20, { year: 2026 }).node.id, 'ns2-005');
  assert.equal(RV.findNearest(q.lat, q.lon, 20, { year: 2023 }), null);
  const wide = RV.findNearest(q.lat, q.lon, 100, { year: 2023 });
  assert.ok(wide);
  assert.ok(wide.node.years.includes(2023));
  assert.equal(wide.node.id, 'ew0-032');
  assert.ok(Math.abs(wide.distanceM - 50) < 1e-4);
  // 2025 excludes ew1 (2023, 2026)
  const q2 = latLonAt(80, 118);
  assert.equal(RV.findNearest(q2.lat, q2.lon, 10).node.id, 'ew1-008');
  assert.equal(RV.findNearest(q2.lat, q2.lon, 10, { year: 2025 }), null);
});

test('findNearest: year filter never returns a node lacking that year; unknown year misses', () => {
  for (const year of [2023, 2025, 2026]) {
    for (const [x, y] of [[0, 0], [160, 120], [320, 240], [310, 121], [5, 239], [200, 60]]) {
      const ll = latLonAt(x, y);
      const hit = RV.findNearest(ll.lat, ll.lon, 500, { year });
      assert.ok(hit, `year ${year} at (${x},${y})`);
      assert.ok(hit.node.years.includes(year), `${hit.node.id} lacks ${year}`);
      const best = Math.min(...RV.nodes.filter((n) => n.years.includes(year))
        .map((n) => Math.hypot(n.x - x, n.y - y)));
      assert.ok(Math.abs(hit.distanceM - best) < 1e-4);
    }
  }
  const o = latLonAt(0, 0);
  assert.equal(RV.findNearest(o.lat, o.lon, 500, { year: 2024 }), null);
  assert.ok(RV.findNearest(o.lat, o.lon, 500, { year: 'latest' }));
  assert.ok(RV.findNearest(o.lat, o.lon, 500, {}));
});

// ---------------------------------------------------------------- resolveYear
test("resolveYear: 'latest' / undefined -> newest year the node has", () => {
  const a = byId.get('ew1-005'); // 2023, 2026
  const b = byId.get('ns2-005'); // 2026
  const c = byId.get('ew0-008'); // 2023, 2025, 2026
  for (const n of [a, b, c]) {
    assert.equal(RV.resolveYear(n, 'latest'), 2026);
    assert.equal(RV.resolveYear(n, undefined), 2026);
    assert.equal(RV.resolveYear(n), 2026);
  }
});

test('resolveYear: an available year resolves to itself', () => {
  for (const n of RV.nodes) {
    for (const y of n.years) assert.equal(RV.resolveYear(n, y), y, n.id + ' ' + y);
  }
  assert.equal(RV.resolveYear(byId.get('ew0-008'), '2025'), 2025);
});

test('resolveYear: an unavailable year resolves to the closest available one', () => {
  assert.equal(RV.resolveYear(byId.get('ew1-005'), 2025), 2026); // 2023|2026 -> 2026 is 1 away
  assert.equal(RV.resolveYear(byId.get('ew1-005'), 2024), 2023);
  assert.equal(RV.resolveYear(byId.get('ew2-005'), 2023), 2025); // 2025|2026
  assert.equal(RV.resolveYear(byId.get('ns2-005'), 2023), 2026); // 2026 only
  assert.equal(RV.resolveYear(byId.get('ns2-005'), 2025), 2026);
  assert.equal(RV.resolveYear(byId.get('ew0-008'), 2019), 2023);
  assert.equal(RV.resolveYear(byId.get('ew0-008'), 2031), 2026);
  // 2024 is equidistant from 2023 and 2025: the intent does not pick a side.
  assert.ok([2023, 2025].includes(RV.resolveYear(byId.get('ew0-008'), 2024)));
});

test('resolveYear: does not mutate node.years', () => {
  const n = byId.get('ew0-008');
  RV.resolveYear(n, 2031);
  RV.resolveYear(n, 2019);
  assert.deepEqual(n.years, [2023, 2025, 2026]);
});

// ---------------------------------------------------------------- manifest
test('getManifest: shape', () => {
  const n = byId.get('ns1-003');
  const m = RV.getManifest('ns1-003', 2025);
  assert.equal(m.nodeId, 'ns1-003');
  assert.equal(typeof m.id, 'string');
  assert.ok(m.id.includes('ns1-003') && m.id.includes('2025'));
  assert.ok(m.sequenceId.includes('ns1') && m.sequenceId.includes('2025'));
  assert.deepEqual(m.availableYears, [2023, 2025, 2026]);
  assert.equal(m.position.lat, n.lat);
  assert.equal(m.position.lon, n.lon);
  assert.equal(typeof m.position.accuracyMeters, 'number');
  assert.equal(m.pose.heading, 0); // ns road runs south -> north
  assert.equal(RV.getManifest('ew0-003', 2025).pose.heading, 90);
  assert.equal(m.projection, 'cubemap');
  assert.equal(typeof m.address, 'string');
  assert.equal(m.photodate, RV.vintage(2025).label);
  const t = new Date(m.captureTime);
  assert.ok(!Number.isNaN(t.getTime()));
  assert.equal(t.toISOString(), m.captureTime);
  assert.equal(t.getUTCFullYear(), 2025);
  assert.equal(typeof m.tiles.template, 'string');
  assert.ok(m.tiles.tileSize > 0 && m.tiles.maxLevel >= 0);
  for (const ph of ['{z}', '{face}', '{x}', '{y}']) assert.ok(m.tiles.template.includes(ph), ph);
  assert.ok(m.privacy && typeof m.privacy.revision === 'number');
  assert.deepEqual(m.links, n.links.map((l) => ({ ...l })));
});

test('getManifest: unknown node -> null; year is resolved like resolveYear', () => {
  assert.equal(RV.getManifest('nope-000', 2025), null);
  assert.ok(RV.getManifest('ew1-004', 'latest').id.endsWith('2026'));
  assert.ok(RV.getManifest('ew1-004').id.endsWith('2026'));
  assert.ok(RV.getManifest('ew1-004', 2023).id.endsWith('2023'));
  assert.ok(RV.getManifest('ew1-004', 2025).id.endsWith('2026')); // 2025 not captured on ew1
  assert.ok(RV.getManifest('ew2-004', 2023).id.endsWith('2025'));
});

test('getManifest: returned arrays are copies (mutating a manifest cannot corrupt the graph)', () => {
  const m = RV.getManifest('ns1-004', 2025);
  m.availableYears.push(1999);
  m.links[0].target = 'hacked';
  m.links.length = 0;
  const n = byId.get('ns1-004');
  assert.deepEqual(n.years, [2023, 2025, 2026]);
  assert.ok(n.links.length > 0 && n.links.every((l) => byId.has(l.target)));
});

test('getManifest: tile template embeds the revision; a re-blur yields a new URL', () => {
  const id = 'ew0-020';
  const before = RV.getManifest(id, 2025);
  assert.equal(before.tiles.tileRevision, 1);
  assert.equal(before.privacy.revision, 1);
  assert.ok(before.tiles.template.split('/').includes('1'), before.tiles.template);
  RV.reportBlur(id, 2025, 10, 0, 'plate');
  const after = RV.getManifest(id, 2025);
  assert.equal(after.tiles.tileRevision, 2);
  assert.equal(after.privacy.revision, 2);
  assert.ok(after.tiles.template.split('/').includes('2'), after.tiles.template);
  assert.notEqual(after.tiles.template, before.tiles.template);
  // different captures never share a tile URL
  assert.notEqual(RV.getManifest(id, 2023).tiles.template, RV.getManifest(id, 2026).tiles.template);
  assert.notEqual(RV.getManifest(id, 2026).tiles.template, RV.getManifest('ew0-021', 2026).tiles.template);
});

// ---------------------------------------------------------------- privacy reports
test('reportBlur: appends a report and bumps only that capture from revision 1', () => {
  const id = 'ns0-010';
  assert.equal(RV.privacyRevision(id, 2025), 1);
  assert.deepEqual(RV.getReports(id, 2025), []);
  const e1 = RV.reportBlur(id, 2025, 370, -5, 'face visible');
  assert.equal(e1.nodeId, id);
  assert.equal(e1.year, 2025);
  assert.equal(e1.heading, 10); // normalised to [0, 360)
  assert.equal(e1.pitch, -5);
  assert.equal(e1.note, 'face visible');
  assert.equal(e1.revision, 2);
  assert.ok(!Number.isNaN(new Date(e1.at).getTime()));
  assert.equal(RV.privacyRevision(id, 2025), 2);
  const e2 = RV.reportBlur(id, 2025, -90, 0);
  assert.equal(e2.heading, 270);
  assert.equal(e2.revision, 3);
  assert.equal(RV.privacyRevision(id, 2025), 3);
  assert.equal(RV.getManifest(id, 2025).privacy.revision, 3);
  assert.deepEqual(RV.getReports(id, 2025).map((r) => r.revision), [2, 3]);
  // isolation: same node other years, and neighbouring nodes, are untouched
  assert.equal(RV.privacyRevision(id, 2023), 1);
  assert.equal(RV.privacyRevision(id, 2026), 1);
  assert.equal(RV.privacyRevision('ns0-011', 2025), 1);
  assert.equal(RV.getManifest(id, 2026).tiles.tileRevision, 1);
  assert.equal(RV.getManifest('ns0-009', 2025).tiles.tileRevision, 1);
  assert.deepEqual(RV.getReports(id, 2026), []);
  assert.deepEqual(RV.getReports('ns0-011', 2025), []);
});

test('getReports: returns a copy', () => {
  RV.reportBlur('ns0-015', 2023, 0, 0, 'x');
  const list = RV.getReports('ns0-015', 2023);
  list.length = 0;
  assert.equal(RV.getReports('ns0-015', 2023).length, 1);
  assert.equal(RV.privacyRevision('ns0-015', 2023), 2);
});

test("reportBlur: emits 'privacy_changed' with the entry; off() stops delivery", () => {
  const seen = [];
  const other = [];
  const cb = (e) => seen.push(e);
  const cb2 = (e) => other.push(e);
  RV.on('privacy_changed', cb);
  RV.on('privacy_changed', cb2);
  const e1 = RV.reportBlur('ew2-010', 2026, 45, 0, 'a');
  assert.equal(seen.length, 1);
  assert.equal(seen[0], e1);
  assert.equal(seen[0].nodeId, 'ew2-010');
  assert.equal(seen[0].year, 2026);
  assert.equal(seen[0].revision, 2);
  RV.off('privacy_changed', cb);
  RV.reportBlur('ew2-010', 2026, 46, 0, 'b');
  assert.equal(seen.length, 1, 'removed listener must not fire');
  assert.equal(other.length, 2, 'other listener keeps firing');
  RV.off('privacy_changed', cb2);
  RV.off('privacy_changed', cb2); // removing twice is harmless
  RV.off('never_registered', cb);
  RV.reportBlur('ew2-010', 2026, 47, 0, 'c');
  assert.equal(other.length, 2);
  assert.equal(RV.privacyRevision('ew2-010', 2026), 4);
});

test('reportBlur: the listener already sees the bumped revision', () => {
  let revAtEvent = null;
  const cb = (e) => { revAtEvent = RV.getManifest(e.nodeId, e.year).tiles.tileRevision; };
  RV.on('privacy_changed', cb);
  const e = RV.reportBlur('ew2-012', 2025, 0, 0);
  RV.off('privacy_changed', cb);
  assert.equal(revAtEvent, e.revision);
});

test('allReports: newest first across captures (reports made at distinct times)', async () => {
  const a = RV.reportBlur('ns2-003', 2026, 1, 0, 'first');
  await sleep(5);
  const b = RV.reportBlur('ew0-027', 2023, 2, 0, 'second');
  await sleep(5);
  const c = RV.reportBlur('ns2-003', 2026, 3, 0, 'third');
  const all = RV.allReports();
  const idx = [a, b, c].map((e) => all.indexOf(e));
  assert.ok(idx.every((i) => i >= 0), 'all three reports are listed');
  assert.ok(idx[2] < idx[1] && idx[1] < idx[0], 'order ' + idx);
  assert.equal(all[0], c);
  for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].at >= all[i].at, 'timestamps descending');
});

test('allReports: newest first even for reports filed within the same millisecond', () => {
  const ids = ['ns1-020', 'ew0-029', 'ns1-020', 'ns1-021', 'ew0-029', 'ns1-020'];
  const made = ids.map((id, i) => RV.reportBlur(id, 2026, i, 0, 'burst ' + i));
  const order = RV.allReports().filter((e) => made.includes(e)).map((e) => e.note);
  assert.deepEqual(order, made.map((e) => e.note).reverse());
});

// ---------------------------------------------------------------- city model
test('cityFor: construction fence + crane only in 2023, tower only from 2025', () => {
  const named = (year, name) => RV.cityFor(year).buildings.filter((b) => b.name === name);
  const c23 = RV.cityFor(2023), c25 = RV.cityFor(2025), c26 = RV.cityFor(2026);
  assert.equal(c23.year, 2023);
  assert.equal(c23.buildings.filter((b) => b.kind === 'fence').length, 1);
  assert.equal(named(2023, '모의타워').length, 0);
  assert.equal(c23.buildings.filter((b) => b.kind === 'tower').length, 0);
  assert.ok(c23.crane && typeof c23.crane.x === 'number' && typeof c23.crane.y === 'number');
  for (const c of [c25, c26]) {
    assert.equal(c.buildings.filter((b) => b.kind === 'fence').length, 0, c.year + ' fence');
    assert.equal(c.buildings.filter((b) => b.name === '모의타워').length, 1, c.year + ' tower');
    assert.equal(c.crane, null, c.year + ' crane');
  }
  // the crane and the tower stand on the fenced lot
  const fence = c23.buildings.find((b) => b.kind === 'fence');
  const tower = named(2025, '모의타워')[0];
  assert.ok(c23.crane.x > fence.x0 && c23.crane.x < fence.x1 && c23.crane.y > fence.y0 && c23.crane.y < fence.y1);
  assert.ok(tower.x0 >= fence.x0 && tower.x1 <= fence.x1 && tower.y0 >= fence.y0 && tower.y1 <= fence.y1);
});

test('cityFor: every listed building is valid for that year; permanent buildings are in all years', () => {
  const permanent = (c) => c.buildings.filter((b) => b.since === undefined && b.until === undefined).map((b) => b.id);
  for (const year of [2023, 2025, 2026]) {
    const c = RV.cityFor(year);
    for (const b of c.buildings) {
      assert.ok(b.since === undefined || year >= b.since, `${b.id} since ${b.since} in ${year}`);
      assert.ok(b.until === undefined || year <= b.until, `${b.id} until ${b.until} in ${year}`);
      assert.ok(b.x1 > b.x0 && b.y1 > b.y0 && b.h > 0, b.id + ' geometry');
    }
    assert.equal(new Set(c.buildings.map((b) => b.id)).size, c.buildings.length);
  }
  assert.deepEqual(permanent(RV.cityFor(2023)), permanent(RV.cityFor(2026)));
  assert.equal(RV.cityFor(2023).buildings.length, RV.cityFor(2025).buildings.length);
  for (const name of ['모의시청', '새별마켓', '한빛공원 쉼터']) {
    for (const year of [2023, 2025, 2026]) {
      assert.equal(RV.cityFor(year).buildings.filter((b) => b.name === name).length, 1, name + ' ' + year);
    }
  }
});

test('cityFor: no building footprint covers a capture point', () => {
  for (const year of [2023, 2025, 2026]) {
    for (const b of RV.cityFor(year).buildings) {
      const hit = RV.nodes.find((n) => n.x > b.x0 && n.x < b.x1 && n.y > b.y0 && n.y < b.y1);
      assert.equal(hit, undefined, `${b.id} covers ${hit && hit.id} in ${year}`);
    }
  }
});

test('cityFor: cars and people exist, sit on a road corridor, and differ between years', () => {
  const lateral = (p) => Math.min(...RV.roads.map((r) => {
    const s = (p.x - r.a[0]) * r.ux + (p.y - r.a[1]) * r.uy;
    if (s < 0 || s > r.len) return Infinity;
    return Math.abs(-(p.x - r.a[0]) * r.uy + (p.y - r.a[1]) * r.ux);
  }));
  for (const year of [2023, 2025, 2026]) {
    const c = RV.cityFor(year);
    assert.ok(c.cars.length > 0 && c.people.length > 0);
    for (const car of c.cars) assert.ok(lateral(car) < RV.ROAD_HALF, `car off the carriageway in ${year}`);
    for (const p of c.people) {
      const d = lateral(p);
      assert.ok(d >= RV.ROAD_HALF && d <= RV.SIDEWALK, `pedestrian not on the sidewalk in ${year}: ${d}`);
    }
  }
  assert.notDeepEqual(RV.cityFor(2023).cars, RV.cityFor(2025).cars);
  assert.notDeepEqual(RV.cityFor(2025).cars, RV.cityFor(2026).cars);
});

test('cityFor: deterministic - repeated calls and a fresh module load give identical cars/people', () => {
  const snap = (rv) => JSON.stringify([2023, 2025, 2026].map((y) => {
    const c = rv.cityFor(y);
    return { cars: c.cars, people: c.people, buildings: c.buildings, crane: c.crane };
  }));
  assert.deepEqual(RV.cityFor(2025).cars, RV.cityFor(2025).cars);
  const first = snap(RV);
  assert.equal(snap(RV), first);
  // Fresh evaluation of the module (the IIFE reuses globalThis.RV, so hide it while loading).
  const savedGlobal = globalThis.RV;
  const savedCache = require.cache[CITY_PATH];
  let fresh;
  try {
    delete globalThis.RV;
    delete require.cache[CITY_PATH];
    fresh = require(CITY_PATH);
  } finally {
    globalThis.RV = savedGlobal;
    require.cache[CITY_PATH] = savedCache;
  }
  assert.notEqual(fresh, RV);
  assert.notEqual(fresh.cityFor(2025), RV.cityFor(2025));
  assert.equal(snap(fresh), first);
  assert.deepEqual(fresh.nodes, RV.nodes);
});
