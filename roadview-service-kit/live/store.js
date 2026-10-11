// Browser storage for real panoramas: node records + image blobs in IndexedDB.
// Stands in for object storage + a spatial DB; falls back to memory when IndexedDB is blocked.
// Stored images are re-encoded JPEGs, so the original EXIF (including GPS) is not kept.
(function (root) {
  'use strict';
  var DB = 'roadview-live', MAX_W = { equirect: 6144, flat: 2560 };
  var nodes = [], blobs = {}, images = {}, db = null, persistent = false, remote = false, renderCbs = [];

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

  // ---- server mode: when served over http by server/index.js, everything lives on the server ----
  function token() { try { return localStorage.getItem('rv-token') || ''; } catch (e) { return ''; } }
  var asking = null;
  function askToken(stale) {
    if (token() !== stale) return Promise.resolve(token());             // another request already got a new one
    if (!asking) {
      asking = Promise.resolve().then(function () {
        var t = root.prompt('서버 쓰기 토큰을 입력하세요 (서버 시작 시 출력되거나 data/token 파일에 있습니다)');
        if (t) { try { localStorage.setItem('rv-token', t.trim()); } catch (e) { /* private mode */ } }
        return t ? t.trim() : '';
      }).then(function (t) { asking = null; return t; });
    }
    return asking;
  }
  function authFetch(url, opts, retried) {
    opts = opts || {};
    var used = token();
    opts.headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + used });
    return fetch(url, opts).then(function (r) {
      if (r.status !== 401 || retried) return r;
      return askToken(used).then(function (t) { return t ? authFetch(url, opts, true) : r; });
    });
  }
  function detectRemote() {
    if (!/^https?:$/.test(root.location.protocol)) return Promise.resolve(false);
    return fetch('/api/health', { cache: 'no-store' }).then(function (r) { return r.ok; }, function () { return false; });
  }
  function merge(node, fresh) {
    node.rev = fresh.rev; node.render = fresh.render;
    return node;
  }
  function pollRender(node, tries) {
    if (!remote || tries > 200) return;
    fetch('/api/nodes/' + encodeURIComponent(node.id), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (fresh) {
      if (!fresh || fresh.rev !== node.rev) return;                       // deleted or edited again
      node.render = fresh.render;
      if (fresh.render.status === 'pending') { setTimeout(function () { pollRender(node, tries + 1); }, 1500); return; }
      renderCbs.forEach(function (cb) { cb(node); });
    }, function () { setTimeout(function () { pollRender(node, tries + 1); }, 4000); });
  }

  var ready = detectRemote().then(function (isRemote) {
    remote = isRemote;
    if (!remote) return null;
    persistent = true;
    return fetch('/api/nodes', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (list) {
      nodes = list;
      nodes.forEach(function (n) { if (n.render && n.render.status === 'pending') pollRender(n, 0); });
      return 'remote';
    }).catch(function () { remote = false; persistent = false; nodes = []; return null; });
  }).then(function (r) { return r === 'remote' ? 'remote' : open(); }).then(function (d) {
    if (remote) return [null, null];
    db = d; persistent = !!d;
    return Promise.all([tx('nodes', 'readonly', function (s) { return s.getAll(); }),
      tx('blobs', 'readonly', function (s) { return s.getAll(); })]);
  }).then(function (res) {
    if (remote) return;
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

  function remoteSave(node) {
    return authFetch('/api/nodes/' + encodeURIComponent(node.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(node) })
      .then(function (r) {
        if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || ('서버 오류 ' + r.status)); });
        return r.json();
      }).then(function (fresh) { merge(node, fresh); pollRender(node, 0); return node; });
  }
  function addNode(node, blobMap) {
    if (remote) {
      var ids0 = Object.keys(blobMap);
      return Promise.all(ids0.map(function (id) {
        return authFetch('/api/blobs/' + encodeURIComponent(id), { method: 'PUT', body: blobMap[id] }).then(function (r) {
          if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || ('업로드 실패 ' + r.status)); });
        });
      })).then(function () { return remoteSave(node); }).then(function () { nodes.push(node); });
    }
    nodes.push(node);
    var ids = Object.keys(blobMap);
    ids.forEach(function (id) { blobs[id] = blobMap[id]; });
    return ready.then(function () {
      return Promise.all([tx('nodes', 'readwrite', function (s) { return s.put(node); })].concat(
        ids.map(function (id) { return tx('blobs', 'readwrite', function (s) { return s.put({ id: id, blob: blobMap[id] }); }); })));
    });
  }
  function updateNode(node) {
    if (remote) return remoteSave(node);
    return tx('nodes', 'readwrite', function (s) { return s.put(node); });
  }
  function removeNode(id) {
    var n = nodes.filter(function (x) { return x.id === id; })[0];
    nodes = nodes.filter(function (x) { return x.id !== id; });
    if (!n) return Promise.resolve();
    if (remote) {
      n.shots.forEach(function (sh) { delete images[sh.id]; });
      return authFetch('/api/nodes/' + encodeURIComponent(id), { method: 'DELETE' });
    }
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
    if (remote) images[shotId] = fetch('/api/blobs/' + encodeURIComponent(shotId)).then(function (r) {
      if (!r.ok) throw new Error('missing image ' + shotId);
      return r.blob();
    }).then(function (bl) { return createImageBitmap(bl); });
    else if (!b) return Promise.reject(new Error('missing image ' + shotId));
    else images[shotId] = createImageBitmap(b);
    images[shotId].catch(function () { delete images[shotId]; });
    var ids = Object.keys(images);
    if (ids.length > IMAGE_LIMIT) delete images[ids[0]];
    return images[shotId];
  }

  root.RVStore = {
    ready: ready, prepare: prepare, addNode: addNode, updateNode: updateNode, removeNode: removeNode,
    clear: clear, getImage: getImage,
    nodes: function () { return nodes; },
    isPersistent: function () { return persistent; },
    isRemote: function () { return remote; },
    onRender: function (cb) { renderCbs.push(cb); }
  };
})(window);
