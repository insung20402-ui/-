'use strict';
// Tests for the pure key-frame / sequence logic in shared/keyframes.js.
// Run: node --test "roadview-mock/tests/*.test.js"
// Expectations come from the stated intent, not from the module's current output.
// sample() and grab() need a <video> element and are out of scope.
const test = require('node:test');
const assert = require('node:assert/strict');

// city.js must load first: it installs globalThis.RV, which keyframes.js extends.
const RV = require('../shared/city.js');
const KF = require('../shared/keyframes.js');

// ---------------------------------------------------------------- helpers
function lcg(seed) {
  let a = seed >>> 0;
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
}
function checkerboard(w, h, cell) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      g[y * w + x] = ((Math.floor(x / cell) + Math.floor(y / cell)) % 2) ? 255 : 0;
    }
  }
  return g;
}
function verticalEdge(w, h) {
  const g = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = x < w / 2 ? 20 : 230;
  return g;
}
// 3x3 box blur with clamped borders
function boxBlur(g, w, h) {
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          sum += g[yy * w + xx];
        }
      }
      out[y * w + x] = sum / 9;
    }
  }
  return out;
}
// Independent travel-time oracle: clock time with stopped stretches removed.
function travelOf(cands) {
  const out = [];
  let acc = 0;
  for (let i = 0; i < cands.length; i++) {
    if (i > 0 && !cands[i].still) acc += cands[i].t - cands[i - 1].t;
    out.push(acc);
  }
  return out;
}
// Checks a select()/selectByInterval() result against the stated rule without
// depending on which side of a window boundary a borderline frame falls:
// windows of `size` travel seconds starting at the first eligible candidate
// (size null = span / slots), null if a window is empty. A pick must be at least
// half a window of travel after the previous pick (so neighbouring windows
// cannot both take the frame at their shared border); among the frames that
// satisfy that, the sharpest wins, and if none does the latest frame is taken.
// Stills are eligible only when the whole clip is still (then clock time is used).
function checkWindows(cands, sel, size, label) {
  const TOL = 1e-6;
  const anyMoving = cands.some((c) => !c.still);
  const times = anyMoving ? travelOf(cands) : cands.map((c) => c.t);
  const eligible = cands.map((_, i) => i).filter((i) => !anyMoving || !cands[i].still);
  const t0 = times[eligible[0]];
  const span = times[eligible[eligible.length - 1]] - t0;
  const slots = sel.length;
  const win = size === null ? (span > 0 ? span / slots : 1) : size;
  assertOrdered(sel);
  let lastTime = -Infinity;
  sel.forEach((pick, s) => {
    const lo = s === 0 ? -Infinity : t0 + s * win;
    const hi = s === slots - 1 ? Infinity : t0 + (s + 1) * win;
    const inside = eligible.filter((i) => times[i] > lo + TOL && times[i] < hi - TOL);
    if (pick === null) {
      assert.deepEqual(inside, [], `${label} slot ${s}: null although frames ${inside} are in the window`);
      return;
    }
    assert.ok(eligible.includes(pick), `${label} slot ${s}: frame ${pick} is not eligible (still?)`);
    assert.ok(times[pick] >= lo - TOL && times[pick] <= hi + TOL, `${label} slot ${s}: frame ${pick} outside its window`);
    const farEnough = inside.filter((i) => times[i] - lastTime >= win / 2 + TOL);
    for (const i of farEnough) {
      assert.ok(cands[pick].sharpness >= cands[i].sharpness, `${label} slot ${s}: picked ${pick} but ${i} is sharper`);
    }
    if (inside.length && !farEnough.length && !inside.some((i) => Math.abs(times[i] - lastTime - win / 2) <= TOL)) {
      assert.equal(pick, inside[inside.length - 1], `${label} slot ${s}: nothing far enough, expected the latest frame`);
    }
    lastTime = times[pick];
  });
  // nothing eligible is left unaccounted for beyond the last window
  const picked = sel.filter((i) => i !== null);
  assert.equal(new Set(picked).size, picked.length, label + ': a frame was used twice');
}
// Irregularly sampled clip with random stops; the first frame is never still.
function randomClip(rand) {
  const n = 2 + Math.floor(rand() * 60);
  const c = [];
  let t = rand() * 10, stopLeft = 0;
  for (let i = 0; i < n; i++) {
    t += 0.137 + rand();
    if (i > 0 && stopLeft === 0 && rand() < 0.12) stopLeft = 1 + Math.floor(rand() * 8);
    const isStill = i > 0 && stopLeft > 0;
    if (stopLeft > 0) stopLeft--;
    c.push({ t, sharpness: Math.round(rand() * 1e6) / 1e3, still: isStill });
  }
  return c;
}
function assertOrdered(sel) {
  const picked = sel.filter((i) => i !== null);
  for (let i = 1; i < picked.length; i++) {
    assert.ok(picked[i] > picked[i - 1], `indexes must strictly increase: ${JSON.stringify(sel)}`);
  }
}
const moving = (t, sharpness) => ({ t, sharpness, still: false });
const still = (t, sharpness) => ({ t, sharpness, still: true });

// ---------------------------------------------------------------- module wiring
test('module: exports the pure functions and registers itself on the shared RV', () => {
  for (const name of ['sharpness', 'difference', 'markStills', 'travelTimes', 'select', 'selectByInterval', 'sequence', 'travelHeading']) {
    assert.equal(typeof KF[name], 'function', name);
  }
  assert.equal(RV.keyframes, KF);
  assert.equal(typeof KF.STILL_THRESHOLD, 'number');
  assert.ok(KF.STILL_THRESHOLD > 0);
});

// ---------------------------------------------------------------- sharpness
test('sharpness: a flat image scores exactly 0 (any buffer type, any level)', () => {
  for (const level of [0, 1, 127, 255, 33.3]) {
    assert.equal(KF.sharpness(new Float32Array(16 * 12).fill(level), 16, 12), 0, 'Float32 ' + level);
    assert.equal(KF.sharpness(new Array(16 * 12).fill(level), 16, 12), 0, 'Array ' + level);
  }
  assert.equal(KF.sharpness(new Uint8ClampedArray(16 * 12).fill(200), 16, 12), 0);
});

