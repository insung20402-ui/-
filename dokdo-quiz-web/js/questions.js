/**
 * 독도 퀴즈 문제 은행
 * ─────────────────────────────────────────────
 * 500문제까지 같은 형식으로 아래 배열에 추가하면 됩니다.
 *
 *  id          문항 고유 번호 (통계 집계 기준이므로 한번 정하면 바꾸지 마세요)
 *  level       "하" | "중" | "상"   → 배점 5 / 10 / 15
 *  category    분야 (역사·지리·자연·문화유산 …)
 *  question    문제 문장
 *  imageUrl    사진 주소 (https://… 또는 images/파일명.jpg). 비워 두면 파란 자리 표시자가 나옵니다.
 *  imageAlt    사진 설명 (자리 표시자 문구 + 화면 낭독기용)
 *  imageCredit 사진 출처 (공공누리·CC 사진은 꼭 적기)
 *  choices     보기 4개
 *  answer      정답 보기의 번호 (0부터)
 *  explanation 해설
 */
const SCORE_BY_LEVEL = { 하: 5, 중: 10, 상: 15 };

// 한 판 구성: 하 2 + 중 6 + 상 2 = 10문제, 2×5 + 6×10 + 2×15 = 100점
const QUIZ_MIX = { 하: 2, 중: 6, 상: 2 };

