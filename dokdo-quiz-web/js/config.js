/**
 * 저장소 설정
 * ─────────────────────────────────────────────
 * BACKEND
 *   "firebase" : Firebase Firestore (무료 Spark 요금제) — 실시간 통계   ← 추천
 *   "sheets"   : 구글 스프레드시트 + Apps Script (apps-script/Code.gs)
 *   "local"    : 이 브라우저에만 저장 (테스트용)
 * 설정값이 비어 있으면 자동으로 "local" 로 동작합니다.
 */
const APP_CONFIG = {
  BACKEND: "firebase",

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
  GRADES: [1, 2, 3],        // 학년 선택지
  CLASSES_PER_GRADE: 10     // 학년별 반 수
};
