// Pull evenly spaced, sharp frames out of a video file in the browser.
// For each target time it looks at a few nearby candidates and keeps the least blurred one,
// which matters for handheld walking footage.
(function (root) {
  'use strict';

  function once(el, ev, ms) {
    return new Promise(function (resolve, reject) {
      var t = setTimeout(function () { el.removeEventListener(ev, h); reject(new Error(ev + ' timeout')); }, ms || 8000);
      function h() { clearTimeout(t); el.removeEventListener(ev, h); resolve(); }
      el.addEventListener(ev, h);
    });
  }
  function seek(v, t) {
    t = Math.max(0, Math.min(v.duration || t, t));
    if (Math.abs(v.currentTime - t) < 1e-3) return Promise.resolve();
    var p = once(v, 'seeked');
    v.currentTime = t;
    return p;
  }
  // variance of horizontal+vertical gradients on a small grayscale copy: higher = sharper
  function sharpness(v, c) {
    var w = c.width, h = c.height, x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(v, 0, 0, w, h);
    var d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h), i, s = 0;
    for (i = 0; i < w * h; i++) g[i] = d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11;
    for (var y = 0; y < h - 1; y++) for (var xx = 0; xx < w - 1; xx++) {
      var a = g[y * w + xx], dx = g[y * w + xx + 1] - a, dy = g[(y + 1) * w + xx] - a;
      s += dx * dx + dy * dy;
    }
    return s / (w * h);
  }

  function open(file) {
    var url = URL.createObjectURL(file), v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    return once(v, 'loadedmetadata', 15000).then(function () {
      if (isFinite(v.duration)) return v;
      // some recorders write no duration: seeking far forward makes the browser compute it
      v.currentTime = 1e9;
      return once(v, 'durationchange', 5000).catch(function () {}).then(function () { v.currentTime = 0; return v; });
    }).then(function (vv) { vv.dataset.url = url; return vv; });
  }
  function release(v) { if (v.dataset.url) URL.revokeObjectURL(v.dataset.url); v.removeAttribute('src'); v.load(); }

  // opts: { count, start, end, maxSide = 1600, quality = 0.85, sharp = true, onProgress(i, n), blur(canvas) -> Promise }
  function extract(file, opts) {
    opts = opts || {};
    return open(file).then(function (v) {
      var dur = v.duration, start = Math.max(0, opts.start || 0), end = Math.min(dur, opts.end || dur), n = Math.max(1, opts.count | 0 || 12);
      var maxSide = opts.maxSide || 1600, scale = Math.min(1, maxSide / Math.max(v.videoWidth, v.videoHeight));
      var big = document.createElement('canvas'); big.width = Math.round(v.videoWidth * scale); big.height = Math.round(v.videoHeight * scale);
      var small = document.createElement('canvas'); small.width = 96; small.height = Math.max(2, Math.round(96 * v.videoHeight / v.videoWidth));
      var step = n > 1 ? (end - start) / (n - 1) : 0, win = Math.min(step * 0.3, 0.2);
      var frames = [], chain = Promise.resolve();
      for (var i = 0; i < n; i++) (function (i) {
        chain = chain.then(function () {
          var t = n > 1 ? start + step * i : (start + end) / 2, best = t;
          var cands = opts.sharp === false || win < 0.02 ? [t] : [t - win, t, t + win].map(function (x) { return Math.max(start, Math.min(end, x)); });
          var bestS = -1, p = Promise.resolve();
          cands.forEach(function (c) {
            p = p.then(function () { return seek(v, c); }).then(function () {
              var s = cands.length > 1 ? sharpness(v, small) : 0;
              if (s > bestS) { bestS = s; best = c; }
            });
          });
          return p.then(function () { return seek(v, best); }).then(function () {
            big.getContext('2d').drawImage(v, 0, 0, big.width, big.height);
            return opts.blur ? opts.blur(big) : null;
          }).then(function () {
            return new Promise(function (res) { big.toBlob(function (b) { res(b); }, 'image/jpeg', opts.quality || 0.85); });
          }).then(function (blob) {
            frames.push({ blob: blob, time: best, width: big.width, height: big.height });
            if (opts.onProgress) opts.onProgress(i + 1, n);
          });
        });
      })(i);
      return chain.then(function () { release(v); return frames; }, function (e) { release(v); throw e; });
    });
  }

  root.RVVideoFrames = { extract: extract, open: open, release: release };
})(window);
