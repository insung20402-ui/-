// Tour player: "walk" tours move through frames shot while walking, "pan" tours scrub through frames shot while
// turning on the spot.
//
// Walking is continuous: the position is a real number between frames. Between two photos the player estimates the
// motion (tour/flow.js), bends both photos along it and cross-fades (tour/warp.js), so a step is a glide instead of a
// jump. Without WebGL, or when the page is opened from file:// (browsers refuse to read pixels of local images), it
// falls back to a zoom cross-fade.
(function (root) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var rv = $('rv'), marker = $('marker');
  var tours = [], tour = null;
  var idx = -1, front = 'b', panX = 0, pf = 0, vel = 0, auto = true, raf = null, walking = null, down = null, moved = false, pa = -1, pb = -1;
  var token = 0, hintTimer = 0;
  var cache = {};
  var A = $('a'), B = $('b');

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
            if (im.complete) fin(); else { im.addEventListener('load', fin, { once: true }); im.addEventListener('error', fin, { once: true }); }
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

  /* ================= walk ================= */
  var gl = null, glFailed = false, wpos = 0, wtarget = 0, holding = 0, walkRaf = 0, lastT = 0;
  var flows = {}, grays = {}, flowQueue = [], flowTimer = 0, canvas = null;

  function ensureGL() {
    if (gl || glFailed) return !!gl;
    try {
      canvas = document.createElement('canvas'); canvas.id = 'gl';
      rv.insertBefore(canvas, rv.firstChild);
      gl = new root.TourWarper(canvas);
    } catch (e) { glFailed = true; gl = null; if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas); }
    return !!gl;
  }
  function disableGL() {            // reading pixels was refused (file://) or the context died: use the CSS fallback
    glFailed = true;
    if (gl) { try { gl.destroy(); } catch (e) { /* ignore */ } }
    gl = null; if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    cancelAnimationFrame(walkRaf); walkRaf = 0;
    if (tour && tour.type === 'walk') { var at = Math.round(wpos); idx = -1; front = 'b'; goCss(at); }
  }

  // ---- motion estimates, computed in the background, nearest pairs first ----
  var WORK_W = 256;
  function grayOf(tourId, i) {
    var key = tourId + ':' + i;
    if (grays[key]) return grays[key];
    var im = imgOf(tour.url(i)), w = WORK_W, h = Math.max(8, Math.round(w * im.naturalHeight / im.naturalWidth));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0, w, h);
    return (grays[key] = root.TourFlow.gray(x.getImageData(0, 0, w, h).data, w, h));
  }
  function computePair(t, i) {
    var key = t.id + ':' + i;
    if (flows[key]) return;
    var a = grayOf(t.id, i), b = grayOf(t.id, i + 1);
    var pr = root.TourFlow.estimatePair(a, b);
    flows[key] = { A: root.TourWarper.field(pr.ab), B: root.TourWarper.field(pr.ba) };
  }
  function queuePairs(t, around) {
    flowQueue = [];
    for (var i = 0; i < t.count - 1; i++) flowQueue.push(i);
    flowQueue.sort(function (p, q) { return Math.abs(p - around) - Math.abs(q - around); });
    clearTimeout(flowTimer); pumpFlows(t, token);
  }
  function pumpFlows(t, tk) {
    if (tk !== token || !flowQueue.length) return;
    try { computePair(t, flowQueue.shift()); wake(); } catch (e) { disableGL(); return; }
    flowTimer = setTimeout(function () { pumpFlows(t, tk); }, 0);
  }

  // ---- drawing ----
  function drawWalk() {
    var n = tour.count, p = Math.min(n - 1, Math.max(0, wpos)), i = Math.min(n - 2, Math.floor(p)), f = n > 1 ? p - i : 0;
    if (n < 2) i = 0;
    var fl = flows[tour.id + ':' + i];
    var w = rv.clientWidth || 1, h = rv.clientHeight || 1;
    try {
      gl.render(imgOf(tour.url(i)), n > 1 ? imgOf(tour.url(i + 1)) : null, fl && fl.A, fl && fl.B, f, [panX / w, 0]);
    } catch (e) { disableGL(); return; }
    progress(n > 1 ? p / (n - 1) : 0, (Math.round(p) + 1) + '/' + n);
    $('fwd').style.opacity = Math.round(wtarget) >= n - 1 && !holding ? 0.35 : 1;
    $('bck').style.opacity = Math.round(wtarget) <= 0 && !holding ? 0.35 : 1;
  }
  function wake() { if (gl && tour && tour.type === 'walk' && !walkRaf) { lastT = 0; walkRaf = requestAnimationFrame(walkTick); } }
  function walkTick(now) {
    walkRaf = 0;
    if (!gl || !tour || tour.type !== 'walk') return;
    var dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016; lastT = now;
    var diff = wtarget - wpos;
    if (Math.abs(diff) > 0.0008) {
      var step = diff * (1 - Math.exp(-dt * 5.5));                    // ease toward the target
      var cap = (holding ? (tour.count > 20 ? 4.5 : 1.8) : 6) * dt;    // frames per second while walking / settling
      wpos += Math.abs(step) > cap ? Math.sign(step) * cap : step;
      if (Math.abs(wtarget - wpos) < 0.0008) wpos = wtarget;
    }
    drawWalk();
    idx = Math.round(wtarget);
    if (Math.abs(wtarget - wpos) > 0.0008 || down) walkRaf = requestAnimationFrame(walkTick);
  }

  // ---- CSS fallback (same look as before) ----
  function paint(src, dir) {
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
  function goCss(g) {
    g = Math.max(0, Math.min(tour.count - 1, g));
    var dir = g >= idx ? 1 : -1;
    if (g === idx) return false;
    idx = g; wpos = wtarget = g; paint(tour.url(g), dir);
    progress(tour.count > 1 ? g / (tour.count - 1) : 0, (g + 1) + '/' + tour.count);
    $('fwd').style.opacity = g === tour.count - 1 ? 0.35 : 1; $('bck').style.opacity = g === 0 ? 0.35 : 1;
    return true;
  }

  // ---- stepping ----
  function go(dir) {
    if (!tour || tour.type !== 'walk') return false;
    if (!gl) return goCss(idx + dir);
    var cur = Math.round(wtarget), t = Math.max(0, Math.min(tour.count - 1, cur + dir));
    if (t === cur) return false;
    wtarget = t; idx = t; wake();
    return true;
  }
  function stopWalk() {
    clearInterval(walking); walking = null;
    if (holding && gl) { wtarget = holding > 0 ? Math.ceil(wpos - 1e-6) : Math.floor(wpos + 1e-6); holding = 0; wake(); }
    holding = 0;
  }
  function startWalk(dir) {
    stopWalk();
    if (gl) { holding = dir; wtarget = dir > 0 ? tour.count - 1 : 0; wake(); return; }       // glide while held
    go(dir); walking = setInterval(function () { if (!go(dir)) stopWalk(); }, tour && tour.count > 20 ? 450 : 800);
  }

  /* ================= pan ================= */
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
    walk: '바닥을 클릭하면 앞으로, 화면 아래쪽을 클릭하면 뒤로 · 화살표를 누르고 있으면 계속 걷습니다 · 드래그로 둘러보기',
    pan: '좌우로 드래그해서 돌려 보세요 (카메라가 돌아가는 방향 그대로 움직입니다)'
  };

  function select(t) {
    var tk = ++token;
    stopWalk(); cancelAnimationFrame(raf); cancelAnimationFrame(walkRaf); walkRaf = 0; clearTimeout(flowTimer); down = null; tour = null;
    $('place').textContent = t.title;
    document.querySelectorAll('#tabs .btn').forEach(function (b) { b.classList.toggle('on', b.dataset.id === t.id); });
    $('arrows').style.display = t.type === 'walk' ? '' : 'none';
    $('s').textContent = t.type === 'walk' ? '입구' : '시작'; $('e').textContent = t.type === 'walk' ? '끝' : (t.loop ? '한 바퀴' : '끝');
    var first = imgOf(t.url(0));
    return new Promise(function (r) { if (first.complete) r(); else { first.addEventListener('load', r, { once: true }); first.addEventListener('error', r, { once: true }); } }).then(function () {
      if (tk !== token) return;
      if (first.naturalWidth) rv.style.setProperty('--ar', first.naturalWidth / first.naturalHeight);
      return preload(t, tk);
    }).then(function () {
      if (tk !== token) return;
      tour = t; panX = 0;
      hint(HINTS[t.type], 6000);
      [A, B].forEach(function (e) { e.style.opacity = 0; e.style.transition = ''; e.style.transform = 'none'; });
      if (canvas) canvas.style.display = t.type === 'walk' ? '' : 'none';
      if (t.type === 'walk') {
        idx = -1; front = 'b'; wpos = wtarget = 0; holding = 0;
        if (t.count > 1 && ensureGL()) {
          canvas.style.display = '';
          try { computePair(t, 0); } catch (e) { disableGL(); }            // first pair now so the first step is already smooth
        }
        if (gl) {
          idx = 0; wake(); drawWalk(); queuePairs(t, 0);
          // a second texture upload on the next frame exposes cross-origin refusals early
          requestAnimationFrame(function () { if (gl && tour === t) drawWalk(); });
        } else {
          goCss(0);
          if (t.count > 1) hint(HINTS.walk + (/^https?:$/.test(location.protocol) ? '' : ' · 서버나 http로 열면 프레임 사이가 부드럽게 이어집니다'), 8000);
        }
      } else { pf = 0; vel = 0; auto = true; pa = pb = -1; front = 'a'; raf = requestAnimationFrame(loop); }
      try { var u = new URL(location.href); u.searchParams.set('tour', t.id); history.replaceState(null, '', u); } catch (e) { /* file:// */ }
    });
  }

  /* ================= pointer / keys ================= */
  function zone(e) { var r = rv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; }
  function setPan(x) {
    var lim = rv.clientWidth * 0.05; panX = Math.max(-lim, Math.min(lim, x));
    if (gl) wake(); else $(front).style.transform = 'translateX(' + panX + 'px) scale(1)';
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
  root.addEventListener('pointercancel', function () { down = null; rv.classList.remove('drag'); });
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
  root.addEventListener('resize', function () { if (gl) wake(); });

  /* ================= boot ================= */
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
      state: function () { return { idx: idx, pos: wpos, target: wtarget, pf: pf, auto: auto, smooth: !!gl, flows: Object.keys(flows).length }; }, ready: true };
    root.dispatchEvent(new Event('tour-ready'));
  });
})(window);