const QUESTION_BANK = [
  // ───── 하 (4) ─────
  {
    id: "Q001", level: "하", category: "지리",
    question: "사진 속 섬의 이름은 무엇일까요?",
    imageUrl: "", imageAlt: "동도와 서도가 함께 보이는 독도 전경", imageCredit: "",
    choices: ["독도", "울릉도", "마라도", "백령도"], answer: 0,
    explanation: "동도와 서도, 89개의 부속 바위섬으로 이루어진 독도입니다. 주소는 경상북도 울릉군 울릉읍 독도리예요."
  },
  {
    id: "Q002", level: "하", category: "자연",
    question: "독도에서 무리 지어 번식하는 사진 속 새의 이름은?",
    imageUrl: "", imageAlt: "독도 바위 위의 괭이갈매기 무리", imageCredit: "",
    choices: ["괭이갈매기", "펭귄", "두루미", "독수리"], answer: 0,
    explanation: "고양이(괭이) 울음소리를 내는 괭이갈매기입니다. 봄이면 독도를 하얗게 뒤덮어요."
  },
  {
    id: "Q003", level: "하", category: "자연",
    question: "옛날 독도에 많이 살았지만 일본의 남획으로 사라진 사진 속 동물은?",
    imageUrl: "", imageAlt: "강치(바다사자) 사진 또는 그림", imageCredit: "",
    choices: ["강치(바다사자)", "돌고래", "바다거북", "고래상어"], answer: 0,
    explanation: "독도 강치는 20세기 초 일본 어민이 가죽과 기름을 얻으려 마구 잡아 사라졌습니다."
  },
  {
    id: "Q004", level: "하", category: "생활",
    question: "독도 동도에 있는 사진 속 시설은 무엇일까요?",
    imageUrl: "", imageAlt: "독도 동도의 하얀 등대", imageCredit: "",
    choices: ["독도 등대", "독도박물관", "독도 공항", "독도 기차역"], answer: 0,
    explanation: "1954년 처음 세워진 독도 등대로, 1998년부터 사람이 머무는 유인 등대로 운영됩니다."
  },

  // ───── 중 (8) ─────
  {
    id: "Q005", level: "중", category: "인물",
    question: "이 사진의 인물(동상)은 누구일까요?",
    imageUrl: "", imageAlt: "이사부 동상 (나무 사자와 함께 있는 신라 장군)", imageCredit: "",
    choices: ["이사부", "안용복", "홍순칠", "장보고"], answer: 0,
    explanation: "신라 장군 이사부입니다. 512년(지증왕 13년) 나무 사자를 배에 싣고 가 우산국(울릉도·독도)을 복속시켰어요."
  },
  {
    id: "Q006", level: "중", category: "인물",
    question: "조선 숙종 때 일본에 건너가 울릉도·독도가 조선 땅임을 주장한 사진 속 동상의 인물은?",
    imageUrl: "", imageAlt: "안용복 동상", imageCredit: "",
    choices: ["안용복", "이사부", "이규원", "심흥택"], answer: 0,
    explanation: "동래 출신 어부 안용복은 1693년과 1696년 두 차례 일본에 건너갔습니다."
  },
  {
    id: "Q007", level: "중", category: "인물",
    question: "사진 속 인물이 이끌며 1953~1956년 독도를 지킨 민간 조직은?",
    imageUrl: "", imageAlt: "홍순칠 대장 사진 또는 독도의용수비대 기념비", imageCredit: "",
    choices: ["독도의용수비대", "광복군", "의병", "독도경비대"], answer: 0,
    explanation: "홍순칠 대장과 울릉도 청년들이 만든 독도의용수비대가 독도를 지킨 뒤 1956년 경찰에 임무를 넘겼습니다."
  },
  {
    id: "Q008", level: "중", category: "문헌",
    question: "'우산(독도)과 무릉(울릉도)은 날씨가 맑으면 바라볼 수 있다'고 기록한 사진 속 문헌은?",
    imageUrl: "", imageAlt: "『세종실록』 지리지 강원도 울진현 기록 부분", imageCredit: "",
    choices: ["세종실록 지리지", "삼국사기", "택리지", "동의보감"], answer: 0,
    explanation: "1454년 완성된 『세종실록』 지리지는 독도를 우리 영토로 기록한 대표적인 조선 시대 관찬 문헌입니다."
  },
  {
    id: "Q009", level: "중", category: "자연",
    question: "가을에 독도 바위틈에 피는 사진 속 연보라색 꽃의 이름은?",
    imageUrl: "", imageAlt: "독도 바위틈에 핀 해국", imageCredit: "",
    choices: ["해국", "무궁화", "진달래", "해바라기"], answer: 0,
    explanation: "해국은 바닷가 바위틈에서 자라는 국화로, 가을이면 연보라색 꽃을 피웁니다."
  },
  {
    id: "Q010", level: "중", category: "문화유산",
    question: "사진 속 독도 바위에 새겨진 '韓國領'의 뜻은?",
    imageUrl: "", imageAlt: "독도 동도 바위에 새겨진 韓國領 글씨", imageCredit: "",
    choices: ["한국의 영토", "일본의 영토", "동쪽 바다", "독립 만세"], answer: 0,
    explanation: "'韓國領(한국령)'은 '한국의 영토'라는 뜻으로, 독도의용수비대가 동도 바위에 새겼습니다."
  },
  {
    id: "Q011", level: "중", category: "지리",
    question: "사진 속 섬은 주민 숙소가 있고 독도에서 더 높은 섬입니다. 이 섬의 이름은?",
    imageUrl: "", imageAlt: "독도 서도와 주민 숙소", imageCredit: "",
    choices: ["서도", "동도", "죽도", "관음도"], answer: 0,
    explanation: "서도는 약 168.5m로 동도(약 98.6m)보다 높고, 주민 숙소와 샘물 '물골'이 있습니다."
  },
  {
    id: "Q012", level: "중", category: "문화유산",
    question: "우리나라 유일의 영토 박물관인 사진 속 건물은 어디에 있을까요?",
    imageUrl: "", imageAlt: "독도박물관 건물 외관", imageCredit: "",
    choices: ["울릉도", "서울", "제주도", "부산"], answer: 0,
    explanation: "독도박물관은 1997년 울릉도에 문을 연 우리나라 유일의 영토 박물관입니다."
  },

  // ───── 상 (3) ─────
  {
    id: "Q013", level: "상", category: "문헌",
    question: "사진은 1900년 반포된 대한제국 칙령 제41호입니다. 이 칙령에서 독도를 가리킨 이름은?",
    imageUrl: "", imageAlt: "대한제국 칙령 제41호가 실린 관보", imageCredit: "",
    choices: ["석도", "우산도", "삼봉도", "가지도"], answer: 0,
    explanation: "칙령 제41호는 울도군의 관할 구역을 '울릉전도, 죽도, 석도'로 정했습니다. 석도(돌섬)가 바로 독도이고, 반포일 10월 25일이 '독도의 날'이에요."
  },
  {
    id: "Q014", level: "상", category: "문헌",
    question: "1785년 일본의 하야시 시헤이가 만들어 울릉도·독도를 조선과 같은 색으로 칠한 사진 속 지도는?",
    imageUrl: "", imageAlt: "삼국접양지도 (울릉도·독도 부분)", imageCredit: "",
    choices: ["삼국접양지도", "대동여지도", "팔도총도", "기죽도약도"], answer: 0,
    explanation: "삼국접양지도는 일본인이 만든 지도인데도 울릉도·독도를 조선 땅과 같은 노란색으로 칠했습니다."
  },
  {
    id: "Q015", level: "상", category: "문헌",
    question: "1877년 '울릉도 외 1도는 일본과 관계없다'는 지령에 첨부된 사진 속 지도의 이름은?",
    imageUrl: "", imageAlt: "태정관 지령에 첨부된 기죽도약도", imageCredit: "",
    choices: ["기죽도약도", "삼국접양지도", "팔도총도", "곤여만국전도"], answer: 0,
    explanation: "일본 최고 기관 태정관의 지령에 첨부된 기죽도약도에는 울릉도(기죽도)와 독도(송도)가 함께 그려져 있습니다."
  }
];
