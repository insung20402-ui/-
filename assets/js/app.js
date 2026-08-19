(function () {
  const MAPS = window.SCHOOL_MAPS;

  const CATEGORY_LABEL = {
    classroom: '교실',
    special: '특별실',
    admin: '행정 · 교무',
    facility: '편의시설',
    outdoor: '외부시설',
    circulation: '이동통로 (계단 · 출입문)',
  };
  const CATEGORY_ORDER = ['classroom', 'special', 'admin', 'facility', 'outdoor', 'circulation'];

  function collectRooms() {
    const rooms = [];
    Object.values(MAPS).forEach((map) => {
      map.rooms.forEach((room) => {
        rooms.push({
          id: room.id, label: room.label, category: room.category,
          building: map.building, floor: map.floor, mapId: map.id,
        });
      });
    });
    return rooms;
  }

  const allRooms = collectRooms();
  const statEl = document.getElementById('page-stat');
  if (statEl) statEl.textContent = `총 ${allRooms.length}개 장소를 정문에서부터 안내해요.`;

  const listEl = document.getElementById('facility-list');
  const searchEl = document.getElementById('facility-search');
  const viewerEl = document.getElementById('viewer');
  const viewerSvg = document.getElementById('viewer-svg');
  const viewerStatus = document.getElementById('viewer-status');
  const viewerTitle = document.getElementById('viewer-title');
  const closeBtn = document.getElementById('viewer-close');
  const replayBtn = document.getElementById('viewer-replay');
  const tourStartBtn = document.getElementById('tour-start');
  const tourStopBtn = document.getElementById('tour-stop');
  const tourProgressEl = document.getElementById('tour-progress');
  const coursesEl = document.getElementById('viewer-courses');

  const HANEOL_OUTDOOR_EDGES = window.SCHOOL_HANEOL_OUTDOOR_EDGES;

  let cancelToken = { cancelled: false };
  let currentDest = null;
  let currentCourse = 'direct'; // 한얼관 목적지일 때만 의미 있음: 'direct' | 'indoor'
  let tourState = null; // {cancelled:false} 둘러보기 진행 중일 때만 존재

  const TOUR_MAP_ORDER = ['campus', 'main-1', 'main-2', 'main-3', 'main-4', 'main-5', 'hakpok-1', 'hakpok-2', 'haneol-1', 'haneol-2'];

  function buildTourList() {
    const start = window.SCHOOL_START;
    const list = [];
    TOUR_MAP_ORDER.forEach((mapId) => {
      const map = MAPS[mapId];
      if (!map) return;
      map.rooms.forEach((room) => {
        if (mapId === start.map && room.id === start.node) return; // 출발지(정문) 제외
        list.push({ id: room.id, label: room.label, category: room.category, building: map.building, floor: map.floor, mapId });
      });
    });
    return list;
  }

  function wait(ms) { return new Promise((res) => setTimeout(res, ms)); }

  function groupRooms(rooms) {
    const groups = {};
    rooms.forEach((r) => {
      const key = r.category;
      (groups[key] = groups[key] || []).push(r);
    });
    return groups;
  }

  function buildingFloorLabel(r) {
    if (r.building === '캠퍼스') return '캠퍼스';
    return r.building + (r.floor ? ' ' + r.floor : '');
  }

  function renderList(filterText) {
    const q = (filterText || '').trim().toLowerCase();
    const filtered = q
      ? allRooms.filter((r) => r.label.toLowerCase().includes(q) || buildingFloorLabel(r).toLowerCase().includes(q))
      : allRooms;

    const groups = groupRooms(filtered);
    listEl.innerHTML = '';

    CATEGORY_ORDER.forEach((cat) => {
      const items = groups[cat];
      if (!items || !items.length) return;
      const details = document.createElement('details');
      details.open = cat !== 'circulation';
      const summary = document.createElement('summary');
      summary.textContent = `${CATEGORY_LABEL[cat]} (${items.length})`;
      details.appendChild(summary);

      const ul = document.createElement('ul');
      ul.className = 'facility-group';
      items
        .sort((a, b) => a.building.localeCompare(b.building) || a.label.localeCompare(b.label, 'ko'))
        .forEach((r) => {
          const li = document.createElement('li');
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'facility-item';
          btn.innerHTML = `<span class="facility-item__name">${r.label}</span><span class="facility-item__loc">${buildingFloorLabel(r)}</span>`;
          btn.addEventListener('click', () => openRoute(r));
          li.appendChild(btn);
          ul.appendChild(li);
        });
      details.appendChild(ul);
      listEl.appendChild(details);
    });

    if (!listEl.children.length) {
      const empty = document.createElement('p');
      empty.className = 'facility-empty';
      empty.textContent = '검색 결과가 없어요.';
      listEl.appendChild(empty);
    }
  }

  function updateCourseUI(room) {
    const isHaneol = room.building === '한얼관';
    coursesEl.hidden = !isHaneol;
    if (!isHaneol) return;
    coursesEl.querySelectorAll('.course-btn').forEach((btn) => {
      btn.classList.toggle('is-active', btn.dataset.course === currentCourse);
    });
  }

  async function openRoute(room, course) {
    currentDest = room;
    const isHaneol = room.building === '한얼관';
    const isHakpok = room.building === '학폭관';
    currentCourse = isHaneol ? (course || 'direct') : 'direct';
    // 학폭관은 항상 서쪽문 → 본관 2층 → "한얼관 가는 길" 갈림길을 통해서만 간다.
    // (그 갈림길로 가는 두 방법 중 하나인 한얼관 건물 통과 지름길은 여기서는 막는다.)
    const avoidEdges = (isHakpok || (isHaneol && currentCourse === 'indoor')) ? HANEOL_OUTDOOR_EDGES : undefined;

    const scenes = window.RouteEngine.computeRoute(room.id, { avoidEdges });
    if (!scenes) {
      alert('경로를 계산할 수 없습니다: ' + room.label);
      return;
    }
    viewerEl.classList.add('is-open');
    viewerTitle.textContent = `정문 → ${room.label}`;
    updateCourseUI(room);
    cancelToken.cancelled = true; // 이전 애니메이션 중단
    cancelToken = { cancelled: false };
    const myToken = cancelToken;
    await window.MapViewer.playRoute(scenes, room.id, { svg: viewerSvg, statusEl: viewerStatus }, myToken);
  }

  coursesEl.querySelectorAll('.course-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!currentDest || tourState) return;
      openRoute(currentDest, btn.dataset.course);
    });
  });

  closeBtn.addEventListener('click', () => {
    cancelToken.cancelled = true;
    if (tourState) tourState.cancelled = true;
    viewerEl.classList.remove('is-open');
  });

  replayBtn.addEventListener('click', () => {
    if (currentDest) openRoute(currentDest, currentCourse);
  });

  searchEl.addEventListener('input', () => renderList(searchEl.value));

  function setTouring(isTouring) {
    listEl.classList.toggle('is-touring', isTouring);
    searchEl.disabled = isTouring;
    tourStartBtn.hidden = isTouring;
    tourStopBtn.hidden = !isTouring;
    coursesEl.classList.toggle('is-touring', isTouring);
  }

  async function startTour() {
    if (tourState) return;
    const order = buildTourList();
    tourState = { cancelled: false };
    setTouring(true);
    tourProgressEl.hidden = false;

    for (let i = 0; i < order.length; i++) {
      if (tourState.cancelled) break;
      tourProgressEl.textContent = `🎬 전체 둘러보기 ${i + 1} / ${order.length} · 다음 목적지: ${order[i].label}`;
      await openRoute(order[i]);
      if (tourState.cancelled) break;
      await wait(450);
    }

    const wasCancelled = tourState.cancelled;
    tourState = null;
    setTouring(false);
    tourProgressEl.textContent = wasCancelled
      ? '둘러보기를 중지했어요.'
      : `학교 안 ${order.length}곳을 정문에서부터 모두 둘러봤어요! 🎉`;
    setTimeout(() => {
      if (!tourState) tourProgressEl.hidden = true;
    }, 5000);
  }

  function stopTour() {
    if (tourState) tourState.cancelled = true;
    cancelToken.cancelled = true; // 현재 재생 중인 애니메이션도 즉시 중단
  }

  tourStartBtn.addEventListener('click', startTour);
  tourStopBtn.addEventListener('click', stopTour);

  renderList('');
})();
