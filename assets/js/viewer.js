/*
 * 지도 렌더링 + 경로 애니메이션(화재대피 안내영상 스타일) 뷰어
 */
(function (global) {
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const MAPS = global.SCHOOL_MAPS;

  function el(tag, attrs, parent) {
    const e = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
    if (parent) parent.appendChild(e);
    return e;
  }

  function categoryColor(cat) {
    switch (cat) {
      case 'circulation': return '#c8cdd6';
      case 'facility': return '#bfe3d0';
      case 'admin': return '#f6d9a8';
      case 'classroom': return '#cfe0f7';
      case 'outdoor': return '#d9ecc4';
      default: return '#e4d6f5';
    }
  }

  /** 지도 하나를 svg 그룹으로 그린다 */
  function renderMap(svg, map, opts) {
    opts = opts || {};
    svg.setAttribute('viewBox', map.viewBox);
    svg.innerHTML = '';
    const scene = el('g', { class: 'scene' }, svg);

    const bg = el('rect', { x: -1000, y: -1000, width: 5000, height: 5000, fill: 'var(--map-bg, #fbfaf7)' }, scene);

    (map.rects || []).forEach((r) => {
      if (r.wall) {
        el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: 'none', stroke: 'var(--map-wall, #2b2b2b)', 'stroke-width': 6 }, scene);
      } else if (r.landmark) {
        const g = el('g', {}, scene);
        el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, fill: 'var(--landmark-fill, #eceae2)', stroke: 'var(--map-wall, #2b2b2b)', 'stroke-width': 3, 'stroke-dasharray': '2 6', rx: 4 }, g);
        const fontSize = Math.max(13, Math.min(r.w, r.h) * 0.18);
        const t = el('text', { x: r.x + r.w / 2, y: r.y + r.h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle', 'font-size': fontSize, fill: 'var(--ink-soft, #5b6270)', 'font-weight': 600 }, g);
        t.textContent = r.label;
      }
    });

    const roomLayer = el('g', {}, scene);
    map.rooms.forEach((room) => {
      const isDest = opts.destId === room.id;
      const g = el('g', { class: 'room' + (isDest ? ' room--dest' : '') }, roomLayer);
      el('rect', {
        x: room.x, y: room.y, width: room.w, height: room.h,
        fill: isDest ? 'var(--map-dest, #ff8a3d)' : categoryColor(room.category),
        stroke: 'var(--map-wall, #2b2b2b)', 'stroke-width': 3, opacity: isDest ? 0.95 : 0.9,
        rx: 4,
      }, g);
      const fontSize = Math.max(14, Math.min(room.w, room.h) * 0.16);
      const text = el('text', {
        x: room.cx, y: room.cy, 'text-anchor': 'middle', 'dominant-baseline': 'middle',
        'font-size': fontSize, fill: isDest ? '#3a1a00' : '#20242b', 'font-weight': isDest ? 700 : 500,
      }, g);
      text.textContent = room.label;
    });

    const routeLayer = el('g', { class: 'route-layer' }, scene);
    return { svg, routeLayer };
  }

  function distance(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

  function buildPathD(points) {
    return points.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
  }

  function wait(ms) { return new Promise((res) => setTimeout(res, ms)); }

  /** 한 장면(scene)의 경로선 + 이동 마커 애니메이션 */
  function animateScene(routeLayer, points, opts) {
    return new Promise((resolve) => {
      if (points.length < 2) { resolve(); return; }
      const path = el('path', {
        d: buildPathD(points), fill: 'none', stroke: 'var(--route-color, #e0402a)',
        'stroke-width': 10, 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
      }, routeLayer);
      const len = path.getTotalLength();
      path.setAttribute('stroke-dasharray', len);
      path.setAttribute('stroke-dashoffset', len);

      const marker = el('circle', { r: 16, fill: 'var(--route-marker, #e0402a)', stroke: '#fff', 'stroke-width': 4 }, routeLayer);
      const glow = el('circle', { r: 26, fill: 'var(--route-marker, #e0402a)', opacity: 0.25 }, routeLayer);

      const duration = Math.max(700, Math.min(3200, len * 1.5));
      const start = performance.now();

      function frame(now) {
        const t = Math.min(1, (now - start) / duration);
        const eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        path.setAttribute('stroke-dashoffset', String(len * (1 - eased)));
        const pt = path.getPointAtLength(len * eased);
        marker.setAttribute('cx', pt.x); marker.setAttribute('cy', pt.y);
        glow.setAttribute('cx', pt.x); glow.setAttribute('cy', pt.y);
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  /**
   * scenes: RouteEngine.computeRoute() 결과
   * container: {svg, statusEl} 뷰어 DOM 참조
   */
  async function playRoute(scenes, destRoomId, refs, onCancelToken) {
    const destMapId = scenes[scenes.length - 1].mapId;
    let lastRouteLayer = null;
    for (let i = 0; i < scenes.length; i++) {
      if (onCancelToken.cancelled) return;
      const scene = scenes[i];
      const map = MAPS[scene.mapId];
      const isLast = i === scenes.length - 1;
      refs.statusEl.textContent = `${i + 1} / ${scenes.length} 단계 · ${map.building}${map.floor ? ' ' + map.floor : ''} 이동 중…`;
      const { routeLayer } = renderMap(refs.svg, map, { destId: isLast ? destRoomId : null });
      lastRouteLayer = routeLayer;
      // 출발 표시
      const startPt = scene.points[0];
      const startDot = el('circle', { cx: startPt.x, cy: startPt.y, r: 14, fill: 'var(--route-start, #2b6fe0)' }, routeLayer);
      await wait(180);
      if (onCancelToken.cancelled) return;
      await animateScene(routeLayer, scene.points, {});
      if (onCancelToken.cancelled) return;
      if (!isLast) {
        refs.statusEl.textContent = `${map.building}${map.floor ? ' ' + map.floor : ''} → 다음 구역으로 이동`;
        await wait(500);
      }
    }
    const destMap = MAPS[destMapId];
    const destRoom = destMap.rooms.find((r) => r.id === destRoomId);
    if (lastRouteLayer && destRoom) {
      el('circle', { class: 'route-arrive-ring', cx: destRoom.cx, cy: destRoom.cy, r: 16, fill: 'none', stroke: 'var(--map-dest, #ff8a3d)', 'stroke-width': 4 }, lastRouteLayer);
    }
    refs.statusEl.textContent = `도착! ${destMap.building}${destMap.floor ? ' ' + destMap.floor : ''} · ${destRoom ? destRoom.label : ''}`;
  }

  global.MapViewer = { renderMap, playRoute };
})(window);
