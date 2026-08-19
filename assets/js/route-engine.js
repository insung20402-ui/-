/*
 * 경로 탐색 엔진
 * SCHOOL_MAPS 의 모든 지도를 하나의 그래프로 합치고, 정문에서 목적지까지
 * 최단 경로를 계산한 뒤 지도(장면) 단위로 잘라서 반환한다.
 */
(function (global) {
  const MAPS = global.SCHOOL_MAPS;
  const INTER_LINKS = global.SCHOOL_INTER_LINKS;

  function key(map, node) {
    return map + '||' + node;
  }

  /** avoidEdges: [{map,a,b}] 형태로, 특정 지도의 특정 간선을 그래프에서 제외한다 (대체 경로 계산용) */
  function buildGraph(avoidEdges) {
    const vertices = new Map(); // key -> {map,node,x,y}
    const adj = new Map(); // key -> [{to,dist}]

    function ensure(k) {
      if (!adj.has(k)) adj.set(k, []);
    }

    function isAvoided(mapId, a, b) {
      return (avoidEdges || []).some((e) => e.map === mapId && ((e.a === a && e.b === b) || (e.a === b && e.b === a)));
    }

    Object.values(MAPS).forEach((map) => {
      const byId = {};
      map.nodes.forEach((n) => { byId[n.id] = n; });
      map.nodes.forEach((n) => {
        const k = key(map.id, n.id);
        vertices.set(k, { map: map.id, node: n.id, x: n.x, y: n.y });
        ensure(k);
      });
      map.edges.forEach(([a, b]) => {
        if (isAvoided(map.id, a, b)) return;
        const na = byId[a], nb = byId[b];
        if (!na || !nb) return;
        const d = Math.hypot(na.x - nb.x, na.y - nb.y);
        const ka = key(map.id, a), kb = key(map.id, b);
        adj.get(ka).push({ to: kb, dist: d });
        adj.get(kb).push({ to: ka, dist: d });
      });
    });

    INTER_LINKS.forEach((link) => {
      const ka = key(link.a.map, link.a.node);
      const kb = key(link.b.map, link.b.node);
      if (!vertices.has(ka) || !vertices.has(kb)) return;
      const TRANSITION_COST = 90;
      ensure(ka); ensure(kb);
      adj.get(ka).push({ to: kb, dist: TRANSITION_COST });
      adj.get(kb).push({ to: ka, dist: TRANSITION_COST });
    });

    return { vertices, adj };
  }

  function findRoomOwner(roomId) {
    for (const map of Object.values(MAPS)) {
      if (map.rooms.some((r) => r.id === roomId)) return map.id;
    }
    return null;
  }

  function dijkstra(graph, startKey, targetKey) {
    const { adj } = graph;
    const dist = new Map();
    const prev = new Map();
    const visited = new Set();
    dist.set(startKey, 0);
    const queue = new Set(adj.keys());

    while (queue.size) {
      let u = null, best = Infinity;
      for (const k of queue) {
        const d = dist.has(k) ? dist.get(k) : Infinity;
        if (d < best) { best = d; u = k; }
      }
      if (u === null) break;
      queue.delete(u);
      if (u === targetKey) break;
      visited.add(u);
      const du = dist.get(u);
      (adj.get(u) || []).forEach((edge) => {
        if (visited.has(edge.to)) return;
        const nd = du + edge.dist;
        if (nd < (dist.has(edge.to) ? dist.get(edge.to) : Infinity)) {
          dist.set(edge.to, nd);
          prev.set(edge.to, u);
        }
      });
    }

    if (!dist.has(targetKey)) return null;
    const path = [];
    let cur = targetKey;
    while (cur) {
      path.unshift(cur);
      cur = prev.get(cur);
      if (cur === startKey) { path.unshift(cur); break; }
    }
    return path;
  }

  /** 정문에서 destRoomId 까지 경로를 지도별 장면(scene) 배열로 반환
   *  opts.avoidEdges: [{map,a,b}] — 특정 간선을 피해서 대체 경로를 계산할 때 사용 */
  function computeRoute(destRoomId, opts) {
    const graph = buildGraph(opts && opts.avoidEdges);
    const start = global.SCHOOL_START;
    const startKey = key(start.map, start.node);
    const targetMap = findRoomOwner(destRoomId);
    if (!targetMap) return null;
    const targetKey = key(targetMap, destRoomId);

    const pathKeys = dijkstra(graph, startKey, targetKey);
    if (!pathKeys) return null;

    const points = pathKeys.map((k) => graph.vertices.get(k));

    // 같은 지도가 연속되는 구간끼리 묶어 장면으로 분할
    const scenes = [];
    points.forEach((p) => {
      const last = scenes[scenes.length - 1];
      if (last && last.mapId === p.map) {
        last.points.push(p);
      } else {
        scenes.push({ mapId: p.map, points: [p] });
      }
    });
    // 중복 지도가 다시 등장하면(왕복) 별도 장면 유지 — 그대로 둠
    return scenes;
  }

  global.RouteEngine = { computeRoute };
})(window);
