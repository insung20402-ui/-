// Registered photos (back-office uploads). Persisted in the browser's
// IndexedDB so every screen opened from the same origin sees them; stands in
// for object storage + a metadata DB. Loading this script registers all
// stored photos with the renderer.
(function (root) {
  'use strict';
  var RV = root.RV;
  var DB_NAME = 'roadview-mock', STORE = 'photos';
  var MAX_WIDTH = { equirect: 4096, flat: 2048 };

  var db = null;
  var records = {};   // id -> { meta..., blob, img, url }
  var persistent = true;

  function openDb() {
    return new Promise(function (resolve) {
      var req;
      try { req = root.indexedDB.open(DB_NAME, 1); } catch (err) { resolve(null); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
    });
  }
  function tx(mode, fn) {
    return new Promise(function (resolve, reject) {
      if (!db) { resolve(null); return; }
      var t = db.transaction(STORE, mode);
      var req = fn(t.objectStore(STORE));
      t.oncomplete = function () { resolve(req && req.result); };
      t.onerror = function () { reject(t.error); };
    });
  }

  function decode(blob) {
    var url = URL.createObjectURL(blob);
    var img = new Image();
    img.src = url;
    return img.decode().then(function () { return { img: img, url: url }; });
  }

  function meta(rec) {
    return {
      id: rec.id, nodeId: rec.nodeId, year: rec.year, kind: rec.kind,
      heading: rec.heading, hfov: rec.hfov, pitch: rec.pitch, roll: rec.roll, k1: rec.k1, k2: rec.k2, source: rec.source, name: rec.name,
      width: rec.width, height: rec.height, bytes: rec.blob.size, createdAt: rec.createdAt
    };
  }

  // push the current shots of one capture into the renderer
  function register(nodeId, year) {
    var shots = Object.keys(records).map(function (id) { return records[id]; })
      .filter(function (r) { return r.nodeId === nodeId && r.year === year; })
      .sort(function (p, q) { return p.createdAt < q.createdAt ? -1 : 1; })
      .map(function (r) { return { img: r.img, kind: r.kind, heading: r.heading, hfov: r.hfov, pitch: r.pitch, roll: r.roll, k1: r.k1, k2: r.k2 }; });
    RV.setNodePhotos(nodeId, year, shots);
  }

  function hydrate(stored) {
    return decode(stored.blob).then(function (d) {
      stored.img = d.img;
      stored.url = d.url;
      records[stored.id] = stored;
    });
  }

  var ready = openDb().then(function (opened) {
    db = opened;
    persistent = !!opened;
    return tx('readonly', function (s) { return s.getAll(); });
  }).then(function (all) {
    return Promise.all((all || []).map(hydrate));
  }).then(function () {
    var seen = {};
    Object.keys(records).forEach(function (id) {
      var r = records[id], key = r.nodeId + '@' + r.year;
      if (!seen[key]) { seen[key] = true; register(r.nodeId, r.year); }
    });
    RV.emit('photos_changed', { reason: 'load' });
  });

  // Downscale + re-encode whatever the user supplied (File, Blob or canvas) to JPEG.
  function prepareImage(input, kind) {
    var maxW = MAX_WIDTH[kind === 'flat' ? 'flat' : 'equirect'];
    var bitmap = input instanceof HTMLCanvasElement
      ? Promise.resolve(input)
      : createImageBitmap(input, { imageOrientation: 'from-image' });
    return bitmap.then(function (src) {
      var scale = Math.min(1, maxW / src.width);
      var c = document.createElement('canvas');
      c.width = Math.round(src.width * scale);
      c.height = Math.round(src.height * scale);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      // ordinary photos get faces masked before they are ever stored
      var masked = kind === 'flat' && root.RVPrivacy ? root.RVPrivacy.blurFaces(c) : Promise.resolve({ faces: 0 });
      return masked.then(function (m) {
        return new Promise(function (resolve) {
          c.toBlob(function (blob) { resolve({ blob: blob, width: c.width, height: c.height, faces: m.faces }); }, 'image/jpeg', 0.85);
        });
      });
    });
  }

  // A photo whose aspect is ~2:1 is taken to be a 360° equirectangular capture.
  function guessKind(width, height) {
    return Math.abs(width / height - 2) < 0.06 ? 'equirect' : 'flat';
  }

  // input: { nodeId, year, file (File|Blob|canvas), kind?, heading?, hfov?, name?, source? }
  // year goes through resolveYear so a photo always lands on an existing capture.
  function add(input) {
    var node = RV.getNode(input.nodeId);
    if (!node) return Promise.reject(new Error('unknown node ' + input.nodeId));
    var year = RV.resolveYear(node, input.year);
    return ready.then(function () {
      return prepareImage(input.file, input.kind || 'equirect');
    }).then(function (p) {
      var kind = input.kind || guessKind(p.width, p.height);
      var rec = {
        id: 'ph-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
        nodeId: node.id, year: year, kind: kind,
        heading: input.heading === undefined || input.heading === null ? node.heading : RV.norm360(input.heading),
        hfov: kind === 'flat' ? (input.hfov || 65) : 360,
        pitch: kind === 'flat' ? Math.max(-60, Math.min(60, input.pitch || 0)) : 0,
        roll: kind === 'flat' ? Math.max(-45, Math.min(45, input.roll || 0)) : 0,
        k1: kind === 'flat' ? Math.max(-0.5, Math.min(0.5, input.k1 !== undefined ? input.k1 : ((input.hfov || 65) > 80 ? -0.08 : 0))) : 0,
        k2: kind === 'flat' ? Math.max(-0.5, Math.min(0.5, input.k2 || 0)) : 0,
        source: input.source || 'upload', name: input.name || '',
        width: p.width, height: p.height, blob: p.blob, createdAt: new Date().toISOString()
      };
      // a capture holds at most one full panorama: a new one replaces the old
      var replaced = kind === 'equirect'
        ? Object.keys(records).filter(function (id) {
          var r = records[id];
          return r.nodeId === rec.nodeId && r.year === rec.year && r.kind === 'equirect';
        }) : [];
      return Promise.all(replaced.map(dropRecord)).then(function () {
        return tx('readwrite', function (s) {
          return s.put({
            id: rec.id, nodeId: rec.nodeId, year: rec.year, kind: rec.kind, heading: rec.heading,
            hfov: rec.hfov, pitch: rec.pitch, roll: rec.roll, k1: rec.k1, k2: rec.k2, source: rec.source, name: rec.name, width: rec.width, height: rec.height,
            blob: rec.blob, createdAt: rec.createdAt
          });
        });
      }).then(function () { return hydrate(rec); }).then(function () {
        register(rec.nodeId, rec.year);
        RV.emit('photos_changed', { reason: 'add', id: rec.id, nodeId: rec.nodeId, year: rec.year });
        return meta(rec);
      });
    });
  }

  function dropRecord(id) {
    var rec = records[id];
    if (!rec) return Promise.resolve();
    delete records[id];
    URL.revokeObjectURL(rec.url);
    return tx('readwrite', function (s) { return s.delete(id); });
  }

  function remove(id) {
    var rec = records[id];
    if (!rec) return Promise.resolve(false);
    return dropRecord(id).then(function () {
      register(rec.nodeId, rec.year);
      RV.emit('photos_changed', { reason: 'remove', id: id, nodeId: rec.nodeId, year: rec.year });
      return true;
    });
  }

  function update(id, patch) {
    var rec = records[id];
    if (!rec) return Promise.resolve(null);
    if (patch.heading !== undefined) rec.heading = RV.norm360(patch.heading);
    if (patch.hfov !== undefined && rec.kind === 'flat') rec.hfov = Math.max(20, Math.min(140, patch.hfov));
    if (patch.pitch !== undefined && rec.kind === 'flat') rec.pitch = Math.max(-60, Math.min(60, patch.pitch));
    if (patch.k1 !== undefined && rec.kind === 'flat') rec.k1 = Math.max(-0.5, Math.min(0.5, patch.k1));
    if (patch.k2 !== undefined && rec.kind === 'flat') rec.k2 = Math.max(-0.5, Math.min(0.5, patch.k2));
    if (patch.roll !== undefined && rec.kind === 'flat') rec.roll = Math.max(-45, Math.min(45, patch.roll));
    return tx('readwrite', function (s) {
      return s.put({
        id: rec.id, nodeId: rec.nodeId, year: rec.year, kind: rec.kind, heading: rec.heading,
        hfov: rec.hfov, pitch: rec.pitch, roll: rec.roll, k1: rec.k1, k2: rec.k2, source: rec.source, name: rec.name, width: rec.width, height: rec.height,
        blob: rec.blob, createdAt: rec.createdAt
      });
    }).then(function () {
      register(rec.nodeId, rec.year);
      RV.emit('photos_changed', { reason: 'update', id: id, nodeId: rec.nodeId, year: rec.year });
      return meta(rec);
    });
  }

  function clear() {
    var keys = {};
    Object.keys(records).forEach(function (id) {
      var r = records[id];
      keys[r.nodeId + '@' + r.year] = [r.nodeId, r.year];
      URL.revokeObjectURL(r.url);
    });
    records = {};
    return tx('readwrite', function (s) { return s.clear(); }).then(function () {
      Object.keys(keys).forEach(function (k) { register(keys[k][0], keys[k][1]); });
      RV.emit('photos_changed', { reason: 'clear' });
    });
  }

  function list() {
    return Object.keys(records).map(function (id) { return meta(records[id]); })
      .sort(function (p, q) { return p.createdAt < q.createdAt ? 1 : -1; });
  }

  function blobToDataUrl(blob) {
    return new Promise(function (resolve) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.readAsDataURL(blob);
    });
  }
  // JSON backup: metadata + image data URLs (moves photos between browsers/machines)
  function exportAll() {
    return Promise.all(Object.keys(records).map(function (id) {
      var r = records[id];
      return blobToDataUrl(r.blob).then(function (dataUrl) {
        var m = meta(r);
        m.dataUrl = dataUrl;
        return m;
      });
    })).then(function (photos) {
      return JSON.stringify({ format: 'roadview-mock-photos', version: 1, exportedAt: new Date().toISOString(), photos: photos });
    });
  }
  function importAll(json) {
    var doc = JSON.parse(json);
    if (doc.format !== 'roadview-mock-photos') return Promise.reject(new Error('not a roadview-mock photo backup'));
    var count = 0;
    return doc.photos.reduce(function (chain, p) {
      return chain.then(function () {
        if (!RV.getNode(p.nodeId)) return null;
        return fetch(p.dataUrl).then(function (r) { return r.blob(); }).then(function (blob) {
          return add({ nodeId: p.nodeId, year: p.year, file: blob, kind: p.kind, heading: p.heading,
            hfov: p.hfov, name: p.name, source: p.source });
        }).then(function () { count++; });
      });
    }, Promise.resolve()).then(function () { return count; });
  }

  RV.photos = {
    ready: ready,
    isPersistent: function () { return persistent; },
    list: list,
    byNode: function (nodeId, year) {
      return list().filter(function (m) { return m.nodeId === nodeId && (year === undefined || m.year === year); });
    },
    url: function (id) { return records[id] ? records[id].url : null; },
    add: add,
    update: update,
    remove: remove,
    clear: clear,
    guessKind: guessKind,
    exportAll: exportAll,
    importAll: importAll
  };
})(window);
