# 로드뷰 서비스 적용 키트

- 먼저 읽기: `docs/service-guide.md` (같은 내용의 `docs/service-guide.html`)
- 화면 열기: `index.html`을 Chrome으로 연다. 서버와 빌드가 필요 없고, three.js와 Leaflet을 CDN에서 받으므로 인터넷은 필요하다.
- 테스트: `node --test "tests/*.test.js"` (Node 22 이상)
- 가이드 HTML 다시 만들기: `uv run --with markdown docs/build.py`

연습용 사진과 영상(약 19MB)은 용량 때문에 뺐다. 원본 프로젝트의 `samples/`에 있다.

실제 사진으로 쓰는 앱: `live/index.html` (Chrome에서 열기). 카카오맵을 바탕 지도로 쓰려면 `live/config.js`에 JavaScript 키를 넣거나 `live/index.html?kakao=키`로 연다. 카카오 로드뷰 자체의 사진 데이터는 쓸 수 없으므로 사진은 직접 올려야 한다.
