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

  const listEl = document.getElementById('facility-list');
  const searchEl = document.getElementById('facility-search');
  const viewerEl = document.getElementById('viewer');
  const viewerSvg = document.getElementById('viewer-svg');
  const viewerStatus = document.getElementById('viewer-status');
  const viewerTitle = document.getElementById('viewer-title');
  const closeBtn = document.getElementById('viewer-close');
  const replayBtn = document.getElementById('viewer-replay');

  let cancelToken = { cancelled: false };
  let currentDest = null;

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

  async function openRoute(room) {
    currentDest = room;
    const scenes = window.RouteEngine.computeRoute(room.id);
    if (!scenes) {
      alert('경로를 계산할 수 없습니다: ' + room.label);
      return;
    }
    viewerEl.classList.add('is-open');
    viewerTitle.textContent = `정문 → ${room.label}`;
    cancelToken.cancelled = true; // 이전 애니메이션 중단
    cancelToken = { cancelled: false };
    const myToken = cancelToken;
    await window.MapViewer.playRoute(scenes, room.id, { svg: viewerSvg, statusEl: viewerStatus }, myToken);
  }

  closeBtn.addEventListener('click', () => {
    cancelToken.cancelled = true;
    viewerEl.classList.remove('is-open');
  });

  replayBtn.addEventListener('click', () => {
    if (currentDest) openRoute(currentDest);
  });

  searchEl.addEventListener('input', () => renderList(searchEl.value));

  renderList('');
})();