test('sharpness: a sharp checkerboard scores much higher than its box-blurred copy', () => {
  const w = 32, h = 24;
  for (const cell of [2, 4, 8]) {
    const sharp = checkerboard(w, h, cell);
    const blurred = boxBlur(sharp, w, h);
    const twice = boxBlur(blurred, w, h);
    const s0 = KF.sharpness(sharp, w, h), s1 = KF.sharpness(blurred, w, h), s2 = KF.sharpness(twice, w, h);
    assert.ok(s0 > 0);
    assert.ok(s0 > 3 * s1, `cell ${cell}: sharp ${s0} vs blurred ${s1}`);
    assert.ok(s1 > s2, `cell ${cell}: more blur must score lower (${s1} vs ${s2})`);
  }
});

test('sharpness: a hard edge scores much higher than the same edge blurred', () => {
  const w = 40, h = 20;
  const sharp = verticalEdge(w, h);
  const blurred = boxBlur(boxBlur(sharp, w, h), w, h);
  const s0 = KF.sharpness(sharp, w, h), s1 = KF.sharpness(blurred, w, h);
  assert.ok(s0 > 3 * s1, `edge ${s0} vs blurred ${s1}`);
  // a pure linear ramp has no edges at all
  const ramp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) ramp[y * w + x] = 3 * x + 2 * y;
  assert.equal(KF.sharpness(ramp, w, h), 0);
});

test('sharpness: more contrast scores higher; the score is finite', () => {
  const w = 32, h = 24;
  const hi = checkerboard(w, h, 4);
  const lo = hi.map((v) => v * 0.25);
  const a = KF.sharpness(hi, w, h), b = KF.sharpness(lo, w, h);
  assert.ok(Number.isFinite(a) && Number.isFinite(b));
  assert.ok(a > b && b > 0);
});

test('sharpness: never negative on random images', () => {
  const rand = lcg(7);
  for (let round = 0; round < 200; round++) {
    const w = 3 + Math.floor(rand() * 20), h = 3 + Math.floor(rand() * 20);
    const g = new Float32Array(w * h);
    const amp = rand() * 255;
    for (let i = 0; i < g.length; i++) g[i] = rand() * amp;
    const s = KF.sharpness(g, w, h);
    assert.ok(s >= 0 && Number.isFinite(s), `round ${round}: ${s}`);
  }
});

