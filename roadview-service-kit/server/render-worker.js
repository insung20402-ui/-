'use strict';
// Renders one node to an equirectangular JPEG (high + low resolution), in a worker thread so
// the HTTP server stays responsive. Mirrors live/pano.js so the browser and server agree.
const { parentPort, workerData } = require('node:worker_threads');
const sharp = require('sharp');
const RP = require('../shared/reproject.js');

const W_HIGH = 4096, W_LOW = 1024;
const norm360 = (a) => ((a % 360) + 360) % 360;

async function raw(file, width) {
  const { data, info } = await sharp(file).rotate().resize({ width, withoutEnlargement: false }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length), w: info.width, h: info.height };
}

async function render(node, blobPath, W) {
  const H = W / 2, ppd = W / 360;
  let out = new Uint8ClampedArray(W * H * 4);
  const eq = node.shots.filter((s) => s.kind === 'equirect').pop();
  const flats = node.shots.filter((s) => s.kind !== 'equirect');
  if (eq) {
    const d0 = await sharp(blobPath(eq.id)).rotate().resize(W, H, { fit: 'fill' }).ensureAlpha().raw().toBuffer();
    const src = { data: new Uint8ClampedArray(d0.buffer, d0.byteOffset, d0.length) };
    const x0 = Math.round(norm360((eq.heading || 0) - 270) * ppd);      // image centre faces `heading`
    for (let y = 0; y < H; y++) for (let c = 0; c < W; c++) {
      const s = ((y * W) + ((c - x0 + W) % W)) * 4, d = (y * W + c) * 4;
      out[d] = src.data[s]; out[d + 1] = src.data[s + 1]; out[d + 2] = src.data[s + 2]; out[d + 3] = 255;
    }
  }
  const items = [];
  for (const s of flats) {
    const hfov = s.hfov || 70;
    const tw = Math.max(64, Math.round(W * hfov / 360 * 1.3));
    const im = await raw(blobPath(s.id), tw);
    items.push({ src: im.data, iw: im.w, ih: im.h,
      shot: { heading: s.heading || 0, hfov, pitch: s.pitch || 0, roll: s.roll || 0, k1: s.k1 || 0, k2: s.k2 || 0, feather: 0.12 } });
  }
  if (!eq && items.length) RP.smartBackdrop(out, W, items, {});
  else if (!eq) out.fill(128);
  items.forEach((it) => RP.reprojectInto(out, W, it.src, it.iw, it.ih, it.shot));
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return sharp(Buffer.from(out.buffer), { raw: { width: W, height: H, channels: 4 } }).jpeg({ quality: 88, mozjpeg: false }).toBuffer();
}

(async () => {
  const { node, blobDir, outDir, rev } = workerData;
  const path = require('node:path'), fs = require('node:fs');
  const blobPath = (id) => path.join(blobDir, id + '.jpg');
  fs.mkdirSync(outDir, { recursive: true });
  const t0 = Date.now();
  const high = await render(node, blobPath, W_HIGH);
  fs.writeFileSync(path.join(outDir, rev + '-high.jpg'), high);
  const low = await sharp(high).resize(W_LOW, W_LOW / 2).jpeg({ quality: 82 }).toBuffer();
  fs.writeFileSync(path.join(outDir, rev + '-low.jpg'), low);
  parentPort.postMessage({ ok: true, ms: Date.now() - t0 });
})().catch((e) => parentPort.postMessage({ ok: false, error: String(e && e.message || e) }));
