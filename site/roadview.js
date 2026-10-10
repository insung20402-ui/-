(() => {
const MODE = document.body.classList.contains('portrait') ? 'portrait' : 'landscape';
const IDS = MODE === 'portrait' ? ['corridor2', 'office1'] : ['corridor', 'office2'];
const NAMES = { corridor2: '복도', corridor: '복도', office1: '교무실', office2: '교무실' };
const $ = id => document.getElementById(id);
const all = (window.TOURS || {}).tours || [];
const tours = IDS.map(id => all.find(t => t.id === id)).filter(Boolean);
let tour, idx = 0, front = 'a', walking = null, panX = 0, busy = false;
const cache = {};
const url = (t, i) => `frames/${t.id}/${String(i).padStart(3, '0')}.${t.ext}`;
const load = (t, i) => cache[url(t, i)] ||= Object.assign(new Image(), { src: url(t, i) });

function show(i, dir = 1) {
  i = Math.max(0, Math.min(tour.count - 1, i));
  if (i === idx && $('a').src) return false;
  idx = i;
  const next = front === 'a' ? 'b' : 'a', n = $(next), f = $(front);
  n.src = url(tour, idx);
  // 이동 느낌: 새 장면이 살짝 커진 상태에서 제자리로 / 이전 장면은 살짝 확대되며 사라짐
  n.style.transition = 'none';
  n.style.transform = `translateX(${panX}px) scale(${dir > 0 ? 1.06 : 0.96})`;
  n.getBoundingClientRect();
  n.style.transition = '';
  n.style.opacity = 1; n.style.transform = `translateX(${panX}px) scale(1)`;
  f.style.opacity = 0; f.style.transform = `translateX(${panX}px) scale(${dir > 0 ? 1.12 : 0.9})`;
  front = next;
  for (let d = 1; d <= 3; d++) { if (idx + d < tour.count) load(tour, idx + d); if (idx - d >= 0) load(tour, idx - d); }
  const p = tour.count > 1 ? idx / (tour.count - 1) : 0;
  $('dot').style.left = `calc(${p * 100}% * (1 - 22px / 100%))`;
  $('dot').style.left = `${6 + p * ($('path').clientWidth - 12 - 12)}px`;
  $('done').style.width = `${p * ($('path').clientWidth - 12)}px`;
  $('count').textContent = `${idx + 1}/${tour.count}`;
  return true;
}
function setPan(x) {
  const lim = $('rv').clientWidth * 0.06;
  panX = Math.max(-lim, Math.min(lim, x));
  for (const id of ['a', 'b']) { const e = $(id); if (e.style.opacity === '1') e.style.transform = `translateX(${panX}px) scale(1)`; }
}
function go(dir) { return show(idx + dir, dir); }
function startWalk(dir) {
  stopWalk(); go(dir);
  walking = setInterval(() => { if (!go(dir)) stopWalk(); }, 420);
}
function stopWalk() { clearInterval(walking); walking = null; }

function setTour(t) {
  stopWalk(); tour = t; idx = -1; panX = 0;
  $('place').textContent = NAMES[t.id];
  document.querySelectorAll('#tabs .btn').forEach(b => b.style.background = b.dataset.id === t.id ? '#fee500' : '', 0);
  document.querySelectorAll('#tabs .btn').forEach(b => b.style.color = b.dataset.id === t.id ? '#191919' : '');
  $('a').removeAttribute('src'); $('b').removeAttribute('src');
  front = 'b'; $('a').style.opacity = 0; $('b').style.opacity = 0;
  show(0);
  const end = t.type === 'pan' ? ['왼쪽', '오른쪽'] : ['입구', '끝'];
  $('s').textContent = end[0]; $('e').textContent = end[1];
}

// 마우스/터치: 바닥 마커 + 클릭 이동 + 드래그로 둘러보기
const rv = $('rv'), marker = $('marker');
let down = null, moved = false;
function zone(e) {
  const r = rv.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
}
rv.addEventListener('pointermove', e => {
  const z = zone(e);
  if (down) {
    const dx = e.clientX - down.x;
    if (Math.abs(dx) > 5) moved = true;
    setPan(down.pan + dx * 0.5);
    marker.classList.remove('on'); return;
  }
  if (e.pointerType === 'touch') return;
  const ground = z.y > z.h * 0.45;
  marker.classList.toggle('on', ground);
  marker.style.left = z.x + 'px'; marker.style.top = z.y + 'px';
  const back = z.y > z.h * 0.86;
  marker.textContent = back ? '▼' : '▲';
});
rv.addEventListener('pointerleave', () => marker.classList.remove('on'));
rv.addEventListener('pointerdown', e => {
  if (e.target.closest('.btn,.arr,#mini')) return;
  down = { x: e.clientX, pan: panX }; moved = false; rv.classList.add('drag');
});
addEventListener('pointerup', e => {
  if (!down) return;
  const z = zone(e); rv.classList.remove('drag'); down = null;
  if (moved) return;
  if (z.y < z.h * 0.3) return; // 천장/위쪽 클릭은 무시 (카카오맵과 동일하게 바닥만 이동)
  go(z.y > z.h * 0.86 ? -1 : 1);
});
rv.addEventListener('wheel', e => { e.preventDefault(); go(e.deltaY < 0 ? 1 : -1); }, { passive: false });
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (['ArrowUp', 'w', 'ArrowRight'].includes(e.key)) go(1);
  if (['ArrowDown', 's', 'ArrowLeft'].includes(e.key)) go(-1);
  if (e.key === 'f') toggleFs();
});
for (const [id, d] of [['fwd', 1], ['bck', -1]]) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.stopPropagation(); startWalk(d); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stopWalk);
}
function toggleFs() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }
$('fs').onclick = toggleFs;

tours.forEach(t => {
  const b = document.createElement('button'); b.className = 'btn'; b.dataset.id = t.id; b.textContent = NAMES[t.id];
  b.onclick = () => setTour(t); $('tabs').appendChild(b);
});
setTimeout(() => $('hint').style.opacity = 0, 5000);
addEventListener('resize', () => show(idx, 0) || 0);
if (tours.length) setTour(tours[0]);
})();
