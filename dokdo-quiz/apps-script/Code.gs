/**
 * 독도 수호 퀴즈 — 참여 결과 데이터베이스 (Google Apps Script)
 *
 * ▶ 설치 방법 (한 번만)
 * 1. 구글 드라이브 → 새로 만들기 → 구글 스프레드시트 (예: "독도 퀴즈 결과")
 * 2. 메뉴 [확장 프로그램] → [Apps Script] → 기본 코드를 지우고 이 파일 내용을 붙여넣기 → 저장
 * 3. 아래 ADMIN_KEY 를 선생님만 아는 비밀번호로 바꾸기 (통계 화면 잠금용)
 * 4. [배포] → [새 배포] → 톱니바퀴에서 '웹 앱' 선택
 *      - 실행 사용자: 나
 *      - 액세스 권한이 있는 사용자: 모든 사용자
 *    → [배포] → 권한 승인 → '웹 앱 URL' 복사
 * 5. dokdo-quiz/config.js 의 SCRIPT_URL 에 붙여넣기
 *
 * ▶ 만들어지는 시트
 *   - results     : 한 판마다 한 줄 (시각, 학년, 반, 번호, 이름, 종류, 점수 …)
 *   - 문항별 기록 : 문제 하나마다 한 줄 (누가 어떤 문제를 맞혔/틀렸는지)
 *   - 문항 통계   : 메뉴 [독도 퀴즈] → [통계·그래프 새로고침] 으로 생성 (많이 틀린/맞힌 문제 그래프 포함)
 *
 * ※ 코드를 고친 뒤에는 [배포] → [배포 관리] → 연필 → 버전 '새 버전' → [배포] 해야 반영됩니다.
 */

const ADMIN_KEY = "dokdo1025";   // ← 꼭 바꾸세요! 웹앱 '통계' 화면 비밀번호
const TZ = "Asia/Seoul";
const RESULT_HEADERS = ["시각", "학년", "반", "번호", "이름", "종류", "점수", "만점", "정답 수", "문항 수", "걸린 시간(초)", "응답(문항:정답여부)"];
const ANSWER_HEADERS = ["시각", "학년", "반", "번호", "이름", "문항 번호", "문제", "분야", "난이도", "결과"];

function sheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) {
    ss.setSpreadsheetTimeZone(TZ);
    sh = ss.insertSheet(name);
    sh.appendRow(headers);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, headers.length).setFontWeight("bold").setBackground("#e8f3fc");
  }
  return sh;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// ── 퀴즈 결과 저장 ──
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = JSON.parse(e.postData.contents);
    const grade = Number(r.grade), klass = Number(r.klass), num = Number(r.num);
    const score = Number(r.score), max = Number(r.max) || 100;
    if (!grade || !klass || !num || !(score >= 0 && score <= max && max <= 300)) return json_({ ok: false, error: "invalid" });
    const name = String(r.name || "").slice(0, 10);
    const mode = r.mode === "photo" ? "사진" : "일반";
    const time = Utilities.formatDate(new Date(), TZ, "yyyy-MM-dd HH:mm:ss");

    sheet_("results", RESULT_HEADERS).appendRow([
      time, grade, klass, num, name, mode, score, max,
      Number(r.correct) || 0, Number(r.total) || 0, Number(r.seconds) || 0, String(r.answers || "").slice(0, 2000)
    ]);

    const detail = Array.isArray(r.detail) ? r.detail.slice(0, 30) : [];
    if (detail.length) {
      const levelName = { 1: "쉬움", 2: "보통", 3: "어려움" };
      const rows = detail.map(function (d) {
        return [time, grade, klass, num, name, String(d.id || ""), String(d.q || "").slice(0, 300),
          String(d.cat || ""), levelName[d.level] || "", d.ok ? "O" : "X"];
      });
      const sh = sheet_("문항별 기록", ANSWER_HEADERS);
      sh.getRange(sh.getLastRow() + 1, 1, rows.length, ANSWER_HEADERS.length).setValues(rows);
    }
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

// ── 기록 조회 ──
//   ?action=rank            → 랭킹용 (이름 가림, 누구나)
//   ?action=all&key=비밀번호 → 통계용 전체 기록 (선생님)
function doGet(e) {
  const p = (e && e.parameter) || {};
  const values = sheet_("results", RESULT_HEADERS).getDataRange().getValues().slice(1);
  const rows = values.map(function (v) {
    const t = v[0] instanceof Date ? Utilities.formatDate(v[0], TZ, "yyyy-MM-dd'T'HH:mm:ss+09:00")
      : String(v[0]).replace(" ", "T") + "+09:00";
    return {
      time: t, grade: v[1], klass: v[2], num: v[3], name: String(v[4]), mode: v[5] === "사진" ? "photo" : "normal",
      score: Number(v[6]), max: Number(v[7]), correct: Number(v[8]), total: Number(v[9]), seconds: Number(v[10]), answers: String(v[11])
    };
  });
  if (p.action === "all") {
    if (String(p.key || "") !== ADMIN_KEY) return json_({ error: "key" });
    return json_(rows);
  }
  // 랭킹: 이름 가운데를 가리고, 응답 내역은 보내지 않음
  return json_(rows.map(function (r) {
    return { time: r.time, grade: r.grade, klass: r.klass, num: r.num, name: mask_(r.name), mode: r.mode, score: r.score };
  }));
}

