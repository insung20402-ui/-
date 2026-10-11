// Roadview app for real photos: map + viewer + photo registration.
(function (root) {
  'use strict';
  var G = root.RVGraph, X = root.RVExif, S = root.RVStore;
  function $(id) { return document.getElementById(id); }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function uid(p) { return p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  var links = {}, viewer = null, map = null, current = null, coverageOn = true, pickFlow = null;
  var kakaoKey = new URLSearchParams(location.search).get('kakao') || (root.RV_CONFIG && root.RV_CONFIG.kakaoKey) || '';

  function nodes() { return S.nodes(); }
  function nodeById(id) { return nodes().filter(function (n) { return n.id === id; })[0]; }
  function rebuild() {
    links = G.buildLinks(nodes(), { maxM: 60 });
    if (map) map.setNodes(nodes(), links);
    $('empty').style.display = nodes().length ? 'none' : 'grid';
  }

  var toastTimer = 0;
  function toast(msg, ms) {
    var t = $('toast'); t.textContent = msg; t.style.display = 'block';
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { t.style.display = 'none'; }, ms || 2600);
  }

  // ---------- viewer <-> map ----------
  function host() {
    return {
      getNode: nodeById,
      getLinks: function (id) { return links[id] || []; },
      getPano: function (n, lod) { return root.RVPano.get(n, lod); },
      isCached: function (n, lod) { return root.RVPano.isCached(n, lod); }
    };
  }
  var COMPASS = ['북', '북동', '동', '남동', '남', '남서', '서', '북서'];
  function compassText(h) { return COMPASS[Math.round(h / 45) % 8] + ' ' + Math.round(h) + '°'; }

  function renderInfo(node) {
    var box = $('info');
    if (!node) { box.hidden = true; $('compass').hidden = true; $('controls').hidden = true; return; }
    box.hidden = false; $('compass').hidden = false; $('controls').hidden = false;
    var eq = node.shots.filter(function (s) { return s.kind === 'equirect'; })[0];
    var kinds = eq ? '360° 사진' : '일반 사진 ' + node.shots.length + '장';
    box.innerHTML = '<span>' + node.lat.toFixed(6) + ', ' + node.lon.toFixed(6) + '</span><span>' + kinds + '</span>' +
      (eq ? '<label>정면 방향 <input id="eqHead" type="number" min="0" max="359" value="' + Math.round(eq.heading || 0) + '">°</label>' : '') +
      '<button id="bDel">삭제</button>';
    var inp = $('eqHead');
    if (inp) inp.onchange = function () {
      eq.heading = G.norm360(parseFloat(inp.value) || 0);
      node.heading = eq.heading;
      S.updateNode(node); root.RVPano.forget(node.id); viewer.refresh();
    };
    $('bDel').onclick = function () { removeNode(node); };
  }

  function removeNode(node) {
    if (!confirm('이 지점의 사진 ' + node.shots.length + '장을 삭제할까요?')) return;
    var near = nodes().filter(function (n) { return n.id !== node.id; })
      .sort(function (a, b) { return G.distance(a, node) - G.distance(b, node); })[0];
    root.RVPano.forget(node.id);
    S.removeNode(node.id).then(function () {
      rebuild();
      if (near) go(near.id); else { current = null; viewer.clear(); map.setCurrent(null); renderInfo(null); }
    });
  }

  function go(id, pov) {
    var n = nodeById(id);
    if (!n) return;
    current = id;
    // jumping from the map / a new upload faces the photos; walking by arrows keeps your gaze
    viewer.setPano(id, { pov: pov || { heading: n.heading || 0, pitch: 0 } });
  }

  // ---------- adding photos ----------
  var staged = [], uidN = 0;

  function measure(file) {
    return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (b) {
      var r = { width: b.width, height: b.height };
      var c = document.createElement('canvas'), sc = 112 / b.width;
      c.width = 112; c.height = Math.max(1, Math.round(b.height * sc));
      c.getContext('2d').drawImage(b, 0, 0, c.width, c.height);
      if (b.close) b.close();
      r.thumb = c.toDataURL('image/jpeg', 0.7);
      return r;
    });
  }

  function stage(files) {
    Array.prototype.filter.call(files, function (f) { return /^image\//.test(f.type) || /\.(jpe?g|png|webp)$/i.test(f.name); })
      .forEach(function (file) {
        var it = { key: ++uidN, file: file, name: file.name, kind: 'flat', hfov: 70, heading: null, gps: null, ready: false };
        staged.push(it);
        Promise.all([measure(file), X.read(file)]).then(function (res) {
          var m = res[0], ex = res[1];
          it.w = m.width; it.h = m.height; it.thumb = m.thumb; it.exif = ex;
          it.kind = ex.projection === 'equirectangular' || Math.abs(m.width / m.height - 2) < 0.06 ? 'equirect' : 'flat';
          var f = X.hfov(ex, m.width, m.height);
          if (f) { it.hfov = Math.round(f); it.hfovExif = true; }
          if (ex.gps) { it.gps = { lat: ex.gps.lat, lon: ex.gps.lon }; if (ex.gps.heading !== undefined) it.heading = Math.round(ex.gps.heading); }
          else if (it.kind === 'equirect' && ex.poseHeading !== undefined) it.heading = Math.round(ex.poseHeading);
          it.ready = true;
        }, function () { it.error = true; }).then(renderRows);
      });
    renderRows();
  }

  function renderRows() {
    var rows = $('rows');
    rows.innerHTML = staged.map(function (it) {
      var gps = it.error ? '<span class="badge warn">읽기 실패</span>' :
        it.gps ? '<span class="badge ok">GPS</span>' : '<span class="badge warn">GPS 없음</span>';
      return '<div class="row" data-k="' + it.key + '"><img src="' + (it.thumb || '') + '" alt="">' +
        '<div><div class="nm">' + esc(it.name) + '</div><div class="muted">' + (it.w ? it.w + '×' + it.h : '확인 중…') + ' ' + gps + '</div></div>' +
        '<div class="opts">' +
        '<select data-a="kind"><option value="equirect"' + (it.kind === 'equirect' ? ' selected' : '') + '>360°</option><option value="flat"' + (it.kind === 'flat' ? ' selected' : '') + '>일반</option></select>' +
        (it.kind === 'flat' ? '<label>화각 <input type="number" data-a="hfov" min="20" max="140" value="' + it.hfov + '">°' + (it.hfovExif ? '(EXIF)' : '') + '</label>' : '') +
        '<label>방향 <input type="number" data-a="heading" min="0" max="359" placeholder="자동" value="' + (it.heading === null ? '' : it.heading) + '">°</label>' +
        '<button data-a="rm">×</button></div></div>';
    }).join('');
    var ready = staged.filter(function (i) { return i.ready; });
    var noGps = ready.filter(function (i) { return !i.gps; });
    $('modeBox').hidden = !noGps.length;
    $('noGpsCount').textContent = noGps.length;
    $('sum').textContent = ready.length ? ready.length + '장 · 위치 지정 필요 ' + noGps.length + '장' : '';
    $('dOk').disabled = !ready.length || ready.length !== staged.filter(function (i) { return !i.error; }).length;
  }

  function itemOf(el) { var r = el.closest('.row'); return r && staged.filter(function (i) { return i.key === +r.dataset.k; })[0]; }
  $('rows').addEventListener('change', function (e) {
    var it = itemOf(e.target), a = e.target.dataset.a;
    if (!it) return;
    if (a === 'kind') it.kind = e.target.value;
    if (a === 'hfov') { it.hfov = Math.max(20, Math.min(140, parseFloat(e.target.value) || 70)); it.hfovExif = false; }
    if (a === 'heading') it.heading = e.target.value === '' ? null : G.norm360(parseFloat(e.target.value) || 0);
    renderRows();
  });
  $('rows').addEventListener('click', function (e) {
    if (e.target.dataset.a !== 'rm') return;
    var it = itemOf(e.target);
    staged = staged.filter(function (i) { return i !== it; });
    renderRows();
  });

  // Build capture points from staged items. `place` supplies positions for photos without GPS.
  function plan(items, place) {
    var withGps = items.filter(function (i) { return i.gps; }).map(function (i) { return { it: i, kind: i.kind, gps: i.gps, heading: i.heading }; });
    var c = G.cluster(withGps, 5), points = [], taken = [];
    c.groups.forEach(function (g) {
      // two 360° shots at the very same coordinates would be unreachable from each other
      var lat = g.lat, lon = g.lon, k = 0;
      while (taken.some(function (t) { return G.distance(t, { lat: lat, lon: lon }) < 1; })) {
        var o = G.offset(g, 90, 3 * ++k); lat = o.lat; lon = o.lon;
      }
      taken.push({ lat: lat, lon: lon });
      points.push({ lat: lat, lon: lon, items: g.photos.map(function (p) { return p.it; }), travel: null });
    });
    var rest = items.filter(function (i) { return !i.gps; });
    if (rest.length && place) {
      if (place.mode === 'spot') {
        // one point per 360° shot (a node holds one sphere); ordinary photos share the first point
        var eqs = rest.filter(function (i) { return i.kind === 'equirect'; }), flatsRest = rest.filter(function (i) { return i.kind !== 'equirect'; });
        var groups = eqs.map(function (e, i) { return { pos: G.offset(place.points[0], 90, 3 * i), items: [e] }; });
        if (flatsRest.length) { if (groups.length) groups[0].items = groups[0].items.concat(flatsRest); else groups.push({ pos: place.points[0], items: flatsRest }); }
        groups.forEach(function (g) { points.push({ lat: g.pos.lat, lon: g.pos.lon, items: g.items, travel: null }); });
      }
      else {
        var sorted = rest.slice().sort(function (a, b) { return a.name < b.name ? -1 : a.name > b.name ? 1 : 0; });
        G.interpolate(place.points[0], place.points[1], sorted.length).forEach(function (p, i) {
          points.push({ lat: p.lat, lon: p.lon, items: [sorted[i]], travel: p.heading });
        });
      }
    }
    return points;
  }

  function shotsFor(pt) {
    var flats = pt.items.filter(function (i) { return i.kind === 'flat'; }), fi = 0;
    return pt.items.map(function (it) {
      var heading = it.heading;
      if (heading === null) {
        if (pt.travel !== null) heading = pt.travel;
        else if (it.kind === 'flat' && flats.length > 1) heading = (fi * 360 / flats.length) % 360;
        else heading = 0;
      }
      if (it.kind === 'flat') fi++;
      return { it: it, shot: { id: uid('s-'), kind: it.kind, heading: heading, hfov: it.kind === 'flat' ? it.hfov : 360,
        pitch: 0, roll: 0, k1: it.kind === 'flat' && it.hfov > 80 ? -0.08 : 0, k2: 0, name: it.name } };
    });
  }

  function commit(items, place) {
    var points = plan(items, place), total = points.length, done = 0, firstId = null;
    $('loading').style.display = 'block';
    function status() { $('loading').textContent = '등록 중 ' + done + ' / ' + total; }
    status();
    return points.reduce(function (chain, pt) {
      return chain.then(function () {
        var made = shotsFor(pt), blobMap = {};
        return Promise.all(made.map(function (m) {
          return S.prepare(m.it.file, m.it.kind).then(function (p) {
            blobMap[m.shot.id] = p.blob; m.shot.width = p.width; m.shot.height = p.height;
          });
        })).then(function () {
          var first = made[0].shot;
          var node = { id: uid('n-'), lat: pt.lat, lon: pt.lon, heading: first.heading, createdAt: new Date().toISOString(),
            shots: made.map(function (m) { return m.shot; }) };
          if (!firstId) firstId = node.id;
          return S.addNode(node, blobMap);
        }).then(function () { done++; status(); });
      });
    }, Promise.resolve()).then(function () {
      $('loading').style.display = 'none';
      rebuild(); map.fit();
      if (firstId) go(firstId);
      toast(total + '개 지점을 등록했습니다.');
    }, function (err) {
      $('loading').style.display = 'none';
      toast('등록 실패: ' + err.message, 5000);
      rebuild();
    });
  }

  $('dOk').onclick = function () {
    var items = staged.filter(function (i) { return i.ready; });
    var noGps = items.filter(function (i) { return !i.gps; });
    var mode = document.querySelector('input[name=mode]:checked').value;
    $('dlg').close();
    if (!noGps.length) { staged = []; renderRows(); commit(items, null); return; }
    startPick(mode, function (pts) { var batch = items; staged = []; renderRows(); commit(batch, { mode: mode, points: pts }); },
      function () { $('dlg').showModal(); });
  };

  function startPick(mode, done, cancel) {
    var need = mode === 'spot' ? 1 : 2, pts = [];
    pickFlow = { done: done, cancel: cancel };
    map.setPick(true);
    function text() {
      return mode === 'spot' ? '지도에서 사진을 찍은 위치를 클릭하세요' :
        (pts.length === 0 ? '지도에서 이동의 시작점을 클릭하세요 (1/2)' : '지도에서 이동의 끝점을 클릭하세요 (2/2)');
    }
    function show() { $('bannerText').textContent = text(); $('banner').style.display = 'flex'; map.setMarkers(pts.map(function (p, i) { return { lat: p.lat, lon: p.lon, label: need === 1 ? '' : String(i + 1) }; })); }
    pickFlow.click = function (lat, lon) {
      if (pts.length && G.distance(pts[0], { lat: lat, lon: lon }) < 3) { toast('시작점과 3m 이상 떨어진 곳을 클릭하세요.'); return; }
      pts.push({ lat: lat, lon: lon });
      if (pts.length < need) { show(); return; }
      finish();
      done(pts);
    };
    function finish() { pickFlow = null; map.setPick(false); map.setMarkers([]); $('banner').style.display = 'none'; }
    pickFlow.abort = function () { finish(); cancel(); };
    if (document.body.classList.contains('full')) setLayout(false);
    show();
  }
  $('bannerCancel').onclick = function () { if (pickFlow) pickFlow.abort(); };

  function openDialog() { $('dlg').showModal(); }
  $('bAdd').onclick = $('bAdd2').onclick = openDialog;
  $('dCancel').onclick = function () { $('dlg').close(); };
  $('bPick').onclick = function () { $('file').click(); };
  $('file').onchange = function () { stage($('file').files); $('file').value = ''; };
  var drop = $('drop');
  ['dragenter', 'dragover'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (n) { drop.addEventListener(n, function (e) { e.preventDefault(); drop.classList.remove('over'); }); });
  drop.addEventListener('drop', function (e) { stage(e.dataTransfer.files); });

  // ---------- layout / toolbar ----------
  function setLayout(full) {
    document.body.classList.toggle('full', full);
    $('bLayout').textContent = full ? '지도 크게' : '전체 화면';
    setTimeout(function () { map.invalidate(); viewer.resize(); }, 50);
  }
  $('bLayout').onclick = function () { setLayout(!document.body.classList.contains('full')); };
  $('bCoverage').onclick = function () {
    coverageOn = !coverageOn;
    $('bCoverage').classList.toggle('on', coverageOn);
    map.setCoverage(coverageOn);
  };
  $('bFwd').onclick = function () { viewer.forward(); };
  $('bBack').onclick = function () { viewer.backward(); };

  // ---------- boot ----------
  Promise.all([S.ready, root.RVMaps.create($('map'), kakaoKey)]).then(function (res) {
    map = res[1];
    if (map.fallbackReason) toast(map.fallbackReason + ' — OpenStreetMap으로 표시합니다.', 6000);
    viewer = root.createLiveViewer($('view'), host());
    viewer.on('pano_changed', function (e) {
      current = e.nodeId;
      map.setCurrent(e.node, viewer.getPov().heading);
      renderInfo(e.node);
    });
    viewer.on('pov_changed', function (p) { map.setHeading(p.heading); $('compass').textContent = compassText(p.heading); });
    viewer.on('load', function (e) { $('loading').style.display = e.lod === 'low' ? 'block' : 'none'; $('loading').textContent = '선명하게 불러오는 중…'; });
    viewer.on('no_link', function () { toast('그쪽으로는 이동할 수 있는 로드뷰가 없습니다.'); });
    viewer.on('error', function (e) { toast('사진을 표시하지 못했습니다: ' + e.message, 5000); });

    map.onClick(function (lat, lon) {
      if (pickFlow) { pickFlow.click(lat, lon); return; }
      if (!coverageOn) return;
      var hit = G.nearest(nodes(), lat, lon, 50);
      if (hit) go(hit.node.id); else toast('반경 50m 안에 로드뷰가 없습니다.');
    });
    map.onNodeClick(function (id) { if (!pickFlow) go(id); });
    rebuild();
    if (nodes().length) { map.fit(); go(nodes()[0].id); }
    if (!S.isPersistent()) toast('이 브라우저는 저장을 막고 있어 새로고침하면 사진이 사라집니다.', 5000);
    root.RVApp = { viewer: viewer, map: map, go: go, stage: stage, commit: commit, nodes: nodes, links: function () { return links; }, staged: function () { return staged; } };
    root.dispatchEvent(new Event('rvapp-ready'));
  });
})(window);
