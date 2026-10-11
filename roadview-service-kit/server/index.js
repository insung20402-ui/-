'use strict';
// Roadview server: storage API + background pre-render + static files for the kit.
//   GET    /api/health                      -> { ok, writable }
//   GET    /api/nodes                       -> all nodes (with render status)
//   GET    /api/nodes/near?lat=&lon=&r=     -> nodes within r metres (default 50), nearest first
//   PUT    /api/nodes/:id        (token)    -> create/replace a node; queues a render
//   DELETE /api/nodes/:id        (token)
//   PUT    /api/blobs/:shotId    (token)    -> raw image body; re-encoded, EXIF stripped
//   GET    /api/blobs/:shotId
//   GET    /pano/:id/:rev-:lod.jpg          -> pre-rendered equirect (lod = high | low)
// Everything else is served from the kit directory.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Worker } = require('node:worker_threads');
const openDb = require('./db.js');
const G = require('../shared/graph.js');

const ID = /^[A-Za-z0-9_-]{1,64}$/;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.md': 'text/markdown; charset=utf-8', '.svg': 'image/svg+xml' };
const MAX_BLOB = 60 * 1024 * 1024, MAX_JSON = 1024 * 1024, MAX_PIXELS = 120e6;

function createServer(opts) {
  const dataDir = path.resolve(opts.dataDir), staticDir = path.resolve(opts.staticDir);
  const blobDir = path.join(dataDir, 'blobs'), panoDir = path.join(dataDir, 'pano');
  fs.mkdirSync(blobDir, { recursive: true }); fs.mkdirSync(panoDir, { recursive: true });
  const db = openDb(path.join(dataDir, 'roadview.db'));
  const sharp = require('sharp');

  // write token: from options/env, else generated once and kept in the data dir
  let token = opts.token || '';
  if (!token) {
    const f = path.join(dataDir, 'token');
    if (fs.existsSync(f)) token = fs.readFileSync(f, 'utf8').trim();
    else { token = crypto.randomBytes(18).toString('base64url'); fs.writeFileSync(f, token, { mode: 0o600 }); }
  }
  function authed(req) {
    const h = req.headers.authorization || '', t = h.startsWith('Bearer ') ? h.slice(7) : '';
    const a = Buffer.from(t), b = Buffer.from(token);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  }

  // ---- render queue: one worker thread at a time ----
  const queue = []; let running = false;
  function enqueue(node) {
    queue.push({ id: node.id, rev: node.rev });
    db.setRender(node.id, node.rev, { status: 'pending', rev: node.rev });
    pump();
  }
  function pump() {
    if (running || !queue.length) return;
    const job = queue.shift(), node = db.get(job.id);
    if (!node || node.rev !== job.rev) return pump();                 // deleted or superseded
    running = true;
    const w = new Worker(path.join(__dirname, 'render-worker.js'), {
      workerData: { node, blobDir, outDir: path.join(panoDir, node.id), rev: node.rev } });
    let done = false;
    const finish = (res) => {
      if (done) return; done = true; running = false;
      db.setRender(node.id, node.rev, res.ok ? { status: 'done', rev: node.rev, ms: res.ms } : { status: 'error', rev: node.rev, error: res.error });
      if (!res.ok) console.error('render failed', node.id, res.error);
      if (opts.onRender) opts.onRender(node.id, res);
      pump();
    };
    w.on('message', finish);
    w.on('error', (e) => finish({ ok: false, error: String(e.message || e) }));
    w.on('exit', (c) => finish({ ok: false, error: 'worker exited ' + c }));
  }
  // anything left pending/rendering from a previous run gets queued again
  db.list().forEach((n) => { if (n.render.status !== 'done') enqueue(n); });

  function readBody(req, limit) {
    return new Promise((resolve, reject) => {
      const chunks = []; let n = 0;
      req.on('data', (c) => { n += c.length; if (n > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }
  const send = (res, status, body, headers) => {
    const isObj = body !== null && typeof body === 'object' && !Buffer.isBuffer(body);
    res.writeHead(status, Object.assign({ 'Content-Type': isObj ? 'application/json' : 'text/plain; charset=utf-8' }, headers));
    res.end(isObj ? JSON.stringify(body) : body);
  };
  const IMMUTABLE = { 'Cache-Control': 'public, max-age=31536000, immutable' };

  function validNode(n, id) {
    if (!n || typeof n !== 'object' || n.id !== id) return 'id mismatch';
    if (!(Math.abs(n.lat) <= 90) || !(Math.abs(n.lon) <= 180)) return 'bad coordinates';
    if (!Array.isArray(n.shots) || !n.shots.length || n.shots.length > 40) return 'shots must be 1..40';
    for (const s of n.shots) {
      if (!s || !ID.test(s.id || '')) return 'bad shot id';
      if (s.kind !== 'equirect' && s.kind !== 'flat') return 'bad shot kind';
      if (!fs.existsSync(path.join(blobDir, s.id + '.jpg'))) return 'missing image ' + s.id;
    }
    return null;
  }
  const clean = (n) => {
    const num = (v, d, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(+v) ? +v : d));
    return { id: n.id, lat: +n.lat, lon: +n.lon, heading: num(n.heading, 0, 0, 360), createdAt: typeof n.createdAt === 'string' ? n.createdAt.slice(0, 40) : new Date().toISOString(),
      shots: n.shots.map((s) => ({ id: s.id, kind: s.kind, name: String(s.name || '').slice(0, 200), width: s.width | 0, height: s.height | 0,
        heading: num(s.heading, 0, 0, 360), hfov: num(s.hfov, s.kind === 'flat' ? 70 : 360, 10, 360), pitch: num(s.pitch, 0, -90, 90),
        roll: num(s.roll, 0, -180, 180), k1: num(s.k1, 0, -0.5, 0.5), k2: num(s.k2, 0, -0.5, 0.5) })) };
  };

  async function api(req, res, url) {
    const p = url.pathname, m = req.method;
    if (p === '/api/health') return send(res, 200, { ok: true });
    if (p === '/api/nodes' && m === 'GET') return send(res, 200, db.list(), { 'Cache-Control': 'no-cache' });
    if (p === '/api/nodes/near' && m === 'GET') {
      const lat = +url.searchParams.get('lat'), lon = +url.searchParams.get('lon'), r = Math.min(500, +url.searchParams.get('r') || 50);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return send(res, 400, { error: 'lat/lon required' });
      const dLat = r / 111000 * 1.2, dLon = dLat / Math.max(0.01, Math.cos(lat * Math.PI / 180));
      const hits = db.near(lat, lon, dLat, dLon).map((n) => ({ n, d: G.distance({ lat, lon }, n) })).filter((x) => x.d <= r).sort((a, b) => a.d - b.d);
      return send(res, 200, hits.map((x) => Object.assign({ distance: x.d }, x.n)));
    }
    let mm;
    if ((mm = /^\/api\/nodes\/([^/]+)$/.exec(p))) {
      const id = mm[1];
      if (!ID.test(id)) return send(res, 400, { error: 'bad id' });
      if (m === 'GET') { const n = db.get(id); return n ? send(res, 200, n) : send(res, 404, { error: 'not found' }); }
      if (!authed(req)) return send(res, 401, { error: 'token required' });
      if (m === 'PUT') {
        let body; try { body = JSON.parse((await readBody(req, MAX_JSON)).toString('utf8')); } catch (e) { return send(res, e.status || 400, { error: e.status ? e.message : 'bad json' }); }
        const err = validNode(body, id);
        if (err) return send(res, 400, { error: err });
        const node = db.put(clean(body)); enqueue(node);
        return send(res, 200, db.get(id));
      }
      if (m === 'DELETE') {
        const n = db.remove(id);
        if (n) {
          n.shots.forEach((s) => fs.rmSync(path.join(blobDir, s.id + '.jpg'), { force: true }));
          fs.rmSync(path.join(panoDir, id), { recursive: true, force: true });
        }
        return send(res, 200, { ok: true });
      }
    }
    if ((mm = /^\/api\/blobs\/([^/]+)$/.exec(p))) {
      const id = mm[1];
      if (!ID.test(id)) return send(res, 400, { error: 'bad id' });
      const file = path.join(blobDir, id + '.jpg');
      if (m === 'GET') return fs.existsSync(file) ? send(res, 200, fs.readFileSync(file), Object.assign({ 'Content-Type': 'image/jpeg' }, IMMUTABLE)) : send(res, 404, { error: 'not found' });
      if (m === 'PUT') {
        if (!authed(req)) return send(res, 401, { error: 'token required' });
        let buf; try { buf = await readBody(req, MAX_BLOB); } catch (e) { return send(res, e.status || 400, { error: e.message }); }
        try {
          const meta = await sharp(buf, { limitInputPixels: MAX_PIXELS }).metadata();
          if (!meta.width || !meta.height) throw new Error('not an image');
          // re-encode: drops EXIF/GPS, applies orientation, caps size
          const out = await sharp(buf, { limitInputPixels: MAX_PIXELS }).rotate().resize({ width: 8192, withoutEnlargement: true }).jpeg({ quality: 90 }).toBuffer({ resolveWithObject: true });
          fs.writeFileSync(file, out.data);
          return send(res, 200, { id, width: out.info.width, height: out.info.height });
        } catch (e) { return send(res, 415, { error: 'unsupported image: ' + e.message }); }
      }
    }
    if ((mm = /^\/pano\/([^/]+)\/(\d+)-(high|low)\.jpg$/.exec(p)) && m === 'GET') {
      const file = path.join(panoDir, mm[1], mm[2] + '-' + mm[3] + '.jpg');
      return ID.test(mm[1]) && fs.existsSync(file) ? send(res, 200, fs.readFileSync(file), Object.assign({ 'Content-Type': 'image/jpeg' }, IMMUTABLE)) : send(res, 404, { error: 'not rendered' });
    }
    return send(res, 404, { error: 'unknown endpoint' });
  }

  function serveStatic(req, res, url) {
    let rel = decodeURIComponent(url.pathname);
    if (rel === '/') { res.writeHead(302, { Location: '/live/index.html' }); return res.end(); }
    const file = path.join(staticDir, path.normalize(rel));
    if (!file.startsWith(staticDir + path.sep) || /(^|[\\/])(server|tests|node_modules)([\\/]|$)/.test(path.relative(staticDir, file))) return send(res, 404, 'not found');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, 'not found');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    });
  }

  const server = http.createServer((req, res) => {
    let url; try { url = new URL(req.url, 'http://x'); } catch (e) { return send(res, 400, 'bad url'); }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const run = url.pathname.startsWith('/api/') || url.pathname.startsWith('/pano/') ? api(req, res, url) : (req.method === 'GET' || req.method === 'HEAD' ? serveStatic(req, res, url) : send(res, 405, 'method not allowed'));
    if (run && run.catch) run.catch((e) => { console.error(e); if (!res.headersSent) send(res, 500, { error: 'server error' }); });
  });
  server.roadview = { db, token, idle: () => new Promise((r) => { const t = setInterval(() => { if (!running && !queue.length) { clearInterval(t); r(); } }, 50); }) };
  server.on('close', () => db.close());
  return server;
}

module.exports = { createServer };

if (require.main === module) {
  const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
  const port = +process.env.PORT || 8080;
  const server = createServer({ dataDir, staticDir: path.join(__dirname, '..'), token: process.env.ADMIN_TOKEN });
  server.listen(port, process.env.HOST || '0.0.0.0', () => {
    console.log('roadview on :' + port + '  data: ' + dataDir);
    console.log('write token: ' + server.roadview.token + (process.env.ADMIN_TOKEN ? '' : '   (generated; stored in ' + path.join(dataDir, 'token') + ')'));
  });
}
