/*
 * 만수중학교 시설안내 지도 데이터
 * ------------------------------------------------------------
 * 각 지도(map)는 {id, name, building, floor, viewBox, rects, rooms, nodes, edges} 로 구성됩니다.
 *  - rects : 벽/외곽선 등 순수 렌더링용 사각형
 *  - rooms : 시설안내 목록에 노출되는 실제 "장소" (rect + 라벨 + 길찾기 노드 겸용)
 *  - nodes : rooms 이외에 경로 계산에만 쓰이는 보조 지점(복도 접속점 등)
 *  - edges : [nodeIdA, nodeIdB] 형태의 무방향 간선 (같은 지도 안에서 걸어갈 수 있는 연결)
 * interLinks 는 서로 다른 지도(층/건물)를 잇는 간선입니다 (계단, 출입문, 연결통로).
 */

(function (global) {
  const MAPS = {};
  const INTER_LINKS = [];

  function addMap(map) {
    MAPS[map.id] = map;
    return map;
  }

  function nid(mapId, key) {
    return mapId + ':' + key;
  }

  // ------------------------------------------------------------------
  // 본관 1~5층 : 공통 템플릿으로 생성
  // ------------------------------------------------------------------
  const VB_W = 1700, VB_H = 750;
  const BX0 = 200, BY0 = 280, BX1 = 1500, BY1 = 650;
  const STAIR_W = 150;
  const CORRIDOR_Y = (BY0 + 500) / 2; // 390
  const ROOMROW_Y = (500 + 650) / 2; // 575
  const CENTER_X = (BX0 + BX1) / 2; // 850

  function buildMainFloor(cfg) {
    const mapId = cfg.id;
    const rects = [];
    const rooms = [];
    const nodes = [];
    const edges = [];
    const corridorStops = [];

    rects.push({ x: BX0, y: BY0, w: BX1 - BX0, h: BY1 - BY0, wall: true });
    rects.push({ x: BX0, y: 500, w: BX1 - BX0, h: 0, corridorLine: true });

    // 중앙계단 노치
    if (cfg.hasCenterStair) {
      const cw = 140, cx0 = CENTER_X - cw / 2;
      rects.push({ x: cx0, y: 90, w: cw, h: BY0 - 90, wall: true });
      const id = nid(mapId, 'stairC');
      rooms.push({ id, label: '중앙계단', category: 'circulation', x: cx0, y: 90, w: cw, h: BY0 - 90, cx: CENTER_X, cy: 90 + (BY0 - 90) / 2 });
      nodes.push({ id, x: CENTER_X, y: BY0 + 15 });
      corridorStops.push({ x: CENTER_X, id });
    }

    // 동쪽계단 / 서쪽계단 (양쪽 끝, 전체 높이)
    const stairE = nid(mapId, 'stairE');
    rooms.push({ id: stairE, label: '동쪽계단', category: 'circulation', x: BX0, y: BY0, w: STAIR_W, h: BY1 - BY0, cx: BX0 + STAIR_W / 2, cy: (BY0 + BY1) / 2 });
    nodes.push({ id: stairE, x: BX0 + STAIR_W / 2, y: (BY0 + BY1) / 2 });
    corridorStops.push({ x: BX0 + STAIR_W / 2, id: stairE });

    const stairW = nid(mapId, 'stairW');
    rooms.push({ id: stairW, label: '서쪽계단', category: 'circulation', x: BX1 - STAIR_W, y: BY0, w: STAIR_W, h: BY1 - BY0, cx: BX1 - STAIR_W / 2, cy: (BY0 + BY1) / 2 });
    nodes.push({ id: stairW, x: BX1 - STAIR_W / 2, y: (BY0 + BY1) / 2 });
    corridorStops.push({ x: BX1 - STAIR_W / 2, id: stairW });

    // 상단 좌/중/우 소형실
    const midX0 = BX0 + STAIR_W, midX1 = BX1 - STAIR_W;
    if (cfg.topLeft) {
      const id = nid(mapId, 'topLeft');
      const x = midX0, y = BY0, w = 220, h = 90;
      rooms.push({ id, label: cfg.topLeft, category: cfg.topLeftCat || 'special', x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
      nodes.push({ id, x: x + w / 2, y: y + h + 10 });
      corridorStops.push({ x: x + w / 2, id });
    }
    if (cfg.topRight) {
      const id = nid(mapId, 'topRight');
      const w = 220, x = midX1 - w, y = BY0, h = 90;
      rooms.push({ id, label: cfg.topRight, category: cfg.topRightCat || 'special', x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
      nodes.push({ id, x: x + w / 2, y: y + h + 10 });
      corridorStops.push({ x: x + w / 2, id });
    }
    if (cfg.topMid) {
      const id = nid(mapId, 'topMid');
      const w = 110, x = CENTER_X + 90, y = BY0, h = 60;
      rooms.push({ id, label: cfg.topMid, category: 'facility', x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
      nodes.push({ id, x: x + w / 2, y: y + h + 10 });
      corridorStops.push({ x: x + w / 2, id });
    }

    // 좌/우 부속 출입 공간 (동쪽문/서쪽문/한얼관 가는 길 등)
    if (cfg.leftAppend) {
      const id = nid(mapId, 'leftAppend');
      const w = 150, x = BX0 - w - 20, y = BY0 + 30, h = BY1 - BY0 - 60;
      rooms.push({ id, label: cfg.leftAppend.label, category: cfg.leftAppend.category || 'circulation', x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
      nodes.push({ id, x: x + w, y: y + h / 2 });
      edges.push([id, stairE]);
      if (cfg.leftAppend.bridgeTo) INTER_LINKS.push({ a: { map: mapId, node: id }, b: cfg.leftAppend.bridgeTo, label: cfg.leftAppend.label });
      if (cfg.leftAppend.campus) INTER_LINKS.push({ a: { map: mapId, node: id }, b: cfg.leftAppend.campus, label: cfg.leftAppend.label });
    }
    if (cfg.rightAppend) {
      const id = nid(mapId, 'rightAppend');
      const w = 150, x = BX1 + 20, y = BY0 + 30, h = BY1 - BY0 - 60;
      rooms.push({ id, label: cfg.rightAppend.label, category: cfg.rightAppend.category || 'circulation', x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
      nodes.push({ id, x, y: y + h / 2 });
      edges.push([id, stairW]);
      if (cfg.rightAppend.bridgeTo) INTER_LINKS.push({ a: { map: mapId, node: id }, b: cfg.rightAppend.bridgeTo, label: cfg.rightAppend.label });
      if (cfg.rightAppend.campus) INTER_LINKS.push({ a: { map: mapId, node: id }, b: cfg.rightAppend.campus, label: cfg.rightAppend.label });
    }

    // 아래쪽 방 열 (동쪽계단과 서쪽계단 사이를 cells 개수만큼 균등분할)
    const cells = cfg.cells || [];
    const n = cells.length;
    const cellW = (midX1 - midX0) / n;
    cells.forEach((label, i) => {
      const x = midX0 + i * cellW, y = 500, w = cellW, h = 150;
      const cx = x + w / 2, cy = y + h / 2;
      corridorStops.push({ x: cx, id: null }); // 방이 없어도 복도는 이어짐
      if (!label) return;
      const id = nid(mapId, 'room' + i);
      rooms.push({ id, label, category: cfg.cellCat ? cfg.cellCat(label) : defaultCat(label), x, y, w, h, cx, cy });
      nodes.push({ id, x: cx, y: CORRIDOR_Y });
      edges.push([id, id]); // placeholder removed below
      corridorStops[corridorStops.length - 1].id = id;
    });
    // 위에서 넣은 자기자신 연결 placeholder 제거
    for (let i = edges.length - 1; i >= 0; i--) if (edges[i][0] === edges[i][1]) edges.splice(i, 1);

    // 복도 정류점들을 x좌표 순으로 정렬 후 사슬로 연결, 각 방과도 연결
    corridorStops.sort((a, b) => a.x - b.x);
    for (let i = 0; i < corridorStops.length; i++) {
      const stop = corridorStops[i];
      const cid = nid(mapId, 'c' + i);
      nodes.push({ id: cid, x: stop.x, y: CORRIDOR_Y });
      if (stop.id) edges.push([stop.id, cid]);
      if (i > 0) edges.push([nid(mapId, 'c' + (i - 1)), cid]);
    }

    return addMap({
      id: mapId, name: cfg.name, building: '본관', floor: cfg.floorLabel,
      viewBox: `0 0 ${VB_W} ${VB_H}`, rects, rooms, nodes, edges,
    });
  }

  function defaultCat(label) {
    if (/계단|문$/.test(label)) return 'circulation';
    if (/화장실/.test(label)) return 'facility';
    if (/교실|홈베이스/.test(label)) return 'classroom';
    if (/교무실|행정실|교장실|보건실|지원실/.test(label)) return 'admin';
    return 'special';
  }

  buildMainFloor({
    id: 'main-1', name: '본관 1층', floorLabel: '1층', hasCenterStair: true,
    leftAppend: { label: '동쪽문', category: 'circulation' },
    rightAppend: { label: '서쪽문', category: 'circulation', campus: { map: 'campus', node: 'westDoor' } },
    cells: ['학생인생건강부', '스포츠동아리실', '건강체력교실', '택배보관실', null, '행정실', '교장실', '통합교육지원실', '보건실'],
  });

  buildMainFloor({
    id: 'main-2', name: '본관 2층', floorLabel: '2층', hasCenterStair: false,
    topRight: '2층 과학실',
    leftAppend: { label: '한얼관 가는 길', category: 'circulation', bridgeTo: { map: 'haneol-2', node: 'bridge' } },
    cells: ['도서관', '방송실', '교무실', '창의융합정보실'],
  });

  buildMainFloor({
    id: 'main-3', name: '본관 3층', floorLabel: '3층', hasCenterStair: true,
    topLeft: '음악실', topMid: '남자화장실', topRight: '3층 과학실',
    cells: ['마음세탁소', '3-1교실', '만수로', '3층 교무실', '3-2교실', '3-3교실'],
  });

  buildMainFloor({
    id: 'main-4', name: '본관 4층', floorLabel: '4층', hasCenterStair: true,
    topLeft: '정보실', topMid: '남자화장실', topRight: '미술실',
    cells: ['2-1교실', '2-2교실', '4층 홈베이스', '4층 교무실', '2-3교실', null],
  });

  buildMainFloor({
    id: 'main-5', name: '본관 5층', floorLabel: '5층', hasCenterStair: true,
    topLeft: '영어교실', topMid: '남자화장실', topRight: '진로실',
    cells: ['1-1교실', '1-2교실', '5층 홈베이스', '5층 교무실', '1-3교실', '1-4교실'],
  });

  // 층간(같은 계단) 연결
  ['stairE', 'stairW'].forEach((s) => {
    const order = ['main-1', 'main-2', 'main-3', 'main-4', 'main-5'];
    for (let i = 0; i < order.length - 1; i++) {
      INTER_LINKS.push({ a: { map: order[i], node: nid(order[i], s) }, b: { map: order[i + 1], node: nid(order[i + 1], s) }, label: s === 'stairE' ? '동쪽계단' : '서쪽계단' });
    }
  });
  // 중앙계단은 2층에 없으므로 1-3-4-5만 연결
  ['main-1', 'main-3', 'main-4', 'main-5'].reduce((prev, cur) => {
    if (prev) INTER_LINKS.push({ a: { map: prev, node: nid(prev, 'stairC') }, b: { map: cur, node: nid(cur, 'stairC') }, label: '중앙계단' });
    return cur;
  }, null);

  // ------------------------------------------------------------------
  // 학폭관 (1층 출입층 / 2층 다목적실층)
  // ------------------------------------------------------------------
  (function buildHakpok() {
    {
      const mapId = 'hakpok-1';
      const rooms = [
        { id: nid(mapId, 'hall'), label: '학폭관', category: 'special', x: 100, y: 100, w: 200, h: 400, cx: 200, cy: 300 },
        { id: nid(mapId, 'stair'), label: '계단', category: 'circulation', x: 300, y: 100, w: 150, h: 120, cx: 375, cy: 160 },
      ];
      const nodes = rooms.map((r) => ({ id: r.id, x: r.cx, y: r.cy }));
      const edges = [[rooms[0].id, rooms[1].id]];
      const rects = [{ x: 90, y: 90, w: 370, h: 420, wall: true }];
      addMap({ id: mapId, name: '학폭관 1층', building: '학폭관', floor: '1층', viewBox: '0 0 500 550', rects, rooms, nodes, edges });
      INTER_LINKS.push({ a: { map: mapId, node: rooms[0].id }, b: { map: 'campus', node: 'hakpokEntrance' }, label: '학폭관 출입구' });
    }
    {
      const mapId = 'hakpok-2';
      const rooms = [
        { id: nid(mapId, 'multi'), label: '다목적실', category: 'special', x: 100, y: 250, w: 350, h: 300, cx: 275, cy: 400 },
        { id: nid(mapId, 'toilet'), label: '화장실', category: 'facility', x: 350, y: 100, w: 150, h: 90, cx: 425, cy: 145 },
        { id: nid(mapId, 'stair'), label: '계단', category: 'circulation', x: 350, y: 190, w: 150, h: 90, cx: 425, cy: 235 },
      ];
      const nodes = rooms.map((r) => ({ id: r.id, x: r.cx, y: r.cy }));
      const edges = [[rooms[0].id, rooms[2].id], [rooms[1].id, rooms[2].id]];
      const rects = [{ x: 90, y: 90, w: 410, h: 470, wall: true }];
      addMap({ id: mapId, name: '학폭관 2층', building: '학폭관', floor: '2층', viewBox: '0 0 550 600', rects, rooms, nodes, edges });
    }
    INTER_LINKS.push({ a: { map: 'hakpok-1', node: nid('hakpok-1', 'stair') }, b: { map: 'hakpok-2', node: nid('hakpok-2', 'stair') }, label: '학폭관 계단' });
  })();

  // ------------------------------------------------------------------
  // 한얼관 (1층 조리실층 / 2층 강당층)
  // ------------------------------------------------------------------
  (function buildHaneol() {
    {
      const mapId = 'haneol-1';
      const rooms = [
        { id: nid(mapId, 'kitchen'), label: '조리실', category: 'special', x: 100, y: 280, w: 150, h: 170, cx: 175, cy: 365 },
        { id: nid(mapId, 'stair'), label: '계단', category: 'circulation', x: 380, y: 100, w: 150, h: 90, cx: 455, cy: 145 },
        { id: nid(mapId, 'lobby'), label: '한얼관 1층 로비', category: 'circulation', x: 250, y: 190, w: 450, h: 260, cx: 500, cy: 365 },
      ];
      const nodes = rooms.map((r) => ({ id: r.id, x: r.cx, y: r.cy }));
      const edges = [[rooms[0].id, rooms[2].id], [rooms[1].id, rooms[2].id]];
      const rects = [{ x: 90, y: 90, w: 620, h: 370, wall: true }];
      addMap({ id: mapId, name: '한얼관 1층', building: '한얼관', floor: '1층', viewBox: '0 0 800 500', rects, rooms, nodes, edges });
      INTER_LINKS.push({ a: { map: mapId, node: rooms[2].id }, b: { map: 'campus', node: 'haneolEntrance' }, label: '한얼관 출입구' });
    }
    {
      const mapId = 'haneol-2';
      const rooms = [
        { id: nid(mapId, 'stage'), label: '방송실(강당)', category: 'special', x: 100, y: 190, w: 130, h: 260, cx: 165, cy: 320 },
        { id: nid(mapId, 'hall'), label: '강당', category: 'special', x: 230, y: 190, w: 470, h: 260, cx: 465, cy: 320 },
        { id: nid(mapId, 'storage'), label: '창고', category: 'facility', x: 520, y: 100, w: 80, h: 60, cx: 560, cy: 130 },
        { id: nid(mapId, 'stair'), label: '계단', category: 'circulation', x: 520, y: 160, w: 180, h: 90, cx: 610, cy: 205 },
        { id: 'bridge', label: '한얼관 가는 길', category: 'circulation', x: 250, y: 100, w: 150, h: 90, cx: 325, cy: 145 },
      ];
      const nodes = rooms.map((r) => ({ id: r.id, x: r.cx, y: r.cy }));
      const edges = [
        [rooms[0].id, rooms[1].id],
        [rooms[1].id, rooms[3].id],
        [rooms[2].id, rooms[3].id],
        [rooms[4].id, rooms[1].id],
      ];
      const rects = [{ x: 90, y: 90, w: 620, h: 360, wall: true }];
      addMap({ id: mapId, name: '한얼관 2층', building: '한얼관', floor: '2층', viewBox: '0 0 800 480', rects, rooms, nodes, edges });
    }
    INTER_LINKS.push({ a: { map: 'haneol-1', node: nid('haneol-1', 'stair') }, b: { map: 'haneol-2', node: nid('haneol-2', 'stair') }, label: '한얼관 계단' });
  })();

  // ------------------------------------------------------------------
  // 캠퍼스 배치도
  // ------------------------------------------------------------------
  (function buildCampus() {
    const mapId = 'campus';
    const rooms = [
      { id: 'mainGate', label: '정문', category: 'outdoor', x: 855, y: 345, w: 45, h: 85, cx: 877, cy: 387 },
      { id: 'field', label: '운동장', category: 'outdoor', x: 90, y: 200, w: 625, h: 195, cx: 400, cy: 297 },
      { id: 'basketballCourt', label: '농구장', category: 'outdoor', x: 575, y: 420, w: 130, h: 40, cx: 640, cy: 440 },
      { id: 'garden', label: '텃밭', category: 'outdoor', x: 175, y: 450, w: 180, h: 25, cx: 265, cy: 462 },
      { id: 'parking', label: '주차장', category: 'outdoor', x: 60, y: 0, w: 670, h: 25, cx: 395, cy: 12 },
    ];
    const linkNodes = [
      { id: 'sidewalk', x: 822, y: 440 },
      { id: 'road', x: 810, y: 320 },
      { id: 'roadNorth', x: 800, y: 100 },
      { id: 'westDoor', x: 767, y: 55 },
      { id: 'westPathSouth', x: 700, y: 300 },
      { id: 'hakpokEntrance', x: 35, y: 300 },
      { id: 'haneolEntrance', x: 65, y: 445 },
    ];
    const westDoorRoom = { id: 'westDoor', label: '서쪽문', category: 'circulation', x: 735, y: 30, w: 65, h: 45, cx: 767, cy: 52 };
    rooms.push(westDoorRoom);
    const nodes = rooms.filter((r) => r.id !== 'westDoor').map((r) => ({ id: r.id, x: r.cx, y: r.cy }))
      .concat(linkNodes.filter((n) => n.id !== 'westDoor'));
    nodes.push({ id: 'westDoor', x: 767, y: 52 });
    const edges = [
      ['mainGate', 'sidewalk'], ['sidewalk', 'road'], ['road', 'roadNorth'], ['roadNorth', 'westDoor'],
      ['road', 'westPathSouth'], ['westPathSouth', 'field'], ['field', 'basketballCourt'],
      ['westPathSouth', 'hakpokEntrance'],
      ['field', 'haneolEntrance'], ['haneolEntrance', 'garden'], ['garden', 'basketballCourt'],
      ['roadNorth', 'parking'],
    ];
    // 경로에는 쓰이지 않지만 지형을 알아볼 수 있게 그려주는 배경 구조물
    const rects = [
      { x: 90, y: 30, w: 625, h: 100, landmark: true, label: '본관' },
      { x: 10, y: 190, w: 55, h: 330, landmark: true, label: '학폭관' },
      { x: 10, y: 430, w: 110, h: 90, landmark: true, label: '한얼관' },
      { x: 790, y: 90, w: 40, h: 340, landmark: true, label: '차도' },
      { x: 790, y: 420, w: 70, h: 30, landmark: true, label: '인도' },
      { x: 745, y: 245, w: 40, h: 270, landmark: true, label: '꽃과 풀들' },
    ];
    addMap({ id: mapId, name: '캠퍼스 배치도', building: '캠퍼스', floor: '', viewBox: '0 0 900 500', rects, rooms, nodes, edges });
  })();

  global.SCHOOL_MAPS = MAPS;
  global.SCHOOL_INTER_LINKS = INTER_LINKS;
  global.SCHOOL_START = { map: 'campus', node: 'mainGate' };
  // 한얼관으로 가는 "운동장을 가로지르는" 직행 코스의 캠퍼스 쪽 간선들 — 이 문이 닫혀 있을 수도 있어
  // 시설안내 화면에서는 이 간선들을 모두 뺀 "서쪽문 → 본관 → 한얼관 가는 길" 실내 대체 경로도 함께 보여준다.
  global.SCHOOL_HANEOL_OUTDOOR_EDGES = [
    { map: 'campus', a: 'field', b: 'haneolEntrance' },
    { map: 'campus', a: 'haneolEntrance', b: 'garden' },
  ];
})(window);
