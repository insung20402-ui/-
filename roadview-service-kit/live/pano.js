// Builds the equirectangular canvas for a node from its real photos. There is no
// synthetic scenery: a full 360° photo fills the sphere; ordinary photos are
// re-projected into place over a sky/ground backdrop sampled from the photos, and
// the more directions are shot, the less backdrop shows.
(function (root) {
  'use strict';
  var RP = root.RVReproject, D2R = Math.PI / 180;
  var LOD = { low: 1024, high: 4096 };
  var cache = { low: new Map(), high: new Map() }, LIMIT = { low: 40, high: 5 };

  function norm360(a) { return ((a % 360) + 360) % 360; }
  function px(bmp) {
    var c = document.createElement('canvas');
    c.width = bmp.width; c.height = bmp.height;
    var x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
    return { ctx: x, data: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height, canvas: c };
  }

  function build(node, W) {
    var H = W / 2, ppd = W / 360;
    var canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    var ctx = canvas.getContext('2d');
    return Promise.all(node.shots.map(function (s) { return root.RVStore.getImage(s.id); })).then(function (imgs) {
      var eqIdx = -1;
      node.shots.forEach(function (s, i) { if (s.kind === 'equirect') eqIdx = i; });
      var flats = node.shots.map(function (s, i) { return { s: s, img: imgs[i] }; })
        .filter(function (x) { return x.s.kind !== 'equirect'; });

      if (eqIdx >= 0) {
        // image centre faces `heading`; texture column 0 is bearing 90 (east)
        var x0 = norm360((node.shots[eqIdx].heading || 0) - 270) * ppd;
        ctx.drawImage(imgs[eqIdx], x0, 0, W, H);
        ctx.drawImage(imgs[eqIdx], x0 - W, 0, W, H);
      }
      if (!flats.length) return canvas;

      var out = ctx.getImageData(0, 0, W, H);
      var items = flats.map(function (f) {
        var s = f.s, hfov = s.hfov || 70;
        var sc = Math.min(1, W * hfov / 360 * 1.3 / f.img.width);
        var t = document.createElement('canvas');
        t.width = Math.max(2, Math.round(f.img.width * sc)); t.height = Math.max(2, Math.round(f.img.height * sc));
        t.getContext('2d').drawImage(f.img, 0, 0, t.width, t.height);
        return { src: t.getContext('2d').getImageData(0, 0, t.width, t.height).data, iw: t.width, ih: t.height,
          shot: { heading: s.heading || 0, hfov: hfov, pitch: s.pitch || 0, roll: s.roll || 0, k1: s.k1 || 0, k2: s.k2 || 0, feather: 0.12 } };
      });
      if (eqIdx < 0) RP.smartBackdrop(out.data, W, items);      // soft continuation of the photos, not scenery
      items.forEach(function (it) { RP.reprojectInto(out.data, W, it.src, it.iw, it.ih, it.shot); });
      ctx.putImageData(out, 0, 0);
      return canvas;
    });
  }

  function key(node) {
    return node.id + '|' + node.shots.map(function (s) { return [s.id, s.heading, s.hfov, s.pitch, s.roll, s.k1].join(','); }).join(';');
  }
  function get(node, lod) {
    lod = lod === 'high' ? 'high' : 'low';
    var k = key(node), c = cache[lod], hit = c.get(k);
    if (hit) { c.delete(k); c.set(k, hit); return hit; }
    var p = build(node, LOD[lod]);
    c.set(k, p);
    p.catch(function () { c.delete(k); });
    if (c.size > LIMIT[lod]) c.delete(c.keys().next().value);
    return p;
  }
  function isCached(node, lod) { return cache[lod === 'high' ? 'high' : 'low'].has(key(node)); }
  function forget(nodeId) {
    ['low', 'high'].forEach(function (l) {
      Array.from(cache[l].keys()).forEach(function (k) { if (k.indexOf(nodeId + '|') === 0) cache[l].delete(k); });
    });
  }

  root.RVPano = { get: get, isCached: isCached, forget: forget };
})(window);
