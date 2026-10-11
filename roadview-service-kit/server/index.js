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
//   GET    /api/tours                       -> video tours [{ id, title, type, count, ext, rev, ... }]
//   PUT    /api/tours/:id/frames/:n?rev=R (token) -> one frame (raw image; re-encoded, EXIF stripped)
//   PUT    /api/tours/:id        (token)    -> publish manifest for rev R once all frames are there
//   DELETE /api/tours/:id        (token)
//   GET    /tours/:id/:rev/:n.jpg           -> a frame (immutable)
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
  const blobDir = path.join(dataDir, 'blobs'), panoDir = path.join(dataDir, 'pano'), tourDir = path.join(dataDir, 'tours');
  fs.mkdirSync(blobDir, { recursive: true }); fs.mkdirSync(panoDir, { recursive: true }); fs.mkdirSync(tourDir, { recursive: true });
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
  // frames uploaded for a tour that was never published (browser closed mid-upload) are removed after an hour
  function sweepTours() {
    const old = (f) => Date.now() - fs.statSync(f).mtimeMs > 3600e3;
    for (const id of fs.readdirSync(tourDir)) {
      const dir = path.join(tourDir, id);
      let cur = null;
      try { cur = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8')).rev; } catch (e) { /* unpublished */ }
      for (const d of fs.readdirSync(dir)) {
        if (d === 'manifest.json' || d === cur) continue;
        if (old(path.join(dir, d))) fs.rmSync(path.join(dir, d), { recursive: true, force: true });
      }
      if (!cur && !fs.readdirSync(dir).length) fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  try { sweepTours(); } catch (e) { console.error('sweep failed', e.message); }
  const sweeper = setInterval(() => { try { sweepTours(); } catch (e) { /* ignore */ } }, 3600e3); sweeper.unref();

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
    let mm;
    if (/%/.test(p)) return send(res, 400, { error: 'bad path' });          // ids are plain [A-Za-z0-9_-]
    if (p === '/api/health') return send(res, 200, { ok: true });
    if (p === '/api/nodes' && m === 'GET') return send(res, 200, db.list(), { 'Cache-Control': 'no-cache' });
    if (p === '/api/nodes/near' && m === 'GET') {
      const lat = +url.searchParams.get('lat'), lon = +url.searchParams.get('lon'), r = Math.min(500, +url.searchParams.get('r') || 50);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return send(res, 400, { error: 'lat/lon required' });
      const dLat = r / 111000 * 1.2, dLon = dLat / Math.max(0.01, Math.cos(lat * Math.PI / 180));
      const hits = db.near(lat, lon, dLat, dLon).map((n) => ({ n, d: G.distance({ lat, lon }, n) })).filter((x) => x.d <= r).sort((a, b) => a.d - b.d);
      return send(res, 200, hits.map((x) => Object.assign({ distance: x.d }, x.n)));
    }
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

    // ---- video tours: frames + manifest on disk, no database needed ----
    if (p === '/api/tours' && m === 'GET') {
      const list = fs.readdirSync(tourDir).map((id) => {
        try { return JSON.parse(fs.readFileSync(path.join(tourDir, id, 'manifest.json'), 'utf8')); } catch (e) { return null; }
      }).filter(Boolean).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.created).localeCompare(String(b.created)));
      return send(res, 200, { tours: list }, { 'Cache-Control': 'no-cache' });
    }
    if ((mm = /^\/api\/tours\/([^/]+)\/frames\/(\d{1,3})$/.exec(p)) && m === 'PUT') {
      const id = mm[1], n = +mm[2], rev = url.searchParams.get('rev') || '';
      if (!ID.test(id) || !ID.test(rev)) return send(res, 400, { error: 'bad id or rev' });
      if (!authed(req)) return send(res, 401, { error: 'token required' });
      let buf; try { buf = await readBody(req, MAX_BLOB); } catch (e) { return send(res, e.status || 400, { error: e.message }); }
      try {
        const out = await sharp(buf, { limitInputPixels: MAX_PIXELS }).rotate().resize({ width: 1920, height: 1920, fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
        const dir = path.join(tourDir, id, rev); fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, String(n).padStart(3, '0') + '.jpg'), out.data);
        return send(res, 200, { n, width: out.info.width, height: out.info.height });
      } catch (e) { return send(res, 415, { error: 'unsupported image: ' + e.message }); }
    }
    if ((mm = /^\/api\/tours\/([^/]+)$/.exec(p))) {
      const id = mm[1];
      if (!ID.test(id)) return send(res, 400, { error: 'bad id' });
      if (m === 'GET') {
        try { return send(res, 200, JSON.parse(fs.readFileSync(path.join(tourDir, id, 'manifest.json'), 'utf8'))); } catch (e) { return send(res, 404, { error: 'not found' }); }
      }
      if (!authed(req)) return send(res, 401, { error: 'token required' });
      if (m === 'PUT') {
        let b; try { b = JSON.parse((await readBody(req, MAX_JSON)).toString('utf8')); } catch (e) { return send(res, e.status || 400, { error: 'bad json' }); }
        const rev = String(b.rev || ''), count = b.count | 0;
        if (!ID.test(rev) || count < 1 || count > 999) return send(res, 400, { error: 'bad rev or count' });
        for (let i = 0; i < count; i++) if (!fs.existsSync(path.join(tourDir, id, rev, String(i).padStart(3, '0') + '.jpg'))) return send(res, 400, { error: 'missing frame ' + i });
        const prev = (() => { try { return JSON.parse(fs.readFileSync(path.join(tourDir, id, 'manifest.json'), 'utf8')); } catch (e) { return null; } })();
        const man = { id, title: String(b.title || id).slice(0, 80), type: b.type === 'pan' ? 'pan' : 'walk', count, ext: 'jpg', rev,
          angle: Math.max(10, Math.min(720, +b.angle || 360)), loop: !!b.loop, order: prev ? prev.order : Date.now(),
          created: prev ? prev.created : new Date().toISOString(), base: '/tours/' + id + '/' + rev + '/' };
        fs.writeFileSync(path.join(tourDir, id, 'manifest.json'), JSON.stringify(man));
        fs.readdirSync(path.join(tourDir, id)).forEach((d) => { if (d !== rev && d !== 'manifest.json') fs.rmSync(path.join(tourDir, id, d), { recursive: true, force: true }); });
        return send(res, 200, man);
      }
      if (m === 'DELETE') { fs.rmSync(path.join(tourDir, id), { recursive: true, force: true }); return send(res, 200, { ok: true }); }
    }
    if ((mm = /^\/tours\/([^/]+)\/([^/]+)\/(\d{3})\.jpg$/.exec(p)) && m === 'GET') {
      const file = path.join(tourDir, mm[1], mm[2], mm[3] + '.jpg');
      return ID.test(mm[1]) && ID.test(mm[2]) && fs.existsSync(file) ? send(res, 200, fs.readFileSync(file), Object.assign({ 'Content-Type': 'image/jpeg' }, IMMUTABLE)) : send(res, 404, { error: 'not found' });
    }
    if ((mm = /^\/pano\/([^/]+)\/(\d+)-(high|low)\.jpg$/.exec(p)) && m === 'GET') {
      const file = path.join(panoDir, mm[1], mm[2] + '-' + mm[3] + '.jpg');
      return ID.test(mm[1]) && fs.existsSync(file) ? send(res, 200, fs.readFileSync(file), Object.assign({ 'Content-Type': 'image/jpeg' }, IMMUTABLE)) : send(res, 404, { error: 'not rendered' });
    }
    return send(res, 404, { error: 'unknown endpoint' });
  }

  // only the front-end folders are public; server code, tests, data (token, db), dotfiles and Docker files are not
  const PUBLIC_DIRS = new Set(['live', 'shared', 'tour', 'backoffice', 'a-split', 'b-immersive', 'c-inspector', 'docs']);
  const PUBLIC_FILES = new Set(['index.html', 'README.md']);
  function serveStatic(req, res, url) {
    let rel;
    try { rel = decodeURIComponent(url.pathname); } catch (e) { return send(res, 400, 'bad url'); }
    if (rel.indexOf('\0') >= 0) return send(res, 400, 'bad url');
    if (rel === '/') { res.writeHead(302, { Location: '/live/index.html' }); return res.end(); }
    const file = path.join(staticDir, path.normalize(rel));
    const parts = path.relative(staticDir, file).split(path.sep);
    const top = parts[0];
    const allowed = file.startsWith(staticDir + path.sep) && !parts.some((x) => x.startsWith('.')) &&
      (parts.length === 1 ? PUBLIC_FILES.has(top) : PUBLIC_DIRS.has(top)) && !(file === dataDir || file.startsWith(dataDir + path.sep));
    if (!allowed) return send(res, 404, 'not found');
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return send(res, 404, 'not found');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
    });
  }

  const server = http.createServer((req, res) => {
    try { handle(req, res); } catch (e) { console.error(e); if (!res.headersSent) send(res, 500, 'server error'); else res.destroy(); }
  });
  function handle(req, res) {
    let url; try { url = new URL(req.url, 'http://x'); } catch (e) { return send(res, 400, 'bad url'); }
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const run = url.pathname.startsWith('/api/') || url.pathname.startsWith('/pano/') || url.pathname.startsWith('/tours/') ? api(req, res, url) : (req.method === 'GET' || req.method === 'HEAD' ? serveStatic(req, res, url) : send(res, 405, 'method not allowed'));
    if (run && run.catch) run.catch((e) => { console.error(e); if (!res.headersSent) send(res, 500, { error: 'server error' }); });
  }
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
