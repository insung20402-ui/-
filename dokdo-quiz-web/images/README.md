# 📷 퀴즈 사진 넣는 곳

아래 **파일 이름 그대로** 사진을 이 `images` 폴더에 넣으면 해당 문제에 사진이 나옵니다.
사진이 없는 문제는 파란 "사진 준비 중" 그림으로 대신 나옵니다. (가로 800px 정도, 500KB 이하 권장)

| 파일 이름 | 문제 | 필요한 사진 |
|---|---|---|
| `q001-dokdo.jpg` | Q001 (하) | 동도·서도가 함께 보이는 독도 전경 |
| `q002-seagull.jpg` | Q002 (하) | 괭이갈매기 |
| `q003-sealion.jpg` | Q003 (하) | 강치(바다사자) 사진 또는 그림 |
| `q004-lighthouse.jpg` | Q004 (하) | 독도 등대 |
| `q005-isabu.jpg` | Q005 (중) | 이사부 동상 (또는 이사부 사자 조형물) |
| `q006-anyongbok.jpg` | Q006 (중) | 안용복 동상 |
| `q007-hongsoonchil.jpg` | Q007 (중) | 홍순칠 대장 사진 또는 독도의용수비대 기념비 |
| `q008-sejong.jpg` | Q008 (중) | 『세종실록』 지리지 우산·무릉 기록 부분 |
| `q009-haeguk.jpg` | Q009 (중) | 해국 (보라색 바닷가 국화) |
| `q010-hangukryeong.jpg` | Q010 (중) | 동도 바위의 '韓國領' 글씨 |
| `q011-seodo.jpg` | Q011 (중) | 서도와 주민 숙소 |
| `q012-museum.jpg` | Q012 (중) | 울릉도 독도박물관 건물 |
| `q013-chikryeong41.jpg` | Q013 (상) | 대한제국 칙령 제41호 (관보) |
| `q014-samgukjeobyang.jpg` | Q014 (상) | 삼국접양지도 |
| `q015-gijukdo.jpg` | Q015 (상) | 기죽도약도 |

## 사진 구하는 곳
- 외교부 독도 홈페이지 (dokdo.mofa.go.kr) – 사진·고지도·문헌
- 동북아역사재단 독도연구소 (dokdo.nahf.or.kr)
- 경상북도 사이버독도 (dokdo.gb.go.kr)
- 공공누리 (kogl.or.kr) – '공공누리 1유형'은 출처만 밝히면 사용 가능
- 위키미디어 공용 (commons.wikimedia.org) – 'Dokdo', 'Liancourt Rocks' 검색

사진을 넣은 뒤 `js/questions.js`에서 그 문제의 `imageCredit`에 출처를 적어 주세요. (예: `"외교부 독도 홈페이지"`)
.png 파일이면 `imageUrl`의 확장자도 `.png`로 바꿔 주세요.
