# 만수중학교 학교 소개 네비게이션

층별 공간을 둘러볼 수 있는 학교 소개 웹페이지입니다. `index.html`을 브라우저로 열거나 정적 서버로 서빙하면 됩니다.

## 영상 추가하는 방법

1. 영상 파일을 웹 재생에 적합한 형식(H.264 mp4)으로 변환해 `videos/` 폴더에 추가합니다.
   ```
   ffmpeg -i 원본.mp4 -vf "scale=720:-2" -c:v libx264 -crf 26 -pix_fmt yuv420p -c:a aac -b:a 96k -movflags +faststart videos/새공간.mp4
   ```
2. 썸네일 이미지를 추출해 `images/thumbnails/` 폴더에 추가합니다.
   ```
   ffmpeg -i videos/새공간.mp4 -ss 00:00:01.0 -vframes 1 -vf "scale=480:-2" images/thumbnails/새공간.jpg
   ```
3. `data/tour.json`에 층(`floors`)과 위치(`locations`) 정보를 추가합니다. 새로운 층이면 `floors` 배열에 새 항목을, 기존 층에 공간을 추가하려면 해당 층의 `locations` 배열에 항목을 추가하면 됩니다.

코드 수정 없이 `data/tour.json`과 파일 추가만으로 네비게이션이 자동으로 갱신됩니다.
