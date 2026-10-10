// Synthetic equirectangular panorama renderer. Stands in for the capture +
// stitch + blur + tile pipeline: every capture is drawn from the city model,
// so moving between nodes shifts buildings, cars and people consistently.
(function (root) {
  'use strict';
  var RV = root.RV;
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var CAM_H = 2.5;
  var LOD_WIDTH = { low: 1024, high: 3072 };
  var CACHE_LIMIT = { low: 48, high: 6 };

  var SEASONS = {
    autumn: {
      skyTop: '#3f6fb5', skyHorizon: '#f3dcb8', sun: { bearing: 250, pitch: 16, color: '255,214,150' },
      cloud: '255,236,214', cloudCount: 10, haze: [222, 205, 180], light: 1.0,
      grass: [141, 138, 79], canopy: ['#c7772e', '#d9a13b', '#a8552a'], bare: false
    },
    winter: {
      skyTop: '#8a96a5', skyHorizon: '#d8dde1', sun: null,
      cloud: '236,240,244', cloudCount: 26, haze: [205, 210, 215], light: 0.9,
      grass: [222, 228, 233], canopy: ['#6d6259'], bare: true
    },
    summer: {
      skyTop: '#1f66c1', skyHorizon: '#cfe6f7', sun: { bearing: 150, pitch: 52, color: '255,250,225' },
      cloud: '255,255,255', cloudCount: 8, haze: [196, 214, 228], light: 1.05,
      grass: [95, 154, 74], canopy: ['#2f7d3a', '#3d9447', '#2a6b33'], bare: false
    }
  };

  function hexToRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function css(rgb, factor, fogT, haze) {
    var f = factor === undefined ? 1 : factor, t = fogT || 0;
    return 'rgb(' +
      Math.round(Math.min(255, rgb[0] * f) * (1 - t) + haze[0] * t) + ',' +
      Math.round(Math.min(255, rgb[1] * f) * (1 - t) + haze[1] * t) + ',' +
      Math.round(Math.min(255, rgb[2] * f) * (1 - t) + haze[2] * t) + ')';
  }
  function fog(d) { var t = Math.min(1, d / 260); return t * t * 0.85; }
  function hash3(a, b, c) {
    var h = (Math.imul(a | 0, 73856093) ^ Math.imul(b | 0, 19349663) ^ Math.imul(c | 0, 83492791)) >>> 0;
    return h % 1000 / 1000;
  }

  function mosaicOn(ctx, x, y, w, h, seed, tones) {
    var n = 3;
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        ctx.fillStyle = tones[Math.floor(hash3(r, c, seed) * tones.length)];
        ctx.fillRect(x + c * w / n, y + r * h / n, w / n + 0.6, h / n + 0.6);
      }
    }
  }

  // blur patches added through the report flow; applied to every kind of capture
  function drawReports(ctx, node, year, W) {
    var ppd = W / 360;
    RV.getReports(node.id, year).forEach(function (r, idx) {
      var w = 5 * ppd, h = 3.4 * ppd;
      var x0 = RV.norm360(r.heading - 90) * ppd - w / 2;
      [x0, x0 + W, x0 - W].forEach(function (x) {
        if (x + w < 0 || x > W) return;
        mosaicOn(ctx, x, (90 - r.pitch) * ppd - h / 2, w, h, idx + 900, ['#9a9a9a', '#b5b5b5', '#868686', '#c7c7c7']);
      });
    });
  }

  function render(node, year, W) {
    var H = W / 2, ppd = W / 360;
    var canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    var ctx = canvas.getContext('2d');
    var city = RV.cityFor(year);
    var pal = SEASONS[RV.vintage(year).season];
    var cx = node.x, cy = node.y;
    var step = W >= 2048 ? 2 : 1;

    // texture column for a compass bearing; matches the viewer's sphere mapping
    function colX(bearing) { return RV.norm360(bearing - 90) * ppd; }
    function rowY(pitch) { return (90 - pitch) * ppd; }
    function wrapX(x0, w, fn) {
      fn(x0);
      if (x0 < 0) fn(x0 + W);
      if (x0 + w > W) fn(x0 - W);
    }

    // ---- sky ----
    var g = ctx.createLinearGradient(0, 0, 0, H / 2);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(1, pal.skyHorizon);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H / 2);
    if (pal.sun) {
      var sunR = 26 * ppd;
      wrapX(colX(pal.sun.bearing) - sunR, sunR * 2, function (x) {
        var sx = x + sunR, sy = rowY(pal.sun.pitch);
        var rg = ctx.createRadialGradient(sx, sy, 0, sx, sy, sunR);
        rg.addColorStop(0, 'rgba(' + pal.sun.color + ',1)');
        rg.addColorStop(0.08, 'rgba(' + pal.sun.color + ',0.95)');
        rg.addColorStop(0.2, 'rgba(' + pal.sun.color + ',0.35)');
        rg.addColorStop(1, 'rgba(' + pal.sun.color + ',0)');
        ctx.fillStyle = rg;
        ctx.fillRect(sx - sunR, sy - sunR, sunR * 2, sunR * 2);
      });
    }
    // clouds sit at infinity, so they are identical for every node of a vintage
    var cr = RV.rng(year * 31 + 7);
    for (var ci = 0; ci < pal.cloudCount; ci++) {
      var cb = cr() * 360, cp = 10 + cr() * 45, cw = (18 + cr() * 34) * ppd, ch = (3 + cr() * 5) * ppd;
      var ca = 0.35 + cr() * 0.4;
      var puffs = [];
      for (var pi = 0; pi < 5; pi++) puffs.push([cr(), cr(), 0.25 + cr() * 0.3]);
      /* eslint-disable no-loop-func */
      wrapX(colX(cb) - cw / 2, cw, function (x) {
        ctx.fillStyle = 'rgba(' + pal.cloud + ',' + ca + ')';
        puffs.forEach(function (p) {
          ctx.beginPath();
          ctx.ellipse(x + p[0] * cw, rowY(cp) + (p[1] - 0.5) * ch, cw * p[2], ch * (0.5 + p[2]), 0, 0, Math.PI * 2);
          ctx.fill();
        });
      });
    }

    // ---- ground (inverse-projected per pixel at reduced resolution) ----
    var gw = W, gh = H / 4;
    var img = ctx.createImageData(gw, gh);
    var data = img.data;
    var roads = RV.roads, half = RV.ROAD_HALF, walk = RV.SIDEWALK;
    var sinB = new Float32Array(gw), cosB = new Float32Array(gw);
    for (var i = 0; i < gw; i++) {
      var bear = ((i + 0.5) / gw * 360 + 90) * D2R;
      sinB[i] = Math.sin(bear);
      cosB[i] = Math.cos(bear);
    }
    var ASPHALT = [58, 61, 66], WALK = [176, 170, 160], PLAZA = [150, 148, 142];
    var park = city.parks;
    for (var j = 0; j < gh; j++) {
      var pitch = (j + 0.5) / gh * 90;
      var d = CAM_H / Math.tan(pitch * D2R);
      var ft = fog(d);
      for (i = 0; i < gw; i++) {
        var wx = cx + d * sinB[i], wy = cy + d * cosB[i];
        var minLat = 1e9, along = 0, hits = 0;
        for (var ri = 0; ri < roads.length; ri++) {
          var rd = roads[ri];
          var rx = wx - rd.a[0], ry = wy - rd.a[1];
          var s = rx * rd.ux + ry * rd.uy;
          if (s < -half || s > rd.len + half) continue;
          var lat = Math.abs(rx * rd.uy - ry * rd.ux);
          if (lat < half) hits++;
          if (lat < minLat) { minLat = lat; along = s; }
        }
        var c, f = pal.light;
        if (minLat < half) {
          c = ASPHALT;
          if (hits < 2) {
            if (minLat < 0.16 && along % 6 < 3) c = [226, 198, 84];
            else if (minLat > 4.5 && minLat < 4.72) c = [224, 224, 224];
          }
        } else if (minLat < walk) {
          c = WALK;
          f *= ((Math.floor(wx / 1.5) + Math.floor(wy / 1.5)) & 1) ? 1 : 0.955;
        } else {
          c = PLAZA;
          if (wx < -46 || wx > 366 || wy < -46 || wy > 286) c = pal.grass;
          for (var pk = 0; pk < park.length; pk++) {
            if (wx > park[pk].x0 && wx < park[pk].x1 && wy > park[pk].y0 && wy < park[pk].y1) c = pal.grass;
          }
        }
        var o = (j * gw + i) * 4;
        data[o] = Math.min(255, c[0] * f) * (1 - ft) + pal.haze[0] * ft;
        data[o + 1] = Math.min(255, c[1] * f) * (1 - ft) + pal.haze[1] * ft;
        data[o + 2] = Math.min(255, c[2] * f) * (1 - ft) + pal.haze[2] * ft;
        data[o + 3] = 255;
      }
    }
    var gc = document.createElement('canvas');
    gc.width = gw;
    gc.height = gh;
    gc.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(gc, 0, H / 2, W, H / 2);

    // ---- painter's list: far to near ----
    var items = [];
    function push(type, obj, dist, maxD) { if (dist < maxD && dist > 0.8) items.push({ t: type, o: obj, d: dist }); }
    city.buildings.forEach(function (b) {
      push('building', b, Math.hypot(Math.max(b.x0 - cx, 0, cx - b.x1), Math.max(b.y0 - cy, 0, cy - b.y1)), 320);
    });
    city.trees.forEach(function (t) { push('tree', t, Math.hypot(t.x - cx, t.y - cy), 170); });
    city.cars.forEach(function (c) { push('car', c, Math.hypot(c.x - cx, c.y - cy), 110); });
    city.people.forEach(function (p) { push('person', p, Math.hypot(p.x - cx, p.y - cy), 85); });
    if (city.crane) push('crane', city.crane, Math.hypot(city.crane.x - cx, city.crane.y - cy), 400);
    items.sort(function (p, q) { return q.d - p.d; });

    function drawBuilding(b) {
      var wall = hexToRgb(b.color);
      var bc = Math.atan2((b.x0 + b.x1) / 2 - cx, (b.y0 + b.y1) / 2 - cy) * R2D;
      var lo = 0, hi = 0;
      [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]].forEach(function (c) {
        var rel = RV.norm180(Math.atan2(c[0] - cx, c[1] - cy) * R2D - bc);
        if (rel < lo) lo = rel;
        if (rel > hi) hi = rel;
      });
      var xBase = colX(bc + lo);
      var npx = (hi - lo) * ppd;
      var seed = parseInt(b.id.slice(1), 10);
      for (var k = 0; k <= npx; k += step) {
        var bearing = (bc + lo + k / ppd) * D2R;
        var dx = Math.sin(bearing), dy = Math.cos(bearing);
        if (Math.abs(dx) < 1e-9) dx = 1e-9;
        if (Math.abs(dy) < 1e-9) dy = 1e-9;
        var tx0 = (b.x0 - cx) / dx, tx1 = (b.x1 - cx) / dx;
        var ty0 = (b.y0 - cy) / dy, ty1 = (b.y1 - cy) / dy;
        var txn = Math.min(tx0, tx1), tyn = Math.min(ty0, ty1);
        var tn = Math.max(txn, tyn), tf = Math.min(Math.max(tx0, tx1), Math.max(ty0, ty1));
        if (tn > tf || tn < 0.2) continue;
        var xFace = txn > tyn;
        var u = xFace ? cy + dy * tn : cx + dx * tn;
        var ft = fog(tn);
        var shade = (xFace ? 0.8 : 1) * pal.light;
        var px = (xBase + k) % W;
        var yTop = rowY(Math.atan2(b.h - CAM_H, tn) * R2D);
        var yBot = rowY(Math.atan2(-CAM_H, tn) * R2D);
        if (b.kind === 'fence') {
          ctx.fillStyle = css(Math.floor(u / 1.6) & 1 ? wall : [40, 40, 44], shade, ft, pal.haze);
          ctx.fillRect(px, yTop, step, yBot - yTop + 1);
          continue;
        }
        ctx.fillStyle = css(wall, shade, ft, pal.haze);
        ctx.fillRect(px, yTop, step, yBot - yTop + 1);
        if (yBot - yTop < 10) continue;
        var floors = Math.floor(b.h / 3.5);
        var fl, z0, z1, y0, y1;
        if (b.kind === 'tower') {
          // curtain wall: floor spandrels + mullions
          ctx.fillStyle = css([52, 78, 104], shade, ft, pal.haze);
          for (fl = 1; fl <= floors; fl++) {
            y0 = rowY(Math.atan2(fl * 3.5 - CAM_H, tn) * R2D);
            ctx.fillRect(px, y0, step, Math.max(1, (yBot - yTop) / floors * 0.14));
          }
          if (u % 2.4 < 0.22) ctx.fillRect(px, yTop, step, yBot - yTop);
          continue;
        }
        var cell = ((u % 3.2) + 3.2) % 3.2;
        if (cell < 0.55 || cell > 2.65) continue;
        var cellIdx = Math.floor(u / 3.2);
        for (fl = 0; fl < floors; fl++) {
          z0 = fl === 0 ? 0.35 : fl * 3.5 + 1.1;
          z1 = fl * 3.5 + 2.9;
          y1 = rowY(Math.atan2(z0 - CAM_H, tn) * R2D);
          y0 = rowY(Math.atan2(z1 - CAM_H, tn) * R2D);
          var lit = hash3(cellIdx, fl, seed + (xFace ? 91 : 0));
          ctx.fillStyle = css(lit < 0.2 ? [214, 205, 160] : (lit < 0.6 ? [58, 74, 92] : [78, 98, 118]), shade, ft, pal.haze);
          ctx.fillRect(px, y0, step, Math.max(1, y1 - y0));
        }
      }
    }

    function mosaic(x, y, w, h, seed, tones) { mosaicOn(ctx, x, y, w, h, seed, tones); }

    function billboard(o, w, h, dist, draw) {
      var bearing = Math.atan2(o.x - cx, o.y - cy) * R2D;
      var wpx = 2 * Math.atan(w / 2 / dist) * R2D * ppd;
      var yTop = rowY(Math.atan2(h - CAM_H, dist) * R2D);
      var yBot = rowY(Math.atan2(-CAM_H, dist) * R2D);
      ctx.globalAlpha = 1 - fog(dist) * 0.8;
      wrapX(colX(bearing) - wpx / 2, wpx, function (x) { draw(x, yTop, wpx, yBot - yTop); });
      ctx.globalAlpha = 1;
    }

    function drawTree(t, dist) {
      billboard(t, t.r * 2, t.h, dist, function (x, y, w, h) {
        ctx.fillStyle = '#5a4634';
        ctx.fillRect(x + w * 0.45, y + h * 0.45, Math.max(1, w * 0.1), h * 0.55);
        if (pal.bare) {
          ctx.strokeStyle = '#5a4634';
          ctx.lineWidth = Math.max(1, w * 0.03);
          for (var k = 0; k < 7; k++) {
            ctx.beginPath();
            ctx.moveTo(x + w * 0.5, y + h * (0.5 - k * 0.03));
            ctx.lineTo(x + w * (0.1 + hash3(k, t.seed, 1) * 0.8), y + h * hash3(k, t.seed, 2) * 0.35);
            ctx.stroke();
          }
          return;
        }
        for (var q = 0; q < 4; q++) {
          ctx.fillStyle = pal.canopy[(t.seed + q) % pal.canopy.length];
          ctx.beginPath();
          ctx.ellipse(x + w * (0.3 + hash3(q, t.seed, 3) * 0.4), y + h * (0.18 + hash3(q, t.seed, 4) * 0.22),
            w * 0.36, h * 0.2, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    function drawCar(c, dist) {
      var vx = (c.x - cx) / dist, vy = (c.y - cy) / dist;
      var endOn = Math.abs(vx * c.ux + vy * c.uy);
      var w = 4.4 * Math.abs(vx * c.uy - vy * c.ux) + 1.8 * endOn;
      billboard(c, w, 1.5, dist, function (x, y, bw, bh) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(x, y + bh * 0.92, bw, bh * 0.1);
        ctx.fillStyle = c.color;
        ctx.fillRect(x, y + bh * 0.38, bw, bh * 0.5);
        ctx.fillRect(x + bw * 0.16, y, bw * 0.68, bh * 0.45);
        ctx.fillStyle = '#26323d';
        ctx.fillRect(x + bw * 0.2, y + bh * 0.07, bw * 0.6, bh * 0.28);
        ctx.fillStyle = '#15171a';
        ctx.beginPath();
        ctx.arc(x + bw * 0.2, y + bh * 0.88, bh * 0.14, 0, Math.PI * 2);
        ctx.arc(x + bw * 0.8, y + bh * 0.88, bh * 0.14, 0, Math.PI * 2);
        ctx.fill();
        var pw = Math.atan(0.52 / dist) * R2D * ppd, ph = pw * 0.24;
        var pxp = endOn > 0.6 ? x + bw / 2 - pw / 2 : x + bw * 0.04;
        var pyp = y + bh * 0.62;
        if (c.plateBlurred) {
          mosaic(pxp, pyp, pw, Math.max(2, ph), c.seed, ['#d9d9d9', '#bdbdbd', '#efefef', '#a8a8a8']);
        } else {
          ctx.fillStyle = '#f4f4f0';
          ctx.fillRect(pxp, pyp, pw, Math.max(2, ph));
          if (ph >= 5) {
            ctx.fillStyle = '#111';
            ctx.font = 'bold ' + Math.floor(ph * 0.82) + 'px sans-serif';
            ctx.textBaseline = 'middle';
            ctx.textAlign = 'center';
            ctx.fillText(c.plate, pxp + pw / 2, pyp + ph / 2, pw * 0.94);
          }
        }
      });
    }

    function drawPerson(p, dist) {
      billboard(p, 0.55, p.h, dist, function (x, y, w, h) {
        var head = h * 0.13;
        ctx.fillStyle = '#2b2b33';
        ctx.fillRect(x + w * 0.22, y + h * 0.55, w * 0.24, h * 0.45);
        ctx.fillRect(x + w * 0.54, y + h * 0.55, w * 0.24, h * 0.45);
        ctx.fillStyle = p.color;
        ctx.fillRect(x + w * 0.12, y + head * 1.15, w * 0.76, h * 0.45);
        var hx = x + w / 2, hy = y + head / 2 + 1;
        if (p.faceBlurred) {
          mosaic(hx - head / 2, hy - head / 2, head, head, p.seed + 500, ['#d8b79a', '#c49f84', '#e3c8ae', '#a98a72']);
        } else {
          ctx.fillStyle = '#e0b999';
          ctx.beginPath();
          ctx.arc(hx, hy, head / 2, 0, Math.PI * 2);
          ctx.fill();
          if (head > 8) {
            ctx.fillStyle = '#222';
            ctx.fillRect(hx - head * 0.22, hy - head * 0.08, head * 0.12, head * 0.12);
            ctx.fillRect(hx + head * 0.1, hy - head * 0.08, head * 0.12, head * 0.12);
            ctx.fillRect(hx - head * 0.15, hy + head * 0.2, head * 0.3, head * 0.06);
          }
        }
      });
    }

    function drawCrane(c, dist) {
      billboard(c, 34, 62, dist, function (x, y, w, h) {
        ctx.fillStyle = '#e0a21a';
        var t = Math.max(1.5, w * 0.03);
        ctx.fillRect(x + w * 0.4, y, t, h);
        ctx.fillRect(x, y + h * 0.06, w, t);
        ctx.fillRect(x + w * 0.9, y + h * 0.06, t * 0.5, h * 0.3);
      });
    }

    items.forEach(function (it) {
      if (it.t === 'building') drawBuilding(it.o);
      else if (it.t === 'tree') drawTree(it.o, it.d);
      else if (it.t === 'car') drawCar(it.o, it.d);
      else if (it.t === 'person') drawPerson(it.o, it.d);
      else drawCrane(it.o, it.d);
    });

    // capture vehicle at nadir is always masked
    var ng = ctx.createLinearGradient(0, rowY(-68), 0, H);
    ng.addColorStop(0, 'rgba(30,32,36,0)');
    ng.addColorStop(0.35, 'rgba(30,32,36,0.92)');
    ng.addColorStop(1, 'rgba(30,32,36,1)');
    ctx.fillStyle = ng;
    ctx.fillRect(0, rowY(-68), W, H - rowY(-68));

    drawReports(ctx, node, year, W);

    return canvas;
  }

  // Photo-backed captures (uploaded or AI-generated). Each node@year holds a
  // list of shots: { img, kind: 'equirect' | 'flat', heading, hfov }.
  //  - equirect: a full 2:1 panorama whose centre faces `heading`
  //  - flat: an ordinary photo re-projected (rectilinear -> equirectangular) onto
  //    the sphere facing `heading`, `hfov` degrees wide, optional `pitch`/`roll`,
  //    over the synthetic render. See shared/reproject.js.
  // `heading` defaults to the node's heading, like a forward-facing vehicle capture.
  var nodePhotos = {};
  function setNodePhotos(nodeId, year, shots) {
    var key = nodeId + '@' + year;
    if (shots && shots.length) nodePhotos[key] = shots; else delete nodePhotos[key];
    caches.low.delete(key + '#image');
    caches.high.delete(key + '#image');
    RV.emit('image_pano_changed', { nodeId: nodeId, year: year });
  }
  function setImagePano(nodeId, year, img) {
    setNodePhotos(nodeId, year, img ? [{ img: img, kind: 'equirect' }] : []);
  }
  function hasImagePano(nodeId, year) { return !!nodePhotos[nodeId + '@' + year]; }
  function renderImage(node, year, W) {
    var shots = nodePhotos[node.id + '@' + year];
    var H = W / 2, ppd = W / 360;
    var full = null;
    shots.forEach(function (s) { if (s.kind !== 'flat') full = s; });
    var canvas = full ? document.createElement('canvas') : render(node, year, W);
    var ctx = canvas.getContext('2d');
    function heading(s) { return s.heading === undefined || s.heading === null ? node.heading : s.heading; }
    if (full) {
      canvas.width = W;
      canvas.height = H;
      var x0 = RV.norm360(heading(full) - 270) * ppd;
      ctx.drawImage(full.img, x0, 0, W, H);
      ctx.drawImage(full.img, x0 - W, 0, W, H);
    }
    // ordinary photos: true rectilinear -> equirectangular re-projection with feathered edges
    var flats = shots.filter(function (s) { return s.kind === 'flat'; });
    if (flats.length && root.RVReproject) {
      var out = ctx.getImageData(0, 0, W, H);
      flats.forEach(function (s) {
        var iw = s.img.naturalWidth || s.img.width, ih = s.img.naturalHeight || s.img.height;
        var sc = Math.min(1, W / 2 / iw * (s.hfov || 65) / 30);   // sample no finer than the target needs
        var tw = Math.max(2, Math.round(iw * sc)), th = Math.max(2, Math.round(ih * sc));
        var tc = document.createElement('canvas');
        tc.width = tw; tc.height = th;
        var tctx = tc.getContext('2d');
        tctx.drawImage(s.img, 0, 0, tw, th);
        root.RVReproject.reprojectInto(out.data, W, tctx.getImageData(0, 0, tw, th).data, tw, th,
          { heading: heading(s), hfov: s.hfov || 65, pitch: s.pitch || 0, roll: s.roll || 0, k1: s.k1 || 0, k2: s.k2 || 0 });
      });
      ctx.putImageData(out, 0, 0);
    }
    drawReports(ctx, node, year, W);
    return canvas;
  }

  var caches = { low: new Map(), high: new Map() };
  // registered photos win unless the caller asks for source 'synthetic'
  function cacheKey(nodeId, year, source) {
    return nodeId + '@' + year + (source !== 'synthetic' && hasImagePano(nodeId, year) ? '#image' : '');
  }
  function getPanoCanvas(nodeId, year, lod, source) {
    lod = lod === 'high' ? 'high' : 'low';
    var key = cacheKey(nodeId, year, source);
    var cache = caches[lod];
    var hit = cache.get(key);
    if (hit) {
      cache.delete(key);
      cache.set(key, hit);
      return hit;
    }
    var node = RV.getNode(nodeId);
    var canvas = key.slice(-6) === '#image'
      ? renderImage(node, year, LOD_WIDTH[lod])
      : render(node, year, LOD_WIDTH[lod]);
    cache.set(key, canvas);
    if (cache.size > CACHE_LIMIT[lod]) cache.delete(cache.keys().next().value);
    return canvas;
  }
  function isCached(nodeId, year, lod, source) { return caches[lod].has(cacheKey(nodeId, year, source)); }

  // a new privacy revision invalidates every LOD of that capture
  RV.on('privacy_changed', function (e) {
    ['', '#image'].forEach(function (suffix) {
      caches.low.delete(e.nodeId + '@' + e.year + suffix);
      caches.high.delete(e.nodeId + '@' + e.year + suffix);
    });
  });

  RV.CAM_H = CAM_H;
  RV.getPanoCanvas = getPanoCanvas;
  RV.setNodePhotos = setNodePhotos;
  RV.setImagePano = setImagePano;
  RV.hasImagePano = hasImagePano;
  RV.isPanoCached = isCached;
})(window);
