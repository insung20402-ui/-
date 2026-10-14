(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const shuffle = (a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pad = (n) => String(n).padStart(2, "0");
  const kst = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

  $("bankSize").textContent = QUESTION_BANK.length;
  Storage.ready.then(() => { $("backendLabel").textContent = Storage.label; });

  // ───── 화면 전환 ─────
  const views = ["start", "quiz", "result", "stats"];
  function show(v) {
    views.forEach((x) => { $("v-" + x).hidden = x !== v; });
    document.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", String((t.dataset.view === "stats") === (v === "stats"))));
    if (v !== "quiz") stopTimer();
    window.scrollTo(0, 0);
  }
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-view]");
    if (!t) return;
    show(t.dataset.view === "stats" ? "stats" : (state.finished ? "result" : "start"));
    if (t.dataset.view === "stats") renderStats();
  });

  // ───── 이미지 자리 표시자 (파란색 톤) ─────
  function placeholder(text) {
    const lines = String(text).match(/.{1,18}/g) || [""];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500">
      <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1166a8"/><stop offset="1" stop-color="#04203d"/></linearGradient></defs>
      <rect width="800" height="500" fill="url(#g)"/>
      <path d="M0 400 C150 370 300 430 450 400 S700 370 800 400 V500 H0Z" fill="#0a3d6b" opacity=".7"/>
      <path d="M210 400 L300 230 L340 280 L400 400Z M430 400 L480 300 L520 250 L560 320 L620 400Z" fill="#e8f4ff" opacity=".18"/>
      <text x="400" y="150" text-anchor="middle" font-size="64">📷</text>
      ${lines.map((l, i) => `<text x="400" y="${230 + i * 44}" text-anchor="middle" fill="#e8f4ff" font-family="Noto Sans KR, sans-serif" font-size="34" font-weight="700">${esc(l)}</text>`).join("")}
      <text x="400" y="${250 + lines.length * 44}" text-anchor="middle" fill="#b8cde0" font-family="Noto Sans KR, sans-serif" font-size="22">사진 준비 중</text></svg>`;
    return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  }

  // ───── 출제: 하 2 + 중 6 + 상 2 ─────
  function buildQuiz() {
    const picked = [];
    for (const level of ["하", "중", "상"]) {
      const pool = shuffle(QUESTION_BANK.filter((q) => q.level === level));
      if (pool.length < QUIZ_MIX[level]) console.warn(`${level} 난이도 문제가 부족합니다 (${pool.length}/${QUIZ_MIX[level]})`);
      picked.push(...pool.slice(0, QUIZ_MIX[level]));
    }
    // 보기 순서 섞기
    return picked.map((q) => {
      const order = shuffle(q.choices.map((_, i) => i));
      return { ...q, choices: order.map((i) => q.choices[i]), answer: order.indexOf(q.answer), points: SCORE_BY_LEVEL[q.level] };
    });
  }

  // ───── 퀴즈 진행 ─────
  const state = { finished: false };
  let timer = null;

  APP_CONFIG.GRADES.forEach((g) => $("playerGrade").add(new Option(g + "학년", g)));
  for (let c = 1; c <= APP_CONFIG.CLASSES_PER_GRADE; c++) $("playerClass").add(new Option(c + "반", c));
  try {
    const saved = JSON.parse(localStorage.getItem("dokdoQuizWebPlayer") || "null");
    if (saved) { $("playerGrade").value = saved.grade; $("playerClass").value = saved.klass; $("playerNum").value = saved.num; $("playerName").value = saved.name; }
  } catch {}

  $("startForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const player = {
      grade: Number($("playerGrade").value), klass: Number($("playerClass").value),
      num: parseInt($("playerNum").value, 10), name: $("playerName").value.trim()
    };
    const err = (msg, el) => { $("startErr").textContent = msg; el.focus(); };
    if (!(player.num >= 1 && player.num <= 50)) return err("번호를 입력해 주세요. (1~50)", $("playerNum"));
    if (!player.name) return err("이름을 입력해 주세요.", $("playerName"));
    $("startErr").textContent = "";
    try { localStorage.setItem("dokdoQuizWebPlayer", JSON.stringify(player)); } catch {}
    start(player);
  });
  $("rRetry").addEventListener("click", () => start(state.player));

  function start(player) {
    Object.assign(state, { player, name: player.name, list: buildQuiz(), idx: 0, score: 0, answers: [], startedAt: Date.now(), finished: false });
    show("quiz");
    renderQuestion();
  }

  function renderQuestion() {
    const q = state.list[state.idx], total = state.list.length;
    $("qCount").textContent = `${state.idx + 1} / ${total}`;
    $("qScore").textContent = state.score;
    $("qProgress").style.width = (state.idx / total) * 100 + "%";
    $("qLevel").textContent = `${q.level} · ${q.points}점`;
    $("qLevel").className = `chip lv-${q.level}`;
    $("qCat").textContent = q.category;
    const img = $("qImg");
    img.onerror = () => { img.onerror = null; img.src = placeholder(q.imageAlt); };
    img.src = q.imageUrl || placeholder(q.imageAlt);
    img.alt = q.imageAlt;
    $("qCredit").textContent = q.imageUrl && q.imageCredit ? `사진: ${q.imageCredit}` : "";
    $("qText").textContent = q.question;
    $("qFeedback").hidden = true;
    $("qNext").hidden = true;
    const box = $("qChoices");
    box.innerHTML = "";
    q.choices.forEach((c, i) => {
      const b = document.createElement("button");
      b.className = "choice";
      b.textContent = `${i + 1}. ${c}`;
      b.addEventListener("click", () => choose(i));
      box.appendChild(b);
    });
    startTimer();
  }

  function startTimer() {
    stopTimer();
    const limit = APP_CONFIG.SECONDS_PER_QUESTION * 1000, t0 = Date.now();
    timer = setInterval(() => {
      const left = Math.max(0, limit - (Date.now() - t0));
      $("qTimer").style.width = (left / limit) * 100 + "%";
      if (!left) choose(-1);
    }, 100);
  }
  function stopTimer() { clearInterval(timer); timer = null; }

  function choose(i) {
    if (!timer) return;
    stopTimer();
    const q = state.list[state.idx];
    const correct = i === q.answer;
    $("qChoices").querySelectorAll(".choice").forEach((b, k) => {
      b.disabled = true;
      if (k === q.answer) b.classList.add("is-correct");
      else if (k === i) b.classList.add("is-wrong");
    });
    if (correct) state.score += q.points;
    state.answers.push({ id: q.id, correct });
    const fb = $("qFeedback");
    fb.className = "feedback mt-4 " + (correct ? "ok" : "no");
    fb.innerHTML = `<b>${correct ? `⭕ 정답! +${q.points}점` : i === -1 ? "⏰ 시간 초과!" : "❌ 아쉬워요!"}</b><br>${esc(q.explanation)}`;
    fb.hidden = false;
    $("qScore").textContent = state.score;
    $("qNext").textContent = state.idx === state.list.length - 1 ? "결과 보기 🏁" : "다음 문제 ➜";
    $("qNext").hidden = false;
  }
  $("qNext").addEventListener("click", () => {
    state.idx++;
    if (state.idx < state.list.length) renderQuestion(); else finish();
  });

  const titleFor = (s) => s === 100 ? "👑 독도 수호 대장군" : s >= 80 ? "🛡️ 독도 경비대장" : s >= 60 ? "⚓ 독도 의용수비대원" : s >= 40 ? "🐦 독도 괭이갈매기" : "🌱 독도 새내기";

  async function finish() {
    state.finished = true;
    const now = new Date();
    const correctCount = state.answers.filter((a) => a.correct).length;
    const p = state.player;
    const record = {
      grade: p.grade,
      klass: p.klass,
      num: p.num,
      name: p.name,
      score: state.score,
      finishedAt: now.toISOString(),
      finishedAtText: kst(now),
      durationSec: Math.round((Date.now() - state.startedAt) / 1000),
      correctCount,
      answers: state.answers
    };
    $("rWho").textContent = `${p.grade}학년 ${p.klass}반 ${p.num}번 ${p.name} · ${record.finishedAtText} 완료`;
    $("rScore").textContent = state.score + "점";
    $("rTitle").textContent = titleFor(state.score);
    $("rDetail").textContent = `10문제 중 ${correctCount}문제 정답 · ${Math.floor(record.durationSec / 60)}분 ${record.durationSec % 60}초`;
    const wrongs = state.list.filter((q, k) => !state.answers[k].correct);
    $("rReview").innerHTML = wrongs.length
      ? wrongs.map((q) => `<div class="glass p-3"><b>${esc(q.question)}</b><br><span class="text-emerald-300">정답: ${esc(q.choices[q.answer])}</span><br><span class="muted">${esc(q.explanation)}</span></div>`).join("")
      : "<p>🎉 모두 맞혔어요! 완벽한 독도 지킴이!</p>";
    show("result");
    $("rSave").textContent = "기록 저장 중…";
    const ok = await Storage.save(record);
    $("rSave").textContent = ok ? `✅ 기록이 저장되었어요 (${Storage.label})` : "⚠️ 서버 저장에 실패해 이 기기에만 저장했어요.";
    renderStats();
  }

  // ───── 통계 (실시간 구독) ─────
  let rows = [], loadErr = "";
  Storage.subscribe((r, err) => {
    if (r) { rows = r; loadErr = ""; } else loadErr = err || "";
    renderStats();
  });

  function renderStats() {
    $("sSource").textContent = loadErr || `저장소: ${Storage.label}`;
    const list = Stats.perQuestion(rows);
    const ok3 = Stats.topCorrect(list), bad3 = Stats.topWrong(list);
    // 결과 화면 미니 대시보드
    if (!$("v-result").hidden) { Stats.barChart("rChartOk", ok3, "ok"); Stats.barChart("rChartBad", bad3, "bad"); }
    if ($("v-stats").hidden) return;

    $("sEmpty").hidden = rows.length > 0;
    $("sBody").hidden = rows.length === 0;
    $("kCount").textContent = rows.length.toLocaleString();
    $("kPeople").textContent = new Set(rows.map((r) => r.grade ? `${r.grade}-${r.klass}-${r.num}` : r.name)).size.toLocaleString();
    $("kAvg").textContent = rows.length ? Math.round(rows.reduce((s, r) => s + (+r.score || 0), 0) / rows.length) + "점" : "-";
    $("kPerfect").textContent = rows.filter((r) => +r.score === 100).length + "회";
    if (!rows.length) return;
    Stats.barChart("sChartOk", ok3, "ok");
    Stats.barChart("sChartBad", bad3, "bad");
    Stats.rateChart("sChartRate", list);
    const recent = rows.slice().sort((a, b) => String(b.finishedAt).localeCompare(String(a.finishedAt))).slice(0, 50);
    $("sRows").innerHTML = recent.map((r) => `<tr><td>${esc(r.finishedAtText || r.finishedAt)}</td><td>${r.grade ? `${esc(r.grade)}-${esc(r.klass)}-${esc(r.num)}` : ""}</td><td>${esc(r.name)}</td>
      <td class="num">${esc(r.score)}</td><td class="num">${esc(r.correctCount ?? "")}/10</td>
      <td class="num">${r.durationSec ? Math.floor(r.durationSec / 60) + "분 " + (r.durationSec % 60) + "초" : ""}</td></tr>`).join("");
  }
})();