test('sharpness: never negative on smooth images whose Laplacian is constant', () => {
  // gray = k * x^2 has Laplacian 2k everywhere, so the variance is 0 in exact
  // arithmetic; rounding must not push the result below zero.
  const w = 24, h = 16;
  for (const k of [0.1, 0.3, 0.7, 1 / 3, 0.123456, 0.011, 7.77]) {
    for (const Buf of [Array, Float32Array, Float64Array]) {
      const g = new Buf(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g[y * w + x] = k * x * x + 0.05 * y * y;
      const s = KF.sharpness(g, w, h);
      assert.ok(s >= 0, `k=${k} ${Buf.name}: ${s}`);
    }
  }
});

test('sharpness: degenerate sizes (w or h < 3) return 0, not NaN', () => {
  const g = new Float32Array(64).map((_, i) => (i * 37) % 255);
  for (const [w, h] of [[0, 0], [1, 1], [2, 2], [2, 10], [10, 2], [1, 30], [30, 1], [0, 10], [10, 0]]) {
    const s = KF.sharpness(g, w, h);
    assert.equal(s, 0, `${w}x${h} -> ${s}`);
  }
  assert.equal(KF.sharpness(new Float32Array(0), 0, 0), 0);
  // the smallest real image: 3x3 has one interior pixel, so variance is 0
  assert.equal(KF.sharpness(new Float32Array([0, 9, 0, 9, 200, 9, 0, 9, 0]), 3, 3), 0);
});

// ---------------------------------------------------------------- difference
test('difference: 0 for identical buffers', () => {
  const a = checkerboard(16, 9, 2);
  assert.equal(KF.difference(a, a), 0);
  assert.equal(KF.difference(a, Float32Array.from(a)), 0);
  assert.equal(KF.difference([1, 2, 3], [1, 2, 3]), 0);
});

test('difference: a uniform +10 offset gives 10', () => {
  const rand = lcg(3);
  const a = new Float32Array(160 * 90).map(() => Math.floor(rand() * 240));
  const b = a.map((v) => v + 10);
  assert.equal(KF.difference(a, b), 10);
  assert.equal(KF.difference(b, a), 10);
});

test('difference: is the MEAN ABSOLUTE difference (signs do not cancel)', () => {
  assert.equal(KF.difference([0, 10, 0, 10], [10, 0, 10, 0]), 10);
  assert.equal(KF.difference([0, 0, 0, 0], [4, 0, 0, 0]), 1);
  assert.equal(KF.difference([5, 5], [0, 20]), 10);
});

test('difference: symmetric and non-negative on random buffers', () => {
  const rand = lcg(11);
  for (let round = 0; round < 50; round++) {
    const n = 1 + Math.floor(rand() * 200);
    const a = new Float32Array(n).map(() => rand() * 255);
    const b = new Float32Array(n).map(() => rand() * 255);
    const ab = KF.difference(a, b), ba = KF.difference(b, a);
    assert.equal(ab, ba);
    assert.ok(ab >= 0 && ab <= 255);
  }
});

test('difference: empty buffers give 0, not NaN', () => {
  assert.equal(KF.difference(new Float32Array(0), new Float32Array(0)), 0);
  assert.equal(KF.difference([], []), 0);
});

// ---------------------------------------------------------------- markStills
test('markStills: still exactly when motion is below the threshold', () => {
  const c = [{ t: 0 }, { t: 1, motion: 9 }, { t: 2, motion: 0.4 }, { t: 3, motion: 4.99 }, { t: 4, motion: 5 }, { t: 5, motion: 5.01 }];
  KF.markStills(c, 5);
  assert.deepEqual(c.map((x) => x.still), [false, false, true, true, false, false]);
});

test('markStills: the first candidate is never still, even with zero motion', () => {
  const c = [{ t: 0, motion: 0 }, { t: 1, motion: 0 }];
  KF.markStills(c, 5);
  assert.equal(c[0].still, false);
  assert.equal(c[1].still, true);
  const one = KF.markStills([{ t: 0, motion: 0 }], 5);
  assert.equal(one[0].still, false);
});

test('markStills: missing motion is not still', () => {
  const c = [{ t: 0 }, { t: 1 }, { t: 2, motion: undefined }, { t: 3, motion: 0 }];
  KF.markStills(c, 5);
  assert.deepEqual(c.map((x) => x.still), [false, false, false, true]);
  for (const x of c) assert.equal(typeof x.still, 'boolean');
});

test('markStills: default threshold is STILL_THRESHOLD; threshold 0 marks nothing', () => {
  const T = KF.STILL_THRESHOLD;
  const make = () => [{ t: 0 }, { t: 1, motion: T - 0.01 }, { t: 2, motion: T }, { t: 3, motion: T + 0.01 }, { t: 4, motion: 0 }];
  assert.deepEqual(KF.markStills(make()).map((x) => x.still), [false, true, false, false, true]);
  assert.deepEqual(KF.markStills(make(), 0).map((x) => x.still), [false, false, false, false, false]);
});

test('markStills: annotates in place, returns the same list, overwrites a stale flag, keeps other fields', () => {
  const c = [{ t: 0, sharpness: 3, still: true }, { t: 1, sharpness: 4, motion: 50, still: true }];
  const out = KF.markStills(c, 5);
  assert.equal(out, c);
  assert.deepEqual(c, [{ t: 0, sharpness: 3, still: false }, { t: 1, sharpness: 4, motion: 50, still: false }]);
  assert.deepEqual(KF.markStills([], 5), []);
});

// ---------------------------------------------------------------- travelTimes
test('travelTimes: clock time with the stopped stretches squeezed out', () => {
  const c = [moving(0, 1), moving(1, 1), still(2, 1), still(3, 1), moving(4, 1), moving(6, 1), still(9, 1), moving(10, 1)];
  assert.deepEqual(KF.travelTimes(c), [0, 1, 1, 1, 2, 4, 4, 5]);
});

test('travelTimes: first value is 0 whatever the clock origin or the first flag', () => {
  assert.deepEqual(KF.travelTimes([moving(100, 1), moving(102, 1), moving(105, 1)]), [0, 2, 5]);
  assert.deepEqual(KF.travelTimes([still(7, 1), moving(8, 1)]), [0, 1]);
  assert.deepEqual(KF.travelTimes([moving(3.5, 1)]), [0]);
  assert.deepEqual(KF.travelTimes([]), []);
});

test('travelTimes: without stops it is t - t[0]; a missing `still` counts as moving', () => {
  const c = [{ t: 2, sharpness: 1 }, { t: 3, sharpness: 1 }, { t: 5, sharpness: 1 }, { t: 9, sharpness: 1 }];
  const before = JSON.stringify(c);
  assert.deepEqual(KF.travelTimes(c), [0, 1, 3, 7]);
  assert.equal(JSON.stringify(c), before, 'must not mutate');
});

test('travelTimes: one value per candidate, never decreasing, total = clock span minus stopped time', () => {
  const rand = lcg(5);
  for (let round = 0; round < 100; round++) {
    const c = randomClip(rand);
    const tt = KF.travelTimes(c);
    assert.equal(tt.length, c.length);
    assert.equal(tt[0], 0);
    let stopped = 0;
    for (let i = 1; i < c.length; i++) {
      assert.ok(tt[i] >= tt[i - 1]);
      if (c[i].still) { assert.equal(tt[i], tt[i - 1]); stopped += c[i].t - c[i - 1].t; }
    }
    const clock = c[c.length - 1].t - c[0].t;
    assert.ok(Math.abs(tt[tt.length - 1] - (clock - stopped)) < 1e-9, `round ${round}`);
  }
});

// ---------------------------------------------------------------- select
test('select: one index per window - the sharpest moving candidate', () => {
  // t 0..9 -> 2 windows: [0, 4.5) holds 0..4, [4.5, 9] holds 5..9
  const sharp = [1, 7, 3, 9, 2, 4, 4.5, 8, 6, 5];
  const c = sharp.map((s, t) => moving(t, s));
  assert.deepEqual(KF.select(c, 2), [3, 7]);
  assert.deepEqual(KF.select(c, 1), [3]);
});

test('select: a still frame is never selected, however sharp', () => {
  const c = [moving(0, 1), still(1, 999), moving(2, 2), still(3, 999), moving(4, 3),
    moving(5, 1), still(6, 999), still(7, 999), moving(8, 0.5), moving(9, 4)];
  for (const slots of [1, 2, 3, 6, 10, 20]) {
    const sel = KF.select(c, slots);
    assert.equal(sel.length, slots);
    for (const i of sel) assert.ok(i === null || !c[i].still, `slots=${slots}: ${JSON.stringify(sel)}`);
    checkWindows(c, sel, null, 'slots=' + slots);
  }
});

test('select: windows are equal in TRAVEL time, not clock time', () => {
  // 4 s driving, 20 s stopped, 4 s driving. Clock-time halves would be 0..14 / 14..28
  // (first half = first drive only); travel-time halves give one pick per drive.
  const c = [];
  for (let t = 0; t <= 4; t++) c.push(moving(t, 10 + t));
  for (let t = 5; t <= 24; t++) c.push(still(t, 500));
  for (let t = 25; t <= 28; t++) c.push(moving(t, 30 + t));
  // travel: 0..4 for the first drive, 5..8 for the second; span 8
  assert.deepEqual(KF.select(c, 2), [3, 28]);                 // [0,4) -> t=3 ; [4,8] -> t=28
  assert.deepEqual(KF.select(c, 4), [1, 3, 25, 28]);          // windows of 2 s travel
  assert.deepEqual(KF.select(c, 8).map((i) => c[i].t), [0, 1, 2, 3, 4, 25, 26, 28]);
});

test('select: a window with no moving candidate yields null (no fallback to a still)', () => {
  const c = [moving(0, 1), moving(1, 2), still(4, 50), still(5, 60), moving(9, 3), moving(10, 4)];
  // travel times 0,1,(1,1),5,6 -> span 6, 3 windows of 2: {0,1}, {}, {9,10}
  assert.deepEqual(KF.select(c, 3), [1, null, 5]);
});

test('select: the last moving candidate belongs to the last window', () => {
  for (const slots of [1, 2, 3, 7, 10, 30]) {
    const c = [];
    for (let i = 0; i <= 60; i++) c.push(moving(i * 0.1, 1));
    c[c.length - 1].sharpness = 100;
    const sel = KF.select(c, slots);
    assert.equal(sel.length, slots);
    assert.equal(sel[slots - 1], c.length - 1, `slots=${slots}: ${JSON.stringify(sel)}`);
    // same when the clip ends with a stop: the last MOVING frame closes the last window
    const tail = c.concat([still(6.1, 999), still(6.2, 999)]);
    assert.equal(KF.select(tail, slots)[slots - 1], c.length - 1, `slots=${slots} with trailing stop`);
  }
});

test('select: result length is floor(slots); slots < 1 or non-numeric gives []', () => {
  const c = [moving(0, 1), moving(1, 2), moving(2, 3), moving(3, 4)];
  assert.equal(KF.select(c, 3).length, 3);
  assert.deepEqual(KF.select(c, 2.9), KF.select(c, 2));
  assert.equal(KF.select(c, 2.9).length, 2);
  for (const bad of [0, 0.5, -1, -3.2, NaN, undefined, null, 'abc', {}]) {
    assert.deepEqual(KF.select(c, bad), [], 'slots=' + String(bad));
  }
});

test('select: empty candidate list gives []', () => {
  for (const slots of [0, 1, 4]) assert.deepEqual(KF.select([], slots), []);
});

test('select: a single candidate is used exactly once; every other slot is null', () => {
  for (const one of [moving(3.2, 4), { t: 3.2, sharpness: 4 }, moving(0, 0), still(1, 5)]) {
    for (const slots of [1, 2, 5]) {
      const sel = KF.select([one], slots);
      assert.equal(sel.length, slots);
      assert.deepEqual(sel.filter((i) => i !== null), [0], `${JSON.stringify(one)} slots=${slots}: ${JSON.stringify(sel)}`);
    }
  }
});

test('select: all candidates on one timestamp -> one pick (the sharpest moving), rest null', () => {
  const c = [moving(5, 2), still(5, 90), moving(5, 8), moving(5, 3)];
  for (const slots of [1, 3, 6]) {
    const sel = KF.select(c, slots);
    assert.equal(sel.length, slots);
    assert.deepEqual(sel.filter((i) => i !== null), [2], `slots=${slots}: ${JSON.stringify(sel)}`);
  }
});

test('select: more slots than candidates - every moving candidate at most once, the rest null', () => {
  const c = [moving(0, 3), moving(1, 1), still(2, 9), moving(3, 2)];
  for (const slots of [4, 5, 9, 50]) {
    const sel = KF.select(c, slots);
    assert.equal(sel.length, slots);
    assert.deepEqual(sel.filter((i) => i !== null), [0, 1, 3], `slots=${slots}: ${JSON.stringify(sel)}`);
    assert.equal(sel[0], 0);
    assert.equal(sel[slots - 1], 3);
  }
});

test('select: ties in sharpness resolve to one of the tied candidates, deterministically', () => {
  const c = [moving(0, 5), moving(1, 5), moving(2, 5), moving(3, 1), moving(4, 7), moving(5, 7)];
  const sel = KF.select(c, 2); // {0,1,2} and {3,4,5}
  assert.ok([0, 1, 2].includes(sel[0]), JSON.stringify(sel));
  assert.ok([4, 5].includes(sel[1]), JSON.stringify(sel));
  assert.deepEqual(KF.select(c, 2), sel);
  // a still frame tied with a moving one never wins, in either order
  assert.deepEqual(KF.select([still(0, 5), moving(1, 5)], 1), [1]);
  assert.deepEqual(KF.select([moving(0, 5), still(1, 5)], 1), [0]);
});

test('select: zero-sharpness candidates are still selectable', () => {
  const c = [moving(0, 0), moving(1, 0), moving(2, 0), moving(3, 0)];
  const sel = KF.select(c, 2);
  assert.equal(sel.length, 2);
  assert.ok(sel.every((i) => i !== null), JSON.stringify(sel));
  assertOrdered(sel);
});

test('select: candidates with no `still` field are treated as moving', () => {
  const sharp = [1, 7, 3, 9, 2, 4, 4.5, 8, 6, 5];
  const bare = sharp.map((s, t) => ({ t, sharpness: s }));
  assert.deepEqual(KF.select(bare, 2), [3, 7]);
  // mixed: flagged stills are skipped, unflagged frames compete normally
  const mixed = [{ t: 0, sharpness: 1 }, still(1, 99), { t: 2, sharpness: 4 }, { t: 3, sharpness: 2 }];
  assert.deepEqual(KF.select(mixed, 1), [2]);
});

test('select: all-still clip (no motion at all) uses clock time and stills become eligible', () => {
  const sharp = [1, 7, 3, 9, 2, 4, 4.5, 8, 6, 5];
  const c = sharp.map((s, t) => still(t, s));
  assert.deepEqual(KF.select(c, 2), [3, 7]);
  assert.deepEqual(KF.select(c, 1), [3]);
  assert.deepEqual(KF.selectByInterval(c, 4.5), [3, 7]);
});

test('select: a clip that never moves, as markStills flags it, yields exactly one frame', () => {
  // markStills never flags the first frame, so this is "one moving frame + stills"
  const c = KF.markStills([0, 1, 2, 3, 4, 5].map((t) => ({ t, sharpness: 10 + t, motion: t ? 0.1 : undefined })));
  assert.deepEqual(KF.select(c, 3), [0, null, null]);
  assert.deepEqual(KF.selectByInterval(c, 2), [0]);
});

test('select: does not depend on a time origin of 0, and does not mutate its input', () => {
  const sharp = [1, 7, 3, 9, 2, 4, 4.5, 8, 6, 5];
  const c = sharp.map((s, i) => moving(1000 + i * 0.25, s));
  const before = JSON.stringify(c);
  assert.deepEqual(KF.select(c, 2), [3, 7]);
  assert.deepEqual(KF.selectByInterval(c, 1.125), [3, 7]);
  assert.equal(JSON.stringify(c), before);
});

test('select: stop at the very beginning of the clip', () => {
  // waiting at the light for 10 s, then 10 s of driving (0.5 s sampling)
  const c = [];
  for (let i = 0; i < 40; i++) c.push({ t: i * 0.5, sharpness: 100 + ((i * 37) % 23), motion: i ? (i < 20 ? 0.2 : 15) : undefined });
  KF.markStills(c);
  for (const slots of [1, 2, 4, 5, 10]) {
    const sel = KF.select(c, slots);
    assert.equal(sel.length, slots);
    assert.ok(sel.every((i) => i !== null), `slots=${slots}: ${JSON.stringify(sel)}`);
    assert.ok(sel.every((i) => !c[i].still), `slots=${slots}: picked a stopped frame ${JSON.stringify(sel)}`);
    checkWindows(c, sel, null, 'slots=' + slots);
  }
  // hand-flagged variant where even frame 0 is still
  const d = [still(0, 9), still(1, 9), still(2, 9), moving(3, 1), moving(4, 2), moving(5, 3), moving(6, 4)];
  assert.deepEqual(KF.select(d, 3), [3, 4, 6]);
  assert.deepEqual(KF.selectByInterval(d, 1.5), [4, 6]); // travel 0..3 from frame 3: [0,1.5) -> {3,4}, [1.5,3] -> {5,6}
});

test('select: stop at the very end of the clip', () => {
  const c = [];
  for (let i = 0; i < 40; i++) c.push({ t: i * 0.5, sharpness: 100 + ((i * 37) % 23), motion: i ? (i < 20 ? 15 : 0.2) : undefined });
  KF.markStills(c);
  for (const slots of [1, 2, 4, 5, 10]) {
    const sel = KF.select(c, slots);
    assert.equal(sel.length, slots);
    assert.ok(sel.every((i) => i !== null && i < 20), `slots=${slots}: ${JSON.stringify(sel)}`);
    checkWindows(c, sel, null, 'slots=' + slots);
  }
  const iv = KF.selectByInterval(c, 5); // 9.5 s of travel -> 2 frames, not 4
  assert.equal(iv.length, 2);
  assert.ok(iv.every((i) => i !== null && i < 20), JSON.stringify(iv));
});

test('select: randomised - length, ordering, uniqueness and the per-window rule always hold', () => {
  const rand = lcg(2026);
  for (let round = 0; round < 400; round++) {
    const c = randomClip(rand);
    const slots = 1 + Math.floor(rand() * 40);
    const sel = KF.select(c, slots);
    assert.equal(sel.length, slots, `round ${round}`);
    checkWindows(c, sel, null, `round ${round}`);
  }
});

// ---------------------------------------------------------------- selectByInterval
test('selectByInterval: one sharpest moving frame per `seconds` of travel time', () => {
  const sharp = [1, 7, 3, 9, 2, 4, 4.5, 8, 6, 5, 2, 3];
  const c = sharp.map((s, t) => moving(t, s)); // travel span 11
  assert.deepEqual(KF.selectByInterval(c, 4), [3, 7, 9]);   // [0,4) [4,8) [8,11]; 8 is only 1 s after pick 7 (< half a window)
  assert.deepEqual(KF.selectByInterval(c, 5.5), [3, 7]);    // divides the span exactly -> 2, not 3
});

test('selectByInterval: slot count is max(1, ceil(travelSpan / seconds))', () => {
  const c = [];
  for (let t = 0; t <= 20; t++) c.push(moving(t, 1 + (t * 7) % 5)); // span 20
  for (const [seconds, expected] of [[5, 4], [4, 5], [10, 2], [20, 1], [6, 4], [7, 3], [3, 7], [0.5, 40], [19.9, 2], [21, 1]]) {
    const sel = KF.selectByInterval(c, seconds);
    assert.equal(sel.length, expected, `seconds=${seconds}: ${JSON.stringify(sel)}`);
    checkWindows(c, sel, seconds, 'seconds=' + seconds);
  }
});

test('selectByInterval: an interval longer than the whole travel span gives exactly 1 frame', () => {
  const c = [moving(0, 2), still(1, 99), moving(2, 8), moving(3, 7), still(4, 99), moving(5, 1)];
  for (const seconds of [3.0001, 5, 60, 1e9, Infinity]) {
    assert.deepEqual(KF.selectByInterval(c, seconds), [2], 'seconds=' + seconds);
  }
  assert.deepEqual(KF.selectByInterval([moving(4, 1)], 5), [0]);
  assert.deepEqual(KF.selectByInterval([moving(4, 1)], 0.001), [0]);
});

test('selectByInterval: a trailing partial window still yields a frame', () => {
  const c = [];
  for (let t = 0; t <= 22; t++) c.push(moving(t, 10 + (t * 3) % 7)); // span 22 = 4 x 5 + 2
  const sel = KF.selectByInterval(c, 5);
  assert.equal(sel.length, 5);
  assert.ok(sel.every((i) => i !== null), JSON.stringify(sel));
  assert.ok(sel[4] >= 20 && sel[4] <= 22, 'last pick comes from the 2 s remainder: ' + sel[4]);
  checkWindows(c, sel, 5, 'partial');
});

test('selectByInterval: seconds <= 0 or non-numeric gives []; empty candidates give []', () => {
  const c = [moving(0, 1), moving(1, 2), moving(2, 3)];
  for (const bad of [0, -1, -0.5, NaN, undefined, null, 'abc']) {
    assert.deepEqual(KF.selectByInterval(c, bad), [], 'seconds=' + String(bad));
  }
  assert.deepEqual(KF.selectByInterval([], 5), []);
});

test('selectByInterval: sampling sparser than the interval leaves null gaps, each frame used once', () => {
  const c = [moving(0, 1), moving(2, 2), moving(4, 3), moving(6, 4)];
  const sel = KF.selectByInterval(c, 0.5); // span 6 -> 12 windows
  assert.equal(sel.length, 12);
  assert.deepEqual(sel.filter((i) => i !== null), [0, 1, 2, 3]);
  checkWindows(c, sel, 0.5, 'sparse');
});

test('selectByInterval: ties, missing `still`, and stills are handled as in select', () => {
  const tied = [moving(0, 5), moving(1, 5), moving(2, 1), moving(3, 7), moving(4, 7)];
  const sel = KF.selectByInterval(tied, 2); // {0,1} and {2,3,4}
  assert.equal(sel.length, 2);
  assert.ok([0, 1].includes(sel[0]) && [3, 4].includes(sel[1]), JSON.stringify(sel));
  assert.deepEqual(KF.selectByInterval(tied, 2), sel);
  const bare = [{ t: 0, sharpness: 1 }, { t: 1, sharpness: 4 }, { t: 2, sharpness: 2 }, { t: 3, sharpness: 9 }];
  assert.deepEqual(KF.selectByInterval(bare, 1.5), [1, 3]);
  assert.deepEqual(KF.selectByInterval([moving(0, 1), still(1, 99), moving(2, 1)], 10), [0]);
});

test('selectByInterval: float-accumulated timestamps do not create a spurious extra slot', () => {
  const c = [];
  for (let i = 0; i <= 200; i++) c.push(moving(i * 0.1, 1 + (i * 13) % 11)); // 20 s at 10 fps
  const sel = KF.selectByInterval(c, 5);
  assert.equal(sel.length, 4, JSON.stringify(sel));
  assert.ok(sel.every((i) => i !== null));
  checkWindows(c, sel, 5, '0.1 steps');
});

test('selectByInterval: randomised - ordering, uniqueness and the per-window rule always hold', () => {
  const rand = lcg(77);
  for (let round = 0; round < 400; round++) {
    const c = randomClip(rand);
    const seconds = 0.2 + rand() * 12;
    const sel = KF.selectByInterval(c, seconds);
    assert.ok(sel.length >= 1, `round ${round}`);
    checkWindows(c, sel, seconds, `round ${round}`);
    // the last window is never empty: it holds the last eligible candidate
    assert.notEqual(sel[sel.length - 1], null, `round ${round}: ${JSON.stringify(sel)}`);
  }
});

// ---------------------------------------------------------------- stop in the middle
// 10 s driving, 10 s stopped at a light, 10 s driving; sampled every 0.5 s.
// position = ground-truth distance (1 unit per second of actual travel).
function stopAndGo() {
  const rand = lcg(9);
  const cands = [], position = [];
  let pos = 0;
  for (let i = 0; i < 60; i++) {
    const stopped = i >= 20 && i < 40;
    if (i > 0 && !stopped) pos += 0.5;
    position.push(pos);
    const c = { t: i * 0.5, sharpness: 300 + rand() * 700 };
    if (i > 0) c.motion = stopped ? rand() * 0.5 : 8 + rand() * 20;
    cands.push(c);
  }
  // the sharpest frames of the clip are shot while standing still (no motion blur)
  for (let i = 20; i < 40; i++) cands[i].sharpness += 5000;
  return { cands: KF.markStills(cands), position };
}

test('stop-and-go: select takes no frame from inside the stop and splits travel evenly', () => {
  const { cands, position } = stopAndGo();
  assert.deepEqual(cands.map((c) => c.still), cands.map((_, i) => i >= 20 && i < 40));
  for (const slots of [2, 4, 6, 8, 10, 20]) {
    const sel = KF.select(cands, slots);
    assert.equal(sel.length, slots);
    assert.ok(sel.every((i) => i !== null), `slots=${slots}: ${JSON.stringify(sel)}`);
    assertOrdered(sel);
    assert.ok(sel.every((i) => i < 20 || i >= 40), `slots=${slots}: frame from inside the stop ${JSON.stringify(sel)}`);
    assert.equal(sel.filter((i) => i < 20).length, slots / 2, `slots=${slots}: first half ${JSON.stringify(sel)}`);
    assert.equal(sel.filter((i) => i >= 40).length, slots / 2, `slots=${slots}: second half ${JSON.stringify(sel)}`);
    const places = sel.map((i) => position[i]);
    assert.equal(new Set(places).size, slots, `slots=${slots}: duplicate location ${places}`);
    // each slot's photo was shot inside that slot's stretch of road
    const size = 19.5 / slots;
    places.forEach((p, s) => assert.ok(p >= s * size - 1e-9 && p <= (s + 1) * size + 1e-9, `slots=${slots} slot ${s}: at ${p}`));
  }
});

test('stop-and-go: selectByInterval(5 s) gives 4 frames, not 6', () => {
  const { cands, position } = stopAndGo();
  const sel = KF.selectByInterval(cands, 5);
  assert.equal(sel.length, 4, JSON.stringify(sel));
  assert.ok(sel.every((i) => i !== null && (i < 20 || i >= 40)), JSON.stringify(sel));
  assertOrdered(sel);
  assert.equal(sel.filter((i) => i < 20).length, 2);
  assert.equal(sel.filter((i) => i >= 40).length, 2);
  assert.equal(new Set(sel.map((i) => position[i])).size, 4);
  sel.forEach((i, s) => assert.ok(position[i] >= s * 5 - 1e-9 && position[i] <= (s + 1) * 5 + 1e-9, `slot ${s} at ${position[i]}`));
  // the stop adds nothing: same result shape as the same drive with the stop cut out
  const noStop = cands.filter((c) => !c.still).map((c, i) => ({ t: i * 0.5, sharpness: c.sharpness, still: false }));
  const moversIdx = cands.map((c, i) => (c.still ? -1 : i)).filter((i) => i >= 0);
  assert.deepEqual(KF.selectByInterval(noStop, 5).map((i) => moversIdx[i]), sel);
  assert.deepEqual(KF.select(noStop, 6).map((i) => moversIdx[i]), KF.select(cands, 6));
});

// ---------------------------------------------------------------- realistic drive
// 120 frames sampled at 1 s intervals. The vehicle moves 1 unit of distance per
// frame except while stopped at a light (frames 50..64, motion ~ 0). Frames
// 84..103 are badly motion-blurred (very low sharpness).
const DRIVE = { n: 120, slots: 30, stopFrom: 50, stopTo: 64, blurFrom: 84, blurTo: 103 };
function buildDrive() {
  const rand = lcg(42);
  const cands = [];
  const position = []; // ground truth: distance travelled when frame i was shot
  let pos = 0;
  for (let i = 0; i < DRIVE.n; i++) {
    const stopped = i >= DRIVE.stopFrom && i <= DRIVE.stopTo;
    const blurry = i >= DRIVE.blurFrom && i <= DRIVE.blurTo;
    if (i > 0 && !stopped) pos += 1;
    position.push(pos);
    const c = { t: i, sharpness: blurry ? 2 + rand() * 6 : 400 + rand() * 900 };
    if (stopped) c.sharpness += 3000; // standing still = no motion blur = sharpest frames of the clip
    if (i > 0) c.motion = stopped ? rand() * 0.6 : 9 + rand() * 20;
    cands.push(c);
  }
  KF.markStills(cands);
  return { cands, position, travelSpan: pos };
}

test('drive: markStills flags exactly the frames shot while stopped', () => {
  const { cands } = buildDrive();
  cands.forEach((c, i) => {
    assert.equal(c.still, i >= DRIVE.stopFrom && i <= DRIVE.stopTo, 'frame ' + i);
  });
});

test('drive: 30 slots are all filled, in time order, no frame twice, none from the stop', () => {
  const { cands } = buildDrive();
  const sel = KF.select(cands, DRIVE.slots);
  assert.equal(sel.length, DRIVE.slots);
  assert.ok(sel.every((i) => Number.isInteger(i) && i >= 0 && i < cands.length), JSON.stringify(sel));
  assertOrdered(sel);
  assert.ok(sel.every((i) => !cands[i].still), 'still frame selected: ' + JSON.stringify(sel));
  checkWindows(cands, sel, null, 'drive');
});

test('drive: the stop does not put the same physical location into several slots', () => {
  const { cands, position, travelSpan } = buildDrive();
  const sel = KF.select(cands, DRIVE.slots);
  const places = sel.map((i) => position[i]);
  assert.equal(new Set(places).size, places.length, `duplicate locations: ${places}`);
  // one photo per equal stretch of road: slot s was shot inside stretch s
  const size = travelSpan / DRIVE.slots;
  places.forEach((p, s) => {
    assert.ok(p >= s * size - 1e-9 && p <= (s + 1) * size + 1e-9, `slot ${s}: shot at ${p}, stretch ${s * size}..${(s + 1) * size}`);
  });
  for (let s = 1; s < places.length; s++) {
    assert.ok(places[s] - places[s - 1] < 2 * size + 1e-9, `gap before slot ${s}: ${places[s] - places[s - 1]}`);
  }
});

test('drive: inside the blurry stretch each window still yields its least-bad frame', () => {
  const { cands, travelSpan } = buildDrive();
  const sel = KF.select(cands, DRIVE.slots);
  const tt = travelOf(cands);
  const size = travelSpan / DRIVE.slots;
  const blurry = (i) => i >= DRIVE.blurFrom && i <= DRIVE.blurTo;
  let fullyBlurry = 0, straddling = 0;
  for (let s = 0; s < DRIVE.slots; s++) {
    // integer travel times and a non-integer window size: no frame sits on a boundary
    const group = cands.map((_, i) => i).filter((i) => !cands[i].still && Math.min(DRIVE.slots - 1, Math.floor(tt[i] / size)) === s);
    assert.ok(group.length > 0, 'window ' + s);
    if (group.every(blurry)) {
      fullyBlurry++;
      const best = group.reduce((a, b) => (cands[b].sharpness > cands[a].sharpness ? b : a));
      assert.equal(sel[s], best, `slot ${s}: expected frame ${best}, got ${sel[s]}`);
    } else if (group.some(blurry)) {
      straddling++;
      assert.ok(!blurry(sel[s]), `slot ${s} took blurry frame ${sel[s]} although a clean one was available`);
    }
  }
  assert.ok(fullyBlurry >= 3, 'scenario has fully blurry windows: ' + fullyBlurry);
  assert.ok(straddling >= 1, 'scenario has windows straddling the blur edge: ' + straddling);
});

test('drive: selectByInterval never returns a stopped frame and covers the road without duplicates', () => {
  const { cands, position, travelSpan } = buildDrive();
  for (const seconds of [2, 3.5, 5, 8, 13, 52, 104, 500]) {
    const sel = KF.selectByInterval(cands, seconds);
    assert.equal(sel.length, Math.max(1, Math.ceil(travelSpan / seconds)), 'seconds=' + seconds);
    assert.ok(sel.every((i) => i !== null && !cands[i].still), `seconds=${seconds}: ${JSON.stringify(sel)}`);
    assertOrdered(sel);
    assert.equal(new Set(sel.map((i) => position[i])).size, sel.length);
    checkWindows(cands, sel, seconds, 'seconds=' + seconds);
  }
});

// ---------------------------------------------------------------- sequence
test('sequence: +1 lists node ids in ascending seq from the start', () => {
  assert.deepEqual(KF.sequence('ew0', 0, 1, 5), ['ew0-000', 'ew0-001', 'ew0-002', 'ew0-003', 'ew0-004']);
  assert.deepEqual(KF.sequence('ns1', 10, 1, 3), ['ns1-010', 'ns1-011', 'ns1-012']);
  assert.deepEqual(KF.sequence('ew2', 7, 1, 1), ['ew2-007']);
});

test('sequence: -1 lists node ids in descending seq from the start', () => {
  assert.deepEqual(KF.sequence('ew0', 4, -1, 5), ['ew0-004', 'ew0-003', 'ew0-002', 'ew0-001', 'ew0-000']);
  assert.deepEqual(KF.sequence('ns2', 24, -1, 3), ['ns2-024', 'ns2-023', 'ns2-022']);
});

test('sequence: truncated at the road end - never wraps, never leaves the road', () => {
  assert.deepEqual(KF.sequence('ew0', 30, 1, 10), ['ew0-030', 'ew0-031', 'ew0-032']);
  assert.deepEqual(KF.sequence('ns0', 22, 1, 10), ['ns0-022', 'ns0-023', 'ns0-024']);
  assert.deepEqual(KF.sequence('ns0', 2, -1, 10), ['ns0-002', 'ns0-001', 'ns0-000']);
  assert.deepEqual(KF.sequence('ew1', 32, 1, 4), ['ew1-032']);
  assert.deepEqual(KF.sequence('ew1', 0, -1, 4), ['ew1-000']);
});

test('sequence: a whole road in either direction, for every road', () => {
  for (const road of RV.roads) {
    const n = road.nodeIds.length;
    assert.equal(n, road.id.startsWith('ew') ? 33 : 25, road.id);
    const fwd = KF.sequence(road.id, 0, 1, 1000);
    const back = KF.sequence(road.id, n - 1, -1, 1000);
    assert.deepEqual(fwd, road.nodeIds, road.id + ' forward');
    assert.deepEqual(back, road.nodeIds.slice().reverse(), road.id + ' backward');
    assert.notEqual(fwd, road.nodeIds, 'must return a copy, not the road\'s own array');
    assert.deepEqual(KF.sequence(road.id, 0, 1, n), road.nodeIds);
    assert.equal(KF.sequence(road.id, 0, 1, n + 1).length, n);
  }
});

test('sequence: every id is a real node of that road, consecutive ids are 10 m apart', () => {
  for (const road of RV.roads) {
    for (const dir of [1, -1]) {
      for (const start of [0, 3, road.nodeIds.length - 1]) {
        const ids = KF.sequence(road.id, start, dir, 12);
        assert.ok(ids.length >= 1 && ids.length <= 12);
        assert.equal(new Set(ids).size, ids.length);
        ids.forEach((id, k) => {
          const node = RV.getNode(id);
          assert.ok(node, `${id} is not a node`);
          assert.equal(node.roadId, road.id);
          assert.equal(node.seq, start + dir * k);
          if (k > 0) {
            const prev = RV.getNode(ids[k - 1]);
            assert.ok(Math.abs(Math.hypot(node.x - prev.x, node.y - prev.y) - 10) < 1e-6);
          }
        });
      }
    }
  }
});

test('sequence: unknown road, count 0 and out-of-range start give []', () => {
  assert.deepEqual(KF.sequence('nope', 0, 1, 5), []);
  assert.deepEqual(KF.sequence('', 0, 1, 5), []);
  assert.deepEqual(KF.sequence(undefined, 0, 1, 5), []);
  assert.deepEqual(KF.sequence('ew0', 0, 1, 0), []);
  assert.deepEqual(KF.sequence('ew0', 5, -1, 0), []);
  assert.deepEqual(KF.sequence('ew0', -1, 1, 5), []);
  assert.deepEqual(KF.sequence('ew0', -1, -1, 5), []);
  assert.deepEqual(KF.sequence('ew0', 33, 1, 5), []);
  assert.deepEqual(KF.sequence('ew0', 33, -1, 5), []); // out of range is out of range, even heading back in
  assert.deepEqual(KF.sequence('ns0', 25, 1, 5), []);
  assert.deepEqual(KF.sequence('ns0', 1000, -1, 5), []);
});

test('sequence: does not mutate the road data', () => {
  const before = JSON.stringify(RV.roads.map((r) => r.nodeIds));
  KF.sequence('ew0', 0, 1, 99).push('junk');
  KF.sequence('ns1', 24, -1, 99).length = 0;
  assert.equal(JSON.stringify(RV.roads.map((r) => r.nodeIds)), before);
});

// ---------------------------------------------------------------- travelHeading
test('travelHeading: the road heading for +1, the opposite (mod 360) for -1', () => {
  for (const id of ['ew0', 'ew1', 'ew2']) {
    assert.equal(KF.travelHeading(id, 1), 90, id);
    assert.equal(KF.travelHeading(id, -1), 270, id);
  }
  for (const id of ['ns0', 'ns1', 'ns2']) {
    assert.equal(KF.travelHeading(id, 1), 0, id);
    assert.equal(KF.travelHeading(id, -1), 180, id);
  }
});

test('travelHeading: agrees with the geometry of sequence() and stays in [0, 360)', () => {
  for (const road of RV.roads) {
    for (const dir of [1, -1]) {
      const h = KF.travelHeading(road.id, dir);
      assert.ok(h >= 0 && h < 360, `${road.id} ${dir}: ${h}`);
      const start = dir > 0 ? 0 : road.nodeIds.length - 1;
      const [a, b] = KF.sequence(road.id, start, dir, 2).map((id) => RV.getNode(id));
      const bearing = ((Math.atan2(b.x - a.x, b.y - a.y) * 180 / Math.PI) % 360 + 360) % 360;
      assert.ok(Math.abs(((h - bearing) % 360 + 540) % 360 - 180) < 1e-6, `${road.id} ${dir}: ${h} vs ${bearing}`);
    }
  }
});
