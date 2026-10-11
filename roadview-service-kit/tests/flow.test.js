'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../tour/flow.js');

// smooth pseudo-random texture so block matching has something to lock onto
function texture(w, h, seed) {
  const d = new Float32Array(w * h);
  let s = seed;
  const rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
  const blobs = Array.from({ length: 60 }, () => ({ x: rnd() * w, y: rnd() * h, r: 3 + rnd() * 9, a: (rnd() - 0.5) * 220 }));
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = 128;
    for (const b of blobs) { const q = ((x - b.x) ** 2 + (y - b.y) ** 2) / (b.r * b.r); if (q < 9) v += b.a * Math.exp(-q); }
    d[y * w + x] = Math.max(0, Math.min(255, v));
  }
  return { data: d, w, h };
}
const warp = (img, fn) => {                       // out(x, y) = img(fn(x, y)), bilinear
  const out = new Float32Array(img.w * img.h);
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) {
    const [sx, sy] = fn(x, y), x0 = Math.floor(sx), y0 = Math.floor(sy), tx = sx - x0, ty = sy - y0;
    const g = (xx, yy) => img.data[Math.min(img.h - 1, Math.max(0, yy)) * img.w + Math.min(img.w - 1, Math.max(0, xx))];
    out[y * img.w + x] = (g(x0, y0) * (1 - tx) + g(x0 + 1, y0) * tx) * (1 - ty) + (g(x0, y0 + 1) * (1 - tx) + g(x0 + 1, y0 + 1) * tx) * ty;
  }
  return { data: out, w: img.w, h: img.h };
};
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

test('recovers a pure shift', () => {
  const A = texture(256, 144, 7), B = warp(A, (x, y) => [x - 9, y - 4]);       // content moved +9, +4
  const f = F.estimate(A, B);
  assert.ok(Math.abs(mean(f.dx) - 9) < 1.2, 'dx ' + mean(f.dx));
  assert.ok(Math.abs(mean(f.dy) - 4) < 1.2, 'dy ' + mean(f.dy));
});

test('recovers forward-walk expansion: flow points away from the centre and grows with distance', () => {
  const A = texture(256, 144, 11), s = 1.08, cx = 128, cy = 72;
  const B = warp(A, (x, y) => [cx + (x - cx) / s, cy + (y - cy) / s]);          // everything grows 8% about the centre
  const f = F.estimate(A, B);
  const at = (i, j) => [f.dx[j * f.gx + i], f.dy[j * f.gx + i]];
  const right = at(f.gx - 2, f.gy >> 1), left = at(1, f.gy >> 1), centre = at(f.gx >> 1, f.gy >> 1);
  assert.ok(right[0] > 4 && left[0] < -4, 'expands outward: ' + [left[0], right[0]]);
  assert.ok(Math.abs(centre[0]) < 2.5, 'little motion at the focus of expansion: ' + centre[0]);
});

test('textureless frames give zero flow instead of garbage', () => {
  const flat = { data: new Float32Array(256 * 144).fill(100), w: 256, h: 144 };
  const f = F.estimate(flat, flat);
  assert.ok(f.dx.every((v) => Math.abs(v) < 1e-6) && f.dy.every((v) => Math.abs(v) < 1e-6));
});

test('sample interpolates between nodes and reports normalised units', () => {
  const A = texture(256, 144, 3), B = warp(A, (x, y) => [x - 8, y]);
  const f = F.estimate(A, B);
  const [u, v] = F.sample(f, 0.5, 0.5);
  assert.ok(Math.abs(u - 8 / 256) < 0.01 && Math.abs(v) < 0.01, [u, v].join());
});

test('estimatePair reaches a large forward step that plain block matching cannot', () => {
  const A = texture(256, 144, 21), s = 1.3, cx = 128, cy = 72;
  const B = warp(A, (x, y) => [cx + (x - cx) / s, cy + (y - cy) / s]);
  const node = (f) => f.dx[(f.gy >> 1) * f.gx + f.gx - 3];                      // x = 168 px right of the centre... ~ +40 expected
  const plain = F.estimate(A, B), pair = F.estimatePair(A, B);
  const x = (16 - 3 + 0.5) * 16 - cx, expected = (s - 1) * x;                    // true flow at that node
  assert.ok(Math.abs(node(pair.ab) - expected) < Math.abs(node(plain) - expected), 'pair is closer than plain: ' + [node(plain), node(pair.ab), expected]);
  assert.ok(Math.abs(node(pair.ab) - expected) < expected * 0.35, 'within 35%: ' + [node(pair.ab), expected]);
  assert.ok(pair.ba.dx[(pair.ba.gy >> 1) * pair.ba.gx + pair.ba.gx - 3] < 0, 'backward flow points the other way');
});

test('zoomModel finds the zoom and ignores pure shifts', () => {
  const A = texture(256, 144, 5), zoomed = warp(A, (x, y) => [128 + (x - 128) / 1.2, 72 + (y - 72) / 1.2]);
  const z = F.zoomModel(A, zoomed);
  assert.ok(Math.abs(z.s - 1.2) < 0.06, 'zoom ' + z.s);
  const shifted = warp(A, (x, y) => [x - 6, y]);
  assert.equal(F.zoomModel(A, shifted).s === 1 || F.zoomModel(A, shifted).s < 1.08, true);
});

test('pairTask run step by step gives exactly the same answer as estimatePair', () => {
  const A = texture(256, 144, 33), B = warp(A, (x, y) => [128 + (x - 128) / 1.15, 72 + (y - 72) / 1.15]);
  const whole = F.estimatePair(A, B);
  const t = F.pairTask(A, B);
  t.steps.forEach((s) => s());
  const part = t.result();
  assert.deepEqual(Array.from(part.ab.dx), Array.from(whole.ab.dx));
  assert.deepEqual(Array.from(part.ba.dy), Array.from(whole.ba.dy));
  assert.ok(t.steps.length >= 5, 'work is split into several small steps');
});
