/**
 * 독도 수호 퀴즈 — 참여 결과 데이터베이스 (Google Apps Script)
 *
 * 사용 방법
 * 1. 구글 드라이브에서 새 스프레드시트를 만든다. (예: "독도 퀴즈 결과")
 * 2. [확장 프로그램] → [Apps Script] 를 열고, 이 파일 내용을 그대로 붙여넣고 저장한다.
 * 3. [배포] → [새 배포] → 유형: 웹 앱
 *      - 실행 사용자: 나
 *      - 액세스 권한: 모든 사용자
 *    → 배포 후 나오는 '웹 앱 URL'을 복사한다.
 * 4. dokdo-quiz/config.js 의 SCRIPT_URL 에 붙여넣는다.
 */

const SHEET_NAME = "results";
const HEADERS = ["time", "grade", "klass", "num", "nick", "score", "correct", "total", "maxCombo", "seconds", "wrongIds"];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// 퀴즈 결과 저장
function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const rec = JSON.parse(e.postData.contents);
    const grade = Number(rec.grade), klass = Number(rec.klass), num = Number(rec.num);
    const score = Number(rec.score);
    // 간단한 유효성 검사 (최대 점수: 10문제 × (200 + 50 + 콤보) 를 넉넉히 잡은 값)
    if (!grade || !klass || !num || !(score >= 0 && score <= 5000)) {
      return json_({ ok: false, error: "invalid" });
    }
    getSheet_().appendRow([
      new Date(), grade, klass, num,
      String(rec.nick || "").slice(0, 10),
      score, Number(rec.correct) || 0, Number(rec.total) || 0,
      Number(rec.maxCombo) || 0, Number(rec.seconds) || 0, String(rec.wrongIds || "")
    ]);
    return json_({ ok: true });
  } finally {
    lock.releaseLock();
  }
}

// 랭킹용 기록 조회
function doGet(e) {
  const values = getSheet_().getDataRange().getValues();
  const rows = values.slice(1).map(function (r) {
    const o = {};
    HEADERS.forEach(function (h, i) { o[h] = r[i]; });
    return o;
  });
  return json_(rows);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * (선택) 스프레드시트에서 직접 실행: 문항별 오답 횟수 통계 시트를 만든다.
 * → 학생들이 가장 많이 틀린 문제를 '독도 수호 마음 나누기' 행사 판넬 자료로 활용하세요.
 */
function buildWrongStats() {
  const values = getSheet_().getDataRange().getValues().slice(1);
  const count = {};
  values.forEach(function (r) {
    String(r[10] || "").split(",").filter(String).forEach(function (id) {
      count[id] = (count[id] || 0) + 1;
    });
  });
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const out = ss.getSheetByName("wrong_stats") || ss.insertSheet("wrong_stats");
  out.clear();
  out.appendRow(["문항 번호(questions.js 순서)", "오답 횟수"]);
  Object.keys(count).sort(function (a, b) { return count[b] - count[a]; })
    .forEach(function (id) { out.appendRow([Number(id), count[id]]); });
}
