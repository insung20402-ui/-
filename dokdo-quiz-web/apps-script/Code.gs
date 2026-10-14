/**
 * 독도 사진 퀴즈 — 구글 스프레드시트 저장 스크립트 (Firebase 대신 쓸 때)
 *
 * 1. 새 구글 스프레드시트 → [확장 프로그램] → [Apps Script] → 이 코드 붙여넣기 → 저장
 * 2. [배포] → [새 배포] → 유형 '웹 앱' / 실행: 나 / 액세스: 모든 사용자 → 배포 → URL 복사
 * 3. src/js/config.js 에서 BACKEND: "sheets", SHEETS_URL: "복사한 URL"
 *
 * 'results' 시트에 한 판마다 한 줄: 풀이 완료 시간 | 학년 | 반 | 번호 | 이름 | 점수 | 정답 수 | 걸린 시간(초) | 문항별 결과
 */
const SHEET = "results";
const HEADERS = ["풀이 완료 시간", "학년", "반", "번호", "이름", "점수", "정답 수", "걸린 시간(초)", "문항별 결과(JSON)", "finishedAt(ISO)"];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET);
  if (!sh) {
    ss.setSpreadsheetTimeZone("Asia/Seoul");
    sh = ss.insertSheet(SHEET);
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
  }
  return sh;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const r = JSON.parse(e.postData.contents);
    const score = Number(r.score);
    const name = String(r.name || "").trim().slice(0, 12);
    const grade = Number(r.grade), klass = Number(r.klass), num = Number(r.num);
    if (!name || !grade || !klass || !num || !(score >= 0 && score <= 100)) return out_({ ok: false });
    const answers = (Array.isArray(r.answers) ? r.answers : []).slice(0, 10)
      .map(function (a) { return { id: String(a.id).slice(0, 20), correct: !!a.correct }; });
    sheet_().appendRow([
      Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss"),
      grade, klass, num, name, score, Number(r.correctCount) || 0, Number(r.durationSec) || 0,
      JSON.stringify(answers), String(r.finishedAt || new Date().toISOString())
    ]);
    return out_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  const rows = sheet_().getDataRange().getValues().slice(1).map(function (v) {
    let answers = [];
    try { answers = JSON.parse(v[8]); } catch (err) {}
    return {
      finishedAtText: v[0] instanceof Date ? Utilities.formatDate(v[0], "Asia/Seoul", "yyyy-MM-dd HH:mm:ss") : String(v[0]),
      grade: Number(v[1]), klass: Number(v[2]), num: Number(v[3]), name: String(v[4]),
      score: Number(v[5]), correctCount: Number(v[6]), durationSec: Number(v[7]),
      answers: answers, finishedAt: String(v[9])
    };
  });
  return out_(rows);
}
