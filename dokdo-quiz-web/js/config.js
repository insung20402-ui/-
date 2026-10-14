/**
 * 저장소 설정
 * ─────────────────────────────────────────────
 * BACKEND
 *   "auto"     : 아래 순서로 자동 선택   ← 기본값
 *                Firebase 설정이 있으면 Firebase → 미니 PC 서버(server.py)로 열었으면 서버 저장
 *                → 스프레드시트 URL이 있으면 스프레드시트 → 아니면 이 브라우저에만 저장
 *   "server"   : 미니 PC의 server.py 에 저장 (data/results.csv) — 계정·설치 필요 없음  ← 미니 PC 추천
 *   "firebase" : Firebase Firestore (무료 Spark 요금제)
 *   "sheets"   : 구글 스프레드시트 + Apps Script (apps-script/Code.gs)
 *   "local"    : 이 브라우저에만 저장 (테스트용)
 */
const APP_CONFIG = {
  BACKEND: "auto",

  // Firebase 콘솔 → 프로젝트 설정 → 내 앱(</>) → SDK 설정 및 구성 에서 복사해 붙여넣기
  FIREBASE: {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: ""
  },
  FIREBASE_COLLECTION: "quizResults",

  // 구글 스프레드시트 Apps Script 웹 앱 URL (BACKEND: "sheets" 일 때)
  SHEETS_URL: "",

  SECONDS_PER_QUESTION: 20,
  ONE_TRY_PER_DEVICE: true, // true: 한 휴대폰(브라우저)에서 한 번만 참여 가능
  GRADES: [1, 2, 3],        // 학년 선택지
  CLASSES_PER_GRADE: 10     // 학년별 반 수
};
