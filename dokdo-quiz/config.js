// ===== 설정 =====
// 1) apps-script/Code.gs 를 구글 스프레드시트에 붙여넣고 '웹 앱'으로 배포하세요. (README.md 참고)
// 2) 배포 후 받은 웹 앱 URL(https://script.google.com/macros/s/.../exec)을 아래에 붙여넣으세요.
// 비워 두면 결과가 이 기기(브라우저)에만 저장됩니다.
const CONFIG = {
  SCRIPT_URL: "",
  QUESTIONS_PER_GAME: 10,   // 한 판에 출제할 문제 수
  SECONDS_PER_QUESTION: 15, // 문제당 제한 시간(초)
  GRADES: [1, 2, 3],        // 학년 선택지
  CLASSES_PER_GRADE: 8,     // 학년별 반 수
  SCHOOL_NAME: "우리 학교"
};
