// Panorama viewer (three.js): drag/zoom POV, ground arrows for navigation
// links, crossfade between captures, low -> high LOD swap, link prefetch,
// vintage switching and the blur-report click flow.
(function (root) {
  'use strict';
  var RV = root.RV;
  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var FADE_MS = 320;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  RV.createViewer = function (el, opts) {
    opts = opts || {};
    var THREE = root.THREE;
    var listeners = {};
    var state = {
      nodeId: null, year: null, vintage: opts.vintage || 'latest',
      heading: 0, pitch: 0, fov: 75
    };
    var destroyed = false, dirty = true, reportMode = false;
    var loadToken = 0, lastPov = '';
    var vel = { h: 0, p: 0, t: 0 }, fovTarget = null;   // drag inertia (deg/ms) and eased wheel zoom

    function on(name, cb) { (listeners[name] = listeners[name] || []).push(cb); return api; }
    function emit(name, payload) {
      (listeners[name] || []).slice().forEach(function (cb) { cb(payload); });
    }

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
    function makeSphere() {
      var mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
        transparent: true, opacity: 0, depthTest: false, depthWrite: false
      }));
      scene.add(mesh);
      return mesh;
    }
    var front = makeSphere(), back = makeSphere();
    var fade = null;

    function makeTexture(canvas) {
      var tex = new THREE.CanvasTexture(canvas);
      tex.minFilter = THREE.LinearFilter;
      tex.generateMipmaps = false;
      return tex;
    }
    function setMap(mesh, tex) {
      if (mesh.material.map) mesh.material.map.dispose();
      mesh.material.map = tex;
      mesh.material.needsUpdate = true;
    }
    function finishFade() {
      if (!fade) return;
      fade = null;
      front.material.opacity = 1;
      back.material.opacity = 0;
      setMap(back, null);
    }

    // ---- navigation arrows ----
    var arrows = new THREE.Group();
    scene.add(arrows);
    var arrowMeshes = [];
    var hovered = null;
    function chevron(offsetY) {
      var s = new THREE.Shape();
      s.moveTo(0, 0.9 + offsetY);
      s.lineTo(0.85, 0.05 + offsetY);
      s.lineTo(0.85, -0.4 + offsetY);
      s.lineTo(0, 0.45 + offsetY);
      s.lineTo(-0.85, -0.4 + offsetY);
      s.lineTo(-0.85, 0.05 + offsetY);
      s.closePath();
      return s;
    }
    var stepGeo = new THREE.ShapeGeometry(chevron(0));
    var jumpGeo = new THREE.ShapeGeometry([chevron(-0.45), chevron(0.45)]);
    function buildArrows() {
      arrowMeshes.forEach(function (m) { m.material.dispose(); });
      arrowMeshes = [];
      hovered = null;
      while (arrows.children.length) arrows.remove(arrows.children[0]);
      if (opts.showArrows === false) return;
      RV.getNode(state.nodeId).links.forEach(function (link) {
        var jump = link.kind === 'jump';
        var holder = new THREE.Group();
        holder.rotation.y = -link.heading * D2R;
        var mesh = new THREE.Mesh(jump ? jumpGeo : stepGeo, new THREE.MeshBasicMaterial({
          color: 0xffffff, transparent: true, opacity: jump ? 0.6 : 0.9,
          depthTest: false, side: THREE.DoubleSide
        }));
        mesh.rotation.x = -Math.PI / 2;
        mesh.position.set(0, -RV.CAM_H, jump ? -13.5 : -7);
        mesh.scale.setScalar(jump ? 0.8 : 1);
        mesh.renderOrder = 5;
        mesh.userData.link = link;
        holder.add(mesh);
        arrows.add(holder);
        arrowMeshes.push(mesh);
      });
    }

    // ---- capture loading ----
    function showCapture(crossfade) {
      var token = ++loadToken;
      var nodeId = state.nodeId, year = state.year;
      var hasHigh = RV.isPanoCached(nodeId, year, 'high', opts.source);
      var tex = makeTexture(RV.getPanoCanvas(nodeId, year, hasHigh ? 'high' : 'low', opts.source));
      finishFade();
      if (crossfade && front.material.map) {
        var old = front;
        front = back;
        back = old;
        setMap(front, tex);
        front.material.opacity = 0;
        front.renderOrder = 2;
        back.renderOrder = 1;
        fade = { start: performance.now() };
      } else {
        setMap(front, tex);
        front.material.opacity = 1;
      }
      dirty = true;
      emit('load', { nodeId: nodeId, year: year, lod: hasHigh ? 'high' : 'low' });
      if (hasHigh) { prefetch(token); return; }
      // high LOD after the low one is on screen (mock of multires tile streaming)
      setTimeout(function () {
        if (destroyed || token !== loadToken) return;
        var hi = makeTexture(RV.getPanoCanvas(nodeId, year, 'high', opts.source));
        setMap(front, hi);
        dirty = true;
        emit('load', { nodeId: nodeId, year: year, lod: 'high' });
        prefetch(token);
      }, FADE_MS + 60);
    }

    // warm the low LOD of the links closest to the current view direction
    function prefetch(token) {
      var node = RV.getNode(state.nodeId);
      var targets = node.links.filter(function (l) { return l.kind === 'step'; })
        .sort(function (p, q) {
          return Math.abs(RV.norm180(p.heading - state.heading)) - Math.abs(RV.norm180(q.heading - state.heading));
        }).slice(0, 2);
      targets.forEach(function (l, i) {
        setTimeout(function () {
          if (destroyed || token !== loadToken) return;
          var t = RV.getNode(l.target);
          RV.getPanoCanvas(t.id, RV.resolveYear(t, state.vintage), 'low', opts.source);
        }, 120 * (i + 1));
      });
    }

    function setPano(nodeId, o) {
      var node = RV.getNode(nodeId);
      if (!node) return false;
      o = o || {};
      if (o.vintage !== undefined) state.vintage = o.vintage;
      var year = RV.resolveYear(node, state.vintage);
      var first = state.nodeId === null;
      if (o.pov) setPov(o.pov);
      else if (first) setPov({ heading: node.heading, pitch: 0 });
      if (!first && nodeId === state.nodeId && year === state.year) return true;
      state.nodeId = nodeId;
      state.year = year;
      buildArrows();
      showCapture(!first);
      emit('pano_changed', {
        nodeId: nodeId, year: year, requestedVintage: state.vintage,
        manifest: RV.getManifest(nodeId, year)
      });
      return true;
    }

    function setPov(pov) {
      if (pov.heading !== undefined) state.heading = RV.norm360(pov.heading);
      if (pov.pitch !== undefined) state.pitch = clamp(pov.pitch, -85, 85);
      if (pov.fov !== undefined) { state.fov = clamp(pov.fov, 30, 100); fovTarget = null; }
      dirty = true;
    }

    function pickLink(heading, kind, maxDiff) {
      var best = null, bestDiff = maxDiff === undefined ? 60 : maxDiff;
      RV.getNode(state.nodeId).links.forEach(function (l) {
        if (l.kind !== kind) return;
        var diff = Math.abs(RV.norm180(l.heading - heading));
        if (diff <= bestDiff) { best = l; bestDiff = diff; }
      });
      return best;
    }
    // relHeading: 0 = the way the user is looking, 180 = behind
    function move(relHeading, kind) {
      if (state.nodeId === null) return false;
      var link = pickLink(state.heading + (relHeading || 0), kind || 'step');
      if (!link) { emit('no_link', { heading: state.heading + (relHeading || 0) }); return false; }
      return setPano(link.target);
    }

    // ---- input ----
    var raycaster = new THREE.Raycaster();
    var ndc = new THREE.Vector2();
    var drag = null;
    function castFromEvent(e) {
      var r = dom.getBoundingClientRect();
      ndc.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height * 2 - 1));
      camera.updateMatrixWorld();
      raycaster.setFromCamera(ndc, camera);
    }
    function arrowAt(e) {
      castFromEvent(e);
      var hit = raycaster.intersectObjects(arrowMeshes)[0];
      return hit ? hit.object : null;
    }
    function setHover(mesh) {
      if (hovered === mesh) return;
      if (hovered) hovered.material.color.set(0xffffff);
      hovered = mesh;
      if (hovered) hovered.material.color.set(0x4ea1ff);
      dom.style.cursor = reportMode ? 'crosshair' : (hovered ? 'pointer' : 'grab');
      dirty = true;
    }
    function onPointerDown(e) {
      dom.focus({ preventScroll: true });
      vel.h = 0; vel.p = 0; vel.t = 0;
      drag = { x: e.clientX, y: e.clientY, heading: state.heading, pitch: state.pitch, moved: false };
      // capture is a nicety (drag keeps tracking outside the canvas); synthetic events cannot be captured
      try { dom.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    }
    function onPointerMove(e) {
      if (!drag) { if (!reportMode) setHover(arrowAt(e)); return; }
      var dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      if (!drag.moved) return;
      var dpp = state.fov / dom.clientHeight;
      var prevH = state.heading, prevP = state.pitch;
      setPov({ heading: drag.heading - dx * dpp, pitch: drag.pitch + dy * dpp });
      var now = performance.now(), dt = Math.max(1, now - (vel.t || now));
      vel.h = 0.8 * vel.h + 0.2 * RV.norm180(state.heading - prevH) / dt;
      vel.p = 0.8 * vel.p + 0.2 * (state.pitch - prevP) / dt;
      vel.t = now;
    }
    function onPointerUp(e) {
      if (!drag) return;
      var wasClick = !drag.moved;
      // a quick flick keeps spinning and decays; a held pause stops dead
      if (!wasClick && performance.now() - vel.t > 80) { vel.h = 0; vel.p = 0; }
      drag = null;
      if (!wasClick || state.nodeId === null) return;
      if (reportMode) {
        castFromEvent(e);
        var d = raycaster.ray.direction;
        var entry = RV.reportBlur(state.nodeId, state.year,
          Math.atan2(d.x, -d.z) * R2D, Math.asin(clamp(d.y, -1, 1)) * R2D, opts.reportNote);
        setReportMode(false);
        emit('report_done', entry);
        return;
      }
      var mesh = arrowAt(e);
      if (mesh) setPano(mesh.userData.link.target);
    }
    function onWheel(e) {
      e.preventDefault();
      fovTarget = clamp((fovTarget === null ? state.fov : fovTarget) + e.deltaY * 0.05, 30, 100);
    }
    function onKey(e) {
      var handled = true;
      // without arrows the host page owns navigation, so keys only rotate
      var nav = opts.showArrows !== false;
      if (nav && e.key === 'ArrowUp') move(0, e.shiftKey ? 'jump' : 'step');
      else if (nav && e.key === 'ArrowDown') move(180, e.shiftKey ? 'jump' : 'step');
      else if (e.key === 'ArrowLeft') setPov({ heading: state.heading - 15 });
      else if (e.key === 'ArrowRight') setPov({ heading: state.heading + 15 });
      else if (e.key === 'Escape' && reportMode) setReportMode(false);
      else handled = false;
      if (handled) e.preventDefault();
    }
    dom.addEventListener('pointerdown', onPointerDown);
    dom.addEventListener('pointermove', onPointerMove);
    dom.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('pointercancel', function () { drag = null; });
    dom.addEventListener('wheel', onWheel, { passive: false });
    dom.addEventListener('keydown', onKey);

    function setReportMode(flag) {
      reportMode = !!flag;
      setHover(null);
      dom.style.cursor = reportMode ? 'crosshair' : 'grab';
      emit('report_mode', { active: reportMode });
    }

    function onPrivacy(e) {
      if (e.nodeId !== state.nodeId || e.year !== state.year) return;
      showCapture(false);
      emit('pano_changed', {
        nodeId: state.nodeId, year: state.year, requestedVintage: state.vintage,
        manifest: RV.getManifest(state.nodeId, state.year)
      });
    }
    RV.on('privacy_changed', onPrivacy);
    // photos registered (or removed) for the capture on screen
    function onImage(e) {
      if (opts.source === 'synthetic' || e.nodeId !== state.nodeId || e.year !== state.year) return;
      showCapture(false);
    }
    RV.on('image_pano_changed', onImage);

    function resize() {
      var w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      dirty = true;
    }
    var ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    function frame(now) {
      if (destroyed) return;
      requestAnimationFrame(frame);
      if (fade) {
        var t = clamp((now - fade.start) / FADE_MS, 0, 1);
        front.material.opacity = t;
        dirty = true;
        if (t >= 1) finishFade();
      }
      if (!drag && (Math.abs(vel.h) > 0.001 || Math.abs(vel.p) > 0.001)) {
        var step = Math.min(50, now - (frame.last || now));
        setPov({ heading: state.heading + vel.h * step, pitch: state.pitch + vel.p * step });
        var decay = Math.pow(0.92, step / 16);
        vel.h *= decay; vel.p *= decay;
      }
      if (fovTarget !== null) {
        var goal = fovTarget, df = goal - state.fov;
        if (Math.abs(df) < 0.05) setPov({ fov: goal });
        else { setPov({ fov: state.fov + df * 0.2 }); fovTarget = goal; }
      }
      frame.last = now;
      if (!dirty) return;
      dirty = false;
      var h = state.heading * D2R, p = state.pitch * D2R;
      camera.fov = state.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(Math.sin(h) * Math.cos(p) * 10, Math.sin(p) * 10, -Math.cos(h) * Math.cos(p) * 10);
      renderer.render(scene, camera);
      var key = state.heading.toFixed(2) + '|' + state.pitch.toFixed(2) + '|' + state.fov.toFixed(2);
      if (key !== lastPov) {
        lastPov = key;
        emit('pov_changed', { heading: state.heading, pitch: state.pitch, fov: state.fov });
      }
    }
    requestAnimationFrame(frame);

    var api = {
      on: on,
      setPano: setPano,
      setPov: setPov,
      getPov: function () { return { heading: state.heading, pitch: state.pitch, fov: state.fov }; },
      getState: function () {
        return { nodeId: state.nodeId, year: state.year, vintage: state.vintage,
          heading: state.heading, pitch: state.pitch, fov: state.fov };
      },
      getManifest: function () { return state.nodeId ? RV.getManifest(state.nodeId, state.year) : null; },
      // 'latest' or a year; a node without that year falls back to its closest capture
      setVintage: function (v) {
        state.vintage = v;
        if (state.nodeId === null) return;
        var year = RV.resolveYear(RV.getNode(state.nodeId), v);
        if (year === state.year) {
          emit('pano_changed', { nodeId: state.nodeId, year: year, requestedVintage: v,
            manifest: RV.getManifest(state.nodeId, year) });
          return;
        }
        state.year = year;
        showCapture(true);
        emit('pano_changed', { nodeId: state.nodeId, year: year, requestedVintage: v,
          manifest: RV.getManifest(state.nodeId, year) });
      },
      forward: function () { return move(0, 'step'); },
      backward: function () { return move(180, 'step'); },
      jump: function (rel) { return move(rel || 0, 'jump'); },
      move: move,
      setReportMode: setReportMode,
      isReportMode: function () { return reportMode; },
      resize: resize,
      focus: function () { dom.focus({ preventScroll: true }); },
      element: dom,
      destroy: function () {
        destroyed = true;
        ro.disconnect();
        RV.off('privacy_changed', onPrivacy);
        RV.off('image_pano_changed', onImage);
        setMap(front, null);
        setMap(back, null);
        renderer.dispose();
        if (dom.parentNode) dom.parentNode.removeChild(dom);
      }
    };

    if (opts.pov) setPov(opts.pov);
    if (opts.nodeId) setPano(opts.nodeId, { pov: opts.pov });
    return api;
  };
})(window);
