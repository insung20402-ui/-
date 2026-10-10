// Key-frame extraction for drive-through videos, and sequential assignment of
// frames to capture nodes. The scoring/selection functions are pure (tested in
// Node); sample() and grab() need a <video> element.
(function (root) {
  'use strict';
  var RV = root.RV = root.RV || {};
  var SAMPLE_W = 160, SAMPLE_H = 90;
  var STILL_THRESHOLD = 1.2;   // mean abs luma diff (0-255) below which the camera is considered stopped
  // Motion is measured against frames about this many seconds away, not
  // against the neighbouring sample, so the still test does not depend on how
  // densely the clip is sampled (adjacent samples 0.1 s apart barely differ
  // even while driving).
  var MOTION_BASELINE_S = 0.6;

  // variance of a 4-neighbour Laplacian over a luma buffer: higher = sharper
  function sharpness(gray, w, h) {
    var sum = 0, sumSq = 0, n = 0;
    for (var y = 1; y < h - 1; y++) {
      for (var x = 1; x < w - 1; x++) {
        var i = y * w + x;
        var lap = gray[i - 1] + gray[i + 1] + gray[i - w] + gray[i + w] - 4 * gray[i];
        sum += lap;
        sumSq += lap * lap;
        n++;
      }
    }
    if (!n) return 0;
    var mean = sum / n;
    return Math.max(0, sumSq / n - mean * mean);   // clamp float cancellation error
  }

  // mean absolute luma difference between two same-sized buffers
  function difference(a, b) {
    var n = Math.min(a.length, b.length), sum = 0;
    for (var i = 0; i < n; i++) sum += Math.abs(a[i] - b[i]);
    return n ? sum / n : 0;
  }

  // Flag candidates where the camera did not move since the previous kept one
  // (waiting at a light), so stops do not produce duplicate captures.
  // candidates: [{ t, sharpness, gray? , motion? }] sorted by t; adds `still`.
  function markStills(candidates, threshold) {
    var limit = threshold === undefined ? STILL_THRESHOLD : threshold;
    candidates.forEach(function (c, i) {
      c.still = i > 0 && c.motion !== undefined && c.motion < limit;
    });
    return candidates;
  }

  // Travel time: clock time with the stopped stretches squeezed out. While the
  // camera is stopped no distance is covered, so windows cut in clock time
  // would hand the same place to several consecutive slots; windows cut in
  // travel time do not. Returns one value per candidate (stills inherit the
  // travel time of the moment the stop began).
  function travelTimes(candidates) {
    var out = [], acc = 0;
    candidates.forEach(function (c, i) {
      if (i > 0 && !c.still) acc += c.t - candidates[i - 1].t;
      out.push(acc);
    });
    return out;
  }

  // Split candidates into windows of travel time. Still frames belong to no
  // window unless every candidate is still (a clip with no motion at all), in
  // which case clock time is used. Returns { size, windows: [[candidateIndex…]…] }.
  function buildWindows(candidates, windowsFor) {
    if (!candidates.length) return { size: 0, windows: [] };
    var anyMoving = candidates.some(function (c) { return !c.still; });
    var times = anyMoving ? travelTimes(candidates) : candidates.map(function (c) { return c.t; });
    var eligible = [];
    candidates.forEach(function (c, i) { if (!(anyMoving && c.still)) eligible.push(i); });
    var t0 = times[eligible[0]], span = times[eligible[eligible.length - 1]] - t0;
    var w = windowsFor(span);
    var windows = [];
    for (var s = 0; s < w.slots; s++) windows.push([]);
    eligible.forEach(function (i) {
      windows[Math.min(w.slots - 1, Math.floor((times[i] - t0) / w.size))].push(i);
    });
    return { size: w.size, windows: windows, times: times };
  }
  function bySlots(slots) {
    return function (span) { return { slots: slots, size: span > 0 ? span / slots : 1 }; };
  }
  function byInterval(seconds) {
    return function (span) { return { slots: Math.max(1, Math.ceil(span / seconds - 1e-9)), size: seconds }; };
  }

  // The sharpest candidate of each window, with one constraint: a pick must be
  // at least half a window of travel after the previous pick. Without it, two
  // neighbouring windows can each pick the frame right at their shared border
  // and deliver two near-identical photos. When nothing in a window is far
  // enough, its latest frame is taken. Empty windows yield null.
  function pickWindows(built) {
    var lastTime = -Infinity;
    return built.windows.map(function (win) {
      if (!win.length) return null;
      var best = null;
      win.forEach(function (i) {
        if (built.times[i] - lastTime < built.size / 2) return;
        if (best === null || built.candidates[i].sharpness > built.candidates[best].sharpness) best = i;
      });
      if (best === null) best = win[win.length - 1];
      lastTime = built.times[best];
      return best;
    });
  }
  function pick(candidates, windowsFor) {
    var built = buildWindows(candidates, windowsFor);
    built.candidates = candidates;
    return pickWindows(built);
  }

  // One frame per slot: travel time is split into `slots` equal windows
  // (use when the number of capture nodes to fill is known).
  // Returns an array of length `slots` holding candidate indexes (or null).
  function select(candidates, slots) {
    slots = Math.floor(slots);
    if (!(slots >= 1)) return [];
    return pick(candidates, bySlots(slots));
  }

  // One frame per `seconds` of travel time (use when the operator decides the
  // capture cadence: "every N seconds keep the best frame"). The number of
  // frames follows from the clip; a trailing partial window still yields one.
  function selectByInterval(candidates, seconds) {
    if (!(seconds > 0)) return [];
    return pick(candidates, byInterval(seconds));
  }

  // The candidate indexes each window holds, for UIs that let the operator
  // swap a pick for another frame of the same window. Pass { slots } or { seconds }.
  function windows(candidates, by) {
    if (by.seconds > 0) return buildWindows(candidates, byInterval(by.seconds)).windows;
    var slots = Math.floor(by.slots);
    return slots >= 1 ? buildWindows(candidates, bySlots(slots)).windows : [];
  }

  // Node ids along a road for sequential registration.
  // direction: +1 follows the road's own direction (node seq ascending), -1 the opposite.
  // Stops at the end of the road, so the result may be shorter than `count`.
  function sequence(roadId, startSeq, direction, count) {
    var road = RV.getRoad(roadId);
    if (!road) return [];
    var ids = [];
    var step = direction < 0 ? -1 : 1;
    for (var i = 0, seq = startSeq; i < count && seq >= 0 && seq < road.nodeIds.length; i++, seq += step) {
      ids.push(road.nodeIds[seq]);
    }
    return ids;
  }
  // heading a forward-facing camera has when driving the road in `direction`
  function travelHeading(roadId, direction) {
    var road = RV.getRoad(roadId);
    return road ? RV.norm360(road.heading + (direction < 0 ? 180 : 0)) : 0;
  }

  // ---- browser-only helpers ----
  function seek(video, t) {
    return new Promise(function (resolve, reject) {
      function done() { cleanup(); resolve(); }
      function fail() { cleanup(); reject(new Error('video seek failed')); }
      function cleanup() {
        video.removeEventListener('seeked', done);
        video.removeEventListener('error', fail);
      }
      video.addEventListener('seeked', done);
      video.addEventListener('error', fail);
      video.currentTime = t;
    });
  }
  function lumaOf(video, canvas) {
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    var px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    var gray = new Float32Array(canvas.width * canvas.height);
    for (var i = 0; i < gray.length; i++) gray[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
    return gray;
  }

  // Scan a loaded <video> and score `count` evenly spaced frames.
  // opts: { step | count, maxCount, start, end, onProgress(done, total) } -> Promise<candidates>
  // Each candidate: { t, sharpness, motion, still }.
  function sample(video, opts) {
    opts = opts || {};
    var start = opts.start || 0;
    var end = opts.end === undefined ? video.duration : opts.end;
    // `step` (seconds between scored frames) wins over `count`
    var count = opts.step > 0 ? Math.ceil((end - start) / opts.step) : (opts.count || 60);
    count = Math.max(2, Math.min(count, opts.maxCount || 600));
    var canvas = document.createElement('canvas');
    canvas.width = SAMPLE_W;
    canvas.height = SAMPLE_H;
    var candidates = [];
    var grays = [];
    var chain = Promise.resolve();
    for (var i = 0; i < count; i++) {
      (function (i) {
        chain = chain.then(function () {
          // stay a hair inside the clip: seeking to exactly `duration` often yields no frame
          var t = start + (end - start) * (i + 0.5) / count;
          return seek(video, t).then(function () {
            var gray = lumaOf(video, canvas);
            candidates.push({ t: t, sharpness: sharpness(gray, SAMPLE_W, SAMPLE_H) });
            grays.push(Uint8Array.from(gray));
            if (opts.onProgress) opts.onProgress(i + 1, count);
          });
        });
      })(i);
    }
    // Motion looks both ways: the smaller of the differences to the frames one
    // baseline earlier and one baseline later. Looking back only would call the
    // first moments of a stop "moving" (they differ from the drive before them).
    chain = chain.then(function () {
      candidates.forEach(function (c, i) {
        var back = -1, fwd = -1, j;
        for (j = i - 1; j >= 0; j--) if (candidates[j].t <= c.t - MOTION_BASELINE_S) { back = j; break; }
        for (j = i + 1; j < candidates.length; j++) if (candidates[j].t >= c.t + MOTION_BASELINE_S) { fwd = j; break; }
        var d = [];
        if (back >= 0) d.push(difference(grays[i], grays[back]));
        if (fwd >= 0) d.push(difference(grays[i], grays[fwd]));
        if (d.length) c.motion = Math.min.apply(null, d);
      });
    });
    return chain.then(function () { return markStills(candidates); });
  }

  // Full-resolution frame at time t as a canvas (capped to maxWidth).
  function grab(video, t, maxWidth) {
    return seek(video, t).then(function () {
      var scale = Math.min(1, (maxWidth || 2048) / video.videoWidth);
      var c = document.createElement('canvas');
      c.width = Math.round(video.videoWidth * scale);
      c.height = Math.round(video.videoHeight * scale);
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      return c;
    });
  }

  RV.keyframes = {
    STILL_THRESHOLD: STILL_THRESHOLD,
    sharpness: sharpness,
    difference: difference,
    markStills: markStills,
    travelTimes: travelTimes,
    select: select,
    selectByInterval: selectByInterval,
    windows: windows,
    sequence: sequence,
    travelHeading: travelHeading,
    sample: sample,
    grab: grab
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = RV.keyframes;
})(typeof window !== 'undefined' ? window : globalThis);
