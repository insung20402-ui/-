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
    return { x: iw / 2 + x * fp, y: ih / 2 - y * fp };
  }

  // Blend one photo into `dst` (RGBA, W x W/2). `src` is RGBA iw x ih.
  // shot: { heading, hfov, pitch?, roll? }. Edges are feathered so overlapping
  // shots and the synthetic backdrop meet without a hard seam.
  function reprojectInto(dst, W, src, iw, ih, shot) {
    var H = W / 2, ppd = W / 360;
    var b = basis(shot.heading, shot.pitch || 0, shot.roll || 0);
    var fp = focalPx(iw, shot.hfov);
    var feather = Math.max(2, Math.min(iw, ih) * 0.05);
    var hv = Math.atan((ih / 2) / fp) / D2R;                 // half vertical fov
    var hh = shot.hfov / 2;
    var wide = hh > 80 || hv > 80;                           // too wide for a safe column window
    var span = Math.min(180, Math.max(hh, hv) * 1.5 + Math.abs(shot.roll || 0) + 5);
    var cx0 = Math.floor(norm360(shot.heading - 90 - span) * ppd);
    var ncols = wide ? W : Math.min(W, Math.ceil(span * 2 * ppd) + 1);
    var pLo = (shot.pitch || 0) - Math.max(hv, hh) * 1.5 - 5, pHi = (shot.pitch || 0) + Math.max(hv, hh) * 1.5 + 5;
    var y0 = Math.max(0, Math.floor((90 - Math.min(90, pHi)) * ppd));
    var y1 = Math.min(H - 1, Math.ceil((90 - Math.max(-90, pLo)) * ppd));
    if (wide) { y0 = 0; y1 = H - 1; cx0 = 0; }

    for (var j = y0; j <= y1; j++) {
      var pitch = (90 - (j + 0.5) / ppd) * D2R, cp = Math.cos(pitch), sp = Math.sin(pitch);
      for (var k = 0; k < ncols; k++) {
        var i = (cx0 + k) % W;
        var bear = ((i + 0.5) / ppd + 90) * D2R;
        var dx = Math.sin(bear) * cp, dy = sp, dz = Math.cos(bear) * cp;
        var z = dx * b.f[0] + dy * b.f[1] + dz * b.f[2];
        if (z <= 1e-6) continue;
        var sx = iw / 2 + (dx * b.right[0] + dy * b.right[1] + dz * b.right[2]) / z * fp;
        var sy = ih / 2 - (dx * b.up[0] + dy * b.up[1] + dz * b.up[2]) / z * fp;
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
          dst[o + c] = dst[o + c] * (1 - a) + v * a;
        }
        dst[o + 3] = 255;
      }
    }
  }

  var api = { project: project, reprojectInto: reprojectInto, focalPx: focalPx, basis: basis };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RVReproject = api;
})(typeof window !== 'undefined' ? window : globalThis);
