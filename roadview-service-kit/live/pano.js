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

  // yield to the event loop so a high-resolution build never freezes dragging/clicks
  var chan = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null, waiters = [];
  if (chan) chan.port1.onmessage = function () { var w = waiters.shift(); if (w) w(); };
  function tick() { return new Promise(function (r) { if (chan) { waiters.push(r); chan.port2.postMessage(0); } else setTimeout(r, 0); }); }
  function inBands(H, step, fn) {
    var chain = Promise.resolve();
    for (var a = 0; a < H; a += step) (function (a) { chain = chain.then(function () { fn([a, a + step]); return tick(); }); })(a);
    return chain;
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
      var band = Math.max(16, Math.round(H / 24)), st = {};
      var p = eqIdx < 0 ? inBands(H, band, function (rows) { RP.smartBackdrop(out.data, W, items, st, rows); }) : Promise.resolve();
      items.forEach(function (it) {
        p = p.then(function () { return inBands(H, band, function (rows) { RP.reprojectInto(out.data, W, it.src, it.iw, it.ih, it.shot, null, rows); }); });
      });
      return p.then(function () { ctx.putImageData(out, 0, 0); return canvas; });
    });
  }

  function key(node) {
    return node.id + '|' + (serverUrl(node, 'high') ? 'srv' + node.rev : '') + '|' + node.shots.map(function (s) { return [s.id, s.heading, s.hfov, s.pitch, s.roll, s.k1].join(','); }).join(';');
  }
  // server-rendered equirect (see server/render-worker.js), when it is current for this revision
  function serverUrl(node, lod) {
    var r = node.render;
    return root.RVStore.isRemote() && r && r.status === 'done' && r.rev === node.rev
      ? '/pano/' + encodeURIComponent(node.id) + '/' + node.rev + '-' + lod + '.jpg' : null;
  }
  function fromServer(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        var c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0); resolve(c);
      };
      img.onerror = function () { reject(new Error('pano load failed')); };
      img.src = url;
    });
  }
  function get(node, lod) {
    lod = lod === 'high' ? 'high' : 'low';
    var k = key(node), c = cache[lod], hit = c.get(k);
    if (hit) { c.delete(k); c.set(k, hit); return hit; }
    var su = serverUrl(node, lod === 'high' ? 'high' : 'low');
    var p = su ? fromServer(su).catch(function () { return build(node, LOD[lod]); }) : build(node, LOD[lod]);
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
