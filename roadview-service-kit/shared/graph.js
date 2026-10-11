// Real-world panorama graph: nodes carry lat/lon, links are derived from geometry.
// Pure functions (no DOM) so the service can run them on the server too.
(function (root) {
  'use strict';
  var R = 6371008.8, D2R = Math.PI / 180;

  function norm360(a) { return ((a % 360) + 360) % 360; }
  function angDiff(a, b) { return Math.abs(((a - b + 540) % 360) - 180); }

  function distance(a, b) {
    var p1 = a.lat * D2R, p2 = b.lat * D2R, dp = p2 - p1, dl = (b.lon - a.lon) * D2R;
    var h = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  // compass bearing from a to b, degrees
  function bearing(a, b) {
    var p1 = a.lat * D2R, p2 = b.lat * D2R, dl = (b.lon - a.lon) * D2R;
    return norm360(Math.atan2(Math.sin(dl) * Math.cos(p2),
      Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl)) / D2R);
  }
  function offset(a, bearingDeg, meters) {
    var d = meters / R, br = bearingDeg * D2R, p1 = a.lat * D2R, l1 = a.lon * D2R;
    var p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(br));
    var l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
    return { lat: p2 / D2R, lon: l2 / D2R };
  }

  // Links by geometry: nearest neighbours, one per direction sector, always symmetric.
  function buildLinks(nodes, opts) {
    var o = { maxM: 60, minSepDeg: 40, maxLinks: 4 };
    for (var k in opts) o[k] = opts[k];
    var links = {};
    nodes.forEach(function (n) { links[n.id] = []; });
    nodes.forEach(function (n) {
      var cands = [];
      nodes.forEach(function (m) {
        if (m === n) return;
        var d = distance(n, m);
        if (d <= o.maxM && d > 0.2) cands.push({ m: m, d: d });
      });
      cands.sort(function (p, q) { return p.d - q.d; });
      cands.forEach(function (c) {
        if (links[n.id].length >= o.maxLinks) return;
        var br = bearing(n, c.m);
        if (links[n.id].some(function (l) { return angDiff(l.heading, br) < o.minSepDeg; })) return;
        links[n.id].push({ target: c.m.id, heading: br, distanceMeters: c.d, kind: 'step' });
      });
    });
    // symmetry: if A -> B then B -> A, so a step forward can always be walked back
    nodes.forEach(function (n) {
      links[n.id].slice().forEach(function (l) {
        var back = links[l.target];
        if (!back.some(function (x) { return x.target === n.id; })) {
          var m = nodes.filter(function (x) { return x.id === l.target; })[0];
          back.push({ target: n.id, heading: bearing(m, n), distanceMeters: l.distanceMeters, kind: 'step' });
        }
      });
    });
    return links;
  }

  function nearest(nodes, lat, lon, radiusM) {
    var best = null;
    nodes.forEach(function (n) {
      var d = distance({ lat: lat, lon: lon }, n);
      if (d <= radiusM && (!best || d < best.distance)) best = { node: n, distance: d };
    });
    return best;
  }

  // Group photos that have GPS into capture points. Full 360° photos are always their
  // own point; ordinary photos taken within `clusterM` of each other are one point
  // (a walk-around shoot of the same spot, told apart from a drive by heading). Photos without GPS come back as `unplaced`.
  function cluster(photos, clusterM) {
    clusterM = clusterM === undefined ? 5 : clusterM;
    var groups = [], unplaced = [];
    photos.forEach(function (p) {
      if (!p.gps) { unplaced.push(p); return; }
      if (p.kind !== 'flat') { groups.push({ lat: p.gps.lat, lon: p.gps.lon, photos: [p] }); return; }
      // same spot AND a different viewing direction => one walk-around shoot. Photos that face
      // the same way within a few metres are consecutive frames of a drive, not one spot.
      var g = groups.filter(function (x) {
        if (x.photos[0].kind !== 'flat' || distance(x, p.gps) > clusterM) return false;
        if (p.heading === undefined || p.heading === null) return true;
        return x.photos.every(function (q) { return q.heading === undefined || q.heading === null || angDiff(q.heading, p.heading) >= 25; });
      })[0];
      if (g) {
        g.photos.push(p);
        var n = g.photos.length;                       // running mean keeps the centre stable
        g.lat += (p.gps.lat - g.lat) / n; g.lon += (p.gps.lon - g.lon) / n;
      } else groups.push({ lat: p.gps.lat, lon: p.gps.lon, photos: [p] });
    });
    return { groups: groups, unplaced: unplaced };
  }

  // n points evenly along a start -> end walk, each facing the direction of travel.
  function interpolate(start, end, n) {
    var hd = bearing(start, end), out = [];
    for (var i = 0; i < n; i++) {
      var t = n === 1 ? 0 : i / (n - 1);
      out.push({ lat: start.lat + (end.lat - start.lat) * t, lon: start.lon + (end.lon - start.lon) * t, heading: hd });
    }
    return out;
  }

  var api = { distance: distance, bearing: bearing, offset: offset, angDiff: angDiff, norm360: norm360,
    buildLinks: buildLinks, nearest: nearest, cluster: cluster, interpolate: interpolate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RVGraph = api;
})(typeof window !== 'undefined' ? window : globalThis);
