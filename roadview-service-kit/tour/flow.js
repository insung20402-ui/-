// Dense-ish motion estimate between two frames: coarse-to-fine block matching on a grid.
// Pure (typed arrays in, typed arrays out) so it runs in the browser and in Node tests.
//
// A frame is { data: Float32Array|Uint8Array grayscale, w, h }. The result describes where each grid node of
// frame A moved to in frame B:  { gx, gy, dx, dy, w, h }  with dx/dy in pixels of the w x h working size.
(function (root) {
  'use strict';

  function downsample(img) {                    // 2x2 box filter
    var w = img.w >> 1, h = img.h >> 1, out = new Float32Array(w * h);
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
      var i = (y * 2) * img.w + x * 2;
      out[y * w + x] = (img.data[i] + img.data[i + 1] + img.data[i + img.w] + img.data[i + img.w + 1]) / 4;
    }
    return { data: out, w: w, h: h };
  }

  // SAD of the bs x bs block of A centred at (cx, cy) against B displaced by (dx, dy); samples outside B are clamped
  function sad(a, b, cx, cy, bs, dx, dy, best) {
    var half = bs >> 1, s = 0;
    for (var y = -half; y < half; y++) {
      var ay = Math.min(a.h - 1, Math.max(0, cy + y)), by = Math.min(b.h - 1, Math.max(0, cy + y + dy));
      for (var x = -half; x < half; x++) {
        var ax = Math.min(a.w - 1, Math.max(0, cx + x)), bx = Math.min(b.w - 1, Math.max(0, cx + x + dx));
        var d = a.data[ay * a.w + ax] - b.data[by * b.w + bx];
        s += d < 0 ? -d : d;
      }
      if (s >= best) return s;                  // early exit: already worse than the best candidate
    }
    return s;
  }
  function variance(a, cx, cy, bs) {
    var half = bs >> 1, n = 0, m = 0, q = 0;
    for (var y = -half; y < half; y++) for (var x = -half; x < half; x++) {
      var v = a.data[Math.min(a.h - 1, Math.max(0, cy + y)) * a.w + Math.min(a.w - 1, Math.max(0, cx + x))];
      n++; m += v; q += v * v;
    }
    m /= n; return q / n - m * m;
  }

  // Walking forward makes the picture expand about a focus point. Find the zoom s and focus (cx, cy) (fractions of the
  // frame) that best explain B as a magnified A, so block matching only has to find what the model misses.
  function zoomModel(A, B) {
    var a = A, b = B;
    while (a.w > 80) { a = downsample(a); b = downsample(b); }
    var w = a.w, h = a.h, best = null, base = 0, n = 0;
    function cost(s, fx, fy) {
      var cx = fx * w, cy = fy * h, sum = 0, cnt = 0;
      for (var y = 2; y < h - 2; y += 2) for (var x = 2; x < w - 2; x += 2) {
        var sx = cx + (x - cx) / s, sy = cy + (y - cy) / s;                 // where this B pixel came from in A
        if (sx < 1 || sy < 1 || sx > w - 2 || sy > h - 2) continue;
        var x0 = sx | 0, y0 = sy | 0, tx = sx - x0, ty = sy - y0;
        var v = (a.data[y0 * w + x0] * (1 - tx) + a.data[y0 * w + x0 + 1] * tx) * (1 - ty) + (a.data[(y0 + 1) * w + x0] * (1 - tx) + a.data[(y0 + 1) * w + x0 + 1] * tx) * ty;
        sum += Math.abs(v - b.data[y * w + x]); cnt++;
      }
      return cnt > w * h / 16 ? sum / cnt : Infinity;
    }
    base = cost(1, 0.5, 0.5);
    for (var s = 1.02; s <= 1.9; s += 0.02) for (var fy = 0.4; fy <= 0.6; fy += 0.05) for (var fx = 0.4; fx <= 0.6; fx += 0.05) {
      var c = cost(s, fx, fy);
      if (!best || c < best.cost) best = { s: s, fx: fx, fy: fy, cost: c };
    }
    n = best && best.cost < base * 0.92;                                   // only trust it if it clearly beats "no zoom"
    return n ? { s: best.s, fx: best.fx, fy: best.fy } : { s: 1, fx: 0.5, fy: 0.5 };
  }

  // opts: { block = 16 (at full working size), levels = 3, range = 5 (search radius at the coarsest level) }
  // opts.model: a { s, fx, fy } zoom model to start from (see zoomModel); default starts from "no motion"
  function estimate(A, B, opts) {
    opts = opts || {};
    return regularize(run(A, B, opts, opts.model || { s: 1, fx: 0.5, fy: 0.5 }).F);
  }

  // Flow both ways. Walking forward is mostly expansion, so we also try starting from the best-fitting zoom (it
  // reaches far larger steps) and keep whichever variant agrees with itself: following A->B and then B->A should lead
  // back to where you started. Mismatches on repeating textures fail that test.
  // The same computation as a list of small steps, so a player can run one per timer tick and never block the UI.
  function pairTask(A, B, opts) {
    opts = opts || {};
    var st = { plain: {}, model: {}, zm: null, out: null };
    var steps = [
      function () { st.plain.ab = estimate(A, B, opts); },
      function () { st.plain.ba = estimate(B, A, opts); },
      function () { st.zm = zoomModel(A, B); if (st.zm.s === 1) st.out = st.plain; },
      function () { if (!st.out) st.model.ab = estimate(A, B, Object.assign({}, opts, { model: st.zm })); },
      function () { if (!st.out) st.model.ba = estimate(B, A, Object.assign({}, opts, { model: { s: 1 / st.zm.s, fx: st.zm.fx, fy: st.zm.fy } })); },
      function () { if (!st.out) st.out = inconsistency(A, st.model) < inconsistency(A, st.plain) ? st.model : st.plain; }
    ];
    return { steps: steps, result: function () { return st.out; } };
  }
  function estimatePair(A, B, opts) {
    var t = pairTask(A, B, opts);
    t.steps.forEach(function (f) { f(); });
    return t.result();
  }
  function inconsistency(A, pair) {
    var F = pair.ab, total = 0, n = 0;
    for (var j = 0; j < F.gy; j++) for (var i = 0; i < F.gx; i++) {
      var k = j * F.gx + i, cx = (i + 0.5) * F.block, cy = (j + 0.5) * F.block;
      if (variance(A, Math.round(cx), Math.round(cy), F.block) <= 20) continue;
      var u = (cx + F.dx[k]) / F.w, v = (cy + F.dy[k]) / F.h;
      if (u < 0 || v < 0 || u > 1 || v > 1) continue;                      // moved out of view: nothing to compare
      var back = sample(pair.ba, u, v);
      total += Math.hypot(F.dx[k] + back[0] * F.w, F.dy[k] + back[1] * F.h); n++;
    }
    return n ? total / n : Infinity;
  }

  function run(A, B, opts, zm) {
    var block = opts.block || 16, levels = opts.levels || 3, range = opts.range || 5;
    var pyrA = [A], pyrB = [B];
    for (var l = 1; l < levels; l++) { pyrA.push(downsample(pyrA[l - 1])); pyrB.push(downsample(pyrB[l - 1])); }
    var gx = Math.floor(A.w / block), gy = Math.floor(A.h / block);
    var dx = new Float32Array(gx * gy), dy = new Float32Array(gx * gy), ok = new Uint8Array(gx * gy), total = 0, counted = 0;
    for (var lv = levels - 1; lv >= 0; lv--) {
      var a = pyrA[lv], b = pyrB[lv], f = Math.pow(2, lv), bs = Math.max(4, block >> lv);
      var r = lv === levels - 1 ? range : 2;
      for (var j = 0; j < gy; j++) for (var i = 0; i < gx; i++) {
        var k = j * gx + i, cx = Math.round(((i + 0.5) * block) / f), cy = Math.round(((j + 0.5) * block) / f);
        if (lv === levels - 1) {
          var fxp = (i + 0.5) * block, fyp = (j + 0.5) * block;                  // node centre in full working pixels
          dx[k] = ((zm.s - 1) * (fxp - zm.fx * A.w)) / f; dy[k] = ((zm.s - 1) * (fyp - zm.fy * A.h)) / f;
          ok[k] = variance(a, cx, cy, bs) > 20 ? 1 : 0;
        }
        else { dx[k] *= 2; dy[k] *= 2; }        // carry the coarser estimate down a level
        if (!ok[k]) continue;
        var cdx = Math.round(dx[k]), cdy = Math.round(dy[k]), best = Infinity, bdx = cdx, bdy = cdy;
        for (var oy = -r; oy <= r; oy++) for (var ox = -r; ox <= r; ox++) {
          // a small penalty for moving away from the carried estimate keeps flat areas from jumping around
          var cost = sad(a, b, cx, cy, bs, cdx + ox, cdy + oy, best) + (Math.abs(ox) + Math.abs(oy)) * 0.5 * bs;
          if (cost < best) { best = cost; bdx = cdx + ox; bdy = cdy + oy; }
        }
        dx[k] = bdx; dy[k] = bdy;
        if (lv === 0) { total += best; counted++; }
      }
    }
    return { F: { gx: gx, gy: gy, dx: dx, dy: dy, ok: ok, block: block, w: A.w, h: A.h, mix: opts.mix }, cost: counted ? total / counted : 0 };
  }

  // Smooth quadratic surface fitted to the flow (robust to bad matches). Repeating textures such as tiles or window
  // rows make block matching jump between neighbours, which shows up as rubbery warping; a surface cannot do that.
  function solve(M, v) {
    var n = v.length, i, j, k;
    for (i = 0; i < n; i++) {
      var p = i; for (j = i + 1; j < n; j++) if (Math.abs(M[j][i]) > Math.abs(M[p][i])) p = j;
      var t = M[i]; M[i] = M[p]; M[p] = t; var tv = v[i]; v[i] = v[p]; v[p] = tv;
      if (Math.abs(M[i][i]) < 1e-12) return null;
      for (j = i + 1; j < n; j++) { var f = M[j][i] / M[i][i]; for (k = i; k < n; k++) M[j][k] -= f * M[i][k]; v[j] -= f * v[i]; }
    }
    var x = new Array(n);
    for (i = n - 1; i >= 0; i--) { var s = v[i]; for (j = i + 1; j < n; j++) s -= M[i][j] * x[j]; x[i] = s / M[i][i]; }
    return x;
  }
  function polyFit(F, vals, w) {
    var gx = F.gx, gy = F.gy, n = gx * gy, wt = new Float32Array(n), co = null, iter, k;
    for (k = 0; k < n; k++) wt[k] = w[k] ? 1 : 0.05;
    function basis(i, j) { var u = (i + 0.5) / gx - 0.5, v = (j + 0.5) / gy - 0.5; return [1, u, v, u * u, u * v, v * v]; }
    for (iter = 0; iter < 4; iter++) {
      var M = [], b = [0, 0, 0, 0, 0, 0], r, c;
      for (r = 0; r < 6; r++) { M.push([0, 0, 0, 0, 0, 0]); }
      for (var j = 0; j < gy; j++) for (var i = 0; i < gx; i++) {
        var q = basis(i, j), ww = wt[j * gx + i];
        for (r = 0; r < 6; r++) { b[r] += ww * q[r] * vals[j * gx + i]; for (c = 0; c < 6; c++) M[r][c] += ww * q[r] * q[c]; }
      }
      co = solve(M, b);
      if (!co) return null;
      var res = [];
      for (j = 0; j < gy; j++) for (i = 0; i < gx; i++) {
        var q2 = basis(i, j), pred = 0; for (r = 0; r < 6; r++) pred += co[r] * q2[r];
        res.push(Math.abs(vals[j * gx + i] - pred));
      }
      var sorted = res.slice().sort(function (p, q) { return p - q; }), mad = sorted[sorted.length >> 1] + 0.5;
      for (k = 0; k < n; k++) wt[k] = (w[k] ? 1 : 0.05) * (res[k] < 2.5 * mad ? 1 : 2.5 * mad / res[k]);      // Huber-style weights
    }
    var out = new Float32Array(n);
    for (j = 0; j < gy; j++) for (i = 0; i < gx; i++) { var q3 = basis(i, j), v = 0; for (r = 0; r < 6; r++) v += co[r] * q3[r]; out[j * gx + i] = v; }
    return out;
  }

  // fill textureless nodes from their neighbours, then median + box filter (removes isolated wrong matches)
  function regularize(F) {
    var gx = F.gx, gy = F.gy, dx = F.dx, dy = F.dy, ok = F.ok;
    for (var pass = 0; pass < 6; pass++) {
      var changed = false;
      for (var j = 0; j < gy; j++) for (var i = 0; i < gx; i++) {
        var k = j * gx + i; if (ok[k]) continue;
        var sx = 0, sy = 0, n = 0;
        [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (d) {
          var ii = i + d[0], jj = j + d[1];
          if (ii >= 0 && jj >= 0 && ii < gx && jj < gy && ok[jj * gx + ii]) { sx += dx[jj * gx + ii]; sy += dy[jj * gx + ii]; n++; }
        });
        if (n) { dx[k] = sx / n; dy[k] = sy / n; ok[k] = 2; changed = true; }
      }
      if (!changed) break;
    }
    function filt(src, median) {
      var out = new Float32Array(src.length);
      for (var j = 0; j < gy; j++) for (var i = 0; i < gx; i++) {
        var vals = [];
        for (var oy = -1; oy <= 1; oy++) for (var ox = -1; ox <= 1; ox++) {
          var ii = Math.min(gx - 1, Math.max(0, i + ox)), jj = Math.min(gy - 1, Math.max(0, j + oy));
          vals.push(src[jj * gx + ii]);
        }
        if (median) { vals.sort(function (p, q) { return p - q; }); out[j * gx + i] = vals[4]; }
        else out[j * gx + i] = vals.reduce(function (p, q) { return p + q; }, 0) / 9;
      }
      return out;
    }
    F.dx = filt(filt(dx, true), false); F.dy = filt(filt(dy, true), false);
    var px = polyFit(F, F.dx, ok), py = polyFit(F, F.dy, ok), mix = F.mix === undefined ? 0.3 : F.mix;
    if (px && py) for (var m = 0; m < F.dx.length; m++) { F.dx[m] = F.dx[m] * (1 - mix) + px[m] * mix; F.dy[m] = F.dy[m] * (1 - mix) + py[m] * mix; }
    return F;
  }

  // flow at a normalised position (u, v in 0..1), bilinear between node centres
  function sample(F, u, v) {
    var fx = Math.min(F.gx - 1, Math.max(0, u * F.gx - 0.5)), fy = Math.min(F.gy - 1, Math.max(0, v * F.gy - 0.5));
    var x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(F.gx - 1, x0 + 1), y1 = Math.min(F.gy - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
    function at(arr) {
      return (arr[y0 * F.gx + x0] * (1 - tx) + arr[y0 * F.gx + x1] * tx) * (1 - ty) + (arr[y1 * F.gx + x0] * (1 - tx) + arr[y1 * F.gx + x1] * tx) * ty;
    }
    return [at(F.dx) / F.w, at(F.dy) / F.h];     // in units of the frame width / height
  }

  // grayscale working copy from RGBA pixels already scaled to w x h
  function gray(rgba, w, h) {
    var g = new Float32Array(w * h);
    for (var i = 0; i < w * h; i++) g[i] = rgba[i * 4] * 0.299 + rgba[i * 4 + 1] * 0.587 + rgba[i * 4 + 2] * 0.114;
    return { data: g, w: w, h: h };
  }

  var api = { zoomModel: zoomModel, pairTask: pairTask, estimatePair: estimatePair, estimate: estimate, sample: sample, gray: gray, downsample: downsample };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TourFlow = api;
})(typeof window !== 'undefined' ? window : globalThis);
