'use strict';
// Minimal tile + API server: node server/tile-server.js [dataDir] [port]
//   GET /tiles/{panoId}/{revision}/{z}/{x}_{y}.jpg  -> file under dataDir (immutable cache)
//   PUT /tiles/...                                  -> store an uploaded tile (token required)
//   GET /healthz
// Revision is part of the path, so tiles are cacheable forever; a re-blur uploads a new revision.
// Replace with object storage + CDN in production; this is the contract, not the scale.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(process.argv[2] || 'tile-data');
const PORT = +process.argv[3] || 8080;
const TOKEN = process.env.UPLOAD_TOKEN || '';
const RE = /^\/tiles\/([\w-]+)\/(\w+)\/(\d+)\/(\d+)_(\d+)\.jpg$/;

function resolve(url) {
  const m = RE.exec(url.split('?')[0]);
  if (!m) return null;
  return path.join(ROOT, m[1], m[2], m[3], m[4] + '_' + m[5] + '.jpg');
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/healthz') return res.end('ok');
  const file = resolve(req.url);
  if (!file) { res.statusCode = 404; return res.end(); }
  if (req.method === 'GET') {
    fs.readFile(file, (err, data) => {
      if (err) { res.statusCode = 404; return res.end(); }
      res.setHeader('Content-Type', 'image/jpeg');
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.end(data);
    });
  } else if (req.method === 'PUT') {
    if (!TOKEN || req.headers.authorization !== 'Bearer ' + TOKEN) { res.statusCode = 401; return res.end(); }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    req.pipe(fs.createWriteStream(file)).on('finish', () => { res.statusCode = 201; res.end(); });
  } else { res.statusCode = 405; res.end(); }
});

if (require.main === module) server.listen(PORT, () => console.log('tiles on :' + PORT + ' from ' + ROOT));
module.exports = { server, resolve };
