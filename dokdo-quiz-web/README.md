# 🇰🇷 독도 사진 퀴즈 (웹사이트)

사진을 보고 맞히는 독도 퀴즈 웹사이트입니다. HTML · CSS(Tailwind) · JavaScript · Chart.js로 만들었고,
결과는 **미니 PC 서버**(추천), **Firebase Firestore**, **구글 스프레드시트** 중 하나에 저장됩니다.

## 🖥️ 미니 PC로 띄우기 (추천 · 계정 필요 없음)
1. 미니 PC에 **파이썬** 설치: https://www.python.org/downloads/
   (설치 첫 화면에서 **"Add python.exe to PATH"** 꼭 체크)
2. 이 `dokdo-quiz-web` 폴더를 미니 PC에 통째로 복사
3. 사진을 `images/` 폴더에 정해진 이름으로 넣기 → 목록은 `images/README.md`
4. **`start-windows.bat` 더블클릭** (맥·리눅스는 `start-mac-linux.sh`)
5. 검은 창에 나오는 **학생 접속 주소**(예: `http://192.168.0.15:8000`)를 QR 코드로 만들어 교실·복도에 붙이기

- 학생 휴대폰이 미니 PC와 **같은 와이파이(학교 네트워크)** 에 있어야 접속됩니다.
- 처음 실행할 때 Windows 방화벽 창이 뜨면 **허용**을 누르세요.
- 결과는 미니 PC의 `data/results.csv`(엑셀로 열기)에 쌓이고, 웹 화면의 **통계** 탭에서 그래프로 볼 수 있습니다.
  학생이 퀴즈를 마치면 5초 안에 통계에 반영됩니다.
- 미니 PC를 끄면 퀴즈도 꺼집니다. 행사 기간에는 미니 PC가 절전 모드로 들어가지 않게 설정해 주세요.
- Tailwind와 Chart.js를 폴더 안에 넣어 두어 **인터넷이 끊겨도** 동작합니다. (글꼴만 기본 글꼴로 바뀜)
- `data/` 폴더를 지우면 기록이 초기화됩니다. 행사 전 시험 기록은 지우고 시작하세요.

## 폴더 구조
```
dokdo-quiz-web/
├─ start-windows.bat       ★ 미니 PC(Windows)에서 더블클릭하면 서버 시작
├─ server.py               미니 PC 서버 (웹사이트 + 결과 저장, 파이썬 기본 기능만 사용)
├─ images/                 ★ 퀴즈 사진 넣는 곳 (파일 이름 목록: images/README.md)
├─ data/                   결과가 저장되는 곳 (서버를 처음 실행하면 생김)
├─ index.html              화면 (시작 · 문제 · 결과 · 통계)
├─ vendor/, css/tailwind.css  Chart.js · Tailwind (인터넷 없이도 동작하도록 포함)
├─ css/style.css           동해 바다 그라데이션 + 반투명 유리(Glassmorphism) 테마
├─ js/config.js            ★ 저장소 설정 (Firebase 키 / 스프레드시트 URL)
├─ js/questions.js         ★ 문제 은행 (샘플 15문제, 500문제까지 같은 형식으로 추가)
├─ js/storage.js           저장소 어댑터 (Firebase / 스프레드시트 / 브라우저)
├─ js/charts.js            통계 집계 + Chart.js 그래프
├─ js/app.js               퀴즈 진행 로직
├─ firebase/firestore.rules  Firestore 보안 규칙
└─ apps-script/Code.gs     구글 스프레드시트 저장 스크립트 (Firebase 대신 쓸 때)
```

## 출제 방식
- **퀴즈 시작하기** → 문제 은행에서 무작위로 **하 2 · 중 6 · 상 2 = 10문제**
- 배점: 하 5점 · 중 10점 · 상 15점 → 2×5 + 6×10 + 2×15 = **100점 만점**
- 보기 순서도 매번 섞입니다. 문제당 제한 시간 20초 (`config.js`에서 변경)

