(() => {
const PORTRAIT = document.body.classList.contains('portrait');
const WALK = PORTRAIT ? 'corridor2' : 'corridor', PANO = PORTRAIT ? 'office1' : 'office2';
const $ = id => document.getElementById(id);
const all = (window.TOURS || {}).tours || [];
const walk = all.find(t => t.id === WALK), pano = all.find(t => t.id === PANO);
const url = (t, i) => `frames/${t.id}/${String(i).padStart(3, '0')}.${t.ext}`;
const cache = {};
const load = (t, i) => cache[url(t, i)] ||= Object.assign(new Image(), { src: url(t, i) });
for (let i = 0; i < walk.count; i++) load(walk, i);
for (let i = 0; i < pano.count; i++) load(pano, i);

let view = 'walk', idx = -1, front = 'b', panX = 0, pf = 0, vel = 0, auto = true, raf = null, walking = null;
const rv = $('rv'), marker = $('marker');

function paint(src, dir) {            // 두 장을 겹쳐 부드럽게 전환
  const next = front === 'a' ? 'b' : 'a', n = $(next), f = $(front);
  n.src = src;
  n.style.transition = 'none';
  n.style.transform = `translateX(${panX}px) scale(${dir > 0 ? 1.08 : 0.94})`;
  n.getBoundingClientRect();
  n.style.transition = '';
  n.style.opacity = 1; n.style.transform = `translateX(${panX}px) scale(1)`;
  f.style.opacity = 0; f.style.transform = `translateX(${panX}px) scale(${dir > 0 ? 1.18 : 0.88})`;
  front = next;
}
function progress(p, label) {
  const W = $('path').clientWidth - 12;
  $('dot').style.left = `${6 + p * (W - 12)}px`; $('done').style.width = `${p * W}px`;
  $('count').textContent = label;
}
/* ---- 복도: 5장 이동 ---- */
function go(dir) {
  if (view !== 'walk') return false;
  const g = Math.max(0, Math.min(walk.count - 1, idx + dir));
  if (g === idx) return false;
  idx = g; paint(url(walk, g), dir);
  progress(g / (walk.count - 1), `${g + 1}/${walk.count}`);
  $('fwd').style.opacity = g === walk.count - 1 ? .35 : 1; $('bck').style.opacity = g === 0 ? .35 : 1;
  return true;
}
function stopWalk() { clearInterval(walking); walking = null; }
function startWalk(dir) { stopWalk(); go(dir); walking = setInterval(() => { if (!go(dir)) stopWalk(); }, 900); }

/* ---- 교감실: 돌려보기 ---- */
let pa = -1, pb = -1;
function showPano() {                 // 두 프레임을 비율대로 섞어서 프레임 사이도 부드럽게
  const x = Math.max(0, Math.min(pano.count - 1, pf)), i = Math.floor(x), fr = x - i, j = Math.min(i + 1, pano.count - 1);
  const A = $('a'), B = $('b');
  if (pa !== i) { A.src = url(pano, i); pa = i; }
  if (pb !== j) { B.src = url(pano, j); pb = j; }
  for (const e of [A, B]) { e.style.transition = 'none'; e.style.transform = 'none'; }
  A.style.opacity = 1; B.style.opacity = i === j ? 0 : fr;
  progress(x / (pano.count - 1), `${Math.round(x / (pano.count - 1) * 100)}%`);
}
function loop() {
  if (view !== 'pano') return;
  if (auto) { pf += 0.2; if (pf >= pano.count - 1) auto = false; }
  else if (Math.abs(vel) > 0.01 && !down) { pf += vel; vel *= 0.93; }
  pf = Math.max(0, Math.min(pano.count - 1, pf));
  showPano(); raf = requestAnimationFrame(loop);
}
function setView(v) {
  stopWalk(); cancelAnimationFrame(raf); view = v; down = null;
  const isWalk = v === 'walk';
  $('place').textContent = isWalk ? '복도' : '교감실';
  $('arrows').style.display = isWalk ? '' : 'none';
  $('s').textContent = isWalk ? '입구' : '왼쪽'; $('e').textContent = isWalk ? '끝' : '오른쪽';
  $('hint').textContent = isWalk ? '바닥을 클릭하면 앞으로, 화면 아래쪽을 클릭하면 뒤로 · 드래그로 둘러보기'
                                 : '좌우로 드래그해서 교감실을 돌려 보세요 (카메라가 돌아가는 방향 그대로 움직입니다)';
  $('hint').style.opacity = 1; setTimeout(() => $('hint').style.opacity = 0, 5000);
  document.querySelectorAll('#tabs .btn').forEach(b => {
    const on = b.dataset.v === v; b.style.background = on ? '#fee500' : ''; b.style.color = on ? '#191919' : '';
  });
  panX = 0;
  if (isWalk) { idx = -1; front = 'b'; for (const k of ['a', 'b']) { $(k).style.opacity = 0; $(k).style.transition = ''; } go(1); }
  else { pf = 0; vel = 0; auto = true; pa = pb = -1; raf = requestAnimationFrame(loop); }
}

/* ---- 포인터 ---- */
let down = null, moved = false;
const zone = e => { const r = rv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; };
function setPan(x) {
  const lim = rv.clientWidth * 0.05; panX = Math.max(-lim, Math.min(lim, x));
  const e = $(front); e.style.transform = `translateX(${panX}px) scale(1)`;
}
rv.addEventListener('pointerdown', e => {
  if (e.target.closest('.btn,.arr,#mini')) return;
  down = { x: e.clientX, pan: panX, pf, last: e.clientX }; moved = false; vel = 0; auto = false; rv.classList.add('drag');
});
rv.addEventListener('pointermove', e => {
  const z = zone(e);
  if (down) {
    const dx = e.clientX - down.x; if (Math.abs(dx) > 5) moved = true;
    if (view === 'pano') { pf = down.pf - dx / z.w * pano.count * 0.9; vel = -(e.clientX - down.last) / z.w * pano.count * 0.9; down.last = e.clientX; }
    else setPan(down.pan + dx * 0.4);
    marker.classList.remove('on'); return;
  }
  if (view !== 'walk' || e.pointerType === 'touch') return;
  marker.classList.toggle('on', z.y > z.h * 0.45);
  marker.style.left = z.x + 'px'; marker.style.top = z.y + 'px';
  marker.textContent = z.y > z.h * 0.86 ? '▼' : '▲';
});
rv.addEventListener('pointerleave', () => marker.classList.remove('on'));
addEventListener('pointerup', e => {
  if (!down) return; const z = zone(e); rv.classList.remove('drag'); down = null;
  if (moved || view !== 'walk' || z.y < z.h * 0.3) return;
  go(z.y > z.h * 0.86 ? -1 : 1);
});
rv.addEventListener('wheel', e => {
  e.preventDefault();
  if (view === 'pano') { auto = false; vel = (e.deltaY > 0 ? 1 : -1) * 0.6; } else go(e.deltaY < 0 ? 1 : -1);
}, { passive: false });
addEventListener('keydown', e => {
  if (e.repeat) return;
  if (view === 'pano') { auto = false; if (e.key === 'ArrowRight') vel = 1.2; if (e.key === 'ArrowLeft') vel = -1.2; }
  else { if (['ArrowUp', 'w', 'ArrowRight'].includes(e.key)) go(1); if (['ArrowDown', 's', 'ArrowLeft'].includes(e.key)) go(-1); }
  if (e.key === 'f') toggleFs();
});
for (const [id, d] of [['fwd', 1], ['bck', -1]]) {
  const b = $(id);
  b.addEventListener('pointerdown', e => { e.stopPropagation(); startWalk(d); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, stopWalk);
}
function toggleFs() { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.(); }
$('fs').onclick = toggleFs;
[['walk', '복도'], ['pano', '교감실']].forEach(([v, n]) => {
  const b = document.createElement('button'); b.className = 'btn'; b.dataset.v = v; b.textContent = n;
  b.onclick = () => setView(v); $('tabs').appendChild(b);
});
setView('walk');
})();
