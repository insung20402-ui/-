// Rectilinear (ordinary lens) photo -> equirectangular panorama re-projection.
// Pure pixel math, no DOM: runs in the browser (pano-render.js) and in Node tests.
//
// Conventions match the viewer: the texture column for compass bearing b is
// norm360(b - 90) * W / 360, and row 0 is straight up (pitch +90).
(function (root) {
  'use strict';
  var D2R = Math.PI / 180;

  function norm360(a) { return ((a % 360) + 360) % 360; }

  // Camera basis for a shot facing `heading` (compass deg), tilted `pitch` deg up, rolled `roll` deg clockwise.
  function basis(heading, pitch, roll) {
    var h = heading * D2R, p = pitch * D2R, r = roll * D2R;
    var f = [Math.sin(h) * Math.cos(p), Math.sin(p), Math.cos(h) * Math.cos(p)];   // east, up, north
    var rt = [Math.cos(h), 0, -Math.sin(h)];
    var up = [-Math.sin(h) * Math.sin(p), Math.cos(p), -Math.cos(h) * Math.sin(p)];
    var cr = Math.cos(r), sr = Math.sin(r);
    return {
      f: f,
      right: [rt[0] * cr - up[0] * sr, rt[1] * cr - up[1] * sr, rt[2] * cr - up[2] * sr],
      up: [rt[0] * sr + up[0] * cr, rt[1] * sr + up[1] * cr, rt[2] * sr + up[2] * cr]
    };
  }

  // Focal length in source pixels from the horizontal field of view.
  function focalPx(iw, hfov) { return (iw / 2) / Math.tan(hfov * D2R / 2); }

  // Brown-Conrady radial model. (x, y) are ideal coordinates in focal lengths; the
  // lens bent the photo, so the pixel lives at the distorted position. k1 < 0 is
  // barrel (wide phone lenses), k1 > 0 pincushion.
  function distort(x, y, k1, k2) {
    var r2 = x * x + y * y, g = 1 + k1 * r2 + k2 * r2 * r2;
    return g;
  }

  // Largest ideal radius r^2 for which the distortion curve r*g(r) still increases.
  // Beyond it the polynomial folds back and would paint mirrored garbage into the photo.
  function maxR2(k1, k2) {
    if (!k1 && !k2) return Infinity;
    for (var r = 0.01; r < 50; r += 0.01) {
      var r2 = r * r;
      if (1 + 3 * k1 * r2 + 5 * k2 * r2 * r2 <= 0) return (r - 0.01) * (r - 0.01);
    }
    return Infinity;
  }

  // Where does the world direction (bearing, pitch) land in the source photo?
  // Returns {x, y} in source pixels, or null when it is behind the camera.
  function project(bearing, pitch, iw, ih, shot) {
    var b = basis(shot.heading, shot.pitch || 0, shot.roll || 0);
    var br = bearing * D2R, pr = pitch * D2R;
    var d = [Math.sin(br) * Math.cos(pr), Math.sin(pr), Math.cos(br) * Math.cos(pr)];
    var z = d[0] * b.f[0] + d[1] * b.f[1] + d[2] * b.f[2];
    if (z <= 1e-6) return null;
    var fp = focalPx(iw, shot.hfov);
    var x = (d[0] * b.right[0] + d[1] * b.right[1] + d[2] * b.right[2]) / z;
    var y = (d[0] * b.up[0] + d[1] * b.up[1] + d[2] * b.up[2]) / z;
    if (x * x + y * y > maxR2(shot.k1 || 0, shot.k2 || 0)) return null;
    var g = distort(x, y, shot.k1 || 0, shot.k2 || 0);
    return { x: iw / 2 + x * g * fp, y: ih / 2 - y * g * fp };
  }

  // Blend one photo into `dst` (RGBA, W x W/2). `src` is RGBA iw x ih.
  // shot: { heading, hfov, pitch?, roll? }. Edges are feathered so overlapping
  // shots and the synthetic backdrop meet without a hard seam.
  // rows (optional): [from, to) restricts the work to a band so callers can yield between bands.
  function reprojectInto(dst, W, src, iw, ih, shot, cov, rows) {
    var H = W / 2, ppd = W / 360;
    var b = basis(shot.heading, shot.pitch || 0, shot.roll || 0);
    var fp = focalPx(iw, shot.hfov), k1 = shot.k1 || 0, k2 = shot.k2 || 0, rmax2 = maxR2(k1, k2);
    var feather = Math.max(2, Math.min(iw, ih) * (shot.feather || 0.05));
    // Footprint = cone around the optical axis through the photo's corners. With lens
    // distortion the corner sits at a larger ideal radius, so solve r*g(r) = corner radius.
    var rd = Math.hypot(iw / 2, ih / 2) / fp, rIdeal = rd;
    if (k1 || k2) {
      var lim = Math.sqrt(rmax2), r = 0;
      while (r < lim && r * distort(r, 0, k1, k2) < rd) r += 0.005;
      rIdeal = Math.min(r, lim);
    }
    var radius = Math.atan(rIdeal) / D2R + 1;                 // degrees
    var tilt = shot.pitch || 0;
    var full = radius >= 89 || Math.abs(tilt) + radius >= 90;  // footprint covers a pole: spans all longitudes
    var span = full ? 180 : Math.asin(Math.min(1, Math.sin(radius * D2R) / Math.cos(tilt * D2R))) / D2R + 1;
    var cx0 = full ? 0 : Math.floor(norm360(shot.heading - 90 - span) * ppd);
    var ncols = full ? W : Math.min(W, Math.ceil(span * 2 * ppd) + 2);
    var y0 = Math.max(0, Math.floor((90 - Math.min(90, tilt + radius)) * ppd));
    var y1 = Math.min(H - 1, Math.ceil((90 - Math.max(-90, tilt - radius)) * ppd));
    if (rows) { y0 = Math.max(y0, rows[0]); y1 = Math.min(y1, rows[1] - 1); }

    for (var j = y0; j <= y1; j++) {
      var pitch = (90 - (j + 0.5) / ppd) * D2R, cp = Math.cos(pitch), sp = Math.sin(pitch);
      for (var k = 0; k < ncols; k++) {
        var i = (cx0 + k) % W;
        var bear = ((i + 0.5) / ppd + 90) * D2R;
        var dx = Math.sin(bear) * cp, dy = sp, dz = Math.cos(bear) * cp;
        var z = dx * b.f[0] + dy * b.f[1] + dz * b.f[2];
        if (z <= 1e-6) continue;
        var ux = (dx * b.right[0] + dy * b.right[1] + dz * b.right[2]) / z;
        var uy = (dx * b.up[0] + dy * b.up[1] + dz * b.up[2]) / z;
        if (ux * ux + uy * uy > rmax2) continue;
        var dg = k1 || k2 ? distort(ux, uy, k1, k2) : 1;
        var sx = iw / 2 + ux * dg * fp;
        var sy = ih / 2 - uy * dg * fp;
        if (sx < 0 || sy < 0 || sx > iw - 1 || sy > ih - 1) continue;
        var edge = Math.min(sx, iw - 1 - sx, sy, ih - 1 - sy);
        var a = edge >= feather ? 1 : edge / feather;
        a = a * a * (3 - 2 * a);                              // smoothstep
        // bilinear sample
        var xi = sx | 0, yi = sy | 0, fx = sx - xi, fy = sy - yi;
        var xj = Math.min(iw - 1, xi + 1), yj = Math.min(ih - 1, yi + 1);
        var o00 = (yi * iw + xi) * 4, o10 = (yi * iw + xj) * 4, o01 = (yj * iw + xi) * 4, o11 = (yj * iw + xj) * 4;
        var o = (j * W + i) * 4;
        for (var c = 0; c < 3; c++) {
          var v = (src[o00 + c] * (1 - fx) + src[o10 + c] * fx) * (1 - fy) +
                  (src[o01 + c] * (1 - fx) + src[o11 + c] * fx) * fy;
          dst[o + c] = dst[o + c] * (1 - a) + v * a;     // with `cov`, dst is premultiplied colour
        }
        if (cov) cov[j * W + i] = cov[j * W + i] * (1 - a) + a;
        dst[o + 3] = 255;
      }
    }
  }

  function lowResFill(items, wl, hl) {
    var n = wl * hl;
    var P = new Float32Array(n * 3), cov = new Float32Array(n);
    var buf = new Uint8ClampedArray(n * 4), cv = new Float32Array(n);
    items.forEach(function (it) {
      var shot = {}; for (var k in it.shot) shot[k] = it.shot[k];
      shot.feather = 0.02;
      reprojectInto(buf, wl, it.src, it.iw, it.ih, shot, cv);
    });
    // reprojectInto blends into a premultiplied buffer when given cov (buf starts at 0)
    for (var i = 0; i < n; i++) { P[i * 3] = buf[i * 4]; P[i * 3 + 1] = buf[i * 4 + 1]; P[i * 3 + 2] = buf[i * 4 + 2]; cov[i] = cv[i]; }
    // pull: weighted 2x2 averages down to a handful of pixels
    var levels = [{ w: wl, h: hl, P: P, a: cov }];
    while (levels[levels.length - 1].w > 6) {
      var up = levels[levels.length - 1], w = up.w / 2, h = up.h / 2, p = new Float32Array(w * h * 3), a = new Float32Array(w * h);
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var o = y * w + x;
        for (var dy = 0; dy < 2; dy++) for (var dx = 0; dx < 2; dx++) {
          var q = (y * 2 + dy) * up.w + x * 2 + dx;
          a[o] += up.a[q] / 4; p[o * 3] += up.P[q * 3] / 4; p[o * 3 + 1] += up.P[q * 3 + 1] / 4; p[o * 3 + 2] += up.P[q * 3 + 2] / 4;
        }
      }
      levels.push({ w: w, h: h, P: p, a: a });
    }
    // push: fill from coarser levels where coverage is weak
    var col = levels.map(function (l) {
      var c = new Float32Array(l.w * l.h * 3);
      for (var q = 0; q < l.w * l.h; q++) {
        var aa = Math.max(l.a[q], 1e-6);
        c[q * 3] = l.P[q * 3] / aa; c[q * 3 + 1] = l.P[q * 3 + 1] / aa; c[q * 3 + 2] = l.P[q * 3 + 2] / aa;
      }
      return c;
    });
    var mean = [128, 128, 128];
    for (var li = levels.length - 1; li >= 0; li--) {
      var L = levels[li], C = col[li], cvg = new Float32Array(L.w * L.h);
      for (var qq = 0; qq < L.w * L.h; qq++) cvg[qq] = Math.min(1, L.a[qq] * 4);   // 4x: sparse coverage still counts
      if (li === levels.length - 1) {
        for (var z = 0; z < L.w * L.h; z++) if (L.a[z] < 1e-4) { C[z * 3] = mean[0]; C[z * 3 + 1] = mean[1]; C[z * 3 + 2] = mean[2]; }
        continue;
      }
      var Lc = levels[li + 1], Cc = col[li + 1];
      for (var y2 = 0; y2 < L.h; y2++) for (var x2 = 0; x2 < L.w; x2++) {
        var fx = (x2 + 0.5) / 2 - 0.5, fy = (y2 + 0.5) / 2 - 0.5;
        var x0 = Math.floor(fx), y0 = Math.floor(fy), tx = fx - x0, ty = fy - y0, o2 = y2 * L.w + x2, r = [0, 0, 0];
        for (var by = 0; by < 2; by++) for (var bx = 0; bx < 2; bx++) {
          var xx = ((x0 + bx) % Lc.w + Lc.w) % Lc.w, yy = Math.max(0, Math.min(Lc.h - 1, y0 + by));
          var wgt = (bx ? tx : 1 - tx) * (by ? ty : 1 - ty), qi = (yy * Lc.w + xx) * 3;
          r[0] += Cc[qi] * wgt; r[1] += Cc[qi + 1] * wgt; r[2] += Cc[qi + 2] * wgt;
        }
        var cw = cvg[o2];
        C[o2 * 3] = C[o2 * 3] * cw + r[0] * (1 - cw);
        C[o2 * 3 + 1] = C[o2 * 3 + 1] * cw + r[1] * (1 - cw);
        C[o2 * 3 + 2] = C[o2 * 3 + 2] * cw + r[2] * (1 - cw);
      }
    }
    return col;
  }

  // Soft environment around the photos. Photos are composited at ~1 px/deg, then every
  // uncovered pixel is filled by push-pull diffusion of the surrounding photo colours
  // (so buildings bleed into soft colour instead of a flat sky/ground gradient), and the
  // result is upsampled into `dst` (RGBA, W x W/2). items: [{ src, iw, ih, shot }].
  function smartBackdrop(dst, W, items, state, rows) {
    state = state || {};
    var wl = 384, hl = 192;
    if (!state.col) state.col = lowResFill(items, wl, hl);
    var base = state.col[0], H = W / 2, r0 = rows ? rows[0] : 0, r1 = rows ? Math.min(H, rows[1]) : H;
    // bilinear upsample (wrapping in longitude) into dst
    for (var j = r0; j < r1; j++) {
      var sy = (j + 0.5) / H * hl - 0.5, yA = Math.max(0, Math.min(hl - 1, Math.floor(sy))), yB = Math.min(hl - 1, yA + 1), ty2 = Math.max(0, Math.min(1, sy - yA));
      for (var i2 = 0; i2 < W; i2++) {
        var sx = (i2 + 0.5) / W * wl - 0.5, xA = Math.floor(sx), tx2 = sx - xA;
        var xa = (xA % wl + wl) % wl, xb = (xa + 1) % wl, od = (j * W + i2) * 4;
        for (var ch = 0; ch < 3; ch++) {
          var top = base[(yA * wl + xa) * 3 + ch] * (1 - tx2) + base[(yA * wl + xb) * 3 + ch] * tx2;
          var bot = base[(yB * wl + xa) * 3 + ch] * (1 - tx2) + base[(yB * wl + xb) * 3 + ch] * tx2;
          dst[od + ch] = top * (1 - ty2) + bot * ty2;
        }
        dst[od + 3] = 255;
      }
    }
  }

  // Mean colour of the top and bottom bands of a photo: what the sky and the ground
  // around it most plausibly look like. src is RGBA iw x ih.
  function edgeColors(src, iw, ih) {
    var band = Math.max(1, Math.round(ih * 0.1)), sky = [0, 0, 0], gnd = [0, 0, 0], n = band * iw;
    for (var y = 0; y < band; y++) for (var x = 0; x < iw; x++) {
      var t = (y * iw + x) * 4, u = ((ih - 1 - y) * iw + x) * 4;
      for (var c = 0; c < 3; c++) { sky[c] += src[t + c]; gnd[c] += src[u + c]; }
    }
    for (var k = 0; k < 3; k++) { sky[k] /= n; gnd[k] /= n; }
    return { sky: sky, ground: gnd };
  }

  // Fill an equirect RGBA buffer with a plausible environment around the photos:
  // sky colour above the horizon, ground colour below, darkening toward the poles.
  function backdrop(dst, W, sky, ground) {
    var H = W / 2;
    for (var j = 0; j < H; j++) {
      var pitch = 90 - (j + 0.5) / (W / 360), up = pitch >= 0, t = Math.abs(pitch) / 90;
      var base = up ? sky : ground, f = up ? 1 - 0.18 * t : 1 - 0.35 * t;
      for (var i = 0; i < W; i++) {
        var o = (j * W + i) * 4;
        dst[o] = base[0] * f; dst[o + 1] = base[1] * f; dst[o + 2] = base[2] * f; dst[o + 3] = 255;
      }
    }
  }

  var api = { smartBackdrop: smartBackdrop, edgeColors: edgeColors, backdrop: backdrop, project: project, reprojectInto: reprojectInto, focalPx: focalPx, basis: basis };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RVReproject = api;
})(typeof window !== 'undefined' ? window : globalThis);