## 문제 추가 (500문제까지)
`js/questions.js`의 `QUESTION_BANK`에 같은 형식으로 추가하세요.
```js
{
  id: "Q016",                 // 고유 번호 (통계 기준, 바꾸지 말 것)
  level: "중",                // 하 / 중 / 상
  category: "인물",
  question: "이 사진의 인물은 누구일까요?",
  imageUrl: "images/isabu.jpg",   // 또는 https://… 주소. 비우면 파란 자리 표시자
  imageAlt: "이사부 동상",
  imageCredit: "출처: ○○○ (공공누리 1유형)",
  choices: ["이사부", "안용복", "홍순칠", "장보고"],
  answer: 0,                  // 정답 보기 번호 (0부터)
  explanation: "해설 문장"
}
```
> 난이도별로 최소 하 2 · 중 6 · 상 2문제 이상 있어야 합니다. 같은 문제가 덜 반복되게 하려면 난이도별로 넉넉히 넣으세요.
> 사진은 `images/` 폴더를 만들어 넣거나, 외교부 독도 홈페이지 · 공공누리 · 위키미디어 공용의 사진 주소를 쓰세요. (출처 표기 필수)

## 저장 데이터
퀴즈를 마칠 때마다 한 건씩 저장됩니다.
```json
{
  "grade": 1, "klass": 3, "num": 12,
  "name": "홍길동",
  "score": 85,
  "finishedAt": "2026-10-20T08:15:32.000Z",
  "finishedAtText": "2026-10-20 17:15:32",
  "durationSec": 143,
  "correctCount": 8,
  "answers": [{ "id": "Q005", "correct": true }, …]
}
```
`answers`(문항별 맞춤/틀림)로 통계 화면의 '가장 많이 맞힌 문제 / 가장 많이 틀린 문제' 그래프를 그립니다.

## A. Firebase 연결 (미니 PC 대신 인터넷 서비스로 운영할 때)
1. https://console.firebase.google.com → **프로젝트 추가**
2. 왼쪽 **Firestore Database → 데이터베이스 만들기** (위치: `asia-northeast3 (서울)`, 프로덕션 모드)
3. Firestore **규칙** 탭에 `firebase/firestore.rules` 내용을 붙여넣고 **게시**
4. **프로젝트 설정(톱니바퀴) → 내 앱 → 웹(</>)** 으로 앱 등록 → 나오는 `firebaseConfig` 값을
   `js/config.js`의 `FIREBASE`에 붙여넣기 (`BACKEND: "firebase"`)
5. 끝! 통계 화면은 새 기록이 저장되면 **실시간으로** 바뀝니다.

> Firebase의 `apiKey`는 비밀번호가 아니라 프로젝트 식별용이라 웹사이트에 들어가도 괜찮습니다.
> 데이터 보호는 3번의 보안 규칙이 담당합니다 (추가·읽기만 허용, 수정·삭제 금지, 점수 0~100 검사).

## B. 구글 스프레드시트 연결 (대안)
1. 새 구글 스프레드시트 → **확장 프로그램 → Apps Script** → `apps-script/Code.gs` 붙여넣기 → 저장
2. **배포 → 새 배포 → 웹 앱** (실행: 나 / 액세스: 모든 사용자) → URL 복사
3. `js/config.js`에서 `BACKEND: "sheets"`, `SHEETS_URL: "복사한 URL"`
→ `results` 시트에 `풀이 완료 시간 | 학년 | 반 | 번호 | 이름 | 점수 | 정답 수 | 걸린 시간 | 문항별 결과`가 쌓입니다. (통계 화면은 30초마다 새로고침)

## 웹사이트로 올리기
- **GitHub Pages**: 저장소 Settings → Pages → 브랜치 선택 → `https://<아이디>.github.io/<저장소>/dokdo-quiz-web/`
- 또는 **Firebase Hosting**: `npm i -g firebase-tools` → `firebase init hosting` (public 폴더를 `dokdo-quiz-web`로) → `firebase deploy`

설정값을 비워 두면 결과가 그 브라우저에만 저장되는 **테스트 모드**로 동작합니다.

## 디자인을 고쳤다면
`index.html`에 새 Tailwind 클래스를 쓰면 `css/tailwind.css`를 다시 만들어야 합니다.
`npx tailwindcss@3.4.17 -o css/tailwind.css --minify --content "./**/*.{html,js}"`
