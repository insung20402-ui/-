// Mock roadview data plane: fictional city, panorama nodes, navigation graph,
// nearest-pano search, manifests and privacy revisions. No DOM access here.
(function (root) {
  'use strict';
  var RV = root.RV = root.RV || {};

  var ORIGIN = { lat: 37.5665, lon: 126.978 };
  var M_LAT = 111320;
  var M_LON = 111320 * Math.cos(ORIGIN.lat * Math.PI / 180);
  var CAPTURE_INTERVAL_M = 10;
  var JUMP_STEPS = 5;
  var ROAD_HALF = 5;
  var SIDEWALK = 8;
  var R2D = 180 / Math.PI;

  function toLatLon(x, y) {
    return { lat: ORIGIN.lat + y / M_LAT, lon: ORIGIN.lon + x / M_LON };
  }
  function toXY(lat, lon) {
    return { x: (lon - ORIGIN.lon) * M_LON, y: (lat - ORIGIN.lat) * M_LAT };
  }
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pad(n, len) {
    var s = String(n);
    while (s.length < len) s = '0' + s;
    return s;
  }
  function norm360(d) { return ((d % 360) + 360) % 360; }
  function norm180(d) { d = norm360(d); return d > 180 ? d - 360 : d; }

  // ---- vintages (capture campaigns) ----
  var VINTAGES = [
    { year: 2023, label: '2023년 10월', season: 'autumn', month: 9, day: 14 },
    { year: 2025, label: '2025년 1월', season: 'winter', month: 0, day: 22 },
    { year: 2026, label: '2026년 8월', season: 'summer', month: 7, day: 19 }
  ];
  var vintageByYear = {};
  VINTAGES.forEach(function (v) { vintageByYear[v.year] = v; });

  // ---- roads = capture sequences ----
  var ROADS = [
    { id: 'ew0', name: '가온로', a: [0, 0], b: [320, 0], years: [2023, 2025, 2026] },
    { id: 'ew1', name: '누리로', a: [0, 120], b: [320, 120], years: [2023, 2026] },
    { id: 'ew2', name: '다솜로', a: [0, 240], b: [320, 240], years: [2025, 2026] },
    { id: 'ns0', name: '마루길', a: [0, 0], b: [0, 240], years: [2023, 2025, 2026] },
    { id: 'ns1', name: '바른길', a: [160, 0], b: [160, 240], years: [2023, 2025, 2026] },
    { id: 'ns2', name: '새별길', a: [320, 0], b: [320, 240], years: [2026] }
  ];
  var roadById = {};
  var nodes = [];
  var nodeById = {};

  ROADS.forEach(function (road, roadIdx) {
    var dx = road.b[0] - road.a[0], dy = road.b[1] - road.a[1];
    road.len = Math.hypot(dx, dy);
    road.ux = dx / road.len;
    road.uy = dy / road.len;
    road.heading = norm360(Math.atan2(dx, dy) * R2D);
    road.index = roadIdx;
    road.nodeIds = [];
    roadById[road.id] = road;
    var n = Math.round(road.len / CAPTURE_INTERVAL_M);
    for (var i = 0; i <= n; i++) {
      var x = road.a[0] + road.ux * i * CAPTURE_INTERVAL_M;
      var y = road.a[1] + road.uy * i * CAPTURE_INTERVAL_M;
      var ll = toLatLon(x, y);
      var node = {
        id: road.id + '-' + pad(i, 3), roadId: road.id, seq: i, x: x, y: y,
        lat: ll.lat, lon: ll.lon, heading: road.heading,
        years: road.years.slice(), links: []
      };
      nodes.push(node);
      nodeById[node.id] = node;
      road.nodeIds.push(node.id);
    }
  });

  // Navigation graph: step links to capture points ~one interval away
  // (same sequence or a crossing one), plus long "jump" links along the sequence.
  // Crossing sequences each keep their own node at an intersection (same
  // coordinates, different captures), and only one link per direction is kept,
  // preferring the node's own sequence. So A -> B always has a way back to A's
  // position, but possibly via A's co-located twin rather than A itself.
  nodes.forEach(function (node) {
    var cands = [];
    nodes.forEach(function (other) {
      if (other === node) return;
      var d = Math.hypot(other.x - node.x, other.y - node.y);
      if (d > 1 && d <= CAPTURE_INTERVAL_M + 0.5) cands.push({ other: other, d: d });
    });
    cands.sort(function (p, q) {
      return (q.other.roadId === node.roadId) - (p.other.roadId === node.roadId);
    });
    cands.forEach(function (c) {
      var heading = norm360(Math.atan2(c.other.x - node.x, c.other.y - node.y) * R2D);
      var dup = node.links.some(function (l) { return Math.abs(norm180(l.heading - heading)) < 5; });
      if (!dup) node.links.push({ target: c.other.id, heading: heading, distanceMeters: c.d, kind: 'step' });
    });
    var ids = roadById[node.roadId].nodeIds;
    [-JUMP_STEPS, JUMP_STEPS].forEach(function (off) {
      var t = nodeById[ids[node.seq + off]];
      if (!t) return;
      node.links.push({
        target: t.id,
        heading: norm360(Math.atan2(t.x - node.x, t.y - node.y) * R2D),
        distanceMeters: Math.hypot(t.x - node.x, t.y - node.y),
        kind: 'jump'
      });
    });
  });

  // ---- static city model (meters; x east, y north) ----
  var WALLS = ['#c9b9a3', '#b4a08a', '#a9b2bd', '#d6cfc2', '#9aa3a8', '#c2a48f', '#b8c1c9', '#d9c7a8'];
  var buildings = [];
  var parks = [];
  var trees = [];
  var brand = rng(20260);

  function addBuilding(x0, y0, x1, y1, extra) {
    var b = {
      id: 'b' + buildings.length, x0: x0, y0: y0, x1: x1, y1: y1,
      h: Math.round((9 + brand() * 32) / 3.5) * 3.5,
      color: WALLS[Math.floor(brand() * WALLS.length)], kind: 'block'
    };
    for (var k in extra) b[k] = extra[k];
    buildings.push(b);
    return b;
  }
  function fillLots(x0, y0, x1, y1, cols, rows, each) {
    var w = (x1 - x0) / cols, h = (y1 - y0) / rows;
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        var lot = [x0 + c * w + 2, y0 + r * h + 2, x0 + (c + 1) * w - 2, y0 + (r + 1) * h - 2];
        if (!each || each(lot, c, r) !== false) addBuilding(lot[0], lot[1], lot[2], lot[3]);
      }
    }
  }
  var CONSTRUCTION_SITE = null;
  // SW block
  fillLots(9, 9, 151, 111, 4, 2, function (lot, c, r) {
    if (c === 0 && r === 0) { addBuilding(lot[0], lot[1], lot[2], lot[3], { name: '모의시청', h: 21, color: '#d8d2c4' }); return false; }
  });
  // SE block: one lot is a construction site in 2023 and a tower from 2025
  fillLots(169, 9, 311, 111, 4, 2, function (lot, c, r) {
    if (c === 0 && r === 1) {
      CONSTRUCTION_SITE = { x: (lot[0] + lot[2]) / 2, y: (lot[1] + lot[3]) / 2 };
      addBuilding(lot[0], lot[1], lot[2], lot[3], { kind: 'fence', h: 3, color: '#e8c33a', until: 2023, name: '공사현장' });
      addBuilding(lot[0] + 4, lot[1] + 4, lot[2] - 4, lot[3] - 4, { kind: 'tower', h: 66.5, color: '#7fa3bf', since: 2025, name: '모의타워' });
      return false;
    }
  });
  // NW block: park with a small pavilion
  parks.push({ x0: 9, y0: 129, x1: 151, y1: 231, name: '한빛공원' });
  addBuilding(72, 174, 88, 186, { h: 5, color: '#b9966b', name: '한빛공원 쉼터' });
  for (var ti = 0; ti < 26; ti++) {
    var tx = 14 + brand() * 132, ty = 134 + brand() * 92;
    if (tx > 66 && tx < 94 && ty > 168 && ty < 192) continue;
    trees.push({ x: tx, y: ty, h: 7 + brand() * 4, r: 2.4 + brand() * 1.4, seed: ti });
  }
  // NE block
  fillLots(169, 129, 311, 231, 3, 2, function (lot, c, r) {
    if (c === 2 && r === 0) { addBuilding(lot[0], lot[1], lot[2], lot[3], { name: '새별마켓', h: 10.5, color: '#c98f6b' }); return false; }
  });
  // outer ring so perimeter streets have two sides
  fillLots(-46, -46, 366, -9, 9, 1);
  fillLots(-46, 249, 366, 286, 9, 1);
  fillLots(-46, -9, -9, 249, 1, 6);
  fillLots(329, -9, 366, 249, 1, 6);

  function nearIntersection(road, s) {
    return ROADS.some(function (other) {
      if (other === road || other.heading === road.heading) return false;
      var cross = road.heading === 90 ? other.a[0] - road.a[0] : other.a[1] - road.a[1];
      return Math.abs(cross - s) < 14;
    });
  }
  function onRoad(road, s, lateral) {
    // left-hand normal of the road direction
    return { x: road.a[0] + road.ux * s - road.uy * lateral, y: road.a[1] + road.uy * s + road.ux * lateral };
  }
  ROADS.forEach(function (road) {
    for (var s = 15; s < road.len - 10; s += 20) {
      if (nearIntersection(road, s)) continue;
      [-6.6, 6.6].forEach(function (side) {
        var p = onRoad(road, s, side);
        trees.push({ x: p.x, y: p.y, h: 6 + brand() * 3, r: 1.8 + brand() * 0.9, seed: trees.length });
      });
    }
  });

  // ---- per-vintage movable objects (cars, pedestrians) ----
  var CAR_COLORS = ['#f2f2f2', '#2b2f36', '#9aa0a8', '#b3261e', '#1f4e8c', '#d9d2c0', '#3f6b4f'];
  var COAT_COLORS = ['#34495e', '#8e3b46', '#2e6f5e', '#b9770e', '#5d4a7a', '#4a4a4a', '#c0c7cf'];
  var HANGUL = '가나다라마바사아자하';
  var dynamicCache = {};
  function dynamicFor(year) {
    if (dynamicCache[year]) return dynamicCache[year];
    var r = rng(year * 7919 + 13);
    var cars = [], people = [];
    ROADS.forEach(function (road) {
      var s;
      for (s = 12 + r() * 20; s < road.len - 8; s += 14 + r() * 30) {
        if (nearIntersection(road, s)) continue;
        var p = onRoad(road, s, r() < 0.5 ? -3.6 : 3.6);
        cars.push({
          x: p.x, y: p.y, ux: road.ux, uy: road.uy,
          color: CAR_COLORS[Math.floor(r() * CAR_COLORS.length)],
          plate: pad(Math.floor(r() * 90) + 10, 2) + HANGUL[Math.floor(r() * 10)] + ' ' + pad(Math.floor(r() * 10000), 4),
          plateBlurred: r() > 0.12, seed: cars.length
        });
      }
      for (s = 8 + r() * 15; s < road.len - 6; s += 10 + r() * 35) {
        if (nearIntersection(road, s)) continue;
        var q = onRoad(road, s, (r() < 0.5 ? -1 : 1) * (7 + r() * 0.7));
        people.push({
          x: q.x, y: q.y, h: 1.58 + r() * 0.26,
          color: COAT_COLORS[Math.floor(r() * COAT_COLORS.length)],
          faceBlurred: r() > 0.08, seed: people.length
        });
      }
    });
    return (dynamicCache[year] = { cars: cars, people: people });
  }

  var cityCache = {};
  function cityFor(year) {
    if (cityCache[year]) return cityCache[year];
    var dyn = dynamicFor(year);
    return (cityCache[year] = {
      year: year,
      buildings: buildings.filter(function (b) {
        return (b.since === undefined || year >= b.since) && (b.until === undefined || year <= b.until);
      }),
      parks: parks, trees: trees, cars: dyn.cars, people: dyn.people,
      crane: year <= 2023 ? CONSTRUCTION_SITE : null
    });
  }

  // ---- events ----
  var listeners = {};
  function on(name, cb) { (listeners[name] = listeners[name] || []).push(cb); }
  function off(name, cb) {
    listeners[name] = (listeners[name] || []).filter(function (f) { return f !== cb; });
  }
  function emit(name, payload) {
    (listeners[name] || []).slice().forEach(function (cb) { cb(payload); });
  }

  // ---- discovery / metadata API ----
  function resolveYear(node, want) {
    if (want === undefined || want === null || want === 'latest') return Math.max.apply(null, node.years);
    want = Number(want);
    if (node.years.indexOf(want) >= 0) return want;
    return node.years.slice().sort(function (p, q) { return Math.abs(p - want) - Math.abs(q - want); })[0];
  }

  // Production equivalent: PostGIS ST_DWithin + ORDER BY ST_Distance LIMIT 1.
  function findNearest(lat, lon, radiusM, opts) {
    var p = toXY(lat, lon);
    var year = opts && opts.year && opts.year !== 'latest' ? Number(opts.year) : null;
    var best = null;
    nodes.forEach(function (node) {
      if (year && node.years.indexOf(year) < 0) return;
      var d = Math.hypot(node.x - p.x, node.y - p.y);
      if (d <= radiusM && (!best || d < best.distanceM)) best = { node: node, distanceM: d };
    });
    return best;
  }

  var reports = {};
  var reportSeq = 0;
  function captureKey(nodeId, year) { return nodeId + '@' + year; }
  function privacyRevision(nodeId, year) {
    return 1 + (reports[captureKey(nodeId, year)] || []).length;
  }
  function getReports(nodeId, year) {
    return (reports[captureKey(nodeId, year)] || []).slice();
  }
  function allReports() {
    var out = [];
    Object.keys(reports).forEach(function (k) { out = out.concat(reports[k]); });
    return out.sort(function (p, q) { return q.seq - p.seq; });
  }
  // Blur-miss report: adds a blur patch and bumps the capture's privacy/tile revision.
  // `year` goes through resolveYear so the bump always lands on a real capture.
  function reportBlur(nodeId, year, heading, pitch, note) {
    var node = nodeById[nodeId];
    if (!node) return null;
    year = resolveYear(node, year);
    var key = captureKey(nodeId, year);
    var entry = {
      nodeId: nodeId, year: year, heading: norm360(heading), pitch: pitch, seq: ++reportSeq,
      note: note || '', at: new Date().toISOString(), revision: privacyRevision(nodeId, year) + 1
    };
    (reports[key] = reports[key] || []).push(entry);
    emit('privacy_changed', entry);
    return entry;
  }

  function captureTime(node, year) {
    var v = vintageByYear[year];
    var road = roadById[node.roadId];
    return new Date(Date.UTC(year, v.month, v.day, 1 + road.index, 12, 0) + node.seq * 2000).toISOString();
  }

  function getManifest(nodeId, want) {
    var node = nodeById[nodeId];
    if (!node) return null;
    var year = resolveYear(node, want);
    var road = roadById[node.roadId];
    var rev = privacyRevision(nodeId, year);
    var id = 'P-' + node.id + '-' + year;
    return {
      id: id,
      nodeId: node.id,
      sequenceId: 'SEQ-' + road.id + '-' + year,
      source: 'OWN_FLEET',
      captureTime: captureTime(node, year),
      photodate: vintageByYear[year].label,
      availableYears: node.years.slice(),
      address: '모의시 ' + road.name + ' ' + (node.seq * 2 + 1),
      position: { lat: node.lat, lon: node.lon, accuracyMeters: 1.8 },
      pose: { heading: node.heading, pitch: 0, roll: 0 },
      projection: 'cubemap',
      tiles: {
        template: '/tiles/' + id + '/' + rev + '/{z}/{face}/{x}/{y}.webp',
        tileSize: 512, maxLevel: 3, tileRevision: rev
      },
      links: node.links.map(function (l) {
        return { target: l.target, heading: l.heading, distanceMeters: l.distanceMeters, kind: l.kind };
      }),
      privacy: { faces: 'BLURRED', plates: 'BLURRED', revision: rev }
    };
  }

  function coverage() {
    return ROADS.map(function (road) {
      var a = toLatLon(road.a[0], road.a[1]), b = toLatLon(road.b[0], road.b[1]);
      return {
        roadId: road.id, name: road.name, years: road.years.slice(),
        lengthM: road.len, path: [[a.lat, a.lon], [b.lat, b.lon]]
      };
    });
  }

  RV.ORIGIN = ORIGIN;
  RV.ROAD_HALF = ROAD_HALF;
  RV.SIDEWALK = SIDEWALK;
  RV.VINTAGES = VINTAGES;
  RV.roads = ROADS;
  RV.nodes = nodes;
  RV.toLatLon = toLatLon;
  RV.toXY = toXY;
  RV.rng = rng;
  RV.norm360 = norm360;
  RV.norm180 = norm180;
  RV.vintage = function (year) { return vintageByYear[year]; };
  RV.getNode = function (id) { return nodeById[id] || null; };
  RV.getRoad = function (id) { return roadById[id] || null; };
  RV.cityFor = cityFor;
  RV.resolveYear = resolveYear;
  RV.findNearest = findNearest;
  RV.getManifest = getManifest;
  RV.coverage = coverage;
  RV.reportBlur = reportBlur;
  RV.getReports = getReports;
  RV.allReports = allReports;
  RV.privacyRevision = privacyRevision;
  RV.on = on;
  RV.off = off;
  RV.emit = emit;

  if (typeof module !== 'undefined' && module.exports) module.exports = RV;
})(typeof window !== 'undefined' ? window : globalThis);