function mask_(n) {
  n = String(n || "");
  if (n.length <= 1) return n;
  if (n.length === 2) return n[0] + "*";
  return n[0] + new Array(n.length - 1).join("*") + n[n.length - 1];
}

// ── 스프레드시트 메뉴 ──
function onOpen() {
  SpreadsheetApp.getUi().createMenu("독도 퀴즈")
    .addItem("통계·그래프 새로고침", "updateStats")
    .addToUi();
}

/**
 * '문항 통계' 시트를 만들고 그래프 2개(많이 틀린 문제 TOP 10, 많이 맞힌 문제 TOP 10)와
 * '점수 분포' 그래프를 그립니다. 메뉴 [독도 퀴즈] → [통계·그래프 새로고침]
 */
function updateStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ans = sheet_("문항별 기록", ANSWER_HEADERS).getDataRange().getValues().slice(1);
  const map = {};
  ans.forEach(function (r) {
    const id = r[5];
    if (!id) return;
    const s = map[id] || (map[id] = { id: id, q: r[6], cat: r[7], level: r[8], n: 0, ok: 0 });
    s.n++; if (r[9] === "O") s.ok++;
  });
  const list = Object.keys(map).map(function (k) { const s = map[k]; s.wrong = s.n - s.ok; s.rate = s.ok / s.n; return s; });

  let sh = ss.getSheetByName("문항 통계");
  if (sh) ss.deleteSheet(sh);
  sh = ss.insertSheet("문항 통계");
  sh.getCharts().forEach(function (c) { sh.removeChart(c); });

  // 표 1: 많이 틀린 문제
  const wrong = list.slice().sort(function (a, b) { return b.wrong - a.wrong || a.rate - b.rate; }).slice(0, 10);
  const right = list.slice().sort(function (a, b) { return b.ok - a.ok || b.rate - a.rate; }).slice(0, 10);
  const head = ["문항", "문제", "분야", "난이도", "응답", "정답", "오답", "정답률"];
  const toRow = function (s) { return [s.id, s.q, s.cat, s.level, s.n, s.ok, s.wrong, s.rate]; };

  sh.getRange(1, 1).setValue("❌ 가장 많이 틀린 문제 TOP 10").setFontWeight("bold").setFontSize(13);
  sh.getRange(2, 1, 1, head.length).setValues([head]).setFontWeight("bold").setBackground("#fdeaea");
  if (wrong.length) sh.getRange(3, 1, wrong.length, head.length).setValues(wrong.map(toRow));

  const r2 = 15;
  sh.getRange(r2, 1).setValue("⭕ 가장 많이 맞힌 문제 TOP 10").setFontWeight("bold").setFontSize(13);
  sh.getRange(r2 + 1, 1, 1, head.length).setValues([head]).setFontWeight("bold").setBackground("#e7f7ee");
  if (right.length) sh.getRange(r2 + 2, 1, right.length, head.length).setValues(right.map(toRow));

  // 점수 분포 (일반 퀴즈)
  const res = sheet_("results", RESULT_HEADERS).getDataRange().getValues().slice(1).filter(function (r) { return r[5] !== "사진"; });
  const bins = [];
  for (let i = 0; i <= 10; i++) bins.push([i === 10 ? "100점" : (i * 10) + "~" + (i * 10 + 9) + "점", 0]);
  res.forEach(function (r) { bins[Math.min(10, Math.floor(Number(r[6]) / 10))][1]++; });
  const r3 = 29;
  sh.getRange(r3, 1).setValue("📊 점수 분포 (일반 퀴즈)").setFontWeight("bold").setFontSize(13);
  sh.getRange(r3 + 1, 1, 1, 2).setValues([["점수 구간", "참여 횟수"]]).setFontWeight("bold");
  sh.getRange(r3 + 2, 1, bins.length, 2).setValues(bins);

  sh.getRange("H:H").setNumberFormat("0%");
  sh.setColumnWidth(2, 380);

  if (wrong.length) {
    sh.insertChart(sh.newChart().asBarChart()
      .addRange(sh.getRange(3, 1, wrong.length, 1)).addRange(sh.getRange(3, 7, wrong.length, 1))
      .setOption("title", "가장 많이 틀린 문제 (오답 횟수)").setOption("legend", { position: "none" })
      .setOption("colors", ["#eb6834"]).setPosition(1, 10, 0, 0).build());
  }
  if (right.length) {
    sh.insertChart(sh.newChart().asBarChart()
      .addRange(sh.getRange(r2 + 2, 1, right.length, 1)).addRange(sh.getRange(r2 + 2, 6, right.length, 1))
      .setOption("title", "가장 많이 맞힌 문제 (정답 횟수)").setOption("legend", { position: "none" })
      .setOption("colors", ["#2a78d6"]).setPosition(r2, 10, 0, 0).build());
  }
  sh.insertChart(sh.newChart().asColumnChart()
    .addRange(sh.getRange(r3 + 2, 1, bins.length, 2))
    .setOption("title", "점수 분포").setOption("legend", { position: "none" })
    .setOption("colors", ["#2a78d6"]).setPosition(r3, 10, 0, 0).build());
}
