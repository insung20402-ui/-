// Tour player: "walk" tours step forward/back through frames shot while walking;
// "pan" tours scrub through frames shot while turning on the spot.
(function (root) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var rv = $('rv'), marker = $('marker');
  var tours = [], tour = null;
  var idx = -1, front = 'b', panX = 0, pf = 0, vel = 0, auto = true, raf = null, walking = null, down = null, moved = false, pa = -1, pb = -1;
  var token = 0, hintTimer = 0;
  var cache = {};

  function imgOf(url) { return cache[url] || (cache[url] = Object.assign(new Image(), { src: url })); }
  function hint(text, ms) {
    var h = $('hint'); h.textContent = text; h.style.opacity = 1;
    clearTimeout(hintTimer); if (ms) hintTimer = setTimeout(function () { h.style.opacity = 0; }, ms);
  }

  // load every frame (tours are a few hundred small JPEGs) before showing, so stepping never flashes blank
  function preload(t, tk) {
    var n = t.count, done = 0, next = 0;
    return new Promise(function (resolve) {
      function pump() {
        while (next < n && next - done < 6) {
          (function (i) {
            var im = imgOf(t.url(i));
            var fin = function () { done++; if (tk === token) hint('불러오는 중 ' + done + '/' + n); if (done >= n) resolve(); else pump(); };
            if (im.complete) fin(); else { im.onload = im.onerror = fin; }
          })(next++);
        }
      }
      pump();
    });
  }

  function progress(p, label) {
    var W = $('path').clientWidth - 12;
    $('dot').style.left = (6 + p * (W - 12)) + 'px';
    $('done').style.width = (p * W) + 'px';
    $('count').textContent = label;
  }

  /* ---- walk ---- */
  var A = $('a'), B = $('b');
  function paint(src, dir) {            // cross-fade two layers with a small zoom: forward = push in
    var next = front === 'a' ? 'b' : 'a', n = $(next), f = $(front);
    n.src = src;
    n.style.transition = 'none';
    n.style.transform = 'translateX(' + panX + 'px) scale(' + (dir > 0 ? 1.08 : 0.94) + ')';
    n.getBoundingClientRect();
    n.style.transition = '';
    n.style.opacity = 1; n.style.transform = 'translateX(' + panX + 'px) scale(1)';
    f.style.opacity = 0; f.style.transform = 'translateX(' + panX + 'px) scale(' + (dir > 0 ? 1.18 : 0.88) + ')';
    front = next;
  }
  function go(dir) {
    if (!tour || tour.type !== 'walk') return false;
    var g = Math.max(0, Math.min(tour.count - 1, idx + dir));
    if (g === idx) return false;
    idx = g; paint(tour.url(g), dir);
    progress(tour.count > 1 ? g / (tour.count - 1) : 0, (g + 1) + '/' + tour.count);
    $('fwd').style.opacity = g === tour.count - 1 ? 0.35 : 1;
    $('bck').style.opacity = g === 0 ? 0.35 : 1;
    return true;
  }
  function stopWalk() { clearInterval(walking); walking = null; }
  function startWalk(dir) { stopWalk(); go(dir); walking = setInterval(function () { if (!go(dir)) stopWalk(); }, tour && tour.count > 20 ? 450 : 800); }

  /* ---- pan ---- */
  function wrap(x) { return tour.loop ? ((x % tour.count) + tour.count) % tour.count : Math.max(0, Math.min(tour.count - 1, x)); }
  function showPano() {                 // blend the two neighbouring frames so motion between frames is smooth too
    var x = wrap(pf), i = Math.floor(x), fr = x - i, j = tour.loop ? (i + 1) % tour.count : Math.min(i + 1, tour.count - 1);
    if (pa !== i) { A.src = tour.url(i); pa = i; }
    if (pb !== j) { B.src = tour.url(j); pb = j; }
    [A, B].forEach(function (e) { e.style.transition = 'none'; e.style.transform = 'none'; });
    A.style.opacity = 1; B.style.opacity = i === j ? 0 : fr;
    var p = tour.loop ? x / tour.count : x / Math.max(1, tour.count - 1);
    progress(p, tour.angle ? Math.round(p * tour.angle) + '°' : Math.round(p * 100) + '%');
  }
  function loop() {
    if (!tour || tour.type !== 'pan') return;
    var speed = Math.max(0.05, 0.2 * tour.count / 120);
    if (auto) {
      pf += speed;
      if (tour.loop ? pf >= tour.count : pf >= tour.count - 1) { auto = false; if (tour.loop) pf = wrap(pf); }
    } else if (Math.abs(vel) > 0.01 && !down) { pf += vel; vel *= 0.93; }
    pf = tour.loop ? pf : Math.max(0, Math.min(tour.count - 1, pf));
    showPano();
    raf = requestAnimationFrame(loop);
  }

  var HINTS = {
    walk: '바닥을 클릭하면 앞으로, 화면 아래쪽을 클릭하면 뒤로 · 드래그로 둘러보기 · 스크롤/방향키 이동',
    pan: '좌우로 드래그해서 돌려 보세요 (카메라가 돌아가는 방향 그대로 움직입니다)'
  };

  function select(t) {
    var tk = ++token;
    stopWalk(); cancelAnimationFrame(raf); down = null; tour = null;
    $('place').textContent = t.title;
    document.querySelectorAll('#tabs .btn').forEach(function (b) { b.classList.toggle('on', b.dataset.id === t.id); });
    $('arrows').style.display = t.type === 'walk' ? '' : 'none';
    $('s').textContent = t.type === 'walk' ? '입구' : '시작'; $('e').textContent = t.type === 'walk' ? '끝' : (t.loop ? '한 바퀴' : '끝');
    var first = imgOf(t.url(0));
    return new Promise(function (r) { if (first.complete) r(); else first.onload = first.onerror = r; }).then(function () {
      if (tk !== token) return;
      if (first.naturalWidth) rv.style.setProperty('--ar', first.naturalWidth / first.naturalHeight);
      return preload(t, tk);
    }).then(function () {
      if (tk !== token) return;
      tour = t; panX = 0;
      hint(HINTS[t.type], 5000);
      [A, B].forEach(function (e) { e.style.opacity = 0; e.style.transition = ''; e.style.transform = 'none'; });
      if (t.type === 'walk') { idx = -1; front = 'b'; go(1); }
      else { pf = 0; vel = 0; auto = true; pa = pb = -1; front = 'a'; raf = requestAnimationFrame(loop); }
      try { var u = new URL(location.href); u.searchParams.set('tour', t.id); history.replaceState(null, '', u); } catch (e) { /* file:// */ }
    });
  }

  /* ---- pointer / keys ---- */
  function zone(e) { var r = rv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; }
  function setPan(x) {
    var lim = rv.clientWidth * 0.05; panX = Math.max(-lim, Math.min(lim, x));
    $(front).style.transform = 'translateX(' + panX + 'px) scale(1)';
  }
  rv.addEventListener('pointerdown', function (e) {
    if (!tour || e.target.closest('.btn,.arr,#mini')) return;
    down = { x: e.clientX, pan: panX, pf: pf, last: e.clientX }; moved = false; vel = 0; auto = false; rv.classList.add('drag');
  });
  rv.addEventListener('pointermove', function (e) {
    if (!tour) return;
    var z = zone(e);
    if (down) {
      var dx = e.clientX - down.x; if (Math.abs(dx) > 5) moved = true;
      if (tour.type === 'pan') {
        pf = down.pf - dx / z.w * tour.count * 0.9;
        vel = -(e.clientX - down.last) / z.w * tour.count * 0.9; down.last = e.clientX;
      } else setPan(down.pan + dx * 0.4);
      marker.classList.remove('on'); return;
    }
    if (tour.type !== 'walk' || e.pointerType === 'touch') return;
    marker.classList.toggle('on', z.y > z.h * 0.45);
    marker.style.left = z.x + 'px'; marker.style.top = z.y + 'px';
    marker.textContent = z.y > z.h * 0.86 ? '▼' : '▲';
  });
  rv.addEventListener('pointerleave', function () { marker.classList.remove('on'); });
  root.addEventListener('pointerup', function (e) {
    if (!down) return;
    var z = zone(e); rv.classList.remove('drag'); down = null;
    if (moved || !tour || tour.type !== 'walk' || z.y < z.h * 0.3) return;
    go(z.y > z.h * 0.86 ? -1 : 1);
  });
  rv.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (!tour) return;
    if (tour.type === 'pan') { auto = false; vel = (e.deltaY > 0 ? 1 : -1) * Math.max(0.3, tour.count / 200); } else go(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
  root.addEventListener('keydown', function (e) {
    if (e.repeat || !tour) return;
    if (tour.type === 'pan') {
      var k = Math.max(0.6, tour.count / 100);
      auto = false; if (e.key === 'ArrowRight') vel = k; if (e.key === 'ArrowLeft') vel = -k;
    } else {
      if (['ArrowUp', 'w', 'ArrowRight'].indexOf(e.key) >= 0) go(1);
      if (['ArrowDown', 's', 'ArrowLeft'].indexOf(e.key) >= 0) go(-1);
    }
    if (e.key === 'f') toggleFs();
  });
  [['fwd', 1], ['bck', -1]].forEach(function (p) {
    var b = $(p[0]);
    b.addEventListener('pointerdown', function (e) { e.stopPropagation(); startWalk(p[1]); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { b.addEventListener(ev, stopWalk); });
  });
  function toggleFs() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); }
  $('fs').onclick = toggleFs;

  /* ---- boot ---- */
  var params = new URLSearchParams(location.search);
  root.RVTours.loadAll(params.get('src') || './', !!params.get('src')).then(function (list) {
    tours = list;
    if (!tours.length) { $('empty').style.display = 'flex'; ['arrows', 'mini', 'tabs', 'hint', 'place'].forEach(function (id) { $(id).style.display = 'none'; }); return; }
    if (tours.length > 1) tours.forEach(function (t) {
      var b = document.createElement('button'); b.className = 'btn'; b.dataset.id = t.id; b.textContent = t.title;
      b.onclick = function () { select(t); }; $('tabs').appendChild(b);
    });
    var want = params.get('tour');
    return select(tours.filter(function (t) { return t.id === want; })[0] || tours[0]);
  }).then(function () {
    root.TourApp = { tours: function () { return tours; }, tour: function () { return tour; }, select: select, go: go,
      state: function () { return { idx: idx, pf: pf, auto: auto }; }, ready: true };
    root.dispatchEvent(new Event('tour-ready'));
  });
})(window);
