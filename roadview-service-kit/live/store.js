// Browser storage for real panoramas: node records + image blobs in IndexedDB.
// Stands in for object storage + a spatial DB; falls back to memory when IndexedDB is blocked.
// Stored images are re-encoded JPEGs, so the original EXIF (including GPS) is not kept.
(function (root) {
  'use strict';
  var DB = 'roadview-live', MAX_W = { equirect: 6144, flat: 2560 };
  var nodes = [], blobs = {}, images = {}, db = null, persistent = false;

  function open() {
    return new Promise(function (resolve) {
      var req;
      try { req = root.indexedDB.open(DB, 1); } catch (e) { resolve(null); return; }
      req.onupgradeneeded = function () {
        req.result.createObjectStore('nodes', { keyPath: 'id' });
        req.result.createObjectStore('blobs', { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = req.onblocked = function () { resolve(null); };
    });
  }
  function tx(store, mode, fn) {
    if (!db) return Promise.resolve(null);
    return new Promise(function (resolve, reject) {
      var t = db.transaction(store, mode), r = fn(t.objectStore(store));
      t.oncomplete = function () { resolve(r && r.result); };
      t.onerror = t.onabort = function () { reject(t.error); };
    });
  }

  var ready = open().then(function (d) {
    db = d; persistent = !!d;
    return Promise.all([tx('nodes', 'readonly', function (s) { return s.getAll(); }),
      tx('blobs', 'readonly', function (s) { return s.getAll(); })]);
  }).then(function (res) {
    nodes = (res[0] || []).sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    (res[1] || []).forEach(function (b) { blobs[b.id] = b.blob; });
  });

  // Decode + downscale + re-encode. Returns { blob, width, height }.
  function prepare(file, kind) {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bmp) {
      var maxW = MAX_W[kind === 'equirect' ? 'equirect' : 'flat'], sc = Math.min(1, maxW / bmp.width);
      var c = document.createElement('canvas');
      c.width = Math.round(bmp.width * sc); c.height = Math.round(bmp.height * sc);
      c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      if (bmp.close) bmp.close();
      return new Promise(function (resolve) {
        c.toBlob(function (blob) { resolve({ blob: blob, width: c.width, height: c.height }); }, 'image/jpeg', 0.88);
      });
    });
  }

  function addNode(node, blobMap) {
    nodes.push(node);
    var ids = Object.keys(blobMap);
    ids.forEach(function (id) { blobs[id] = blobMap[id]; });
    return ready.then(function () {
      return Promise.all([tx('nodes', 'readwrite', function (s) { return s.put(node); })].concat(
        ids.map(function (id) { return tx('blobs', 'readwrite', function (s) { return s.put({ id: id, blob: blobMap[id] }); }); })));
    });
  }
  function updateNode(node) { return tx('nodes', 'readwrite', function (s) { return s.put(node); }); }
  function removeNode(id) {
    var n = nodes.filter(function (x) { return x.id === id; })[0];
    nodes = nodes.filter(function (x) { return x.id !== id; });
    if (!n) return Promise.resolve();
    return Promise.all([tx('nodes', 'readwrite', function (s) { return s.delete(id); })].concat(n.shots.map(function (sh) {
      delete blobs[sh.id]; delete images[sh.id];
      return tx('blobs', 'readwrite', function (s) { return s.delete(sh.id); });
    })));
  }
  function clear() {
    var all = nodes.slice();
    return Promise.all(all.map(function (n) { return removeNode(n.id); }));
  }

  // decoded image for a shot (cached)
  // Decoded bitmaps are big (a 2560x1920 photo is ~20 MB), so only the most recent are kept.
  var IMAGE_LIMIT = 16;
  function getImage(shotId) {
    if (images[shotId]) {
      var hit = images[shotId]; delete images[shotId]; images[shotId] = hit;   // refresh recency
      return hit;
    }
    var b = blobs[shotId];
    if (!b) return Promise.reject(new Error('missing image ' + shotId));
    images[shotId] = createImageBitmap(b);
    var ids = Object.keys(images);
    if (ids.length > IMAGE_LIMIT) delete images[ids[0]];
    return images[shotId];
  }

  root.RVStore = {
    ready: ready, prepare: prepare, addNode: addNode, updateNode: updateNode, removeNode: removeNode,
    clear: clear, getImage: getImage,
    nodes: function () { return nodes; },
    isPersistent: function () { return persistent; }
  };
})(window);
