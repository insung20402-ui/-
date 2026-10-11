// WebGL renderer that shows the moment between two photos: both are drawn on a mesh that is bent along the
// estimated motion, then cross-faded. Falls back (throws from the constructor) when WebGL is not available.
(function (root) {
  'use strict';
  var NX = 28, NY = 16;

  function shader(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function smooth(a, b, x) { var t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); }

  // flow grid -> per-vertex displacement (normalised units), pinned to zero along the frame border so the mesh
  // always covers the whole picture
  function field(F) {
    var out = new Float32Array((NX + 1) * (NY + 1) * 2);
    if (!F) return out;
    for (var j = 0; j <= NY; j++) for (var i = 0; i <= NX; i++) {
      var u = i / NX, v = j / NY, d = root.TourFlow.sample(F, u, v), pin = smooth(0, 0.06, Math.min(u, v, 1 - u, 1 - v));
      out[(j * (NX + 1) + i) * 2] = d[0] * pin; out[(j * (NX + 1) + i) * 2 + 1] = d[1] * pin;
    }
    return out;
  }

  function Warper(canvas) {
    var gl = canvas.getContext('webgl', { antialias: false, alpha: false, preserveDrawingBuffer: false });
    if (!gl) throw new Error('no webgl');
    this.gl = gl; this.canvas = canvas; this.tex = new Map();
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl, gl.VERTEX_SHADER,
      'attribute vec2 a_pos; attribute vec2 a_uv; uniform vec2 u_pan; varying vec2 v_uv;' +
      'void main(){ vec2 q = a_pos + u_pan; gl_Position = vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0); v_uv = a_uv; }'));
    gl.attachShader(p, shader(gl, gl.FRAGMENT_SHADER,
      'precision mediump float; uniform sampler2D u_tex; uniform float u_w; varying vec2 v_uv;' +
      'void main(){ gl_FragColor = vec4(texture2D(u_tex, v_uv).rgb * u_w, 1.0); }'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    gl.useProgram(p);
    this.loc = { pos: gl.getAttribLocation(p, 'a_pos'), uv: gl.getAttribLocation(p, 'a_uv'),
      pan: gl.getUniformLocation(p, 'u_pan'), w: gl.getUniformLocation(p, 'u_w') };
    var uv = new Float32Array((NX + 1) * (NY + 1) * 2), idx = [];
    for (var j = 0; j <= NY; j++) for (var i = 0; i <= NX; i++) { uv[(j * (NX + 1) + i) * 2] = i / NX; uv[(j * (NX + 1) + i) * 2 + 1] = j / NY; }
    for (j = 0; j < NY; j++) for (i = 0; i < NX; i++) {
      var a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    this.uv = uv; this.pos = new Float32Array(uv.length); this.count = idx.length;
    this.uvBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf); gl.bufferData(gl.ARRAY_BUFFER, uv, gl.STATIC_DRAW);
    this.posBuf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf); gl.bufferData(gl.ARRAY_BUFFER, this.pos, gl.DYNAMIC_DRAW);
    this.idxBuf = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);                    // weights sum to 1, so adding is a cross-fade
  }

  Warper.prototype.texture = function (img) {
    var gl = this.gl, hit = this.tex.get(img);
    if (hit) { this.tex.delete(img); this.tex.set(img, hit); return hit; }
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);       // throws SecurityError for file:// images
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.tex.set(img, t);
    if (this.tex.size > 8) { var k = this.tex.keys().next().value; gl.deleteTexture(this.tex.get(k)); this.tex.delete(k); }
    return t;
  };

  Warper.prototype.resize = function () {
    var c = this.canvas, dpr = Math.min(root.devicePixelRatio || 1, 2), w = Math.round(c.clientWidth * dpr), h = Math.round(c.clientHeight * dpr);
    if (w && h && (c.width !== w || c.height !== h)) { c.width = w; c.height = h; }
    this.gl.viewport(0, 0, c.width, c.height);
  };

  // layer: one frame drawn with its mesh displaced by `disp * amount`, weighted `weight`
  Warper.prototype.layer = function (img, disp, amount, weight, pan) {
    var gl = this.gl, L = this.loc, n = this.uv.length;
    for (var k = 0; k < n; k++) this.pos[k] = this.uv[k] + (disp ? disp[k] * amount : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.posBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pos);
    gl.enableVertexAttribArray(L.pos); gl.vertexAttribPointer(L.pos, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.uvBuf);
    gl.enableVertexAttribArray(L.uv); gl.vertexAttribPointer(L.uv, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.idxBuf);
    gl.bindTexture(gl.TEXTURE_2D, this.texture(img));
    gl.uniform1f(L.w, weight); gl.uniform2f(L.pan, pan[0], pan[1]);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_SHORT, 0);
  };

  // f in [0, 1]: 0 shows A, 1 shows B. fieldA bends A toward B, fieldB bends B back toward A.
  // gain in [0, 1] scales the bending, so a motion estimate that arrives late can be faded in instead of popping.
  Warper.prototype.render = function (A, B, fieldA, fieldB, f, pan, gain) {
    var gl = this.gl; pan = pan || [0, 0]; gain = gain === undefined ? 1 : gain;
    this.resize();
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    if (f <= 0.0005 || !B) { this.layer(A, null, 0, 1, pan); return; }
    if (f >= 0.9995) { this.layer(B, null, 0, 1, pan); return; }
    this.layer(A, fieldA, f * gain, 1 - f, pan);
    this.layer(B, fieldB, (1 - f) * gain, f, pan);
  };

  Warper.prototype.destroy = function () { this.tex.forEach(function (t) { this.gl.deleteTexture(t); }, this); this.tex.clear(); };

  root.TourWarper = Warper;
  root.TourWarper.field = field;
})(window);
