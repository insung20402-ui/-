'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../shared/exif.js');
const R = require('../shared/reproject.js');

// Build a tiny JPEG: SOI + APP1(Exif, little endian, IFD0->ExifIFD with FocalLengthIn35mm=26, orientation=6).
function jpeg() {
  const t = [];
  const w16 = (v) => t.push(v & 255, v >> 8), w32 = (v) => t.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, v >>> 24);
  t.push(0x49, 0x49); w16(42); w32(8);
  w16(2);                                   // IFD0: orientation, exifptr
  w16(0x0112); w16(3); w32(1); w16(6); w16(0);
  w16(0x8769); w16(4); w32(1); w32(8 + 2 + 24 + 4);
  w32(0);
  w16(1);                                   // Exif IFD: FocalLengthIn35mm
  w16(0xA405); w16(3); w32(1); w16(26); w16(0);
  w32(0);
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...t];
  const len = body.length + 2;
  return new Uint8Array([0xFF, 0xD8, 0xFF, 0xE1, len >> 8, len & 255, ...body, 0xFF, 0xDA]).buffer;
}

test('reads orientation and 35mm focal length', () => {
  const e = X.parse(jpeg());
  assert.equal(e.orientation, 6);
  assert.equal(e.focalLength35, 26);
});

test('26mm-equivalent landscape photo is ~69.4 deg wide', () => {
  assert.ok(Math.abs(X.hfov({ focalLength35: 26 }, 4000, 3000) - 69.4) < 0.1);
});

test('portrait photos use the 24mm side', () => {
  assert.ok(Math.abs(X.hfov({ focalLength35: 26 }, 3000, 4000) - 49.6) < 0.1);
});

test('non-JPEG input yields no data', () => {
  assert.deepEqual(X.parse(new ArrayBuffer(8)), {});
});

test('barrel distortion k1<0 pulls edge samples inward, k1=0 matches the pure model', () => {
  const shot = { heading: 0, hfov: 90 };
  const a = R.project(40, 0, 640, 480, shot), b = R.project(40, 0, 640, 480, { ...shot, k1: -0.1 });
  assert.ok(b.x < a.x && b.x > 320);
  assert.ok(Math.abs(R.project(0, 0, 640, 480, { ...shot, k1: -0.1 }).x - 320) < 1e-9);
});
