// Where tours come from. All three produce the same shape:
//   { id, title, type: 'walk' | 'pan', count, angle, loop, source, url(i), remove() }
//   server : GET /api/tours (frames live on the server)
//   local  : this browser's IndexedDB (made with make.html while no server is used)
//   static : tours.js / tours.json next to a frames/<id>/NNN.jpg folder (the original school-roadview format);
//            pick the folder with ?src=path/
(function (root) {
  'use strict';
  var pad = function (i) { return String(i).padStart(3, '0'); };

  function token() { try { return localStorage.getItem('rv-token') || ''; } catch (e) { return ''; } }
  var asking = null;
  function authFetch(url, opts, retried) {
    opts = opts || {};
    var used = token();
    opts.headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + used });
    return fetch(url, opts).then(function (r) {
      if (r.status !== 401 || retried) return r;
      if (token() === used && !asking) {
        asking = Promise.resolve().then(function () {
          var t = root.prompt('서버 쓰기 토큰을 입력하세요 (서버 시작 시 출력되거나 data/token 파일에 있습니다)');
          if (t) { try { localStorage.setItem('rv-token', t.trim()); } catch (e) { /* private mode */ } }
          return t;
        }).then(function (t) { asking = null; return t; });
      }
      return (asking || Promise.resolve(token())).then(function (t) { return t ? authFetch(url, opts, true) : r; });
    });
  }

  var isRemote = null;
  function remote() {
    if (isRemote !== null) return Promise.resolve(isRemote);
    if (!/^https?:$/.test(root.location.protocol)) return Promise.resolve((isRemote = false));
    return fetch('/api/health', { cache: 'no-store' }).then(function (r) { return (isRemote = r.ok); }, function () { return (isRemote = false); });
  }

  // ---- local (IndexedDB) ----
  var dbp = null;
  function idb() {
    if (dbp) return dbp;
    dbp = new Promise(function (resolve) {
      var req;
      try { req = root.indexedDB.open('roadview-tours', 1); } catch (e) { resolve(null); return; }
      req.onupgradeneeded = function () { req.result.createObjectStore('tours', { keyPath: 'id' }); };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = req.onblocked = function () { resolve(null); };
    });
    return dbp;
  }
  function idbDo(mode, fn) {
    return idb().then(function (db) {
      if (!db) return null;
      return new Promise(function (resolve, reject) {
        var t = db.transaction('tours', mode), r = fn(t.objectStore('tours'));
        t.oncomplete = function () { resolve(r && r.result); };
        t.onerror = t.onabort = function () { reject(t.error); };
      });
    });
  }
  function localTour(rec) {
    var urls = [];
    var t = Object.assign({}, rec.manifest, { source: 'local', url: function (i) {
      return urls[i] || (urls[i] = URL.createObjectURL(rec.frames[i]));
    }, remove: function () { return idbDo('readwrite', function (s) { return s.delete(rec.id); }); } });
    return t;
  }

  // ---- static (original format) ----
  function staticTours(base) {
    return new Promise(function (resolve) {
      var done = false;
      function finish(data) {
        if (done) return; done = true;
        resolve(((data && data.tours) || []).map(function (m) {
          return Object.assign({ angle: 0, loop: false }, m, { source: 'static', url: function (i) { return base + 'frames/' + m.id + '/' + pad(i) + '.' + (m.ext || 'jpg'); }, remove: null });
        }));
      }
      var s = document.createElement('script');
      s.src = base + 'tours.js';
      s.onload = function () { var d = root.TOURS; root.TOURS = undefined; finish(d); };
      s.onerror = function () {
        if (!/^https?:$/.test(root.location.protocol)) { finish(null); return; }   // file:// cannot fetch json
        fetch(base + 'tours.json').then(function (r) { return r.ok ? r.json() : null; }, function () { return null; }).then(finish);
      };
      document.head.appendChild(s);
    });
  }

  // static folders are tried when there is no server, or when a folder is asked for explicitly (?src=)
  function loadAll(base, explicit) {
    base = base || './';
    if (base.slice(-1) !== '/') base += '/';
    return remote().then(function (isR) {
      var server = isR ? fetch('/api/tours', { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (d) {
        return d.tours.map(function (m) {
          return Object.assign({}, m, { source: 'server', url: function (i) { return m.base + pad(i) + '.jpg'; },
            remove: function () { return authFetch('/api/tours/' + encodeURIComponent(m.id), { method: 'DELETE' }); } });
        });
      }).catch(function () { return []; }) : Promise.resolve([]);
      var local = idbDo('readonly', function (s) { return s.getAll(); }).then(function (all) { return (all || []).map(localTour); }, function () { return []; });
      return Promise.all([server, local]).then(function (r) {
        // a static folder is tried without a server, when asked for (?src=), or when the server has no tours yet
        var wantStatic = !isR || explicit || !r[0].length;
        return (wantStatic ? staticTours(base) : Promise.resolve([])).then(function (st) { return [].concat(r[0], r[1], st); });
      });
    });
  }

  // frames: [Blob], meta: { id, title, type, angle, loop }
  function save(meta, frames, onProgress) {
    return remote().then(function (isR) {
      var man = { id: meta.id, title: meta.title, type: meta.type, count: frames.length, ext: 'jpg', angle: meta.angle || 360, loop: !!meta.loop };
      if (isR) {
        var rev = 'r' + Date.now().toString(36), done = 0;
        function put(i) {
          return authFetch('/api/tours/' + encodeURIComponent(meta.id) + '/frames/' + i + '?rev=' + rev, { method: 'PUT', body: frames[i] }).then(function (r) {
            if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || ('업로드 실패 ' + r.status)); });
            if (onProgress) onProgress(++done, frames.length);
          });
        }
        var chain = put(0);                                         // first one settles the token prompt
        for (var k = 1; k < frames.length; k += 4) (function (k) {
          chain = chain.then(function () { return Promise.all([0, 1, 2, 3].map(function (d) { return k + d < frames.length ? put(k + d) : null; })); });
        })(k);
        return chain.then(function () {
          return authFetch('/api/tours/' + encodeURIComponent(meta.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ rev: rev }, man)) });
        }).then(function (r) { if (!r.ok) return r.json().then(function (j) { throw new Error(j.error || '저장 실패'); }); return 'server'; });
      }
      return idbDo('readwrite', function (s) { return s.put({ id: meta.id, manifest: man, frames: frames }); }).then(function (x) {
        if (x === null) throw new Error('이 브라우저는 저장을 막고 있습니다. ZIP으로 내려받으세요.');
        return 'local';
      });
    });
  }

  root.RVTours = { loadAll: loadAll, save: save, isRemote: remote, pad: pad };
})(window);
