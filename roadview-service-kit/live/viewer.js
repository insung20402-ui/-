// Roadview viewer for real panoramas (three.js): drag with inertia, pinch/wheel zoom,
// arrows on the ground toward linked captures, crossfade, low -> high resolution swap.
(function (root) {
  'use strict';
  var D2R = Math.PI / 180, CAM_H = 2.5, FADE_MS = 320;
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function norm360(a) { return ((a % 360) + 360) % 360; }
  function norm180(a) { return ((a + 540) % 360) - 180; }

  // host: { getNode(id), getLinks(id), getPano(node, lod) -> Promise<canvas>, isCached(node, lod) }
  root.createLiveViewer = function (el, host) {
    var THREE = root.THREE, listeners = {};
    var state = { nodeId: null, heading: 0, pitch: 0, fov: 75 };
    var destroyed = false, dirty = true, loadToken = 0, lastPov = '';
    var vel = { h: 0, p: 0, t: 0 }, fovTarget = null, fade = null, hovered = null, arrowMeshes = [];

    function on(n, cb) { (listeners[n] = listeners[n] || []).push(cb); return api; }
    function emit(n, p) { (listeners[n] || []).slice().forEach(function (cb) { cb(p); }); }

    var renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 2));
    var dom = renderer.domElement;
    dom.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;outline:none;cursor:grab';
    dom.tabIndex = 0;
    el.appendChild(dom);

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(state.fov, 1, 0.1, 300);
    var geo = new THREE.SphereGeometry(100, 64, 32);
    geo.scale(-1, 1, 1);
    function sphere() {
      var m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthTest: false, depthWrite: false }));
      scene.add(m); return m;
    }
    var front = sphere(), back = sphere();
    function tex(canvas) {
      var t = new THREE.CanvasTexture(canvas);
      t.minFilter = THREE.LinearFilter; t.generateMipmaps = false;
      return t;
    }
    function setMap(mesh, t) {
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.map = t; mesh.material.needsUpdate = true;
    }
    function finishFade() {
      if (!fade) return;
      fade = null; front.material.opacity = 1; back.material.opacity = 0; setMap(back, null);
    }

    // ---- ground arrows ----
    var arrows = new THREE.Group();
    scene.add(arrows);
    function chevron() {
      var s = new THREE.Shape();
      s.moveTo(0, 0.9); s.lineTo(0.85, 0.05); s.lineTo(0.85, -0.4); s.lineTo(0, 0.45); s.lineTo(-0.85, -0.4); s.lineTo(-0.85, 0.05); s.closePath();
      return s;
    }
    var arrowGeo = new THREE.ShapeGeometry(chevron());
    function buildArrows() {
      arrowMeshes.forEach(function (m) { m.material.dispose(); });
      arrowMeshes = []; hovered = null;
      while (arrows.children.length) arrows.remove(arrows.children[0]);
      host.getLinks(state.nodeId).forEach(function (link) {
        var holder = new THREE.Group();
        holder.rotation.y = -link.heading * D2R;
        var mesh = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false, side: THREE.DoubleSide }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, -CAM_H, -7);
        mesh.renderOrder = 5;
        mesh.userData.link = link;
        holder.add(mesh); arrows.add(holder); arrowMeshes.push(mesh);
      });
    }

    // ---- loading ----
    function showCapture(crossfade) {
      var token = ++loadToken, node = host.getNode(state.nodeId);
      var hasHigh = host.isCached(node, 'high');
      host.getPano(node, hasHigh ? 'high' : 'low').then(function (canvas) {
        if (destroyed || token !== loadToken) return;
        var t = tex(canvas);
        finishFade();
        if (crossfade && front.material.map) {
          var old = front; front = back; back = old;
          setMap(front, t); front.material.opacity = 0; front.renderOrder = 2; back.renderOrder = 1;
          fade = { start: performance.now() };
        } else { setMap(front, t); front.material.opacity = 1; }
        dirty = true;
        emit('load', { nodeId: node.id, lod: hasHigh ? 'high' : 'low' });
        if (!hasHigh) host.getPano(node, 'high').then(function (hc) {
          if (destroyed || token !== loadToken) return;
          setMap(front, tex(hc)); dirty = true;
          emit('load', { nodeId: node.id, lod: 'high' });
        });
        prefetch(token);
      }, function (err) { emit('error', err); });
    }
    function prefetch(token) {
      host.getLinks(state.nodeId).slice().sort(function (p, q) {
        return Math.abs(norm180(p.heading - state.heading)) - Math.abs(norm180(q.heading - state.heading));
      }).slice(0, 2).forEach(function (l, i) {
        setTimeout(function () {
          if (destroyed || token !== loadToken) return;
          var n = host.getNode(l.target);
          if (n) host.getPano(n, 'low');
        }, 150 * (i + 1));
      });
    }

    function setPano(nodeId, o) {
      var node = host.getNode(nodeId);
      if (!node) return false;
      o = o || {};
      var first = state.nodeId === null;
      if (o.pov) setPov(o.pov); else if (first) setPov({ heading: node.heading || 0, pitch: 0 });
      if (!first && nodeId === state.nodeId && !o.force) return true;
      state.nodeId = nodeId;
      buildArrows();
      showCapture(!first && !o.force);
      emit('pano_changed', { nodeId: nodeId, node: node });
      return true;
    }
    function refresh() { if (state.nodeId) { buildArrows(); showCapture(false); } }

    function setPov(p) {
      if (p.heading !== undefined) state.heading = norm360(p.heading);
      if (p.pitch !== undefined) state.pitch = clamp(p.pitch, -85, 85);
      if (p.fov !== undefined) { state.fov = clamp(p.fov, 30, 100); fovTarget = null; }
      dirty = true;
    }
    function move(rel) {
      if (state.nodeId === null) return false;
      var want = state.heading + (rel || 0), best = null, bd = 60;
      host.getLinks(state.nodeId).forEach(function (l) {
        var d = Math.abs(norm180(l.heading - want));
        if (d <= bd) { best = l; bd = d; }
      });
      if (!best) { emit('no_link', {}); return false; }
      return setPano(best.target);
    }

    // ---- input ----
    var ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), drag = null, pointers = {}, pinch = null;
    function cast(e) {
      var r = dom.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
      camera.updateMatrixWorld(); ray.setFromCamera(ndc, camera);
    }
    function arrowAt(e) { cast(e); var h = ray.intersectObjects(arrowMeshes)[0]; return h ? h.object : null; }
    function setHover(m) {
      if (hovered === m) return;
      if (hovered) hovered.material.color.set(0xffffff);
      hovered = m;
      if (hovered) hovered.material.color.set(0x4ea1ff);
      dom.style.cursor = hovered ? 'pointer' : 'grab';
      dirty = true;
    }
    dom.addEventListener('pointerdown', function (e) {
      dom.focus({ preventScroll: true });
      pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      try { dom.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
      var ids = Object.keys(pointers);
      if (ids.length === 2) {
        var a = pointers[ids[0]], b = pointers[ids[1]];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), fov: state.fov }; drag = null; return;
      }
      vel.h = 0; vel.p = 0; vel.t = 0;
      drag = { x: e.clientX, y: e.clientY, heading: state.heading, pitch: state.pitch, moved: false };
    });
    dom.addEventListener('pointermove', function (e) {
      if (pointers[e.pointerId]) pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
      if (pinch) {
        var ids = Object.keys(pointers);
        if (ids.length >= 2) {
          var a = pointers[ids[0]], b = pointers[ids[1]];
          setPov({ fov: pinch.fov * pinch.d / Math.max(10, Math.hypot(a.x - b.x, a.y - b.y)) });
        }
        return;
      }
      if (!drag) { setHover(arrowAt(e)); return; }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (!drag.moved) return;
      var dpp = state.fov / dom.clientHeight, ph = state.heading, pp = state.pitch;
      setPov({ heading: drag.heading - dx * dpp, pitch: drag.pitch + dy * dpp });
      var now = performance.now(), dt = Math.max(1, now - (vel.t || now));
      vel.h = 0.8 * vel.h + 0.2 * norm180(state.heading - ph) / dt;
      vel.p = 0.8 * vel.p + 0.2 * (state.pitch - pp) / dt;
      vel.t = now;
    });
    function up(e) {
      delete pointers[e.pointerId];
      if (pinch) { if (Object.keys(pointers).length < 2) pinch = null; return; }
      if (!drag) return;
      var click = !drag.moved;
      if (!click && performance.now() - vel.t > 80) { vel.h = 0; vel.p = 0; }
      drag = null;
      if (click && state.nodeId !== null && e.type === 'pointerup') {
        var m = arrowAt(e);
        if (m) setPano(m.userData.link.target);
      }
    }
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', function (e) { delete pointers[e.pointerId]; drag = null; pinch = null; });
    dom.addEventListener('wheel', function (e) {
      e.preventDefault();
      fovTarget = clamp((fovTarget === null ? state.fov : fovTarget) + e.deltaY * 0.05, 30, 100);
    }, { passive: false });
    dom.addEventListener('keydown', function (e) {
      var ok = true;
      if (e.key === 'ArrowUp') move(0);
      else if (e.key === 'ArrowDown') move(180);
      else if (e.key === 'ArrowLeft') setPov({ heading: state.heading - 15 });
      else if (e.key === 'ArrowRight') setPov({ heading: state.heading + 15 });
      else ok = false;
      if (ok) e.preventDefault();
    });

    function resize() {
      var w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false); camera.aspect = w / h; dirty = true;
    }
    var ro = new ResizeObserver(resize);
    ro.observe(el); resize();

    var lastT = 0;
    function frame(now) {
      if (destroyed) return;
      requestAnimationFrame(frame);
      var step = Math.min(50, now - (lastT || now)); lastT = now;
      if (fade) {
        var t = clamp((now - fade.start) / FADE_MS, 0, 1);
        front.material.opacity = t; dirty = true;
        if (t >= 1) finishFade();
      }
      if (!drag && !pinch && (Math.abs(vel.h) > 0.001 || Math.abs(vel.p) > 0.001)) {
        setPov({ heading: state.heading + vel.h * step, pitch: state.pitch + vel.p * step });
        var k = Math.pow(0.92, step / 16); vel.h *= k; vel.p *= k;
      }
      if (fovTarget !== null) {
        var goal = fovTarget, df = goal - state.fov;
        if (Math.abs(df) < 0.05) setPov({ fov: goal }); else { setPov({ fov: state.fov + df * 0.2 }); fovTarget = goal; }
      }
      if (!dirty) return;
      dirty = false;
      var h = state.heading * D2R, p = state.pitch * D2R;
      camera.fov = state.fov; camera.updateProjectionMatrix();
      camera.lookAt(Math.sin(h) * Math.cos(p) * 10, Math.sin(p) * 10, -Math.cos(h) * Math.cos(p) * 10);
      renderer.render(scene, camera);
      var key = state.heading.toFixed(1) + '|' + state.pitch.toFixed(1) + '|' + state.fov.toFixed(1);
      if (key !== lastPov) { lastPov = key; emit('pov_changed', { heading: state.heading, pitch: state.pitch, fov: state.fov }); }
    }
    requestAnimationFrame(frame);

    var api = {
      on: on, setPano: setPano, setPov: setPov, refresh: refresh, resize: resize, move: move,
      getPov: function () { return { heading: state.heading, pitch: state.pitch, fov: state.fov }; },
      getState: function () { return { nodeId: state.nodeId, heading: state.heading, pitch: state.pitch, fov: state.fov }; },
      forward: function () { return move(0); }, backward: function () { return move(180); },
      clear: function () {
        state.nodeId = null; loadToken++; setMap(front, null); setMap(back, null);
        front.material.opacity = 0; buildArrowsEmpty(); dirty = true;
      },
      element: dom,
      destroy: function () {
        destroyed = true; ro.disconnect(); setMap(front, null); setMap(back, null);
        renderer.dispose(); if (dom.parentNode) dom.parentNode.removeChild(dom);
      }
    };
    function buildArrowsEmpty() { while (arrows.children.length) arrows.remove(arrows.children[0]); arrowMeshes = []; }
    return api;
  };
})(window);
