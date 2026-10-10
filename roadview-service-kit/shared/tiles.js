// Multi-resolution tile pyramid for an equirectangular panorama (browser side).
// Level z has (2^z * 2) x (2^z) tiles of `tile` px; the top level is the full image.
// URLs follow the guide: /tiles/{panoId}/{revision}/{z}/{x}_{y}.jpg, so a new privacy
// revision gets new URLs and CDN caches never need purging.
(function (root) {
  'use strict';

  function plan(width, tile) {
    tile = tile || 512;
    var levels = Math.max(1, Math.ceil(Math.log2(width / 2 / tile)) + 1), out = [];
    for (var z = 0; z < levels; z++) out.push({ z: z, cols: Math.pow(2, z) * 2, rows: Math.pow(2, z) });
    return { tile: tile, levels: out, width: tile * out[out.length - 1].cols };
  }

  function path(panoId, revision, z, x, y) {
    return '/tiles/' + panoId + '/' + revision + '/' + z + '/' + x + '_' + y + '.jpg';
  }

  // canvas -> [{ path, blob }] + manifest
  function slice(canvas, panoId, revision, tile) {
    var p = plan(canvas.width, tile), jobs = [];
    p.levels.forEach(function (lv) {
      var lw = lv.cols * p.tile, lh = lv.rows * p.tile;
      var scaled = document.createElement('canvas');
      scaled.width = lw; scaled.height = lh;
      scaled.getContext('2d').drawImage(canvas, 0, 0, lw, lh);
      for (var y = 0; y < lv.rows; y++) for (var x = 0; x < lv.cols; x++) {
        (function (x, y) {
          var t = document.createElement('canvas');
          t.width = t.height = p.tile;
          t.getContext('2d').drawImage(scaled, x * p.tile, y * p.tile, p.tile, p.tile, 0, 0, p.tile, p.tile);
          jobs.push(new Promise(function (res) {
            t.toBlob(function (blob) { res({ path: path(panoId, revision, lv.z, x, y), blob: blob }); }, 'image/jpeg', 0.82);
          }));
        })(x, y);
      }
    });
    return Promise.all(jobs).then(function (tiles) {
      return { manifest: { panoId: panoId, revision: revision, tile: p.tile, levels: p.levels,
        template: '/tiles/' + panoId + '/' + revision + '/{z}/{x}_{y}.jpg' }, tiles: tiles };
    });
  }

  // Which tiles does a view need? Used by a tile loader to fetch only what is on screen.
  function visible(plan_, z, heading, fov, aspect) {
    var lv = plan_.levels[z], hHalf = fov * Math.max(1, aspect) / 2 + 5;
    var out = [];
    for (var x = 0; x < lv.cols; x++) {
      var centre = ((x + 0.5) / lv.cols * 360 + 90) % 360;
      var d = Math.abs(((centre - heading + 540) % 360) - 180);
      if (d <= hHalf + 180 / lv.cols) for (var y = 0; y < lv.rows; y++) out.push({ z: z, x: x, y: y });
    }
    return out;
  }

  var api = { plan: plan, path: path, slice: slice, visible: visible };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RVTiles = api;
})(typeof window !== 'undefined' ? window : globalThis);
