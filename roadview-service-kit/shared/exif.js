// Minimal JPEG EXIF/XMP reader: enough to derive a field of view and detect 360° photos.
// Pure (ArrayBuffer in, plain object out) so it runs in the browser and in Node tests.
(function (root) {
  'use strict';
  var D2R = Math.PI / 180;

  // Horizontal fov from a 35mm-equivalent focal length (36mm frame width).
  function hfovFrom35mm(f35, aspect) {
    var width = aspect && aspect < 1 ? 24 : 36;      // portrait photos: the long side is vertical
    return 2 * Math.atan(width / (2 * f35)) / D2R;
  }

  function parse(buf) {
    var v = new DataView(buf), out = {};
    if (v.byteLength < 4 || v.getUint16(0) !== 0xFFD8) return out;
    var p = 2;
    while (p + 4 < v.byteLength) {
      if (v.getUint8(p) !== 0xFF) break;
      var marker = v.getUint8(p + 1), len = v.getUint16(p + 2);
      if (marker === 0xE1) {
        var head = String.fromCharCode.apply(null, new Uint8Array(buf, p + 4, Math.min(29, len)));
        if (head.indexOf('Exif\0\0') === 0) readTiff(v, p + 10, out);
        else if (head.indexOf('http://ns.adobe.com/xap') === 0) {
          var xmp = new TextDecoder('utf-8').decode(new Uint8Array(buf, p + 4, len - 2));
          if (/GPano:ProjectionType\s*=\s*"equirectangular"|<GPano:ProjectionType>equirectangular/.test(xmp)) out.projection = 'equirectangular';
          var fh = /GPano:PoseHeadingDegrees\s*=\s*"([\d.\-]+)"/.exec(xmp);
          if (fh) out.poseHeading = parseFloat(fh[1]);
        }
      }
      if (marker === 0xDA) break;
      p += 2 + len;
    }
    return out;
  }

  function readTiff(v, base, out) {
    var le = v.getUint16(base) === 0x4949;
    var u16 = function (o) { return v.getUint16(base + o, le); };
    var u32 = function (o) { return v.getUint32(base + o, le); };
    var rat = function (o) { var d = u32(o + 4); return d ? u32(o) / d : 0; };
    function ifd(off, handler) {
      var n = u16(off);
      for (var i = 0; i < n; i++) {
        var e = off + 2 + i * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4);
        var size = ({ 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 })[type] * count;
        handler(tag, type, count, size > 4 ? u32(e + 8) : e + 8);
      }
    }
    var exifOff = 0, gpsOff = 0;
    ifd(u32(4), function (tag, type, count, o) {
      if (tag === 0x8769) exifOff = u32(o);
      else if (tag === 0x8825) gpsOff = u32(o);
      else if (tag === 0x0112) out.orientation = u16(o);
      else if (tag === 0x010F || tag === 0x0110) {
        var s = ''; for (var i = 0; i < count - 1; i++) s += String.fromCharCode(v.getUint8(base + o + i));
        out[tag === 0x010F ? 'make' : 'model'] = s.trim();
      }
    });
    if (exifOff) ifd(exifOff, function (tag, type, count, o) {
      if (tag === 0x920A) out.focalLength = rat(o);
      else if (tag === 0xA405) out.focalLength35 = u16(o);
      else if (tag === 0xA002) out.pixelWidth = type === 3 ? u16(o) : u32(o);
      else if (tag === 0xA003) out.pixelHeight = type === 3 ? u16(o) : u32(o);
    });
    if (gpsOff) {
      var g = {};
      ifd(gpsOff, function (tag, type, count, o) {
        if (tag === 1 || tag === 3) g[tag] = String.fromCharCode(v.getUint8(base + o));
        else if (tag === 2 || tag === 4) g[tag] = rat(o) + rat(o + 8) / 60 + rat(o + 16) / 3600;
        else if (tag === 17) g.dir = rat(o);
      });
      if (g[2] !== undefined && g[4] !== undefined) {
        out.gps = { lat: g[1] === 'S' ? -g[2] : g[2], lon: g[3] === 'W' ? -g[4] : g[4] };
        if (g.dir !== undefined) out.gps.heading = g.dir;
      }
    }
  }

  // Best hfov for an ordinary photo: 35mm-equivalent focal length when present.
  // Without it, fall back to real focal length if the sensor width is guessable (phones: ~6.2mm wide at 1/2.55").
  function hfov(exif, width, height) {
    var aspect = width && height ? width / height : 1.33;
    if (exif.focalLength35) return hfovFrom35mm(exif.focalLength35, aspect);
    return null;
  }

  function read(blob) {
    return blob.slice(0, 256 * 1024).arrayBuffer().then(function (b) { return parse(b); }, function () { return {}; });
  }

  var api = { parse: parse, read: read, hfov: hfov, hfovFrom35mm: hfovFrom35mm };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RVExif = api;
})(typeof window !== 'undefined' ? window : globalThis);
