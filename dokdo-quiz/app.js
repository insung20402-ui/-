(() => {
  const $ = (s) => document.querySelector(s);
  const LS_RESULTS = "dokdoQuizResults";
  const LS_PLAYER = "dokdoQuizPlayer";
  const LS_SEEN = "dokdoQuizSeen";
  const LS_KEY = "dokdoQuizAdminKey";
  const LEVEL_NAME = { 1: "쉬움", 2: "보통", 3: "어려움" };
  const PHOTO_POINT = 10;
  const QMAP = new Map([...QUESTIONS, ...PHOTO_QUESTIONS].map((q) => [q.id, q]));

  $("#poolSize").textContent = QUESTIONS.length;
  $("#secRule").textContent = CONFIG.SECONDS_PER_QUESTION;

  // ---------- 공통 ----------
  function lsGet(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  }
  function lsSet(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch {} }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }
  function maskName(n) {
    n = String(n || "");
    if (n.length <= 1) return n;
    if (n.length === 2) return n[0] + "*";
    return n[0] + "*".repeat(n.length - 2) + n[n.length - 1];
  }
  function fmtTime(t) {
    const d = new Date(t);
    if (isNaN(d)) return String(t || "");
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  // claude.ai 아티팩트로 열면 공유 DB 사용
  const dbReady = (window.claude && window.claude.use) ? window.claude.use("db").catch(() => null) : Promise.resolve(null);

  // ---------- 화면 전환 ----------
  const state = { playing: false };
  let timerId = null;

  function go(id) {
    document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("on", s.id === id));
    document.querySelectorAll("nav button").forEach((b) => b.classList.toggle("on", b.dataset.go === id));
    if (id !== "quiz") { stopTimer(); state.playing = false; }
    if (id === "rank") loadRanking();
    if (id === "stats") loadStats();
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-go]");
    if (t) go(t.dataset.go);
  });

  // ---------- 참가자 ----------
  CONFIG.GRADES.forEach((g) => $("#grade").add(new Option(g + "학년", g)));
  for (let c = 1; c <= CONFIG.CLASSES_PER_GRADE; c++) $("#klass").add(new Option(c + "반", c));
  const saved = lsGet(LS_PLAYER, null);
  if (saved) { $("#grade").value = saved.grade; $("#klass").value = saved.klass; $("#num").value = saved.num; $("#name").value = saved.name || ""; }

  function readPlayer() {
    const p = {
      grade: $("#grade").value, klass: $("#klass").value,
      num: String(parseInt($("#num").value, 10) || ""), name: $("#name").value.trim()
    };
    $("#err").textContent = "";
    if (!p.num || +p.num < 1) { $("#err").textContent = "번호를 입력해 주세요."; $("#num").focus(); return null; }
    if (!p.name) { $("#err").textContent = "이름을 입력해 주세요."; $("#name").focus(); return null; }
    lsSet(LS_PLAYER, p);
    return p;
  }

  // ---------- 출제 ----------
  // 난이도별 개수(MIX)를 맞추고, 같은 사실(f)에서 나온 문제는 한 판에 하나만,
  // 연표 문제는 최대 2개, 최근에 본 문제는 되도록 제외
  function pickQuiz() {
    const seen = new Set(lsGet(LS_SEEN, []));
    const usedFacts = new Set();
    let timeline = 0;
    const picked = [];
    for (const lv of [1, 2, 3]) {
      const need = CONFIG.MIX[lv];
      const pool = shuffle(QUESTIONS.filter((q) => q.l === lv));
      const fresh = pool.filter((q) => !seen.has(q.id));
      const order = fresh.length >= need * 3 ? fresh.concat(pool) : pool;
      let got = 0;
      for (const q of order) {
        if (got >= need) break;
        if (usedFacts.has(q.f) || picked.includes(q)) continue;
        if (q.c === "연표" && timeline >= 2) continue;
        usedFacts.add(q.f);
        if (q.c === "연표") timeline++;
        picked.push(q); got++;
      }
    }
    // 최근 본 문제 기록 (문제 은행의 절반까지 기억)
    const keep = Math.floor(QUESTIONS.length / 2);
    lsSet(LS_SEEN, [...seen, ...picked.map((q) => q.id)].slice(-keep));
    return picked.map((q) => withShuffledChoices(q, CONFIG.POINTS[q.l]));
  }

  function withShuffledChoices(q, pts) {
    if (q.t === "ox") return { ...q, pts };
    const order = shuffle(q.o.map((_, i) => i));
    return { ...q, pts, o: order.map((i) => q.o[i]), a: order.indexOf(q.a) };
  }

  // 사진 퀴즈: 실제로 사진이 열리는 문제만 출제
  let photoReady = null;
  function checkPhotos() {
    if (!photoReady) {
      photoReady = Promise.all(PHOTO_QUESTIONS.map((q) => new Promise((res) => {
        const img = new Image();
        img.onload = () => res(q);
        img.onerror = () => res(null);
        img.src = q.img;
      }))).then((list) => list.filter(Boolean));
    }
    return photoReady;
  }

  $("#startBtn").addEventListener("click", () => {
    const p = readPlayer();
    if (p) startGame(p, "normal", pickQuiz());
  });
  $("#photoBtn").addEventListener("click", async () => {
    const p = readPlayer();
    if (!p) return;
    $("#photoBtn").disabled = true;
    const ok = await checkPhotos();
    $("#photoBtn").disabled = false;
    if (!ok.length) {
      $("#err").textContent = "아직 사진이 준비되지 않았어요. 선생님이 사진을 올리면 열려요!";
      return;
    }
    const list = shuffle(ok).slice(0, CONFIG.PHOTO_COUNT).map((q) => withShuffledChoices(q, PHOTO_POINT));
    startGame(p, "photo", list);
  });
  $("#retryBtn").addEventListener("click", async () => {
    if (state.mode === "photo") {
      const ok = await checkPhotos();
      startGame(state.player, "photo", shuffle(ok).slice(0, CONFIG.PHOTO_COUNT).map((q) => withShuffledChoices(q, PHOTO_POINT)));
    } else startGame(state.player, "normal", pickQuiz());
  });

  // ---------- 게임 진행 ----------
  function startGame(player, mode, list) {
    Object.assign(state, {
      player, mode, list, idx: 0, score: 0, correct: 0, combo: 0, maxCombo: 0,
      answers: [], wrongs: [], playing: true, startedAt: Date.now(),
      max: list.reduce((s, q) => s + q.pts, 0)
    });
    go("quiz");
    state.playing = true;
    showQuestion();
  }

  function showQuestion() {
    const q = state.list[state.idx];
    const total = state.list.length;
    $("#qnum").textContent = `${state.idx + 1} / ${total}`;
    $("#progress").style.width = (state.idx / total) * 100 + "%";
    $("#qscore").textContent = state.score;
    $("#combo").textContent = state.combo >= 2 ? `🔥 ${state.combo}연속` : "";
    $("#level").textContent = q.l ? `${LEVEL_NAME[q.l]} · ${q.pts}점` : `${q.pts}점`;
    $("#level").className = "badge" + (q.l === 3 ? " l3" : "");
    $("#cat").textContent = q.c || "";
    $("#question").textContent = (q.t === "ox" ? "[O/X] " : "") + q.q;
    $("#feedback").hidden = true;
    $("#nextBtn").hidden = true;

    if (q.img) {
      $("#photo").hidden = false;
      $("#photoImg").src = q.img;
      $("#photoCredit").textContent = q.credit ? "사진: " + q.credit : "";
    } else $("#photo").hidden = true;

    const box = $("#choices");
    box.innerHTML = "";
    box.className = "choices" + (q.t === "ox" ? " ox" : "");
    const opts = q.t === "ox" ? ["O", "X"] : q.o;
    opts.forEach((text, i) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.textContent = q.t === "ox" ? text : `${i + 1}. ${text}`;
      b.addEventListener("click", () => answer(i));
      box.appendChild(b);
    });
    startTimer();
  }

  function startTimer() {
    stopTimer();
    const limit = CONFIG.SECONDS_PER_QUESTION * 1000;
    state.qStart = Date.now();
    timerId = setInterval(() => {
      const left = Math.max(0, limit - (Date.now() - state.qStart));
      $("#timer").style.width = (left / limit) * 100 + "%";
      if (left <= 0) answer(-1);
    }, 100);
  }
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }

  function answer(choice) {
    if (!timerId) return;
    stopTimer();
    const q = state.list[state.idx];
    const correctIdx = q.t === "ox" ? (q.a ? 0 : 1) : q.a;
    const ok = choice === correctIdx;
    $("#choices").querySelectorAll(".choice").forEach((b, i) => {
      b.disabled = true;
      if (i === correctIdx) b.classList.add("correct");
      else if (i === choice) b.classList.add("wrong");
    });
    state.answers.push({ id: q.id, ok });
    let msg;
    if (ok) {
      state.correct++; state.combo++; state.maxCombo = Math.max(state.maxCombo, state.combo);
      state.score += q.pts;
      msg = `<b>⭕ 정답! +${q.pts}점</b>`;
      popup(state.combo >= 3 ? `🔥 ${state.combo}연속 정답!` : "정답! 👍");
    } else {
      state.combo = 0;
      state.wrongs.push(q);
      msg = choice === -1 ? "<b>⏰ 시간 초과!</b>" : "<b>❌ 아쉬워요!</b>";
    }
    const fb = $("#feedback");
    fb.innerHTML = `${msg}<br>${esc(q.e)}`;
    fb.className = "feedback " + (ok ? "ok" : "no");
    fb.hidden = false;
    $("#qscore").textContent = state.score;
    $("#combo").textContent = state.combo >= 2 ? `🔥 ${state.combo}연속` : "";
    $("#nextBtn").textContent = state.idx === state.list.length - 1 ? "결과 보기 🏁" : "다음 문제 ➜";
    $("#nextBtn").hidden = false;
  }

  $("#nextBtn").addEventListener("click", () => {
    state.idx++;
    if (state.idx < state.list.length) showQuestion();
    else finish();
  });

  function popup(text) {
    const p = $("#pop");
    p.textContent = text;
    p.classList.remove("go"); void p.offsetWidth; p.classList.add("go");
  }

  function titleFor(score, max) {
    const r = score / max;
    if (r === 1) return "👑 독도 수호 대장군";
    if (r >= 0.8) return "🛡️ 독도 경비대장";
    if (r >= 0.6) return "⚓ 독도 의용수비대원";
    if (r >= 0.4) return "🐦 독도 괭이갈매기";
    return "🌱 독도 새내기 (독도 알기를 읽고 재도전!)";
  }

  function makeCode(p, score) {
    const base = `${p.grade}${String(p.klass).padStart(2, "0")}${String(p.num).padStart(2, "0")}`;
    let h = 0;
    for (const ch of base + score + "dokdo") h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `DD-${base}-${h.toString(36).toUpperCase().slice(-4)}`;
  }

  function finish() {
    state.playing = false;
    const p = state.player, total = state.list.length;
    $("#progress").style.width = "100%";
    $("#who").textContent = `${p.grade}학년 ${p.klass}반 ${p.num}번 ${p.name}${state.mode === "photo" ? " · 사진 퀴즈" : ""}`;
    $("#finalScore").textContent = `${state.score}점`;
    $("#finalTitle").textContent = titleFor(state.score, state.max);
    $("#finalDetail").textContent = `${total}문제 중 ${state.correct}문제 정답 (만점 ${state.max}점) · 최대 ${state.maxCombo}연속 정답`;
    $("#code").textContent = makeCode(p, state.score);
    $("#review").innerHTML = state.wrongs.length
      ? state.wrongs.map((q) => `<div><b>Q. ${esc(q.q)}</b><br>💡 ${esc(q.e)}</div>`).join("")
      : "<div>🎉 모두 맞혔어요! 완벽한 독도 지킴이!</div>";

    saveRecord({
      time: new Date().toISOString(), grade: +p.grade, klass: +p.klass, num: +p.num, name: p.name,
      mode: state.mode, score: state.score, max: state.max, correct: state.correct, total,
      seconds: Math.round((Date.now() - state.startedAt) / 1000),
      answers: state.answers.map((a) => `${a.id}:${a.ok ? 1 : 0}`).join(",")
    });
    go("result");
  }

  // ---------- 저장 ----------
  async function saveRecord(rec) {
    const all = lsGet(LS_RESULTS, []);
    all.push(rec);
    lsSet(LS_RESULTS, all.slice(-500));
    const msg = $("#saveMsg");
    const db = await dbReady;
    if (db) {
      msg.textContent = "기록 저장 중…";
      try { await db.collection("results").add(rec); msg.textContent = "✅ 기록이 저장되었어요!"; }
      catch { msg.textContent = "⚠️ 공유 기록 저장에 실패해 이 기기에만 저장했어요."; }
      return;
    }
    if (!CONFIG.SCRIPT_URL) { msg.textContent = "※ 이 기기에만 저장되었어요."; return; }
    msg.textContent = "기록 저장 중…";
    // 구글 시트에는 문항 내용도 함께 보내 '문항별 기록' 시트에 사람이 읽을 수 있게 남김
    const detail = state.answers.map((a) => {
      const q = QMAP.get(a.id) || {};
      return { id: a.id, q: q.q || "", level: q.l || "", cat: q.c || "", ok: a.ok };
    });
    fetch(CONFIG.SCRIPT_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...rec, detail })
    }).then(() => { msg.textContent = "✅ 기록이 저장되었어요!"; })
      .catch(() => { msg.textContent = "⚠️ 인터넷 연결 문제로 이 기기에만 저장했어요."; });
  }

  // ---------- 데이터 불러오기 ----------
  // 반환: { rows, source, needKey }
  async function fetchRows(withKey) {
    const db = await dbReady;
    if (db) {
      try {
        const snap = await db.collection("results").get();
        return { rows: snap.docs.map((d) => d.data()), source: "전체 참여 기록" };
      } catch { return { rows: lsGet(LS_RESULTS, []), source: "⚠️ 공유 기록을 불러오지 못해 이 기기의 기록만 표시합니다." }; }
    }
    if (CONFIG.SCRIPT_URL) {
      try {
        const url = CONFIG.SCRIPT_URL + (withKey ? `?action=all&key=${encodeURIComponent(lsGet(LS_KEY, ""))}` : "?action=rank");
        const res = await fetch(url);
        const data = await res.json();
        if (data && data.error === "key") return { rows: [], needKey: true };
        return { rows: Array.isArray(data) ? data : [], source: "전교 참여 기록 (구글 시트)" };
      } catch {
        return { rows: lsGet(LS_RESULTS, []), source: "⚠️ 구글 시트에 연결하지 못해 이 기기의 기록만 표시합니다." };
      }
    }
    return { rows: lsGet(LS_RESULTS, []), source: "이 기기에서 참여한 기록만 표시됩니다. (구글 시트를 연결하면 전교 기록이 모여요)" };
  }

  // ---------- 랭킹 ----------
  let rankTab = "class", rankRows = [];
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => {
    rankTab = b.dataset.tab;
    document.querySelectorAll("[data-tab]").forEach((x) => x.classList.toggle("on", x === b));
    renderRanking();
  }));

  async function loadRanking() {
    $("#rankBody").innerHTML = '<p class="muted">불러오는 중…</p>';
    const { rows, source } = await fetchRows(false);
    rankRows = rows.filter((r) => (r.mode || "normal") === "normal");
    $("#rankSrc").textContent = (source || "") + " · 일반 퀴즈 점수 기준";
    renderRanking();
  }

  function bestPerStudent(rows) {
    const m = new Map();
    rows.forEach((r) => {
      const k = `${r.grade}-${r.klass}-${r.num}`;
      if (!m.has(k) || +r.score > +m.get(k).score) m.set(k, r);
    });
    return [...m.values()];
  }

  function renderRanking() {
    const best = bestPerStudent(rankRows);
    if (!best.length) { $("#rankBody").innerHTML = '<p class="muted">아직 기록이 없어요. 첫 번째 독도 지킴이가 되어 보세요!</p>'; return; }
    const me = lsGet(LS_PLAYER, {});
    const medal = (i) => ["🥇", "🥈", "🥉"][i] || i + 1;
    if (rankTab === "person") {
      const rows = best.sort((a, b) => b.score - a.score).slice(0, 20);
      $("#rankBody").innerHTML = `<table><tr><th>순위</th><th>학반</th><th>이름</th><th class="num">점수</th></tr>${
        rows.map((r, i) => `<tr class="${r.grade == me.grade && r.klass == me.klass && r.num == me.num ? "me" : ""}">
          <td>${medal(i)}</td><td>${r.grade}-${r.klass}</td><td>${esc(maskName(r.name))}</td><td class="num">${r.score}</td></tr>`).join("")
      }</table>`;
    } else {
      const cls = new Map();
      best.forEach((r) => {
        const k = `${r.grade}-${r.klass}`;
        const c = cls.get(k) || { k, grade: r.grade, klass: r.klass, n: 0, sum: 0 };
        c.n++; c.sum += +r.score; cls.set(k, c);
      });
      const rows = [...cls.values()].sort((a, b) => b.sum - a.sum);
      $("#rankBody").innerHTML = `<table><tr><th>순위</th><th>반</th><th class="num">참여</th><th class="num">평균</th><th class="num">반 점수</th></tr>${
        rows.map((c, i) => `<tr class="${c.k === `${me.grade}-${me.klass}` ? "me" : ""}">
          <td>${medal(i)}</td><td>${c.grade}학년 ${c.klass}반</td><td class="num">${c.n}명</td><td class="num">${Math.round(c.sum / c.n)}</td><td class="num"><b>${c.sum.toLocaleString()}</b></td></tr>`).join("")
      }</table><p class="muted">반 점수 = 참여한 학생 각자의 최고 점수 합계. 많이 참여할수록 우리 반이 올라가요!</p>`;
    }
  }

  // ---------- 통계 (선생님용) ----------
  $("#keyBtn").addEventListener("click", () => { lsSet(LS_KEY, $("#adminKey").value.trim()); loadStats(); });
  $("#adminKey").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#keyBtn").click(); });

  async function loadStats() {
    $("#statsBody").innerHTML = '<p class="muted">불러오는 중…</p>';
    const db = await dbReady;
    const needsKey = !db && CONFIG.SCRIPT_URL;
    if (needsKey && !lsGet(LS_KEY, "")) {
      $("#keyCard").hidden = false; $("#statsBody").innerHTML = ""; return;
    }
    const { rows, source, needKey } = await fetchRows(true);
    if (needKey) {
      $("#keyCard").hidden = false; $("#keyErr").textContent = "비밀번호가 맞지 않아요."; $("#statsBody").innerHTML = ""; return;
    }
    $("#keyCard").hidden = true; $("#keyErr").textContent = "";
    renderStats(rows, source);
  }

  function renderStats(rows, source) {
    if (!rows.length) {
      $("#statsBody").innerHTML = `<div class="card"><h3 style="margin-top:0">📊 참여 통계</h3>
        <p>아직 참여 기록이 없어요. 학생들이 퀴즈를 풀면 여기에 참여 시각·점수·문항별 정답률 그래프가 나타납니다.</p>
        <p class="src">${esc(source || "")}</p></div>`;
      return;
    }
    rows = rows.slice().sort((a, b) => new Date(b.time) - new Date(a.time));
    const normal = rows.filter((r) => (r.mode || "normal") === "normal");
    const students = new Set(rows.map((r) => `${r.grade}-${r.klass}-${r.num}`)).size;
    const avg = normal.length ? Math.round(normal.reduce((s, r) => s + +r.score, 0) / normal.length) : 0;
    const perfect = normal.filter((r) => +r.score === 100).length;

    // 문항별 집계
    const qs = new Map();
    rows.forEach((r) => String(r.answers || "").split(",").filter(Boolean).forEach((pair) => {
      const [id, ok] = pair.split(":");
      const s = qs.get(id) || { id, n: 0, ok: 0 };
      s.n++; if (ok === "1") s.ok++;
      qs.set(id, s);
    }));
    const qlist = [...qs.values()].map((s) => ({ ...s, wrong: s.n - s.ok, rate: s.ok / s.n, q: QMAP.get(s.id) }));
    const mostWrong = qlist.filter((s) => s.wrong > 0).sort((a, b) => b.wrong - a.wrong || a.rate - b.rate).slice(0, 10);
    const mostRight = qlist.filter((s) => s.ok > 0).sort((a, b) => b.ok - a.ok || b.rate - a.rate).slice(0, 10);

    // 분야별 정답률
    const cats = new Map();
    qlist.forEach((s) => {
      const c = (s.q && s.q.c) || "기타";
      const v = cats.get(c) || { n: 0, ok: 0 };
      v.n += s.n; v.ok += s.ok; cats.set(c, v);
    });
    // 점수 분포 (일반 퀴즈, 10점 단위)
    const bins = Array.from({ length: 11 }, (_, i) => ({ label: i === 10 ? "100" : `${i * 10}`, v: 0 }));
    normal.forEach((r) => { bins[Math.min(10, Math.floor(+r.score / 10))].v++; });
    // 시간대별 참여
    const hours = new Map();
    rows.forEach((r) => { const h = new Date(r.time).getHours(); if (!isNaN(h)) hours.set(h, (hours.get(h) || 0) + 1); });
    const hourKeys = [...hours.keys()].sort((a, b) => a - b);
    const hourBins = hourKeys.length ? Array.from({ length: hourKeys[hourKeys.length - 1] - hourKeys[0] + 1 }, (_, i) => {
      const h = hourKeys[0] + i; return { label: `${h}시`, v: hours.get(h) || 0 };
    }) : [];
    // 반별 평균
    const cls = new Map();
    bestPerStudent(normal).forEach((r) => {
      const k = `${r.grade}-${r.klass}`;
      const c = cls.get(k) || { label: `${r.grade}학년 ${r.klass}반`, n: 0, sum: 0 };
      c.n++; c.sum += +r.score; cls.set(k, c);
    });

    const qLabel = (s) => s.q ? `<b>${esc(s.id)}</b>${esc(s.q.q)}` : `<b>${esc(s.id)}</b>(삭제된 문항)`;
    $("#statsBody").innerHTML = `
      <div class="kpis">
        <div class="kpi"><span>참여 횟수</span><strong>${rows.length.toLocaleString()}</strong></div>
        <div class="kpi"><span>참여 학생</span><strong>${students.toLocaleString()}명</strong></div>
        <div class="kpi"><span>평균 점수 (일반)</span><strong>${avg}점</strong></div>
        <div class="kpi"><span>만점 (100점)</span><strong>${perfect}회</strong></div>
      </div>
      <div class="card chart"><h3>❌ 가장 많이 틀린 문제 TOP 10</h3><p class="muted sub">막대 = 틀린 횟수 · 오른쪽 = 정답률. 행사 판넬이나 수업 복습 자료로 활용하세요.</p>
        <div class="hbars" id="chWrong"></div></div>
      <div class="card chart"><h3>⭕ 가장 많이 맞힌 문제 TOP 10</h3><p class="muted sub">막대 = 맞힌 횟수 · 오른쪽 = 정답률</p>
        <div class="hbars" id="chRight"></div></div>
      <div class="grid2">
        <div class="card chart"><h3>점수 분포</h3><p class="muted sub">일반 퀴즈 점수, 10점 단위 (참여 횟수)</p><div id="chScore"></div></div>
        <div class="card chart"><h3>시간대별 참여</h3><p class="muted sub">퀴즈를 마친 시각 기준 (참여 횟수)</p><div id="chHour"></div></div>
        <div class="card chart"><h3>분야별 정답률</h3><p class="muted sub">모든 응답 기준</p><div class="hbars" id="chCat"></div></div>
        <div class="card chart"><h3>반별 평균 점수</h3><p class="muted sub">학생별 최고 점수의 평균</p><div class="hbars" id="chClass"></div></div>
      </div>
      <div class="card" style="margin-top:16px"><h3 style="margin-top:0">🕗 참여 기록 (최근 100건)</h3>
        <div class="tablebox"><table><tr><th>시각</th><th>학반·번호</th><th>이름</th><th>종류</th><th class="num">점수</th><th class="num">정답</th></tr>
        ${rows.slice(0, 100).map((r) => `<tr><td>${esc(fmtTime(r.time))}</td><td>${r.grade}-${r.klass}-${r.num}</td><td>${esc(r.name)}</td>
          <td>${r.mode === "photo" ? "사진" : "일반"}</td><td class="num">${r.score}${r.max && r.max !== 100 ? "/" + r.max : ""}</td><td class="num">${r.correct}/${r.total}</td></tr>`).join("")}
        </table></div>
        <p class="src">${esc(source || "")} · 전체 기록은 구글 시트 'results' / '문항별 기록' 시트에서 볼 수 있어요.</p></div>
      <div class="card"><h3 style="margin-top:0">📋 문항별 정답률 표 (응답 많은 순 50개)</h3>
        <div class="tablebox"><table><tr><th>문항</th><th class="num">응답</th><th class="num">정답</th><th class="num">오답</th><th class="num">정답률</th></tr>
        ${qlist.sort((a, b) => b.n - a.n).slice(0, 50).map((s) => `<tr><td class="q">${qLabel(s)}</td><td class="num">${s.n}</td><td class="num">${s.ok}</td><td class="num">${s.wrong}</td><td class="num">${Math.round(s.rate * 100)}%</td></tr>`).join("")}
        </table></div></div>`;

    hbars($("#chWrong"), mostWrong.map((s) => ({ label: qLabel(s), v: s.wrong, text: `${s.wrong}회 · 정답률 ${Math.round(s.rate * 100)}%`,
      tip: `${s.q ? s.q.q : s.id}\n응답 ${s.n} · 정답 ${s.ok} · 오답 ${s.wrong}` })), "var(--series-2)");
    hbars($("#chRight"), mostRight.map((s) => ({ label: qLabel(s), v: s.ok, text: `${s.ok}회 · 정답률 ${Math.round(s.rate * 100)}%`,
      tip: `${s.q ? s.q.q : s.id}\n응답 ${s.n} · 정답 ${s.ok} · 오답 ${s.wrong}` })), "var(--series-1)");
    vbars($("#chScore"), bins.map((b) => ({ ...b, tip: `${b.label === "100" ? "100점" : b.label + "~" + (+b.label + 9) + "점"}: ${b.v}회` })));
    vbars($("#chHour"), hourBins.map((b) => ({ ...b, tip: `${b.label}: ${b.v}회` })));
    hbars($("#chCat"), [...cats.entries()].map(([c, v]) => ({ label: esc(c), v: v.ok / v.n, max: 1,
      text: `${Math.round((v.ok / v.n) * 100)}%`, tip: `${c}: 응답 ${v.n} · 정답 ${v.ok}` })).sort((a, b) => b.v - a.v), "var(--series-1)");
    hbars($("#chClass"), [...cls.values()].map((c) => ({ label: esc(c.label), v: c.sum / c.n, max: 100,
      text: `${Math.round(c.sum / c.n)}점 (${c.n}명)`, tip: `${c.label}: 평균 ${Math.round(c.sum / c.n)}점, 참여 ${c.n}명` })).sort((a, b) => b.v - a.v), "var(--series-1)");
  }

  // 가로 막대 (값이 0인 막대는 생략하지 않음)
  function hbars(el, rows, color) {
    if (!rows.length) { el.innerHTML = '<p class="muted">아직 데이터가 없어요.</p>'; return; }
    const max = rows[0].max || Math.max(...rows.map((r) => r.v)) || 1;
    el.innerHTML = rows.map((r) => `<div class="hrow" data-tip="${esc(r.tip)}"><div class="lbl">${r.label}</div>
      <div class="htrack"><div class="hfill" style="width:${Math.max(1, (r.v / max) * 78)}%;background:${color}"></div><span class="hval">${esc(r.text)}</span></div></div>`).join("");
  }
  // 세로 막대
  function vbars(el, rows) {
    if (!rows.length) { el.innerHTML = '<p class="muted">아직 데이터가 없어요.</p>'; return; }
    const max = Math.max(...rows.map((r) => r.v)) || 1;
    el.innerHTML = `<div class="vbars">${rows.map((r) => `<div class="vcol" data-tip="${esc(r.tip)}">
        <span class="vval">${r.v || ""}</span><div class="vfill" style="height:${(r.v / max) * 85}%"></div></div>`).join("")}</div>
      <div class="vlabels">${rows.map((r) => `<span>${esc(r.label)}</span>`).join("")}</div>`;
  }
  // 마우스를 올리면 자세한 수치 표시
  const tip = $("#tip");
  document.addEventListener("mousemove", (e) => {
    const t = e.target.closest("[data-tip]");
    if (!t) { tip.classList.remove("on"); return; }
    tip.textContent = t.dataset.tip;
    tip.style.whiteSpace = "pre-line";
    const x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
    tip.style.left = x + "px"; tip.style.top = (e.clientY + 14) + "px";
    tip.classList.add("on");
  });
})();
