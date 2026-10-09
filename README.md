# 학교 로드뷰

영상 -> 프레임 -> 웹 로드뷰.

- 뷰어: `site/index.html` (`python3 -m http.server -d site` 로 열기)
- 프레임 재생성: `python3 tools/build_frames.py tools/tours.config.json`
- `tools/tours.config.json` 옵션: `fps`(초당 프레임), `people`(`none`/`face`/`body`),
  `manual_mask`(가릴 영역 `[x,y,w,h]` 비율), `drop`(제외할 프레임 번호)
- 자동 사람 감지(`face`/`body`)는 오탐이 많아 기본은 꺼 두었고, 사람이 나오는 프레임은 `drop`/`manual_mask`로 지정합니다.
