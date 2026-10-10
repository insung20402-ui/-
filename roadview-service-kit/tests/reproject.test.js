'use strict';
// Tests for shared/reproject.js: a rectilinear photo must land on the right bearings.
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../shared/reproject.js');

test('optical axis projects to the image centre', () => {
  const p = R.project(120, 0, 640, 480, { heading: 120, hfov: 70 });
  assert.ok(Math.abs(p.x - 320) < 1e-6 && Math.abs(p.y - 240) < 1e-6);
});

test('edge of horizontal fov lands on the image edge', () => {
  const p = R.project(120 + 35, 0, 640, 480, { heading: 120, hfov: 70 });
  assert.ok(Math.abs(p.x - 640) < 1e-6);
});

test('directions behind the camera do not project', () => {
  assert.equal(R.project(300, 0, 640, 480, { heading: 120, hfov: 70 }), null);
});

test('rectilinear: a point 20 deg right is further than 20/35 of the half width (tan law)', () => {
  const p = R.project(20, 0, 640, 480, { heading: 0, hfov: 70 });
  const expect = 320 + 320 * Math.tan(20 * Math.PI / 180) / Math.tan(35 * Math.PI / 180);
  assert.ok(Math.abs(p.x - expect) < 1e-6);
});

test('positive camera pitch moves the horizon down in the photo', () => {
  const p = R.project(0, 0, 640, 480, { heading: 0, hfov: 70, pitch: 10 });
  assert.ok(p.y > 240);
});

test('reprojectInto paints the facing sector and leaves the rest untouched', () => {
  const W = 360, H = 180, iw = 40, ih = 30;
  const src = new Uint8ClampedArray(iw * ih * 4).fill(255);        // white photo
  const dst = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < dst.length; i += 4) dst[i + 3] = 255;        // black backdrop
  R.reprojectInto(dst, W, src, iw, ih, { heading: 0, hfov: 60 });
  const at = (bearing, pitch) => dst[(Math.floor((90 - pitch)) * W + (((Math.floor(bearing) + 270) % 360))) * 4];
  assert.ok(at(0, 0) > 250, 'centre of the photo is painted');
  assert.equal(at(180, 0), 0, 'opposite side untouched');
  assert.ok(at(28, 0) > 0 && at(28, 0) < 255, 'feathered edge is a partial blend');
});
