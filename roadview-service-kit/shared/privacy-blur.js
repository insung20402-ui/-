// Browser-side privacy masking for ordinary photos, applied before the image is stored.
// Faces: uses the platform FaceDetector (Chrome/Android) when it exists; otherwise nothing
// is detected and the caller must route the photo to manual review. Plates: no browser API
// exists, so plates need a server-side model (see docs/service-guide.md section on privacy).
(function (root) {
  'use strict';

  function pixelate(ctx, x, y, w, h, cell) {
    x = Math.max(0, Math.floor(x)); y = Math.max(0, Math.floor(y));
    w = Math.floor(w); h = Math.floor(h);
    var small = document.createElement('canvas');
    small.width = Math.max(1, Math.ceil(w / cell)); small.height = Math.max(1, Math.ceil(h / cell));
    var sctx = small.getContext('2d');
    sctx.drawImage(ctx.canvas, x, y, w, h, 0, 0, small.width, small.height);
    var prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, small.width, small.height, x, y, w, h);
    ctx.imageSmoothingEnabled = prev;
  }

  // Expand a detected box so hair/ears are covered too.
  function grow(b, f, W, H) {
    var dx = b.width * f, dy = b.height * f;
    var x = Math.max(0, b.x - dx), y = Math.max(0, b.y - dy);
    return { x: x, y: y, width: Math.min(W - x, b.width + 2 * dx), height: Math.min(H - y, b.height + 2 * dy) };
  }

  function available() { return typeof root.FaceDetector === 'function'; }

  // canvas is modified in place. Resolves { faces, supported }.
  function blurFaces(canvas) {
    if (!available()) return Promise.resolve({ faces: 0, supported: false });
    var det;
    try { det = new root.FaceDetector({ fastMode: true, maxDetectedFaces: 40 }); } catch (e) { return Promise.resolve({ faces: 0, supported: false }); }
    return det.detect(canvas).then(function (found) {
      var ctx = canvas.getContext('2d');
      found.forEach(function (f) {
        var b = grow(f.boundingBox, 0.25, canvas.width, canvas.height);
        pixelate(ctx, b.x, b.y, b.width, b.height, Math.max(6, b.width / 8));
      });
      return { faces: found.length, supported: true };
    }, function () { return { faces: 0, supported: false }; });
  }

  root.RVPrivacy = { blurFaces: blurFaces, pixelate: pixelate, available: available };
})(window);
