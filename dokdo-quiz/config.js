// ===== 설정 =====
// 1) apps-script/Code.gs 를 구글 스프레드시트의 Apps Script 에 붙여넣고 '웹 앱'으로 배포하세요. (README.md 참고)
// 2) 배포 후 받은 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 아래 SCRIPT_URL 에 붙여넣으세요.
// 비워 두면 결과가 이 기기(브라우저)에만 저장됩니다.
const CONFIG = {
  SCRIPT_URL: "",
  // 한 판 구성: 쉬움 3문제(5점) + 보통 4문제(10점) + 어려움 3문제(15점) = 100점
  MIX: { 1: 3, 2: 4, 3: 3 },
  POINTS: { 1: 5, 2: 10, 3: 15 },
  PHOTO_COUNT: 10,           // 사진 퀴즈 문제 수 (문제당 10점)
  SECONDS_PER_QUESTION: 20,  // 문제당 제한 시간(초)
  GRADES: [1, 2, 3],         // 학년 선택지
  CLASSES_PER_GRADE: 8       // 학년별 반 수
};
