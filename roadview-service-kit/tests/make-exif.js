'use strict';
// Test helper: insert an EXIF block (35mm focal length + GPS position + GPS direction) into a JPEG.
function rat(v) { return [Math.round(v * 10000), 10000]; }
function dms(deg) {
  const d = Math.floor(Math.abs(deg)), m = Math.floor((Math.abs(deg) - d) * 60), s = ((Math.abs(deg) - d) * 60 - m) * 60;
  return [[d, 1], [m, 1], [Math.round(s * 10000), 10000]];
}
module.exports = function withExif(jpeg, o) {
  const t = [];
  const w16 = (v) => t.push(v & 255, (v >> 8) & 255), w32 = (v) => t.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
  t.push(0x49, 0x49); w16(42); w32(8);
  const hasGps = o.lat !== undefined;
  const nIfd0 = hasGps ? 2 : 1, exifAt = 8 + 2 + nIfd0 * 12 + 4, gpsAt = exifAt + 2 + 12 + 4;
  w16(nIfd0);
  w16(0x8769); w16(4); w32(1); w32(exifAt);
  if (hasGps) { w16(0x8825); w16(4); w32(1); w32(gpsAt); }
  w32(0);
  w16(1); w16(0xA405); w16(3); w32(1); w16(o.focal35 || 26); w16(0); w32(0);
  if (hasGps) {
    const data = gpsAt + 2 + 5 * 12 + 4;
    w16(5);
    w16(1); w16(2); w32(2); t.push(o.lat < 0 ? 0x53 : 0x4E, 0, 0, 0);
    w16(2); w16(5); w32(3); w32(data);
    w16(3); w16(2); w32(2); t.push(o.lon < 0 ? 0x57 : 0x45, 0, 0, 0);
    w16(4); w16(5); w32(3); w32(data + 24);
    w16(17); w16(5); w32(1); w32(data + 48);
    w32(0);
    dms(o.lat).concat(dms(o.lon)).concat([rat(o.dir || 0)]).forEach((r) => { w32(r[0]); w32(r[1]); });
  }
  const body = [0x45, 0x78, 0x69, 0x66, 0, 0, ...t], len = body.length + 2;
  return Buffer.concat([jpeg.slice(0, 2), Buffer.from([0xFF, 0xE1, len >> 8, len & 255, ...body]), jpeg.slice(2)]);
};
