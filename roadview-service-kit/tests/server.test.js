'use strict';
// Integration test: real HTTP server, real sharp, real worker thread render.
// Needs `npm install` in server/ (skipped otherwise).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');

let sharp = null;
try { sharp = require('../server/node_modules/sharp'); } catch (e) { /* not installed */ }
const skip = sharp ? false : 'server/node_modules missing: run npm install in server/';

const TOKEN = 't0ken-for-tests';
let server, base, dir;

function call(method, url, body, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + url, { method, headers: headers || {} }, (res) => {
      const chunks = []; res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}
const auth = { Authorization: 'Bearer ' + TOKEN };
const solid = (w, h, rgb) => sharp({ create: { width: w, height: h, channels: 3, background: { r: rgb[0], g: rgb[1], b: rgb[2] } } }).jpeg({ quality: 95 }).toBuffer();
async function pixel(buf, x, y) {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  const o = (y * info.width + x) * info.channels; return [data[o], data[o + 1], data[o + 2]];
}

test.before(async () => {
  if (skip) return;
  const { createServer } = require('../server/index.js');
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rv-'));
  server = createServer({ dataDir: dir, staticDir: path.join(__dirname, '..'), token: TOKEN });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
test.after(async () => { if (server) { await new Promise((r) => server.close(r)); fs.rmSync(dir, { recursive: true, force: true }); } });

test('writes need the token, reads do not', { skip }, async () => {
  assert.equal((await call('GET', '/api/health')).status, 200);
  assert.equal((await call('PUT', '/api/blobs/b1', await solid(64, 48, [255, 0, 0]))).status, 401);
  assert.equal((await call('PUT', '/api/blobs/b1', await solid(64, 48, [255, 0, 0]), { Authorization: 'Bearer nope' })).status, 401);
  assert.equal((await call('GET', '/api/nodes')).status, 200);
});

test('rejects non-images, bad ids and nodes that reference missing images', { skip }, async () => {
  assert.equal((await call('PUT', '/api/blobs/bad', Buffer.from('not an image'), auth)).status, 415);
  assert.equal((await call('PUT', '/api/blobs/..%2Fx', Buffer.from('x'), auth)).status, 400);
  const node = { id: 'n-x', lat: 37.5, lon: 127, shots: [{ id: 'nope', kind: 'flat' }] };
  const r = await call('PUT', '/api/nodes/n-x', JSON.stringify(node), auth);
  assert.equal(r.status, 400);
  assert.match(JSON.parse(r.body).error, /missing image/);
  assert.equal((await call('PUT', '/api/nodes/n-y', JSON.stringify({ id: 'n-y', lat: 999, lon: 0, shots: [] }), auth)).status, 400);
});

test('flat photo: stored without EXIF, node rendered to a 4096x2048 pano with the photo in the right place', { skip }, async () => {
  const red = await sharp(await solid(400, 300, [255, 0, 0])).withMetadata({ exif: { IFD0: { Copyright: 'secret' } } }).jpeg().toBuffer();
  assert.equal((await call('PUT', '/api/blobs/s-red', red, auth)).status, 200);
  const stored = (await call('GET', '/api/blobs/s-red')).body;
  assert.equal((await sharp(stored).metadata()).exif, undefined, 'EXIF stripped');
  const node = { id: 'n-flat', lat: 37.5665, lon: 126.978, heading: 90, shots: [{ id: 's-red', kind: 'flat', heading: 90, hfov: 60 }] };
  const put = await call('PUT', '/api/nodes/n-flat', JSON.stringify(node), auth);
  assert.equal(put.status, 200);
  assert.equal(JSON.parse(put.body).rev, 1);
  await server.roadview.idle();
  const n = JSON.parse((await call('GET', '/api/nodes/n-flat')).body);
  assert.equal(n.render.status, 'done', JSON.stringify(n.render));
  const pano = await call('GET', '/pano/n-flat/1-high.jpg');
  assert.equal(pano.status, 200);
  assert.match(pano.headers['cache-control'], /immutable/);
  const meta = await sharp(pano.body).metadata();
  assert.deepEqual([meta.width, meta.height], [4096, 2048]);
  const lowMeta = await sharp((await call('GET', '/pano/n-flat/1-low.jpg')).body).metadata();
  assert.deepEqual([lowMeta.width, lowMeta.height], [1024, 512]);
  // bearing 90 (east) is texture column 0 / wraps; the photo faces it, so the column just right of 0 is red
  const [r, g, b] = await pixel(pano.body, 40, 1024);
  assert.ok(r > 200 && g < 60 && b < 60, 'photo in front: ' + [r, g, b]);
  const [r2, g2] = await pixel(pano.body, 2048, 1024);
  assert.ok(!(r2 > 200 && g2 < 60), 'opposite side is backdrop, not the photo');
});

test('360 photo fills the sphere and its heading rotates it', { skip }, async () => {
  const left = await solid(1024, 1024, [0, 0, 255]), right = await solid(1024, 1024, [0, 255, 0]);
  const eq = await sharp({ create: { width: 2048, height: 1024, channels: 3, background: '#000' } })
    .composite([{ input: left, left: 0, top: 0 }, { input: right, left: 1024, top: 0 }]).jpeg({ quality: 95 }).toBuffer();
  assert.equal((await call('PUT', '/api/blobs/s-eq', eq, auth)).status, 200);
  const node = { id: 'n-eq', lat: 37.5666, lon: 126.9781, shots: [{ id: 's-eq', kind: 'equirect', heading: 0 }] };
  await call('PUT', '/api/nodes/n-eq', JSON.stringify(node), auth);
  await server.roadview.idle();
  const pano = (await call('GET', '/pano/n-eq/1-high.jpg')).body;
  // heading 0: image centre faces north; bearings 180..360 are the left (blue) half, 0..180 the right (green)
  const blue = await pixel(pano, 2048, 1024);            // bearing 270
  const green = await pixel(pano, 0, 1024);              // bearing 90
  assert.ok(blue[2] > 200 && blue[1] < 60, 'bearing 270 blue: ' + blue);
  assert.ok(green[1] > 200 && green[2] < 60, 'bearing 90 green: ' + green);
});

test('editing a node bumps the revision and renders again; stale renders are dropped', { skip }, async () => {
  const n = JSON.parse((await call('GET', '/api/nodes/n-flat')).body);
  n.shots[0].heading = 180;
  const put = JSON.parse((await call('PUT', '/api/nodes/n-flat', JSON.stringify(n), auth)).body);
  assert.equal(put.rev, 2);
  assert.equal(put.render.status, 'pending');
  await server.roadview.idle();
  assert.equal(JSON.parse((await call('GET', '/api/nodes/n-flat')).body).render.status, 'done');
  assert.equal((await call('GET', '/pano/n-flat/2-high.jpg')).status, 200);
});

test('near query: radius and ordering', { skip }, async () => {
  const hits = JSON.parse((await call('GET', '/api/nodes/near?lat=37.5665&lon=126.978&r=50')).body);
  assert.ok(hits.length >= 2 && hits[0].id === 'n-flat' && hits[0].distance < 1);
  const far = JSON.parse((await call('GET', '/api/nodes/near?lat=37.6&lon=127.2&r=50')).body);
  assert.equal(far.length, 0);
});

test('static files are served; server code, tests and traversal are not', { skip }, async () => {
  assert.equal((await call('GET', '/live/index.html')).status, 200);
  assert.equal((await call('GET', '/shared/graph.js')).status, 200);
  assert.equal((await call('GET', '/server/index.js')).status, 404);
  assert.equal((await call('GET', '/tests/graph.test.js')).status, 404);
  assert.equal((await call('GET', '/..%2f..%2fetc%2fpasswd')).status, 404);
  assert.equal((await call('GET', '/')).status, 302);
});

test('delete removes the node, its images and its renders', { skip }, async () => {
  assert.equal((await call('DELETE', '/api/nodes/n-flat')).status, 401);
  assert.equal((await call('DELETE', '/api/nodes/n-flat', null, auth)).status, 200);
  assert.equal((await call('GET', '/api/nodes/n-flat')).status, 404);
  assert.equal((await call('GET', '/api/blobs/s-red')).status, 404);
  assert.equal((await call('GET', '/pano/n-flat/2-high.jpg')).status, 404);
});

test('video tours: frames then manifest; unknown revs and missing frames are refused; frames are immutable', { skip }, async () => {
  const frame = (c) => solid(320, 180, c);
  assert.equal((await call('PUT', '/api/tours/school/frames/0?rev=r1', await frame([255, 0, 0]))).status, 401);
  for (let i = 0; i < 3; i++) assert.equal((await call('PUT', `/api/tours/school/frames/${i}?rev=r1`, await frame([i * 80, 100, 50]), auth)).status, 200);
  const bad = await call('PUT', '/api/tours/school', JSON.stringify({ title: '복도', type: 'walk', count: 4, rev: 'r1' }), auth);
  assert.equal(bad.status, 400); assert.match(JSON.parse(bad.body).error, /missing frame 3/);
  const ok = await call('PUT', '/api/tours/school', JSON.stringify({ title: '복도', type: 'pan', count: 3, rev: 'r1', angle: 200, loop: true }), auth);
  assert.equal(ok.status, 200);
  const man = JSON.parse(ok.body);
  assert.deepEqual([man.type, man.count, man.angle, man.loop, man.base], ['pan', 3, 200, true, '/tours/school/r1/']);
  const list = JSON.parse((await call('GET', '/api/tours')).body).tours;
  assert.equal(list.length, 1);
  const fr = await call('GET', '/tours/school/r1/001.jpg');
  assert.equal(fr.status, 200); assert.match(fr.headers['cache-control'], /immutable/);
  // replacing the tour with a new revision removes the old frames
  for (let i = 0; i < 2; i++) await call('PUT', `/api/tours/school/frames/${i}?rev=r2`, await frame([9, 9, 9]), auth);
  assert.equal((await call('PUT', '/api/tours/school', JSON.stringify({ title: '복도', type: 'walk', count: 2, rev: 'r2' }), auth)).status, 200);
  assert.equal((await call('GET', '/tours/school/r1/001.jpg')).status, 404);
  assert.equal((await call('GET', '/tours/school/r2/001.jpg')).status, 200);
  assert.equal(JSON.parse((await call('GET', '/api/tours')).body).tours[0].type, 'walk');
  assert.ok([400, 404].includes((await call('GET', '/tours/school/..%2f/000.jpg')).status));
  assert.equal((await call('DELETE', '/api/tours/school', null, auth)).status, 200);
  assert.equal(JSON.parse((await call('GET', '/api/tours')).body).tours.length, 0);
});

test('malformed URLs get an error response and never crash the server', { skip }, async () => {
  const net = require('node:net');
  const raw = (line) => new Promise((resolve) => {
    const c = net.connect(server.address().port, '127.0.0.1', () => c.write(line + ' HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
    let out = ''; c.on('data', (d) => { out += d; }); c.on('close', () => resolve(out.split('\r\n')[0])); c.on('error', () => resolve('error'));
  });
  for (const u of ['/%00', '/%E0%A4%A', '/live/%00.js', '/api/nodes/%00', '/tours/a/b/%00', '/api/tours/%2e%2e/frames/1']) {
    const status = await raw('GET ' + u);
    assert.match(status, /HTTP\/1\.1 (400|404)/, u + ' -> ' + status);
  }
  assert.equal((await call('GET', '/api/health')).status, 200, 'still alive');
});

test('private files are never served, even when the data dir sits inside the served folder', { skip }, async () => {
  const { createServer } = require('../server/index.js');
  const inner = path.join(__dirname, '..', '.tmp-data-' + process.pid);
  const s2 = createServer({ dataDir: inner, staticDir: path.join(__dirname, '..'), token: 'zzz' });
  await new Promise((r) => s2.listen(0, '127.0.0.1', r));
  const get = (u) => new Promise((resolve) => http.get('http://127.0.0.1:' + s2.address().port + u, (res) => { res.resume(); resolve(res.statusCode); }));
  try {
    for (const u of ['/' + path.basename(inner) + '/roadview.db', '/' + path.basename(inner) + '/token', '/Dockerfile', '/.env.example', '/docker-compose.yml', '/server/package.json', '/tests/graph.test.js', '/.gitignore']) {
      assert.equal(await get(u), 404, u);
    }
    assert.equal(await get('/tour/index.html'), 200);
    assert.equal(await get('/README.md'), 200);
  } finally { await new Promise((r) => s2.close(r)); fs.rmSync(inner, { recursive: true, force: true }); }
});

test('tour frame numbers above 999 are refused (file names are 3 digits)', { skip }, async () => {
  assert.equal((await call('PUT', '/api/tours/big/frames/1000?rev=r1', await solid(8, 8, [1, 2, 3]), auth)).status, 404);
  assert.equal((await call('PUT', '/api/tours/big', JSON.stringify({ title: 'x', type: 'walk', count: 1000, rev: 'r1' }), auth)).status, 400);
});
