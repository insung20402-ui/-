(function (root) {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var file = null, frames = null, duration = 0;

  function type() { return document.querySelector('input[name=type]:checked').value; }
  function slug(s) {
    var a = String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);
    return (a || 'tour') + '-' + Math.random().toString(36).slice(2, 6);
  }
  function syncType() {
    var pan = type() === 'pan';
    $('angleBox').hidden = !pan; $('loopBox').hidden = !pan;
    $('count').value = pan ? Math.min(150, Math.max(24, Math.round(duration * 8))) : Math.min(40, Math.max(6, Math.round(duration / 1.5)));
    $('tip').textContent = pan
      ? '돌려보기는 프레임이 많을수록 부드럽습니다(90~150장 권장). 천천히 일정한 속도로 돌며 찍은 영상이 좋습니다.'
      : '걷기는 한 걸음에 한 프레임입니다. 영상 길이 1.5초당 한 장이 기본이고, 촘촘할수록 이동이 자연스럽지만 한 번에 이동하는 거리는 짧아집니다.';
  }
  document.querySelectorAll('input[name=type]').forEach(function (r) { r.onchange = syncType; });

  $('file').onchange = function () {
    file = $('file').files[0]; frames = null; $('outBox').hidden = true;
    if (!file) return;
    var v = $('vid'); v.src = URL.createObjectURL(file);
    v.onerror = function () { $('vbox').hidden = true; $('optBox').hidden = true; alert('이 브라우저가 읽을 수 없는 영상입니다. MP4(H.264) 또는 WebM 영상을 올려 주세요.'); };
    v.onloadedmetadata = function () {
      duration = isFinite(v.duration) ? v.duration : 0;
      $('end').value = duration.toFixed(1); $('start').value = 0;
      $('vinfo').textContent = v.videoWidth + '×' + v.videoHeight + (v.videoWidth < v.videoHeight ? ' (세로 영상)' : ' (가로 영상)') + ' · ' + duration.toFixed(1) + '초';
      $('vbox').hidden = false; $('optBox').hidden = false;
      if (!$('title').value) $('title').value = file.name.replace(/\.[^.]+$/, '');
      syncType();
    };
  };
  $('setStart').onclick = function (e) { e.preventDefault(); $('start').value = $('vid').currentTime.toFixed(1); };
  $('setEnd').onclick = function (e) { e.preventDefault(); $('end').value = $('vid').currentTime.toFixed(1); };

  $('make').onclick = function () {
    var start = +$('start').value || 0, end = +$('end').value || duration, count = Math.max(2, Math.min(300, +$('count').value | 0));
    if (end - start < 0.5) { $('msg').textContent = '구간이 너무 짧습니다.'; return; }
    $('make').disabled = true; $('bar').hidden = false; $('msg').textContent = '프레임을 뽑는 중…';
    var blur = root.RVPrivacy && root.RVPrivacy.available() ? function (c) { return root.RVPrivacy.blurFaces(c); } : null;
    root.RVVideoFrames.extract(file, { count: count, start: start, end: end, maxSide: 1600, blur: blur,
      onProgress: function (i, n) { $('bar').firstChild.style.width = (i / n * 100) + '%'; $('msg').textContent = i + ' / ' + n; } })
      .then(function (fr) {
        frames = fr;
        $('msg').textContent = fr.length + '장을 뽑았습니다.';
        var strip = $('strip'); strip.innerHTML = '';
        fr.forEach(function (f) { var im = new Image(); im.src = URL.createObjectURL(f.blob); strip.appendChild(im); });
        var blurOn = !!blur;
        $('privacy').innerHTML = blurOn ? '<div class="ok">얼굴 자동 가림이 켜져 있습니다. 그래도 명찰·화면·문서는 직접 확인하세요.</div>'
          : '<div class="warn">이 브라우저는 얼굴 자동 가림을 지원하지 않습니다. 사람이 찍힌 장면이 있으면 저장하지 마세요.</div>';
        $('confirmBox').hidden = false; $('confirm').checked = false;
        $('outBox').hidden = false; syncSave();
      }, function (err) { $('msg').textContent = '실패: ' + err.message + ' (이 브라우저가 읽을 수 없는 영상 형식일 수 있습니다. MP4(H.264)나 WebM을 쓰세요.)'; })
      .then(function () { $('make').disabled = false; });
  };

  function syncSave() { var ok = frames && $('confirm').checked; $('save').disabled = !ok; $('zip').disabled = !ok; }
  $('confirm').onchange = syncSave;

  function meta() {
    return { id: slug($('title').value), title: $('title').value.trim() || '투어', type: type(),
      angle: +$('angle').value || 360, loop: type() === 'pan' && $('loop').checked };
  }

  $('save').onclick = function () {
    var m = meta(); $('save').disabled = true; $('saveMsg').textContent = '저장 중…';
    root.RVTours.save(m, frames.map(function (f) { return f.blob; }), function (i, n) { $('saveMsg').textContent = '업로드 ' + i + ' / ' + n; })
      .then(function (where) {
        $('saveMsg').innerHTML = (where === 'server' ? '서버에 저장했습니다.' : '이 브라우저에 저장했습니다.') + ' <a href="index.html?tour=' + m.id + '">열어 보기</a>';
        loadList();
      }, function (e) { $('saveMsg').textContent = '저장 실패: ' + e.message; })
      .then(syncSave);
  };

  $('zip').onclick = function () {
    var m = meta(), man = { tours: [{ id: m.id, title: m.title, type: m.type, count: frames.length, ext: 'jpg', angle: m.angle, loop: m.loop }] };
    var enc = new TextEncoder(), json = JSON.stringify(man, null, 1);
    Promise.all(frames.map(function (f) { return f.blob.arrayBuffer(); })).then(function (bufs) {
      var files = [{ name: 'tours.json', data: enc.encode(json) }, { name: 'tours.js', data: enc.encode('window.TOURS = ' + JSON.stringify(man) + ';') }];
      bufs.forEach(function (b, i) { files.push({ name: 'frames/' + m.id + '/' + root.RVTours.pad(i) + '.jpg', data: new Uint8Array(b) }); });
      var blob = new Blob([root.RVZip.zip(files)], { type: 'application/zip' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = m.id + '.zip'; a.click();
      $('saveMsg').textContent = 'ZIP을 만들었습니다. 압축을 푼 폴더를 index.html?src=폴더/ 로 열 수 있습니다.';
    });
  };

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function loadList() {
    root.RVTours.loadAll('./').then(function (ts) {
      var box = $('list'); box.innerHTML = '';
      if (!ts.length) { box.innerHTML = '<span class="muted">아직 없습니다.</span>'; return; }
      ts.forEach(function (t) {
        var d = document.createElement('div'); d.className = 'item';
        d.innerHTML = '<span>' + esc(t.title) + ' <span class="muted">· ' + (t.type === 'walk' ? '걷기' : '돌려보기') + ' ' + t.count + '장 · ' + ({ server: '서버', local: '이 브라우저', static: '폴더' })[t.source] + '</span></span>' +
          '<a class="btn" href="index.html?tour=' + encodeURIComponent(t.id) + '">열기</a>' + (t.remove ? '<button class="danger">삭제</button>' : '');
        var b = d.querySelector('button');
        if (b) b.onclick = function () { if (confirm('"' + t.title + '"을(를) 삭제할까요?')) t.remove().then(loadList); };
        box.appendChild(d);
      });
    });
  }
  loadList();
  syncType();
})(window);
