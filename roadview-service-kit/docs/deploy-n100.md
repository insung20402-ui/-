# 미니PC(N100) 서버로 띄우기

N100(4코어, GPU 없음)이면 이 키트의 서버로 충분하다. 서버가 하는 일은 저장, 지점 검색, 그리고 사진을 올릴 때 한 번만 파노라마로 미리 만들어 두는 것이다. 이미지 변환은 sharp(libvips)와 워커 스레드로 하며, 4096×2048 파노라마 한 장을 만드는 데 이 개발 환경(4코어)에서 1~2초 걸렸다. N100도 비슷한 범위로 예상하지만 실측하지는 않았다.

## 1. 준비 (Ubuntu/Debian 기준)

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER      # 다시 로그인
git clone https://github.com/insung20402-ui/- roadview && cd roadview
git checkout claude/relaxed-brahmagupta-eiy6gu
cd roadview-service-kit
mkdir -p data && cp .env.example .env
nano .env                          # ADMIN_TOKEN을 12자 이상 임의 문자열로 (짧거나 예시 그대로면 서버가 시작을 거부한다)
PUID=$(id -u) PGID=$(id -g) docker compose up -d --build
```

브라우저에서 `http://미니PC주소:8080` 으로 연다. 처음 사진을 올리거나 지울 때 토큰을 한 번 묻는다. 토큰은 그 브라우저에 저장된다. 보는 것은 토큰 없이 된다.

Docker 없이 쓰려면 Node 22.13 이상을 설치하고 아래처럼 실행한다.

```bash
cd server && npm install && cd ..
ADMIN_TOKEN=... DATA_DIR=./data node server/index.js
```

## 2. 밖에서 접속하기

포트를 공유기에서 직접 열지 않는다. 쓰기는 토큰 하나로 막혀 있고 읽기는 열려 있다.

- **혼자·가족만 볼 때:** Tailscale을 미니PC와 휴대폰에 깔면 `http://미니PC의-tailscale-주소:8080`으로 어디서나 열린다.
- **링크로 공유할 때:** Cloudflare Tunnel로 HTTPS 주소를 붙이고, Cloudflare Access로 접근할 사람을 제한한다.

## 3. 저장되는 것과 백업

`data/` 폴더 하나에 전부 있다.

| 경로 | 내용 |
|---|---|
| `data/roadview.db` | 지점 정보(SQLite) |
| `data/blobs/` | 업로드 사진. 재인코딩되어 EXIF(GPS 포함)는 지워진 상태 |
| `data/pano/` | 미리 만든 파노라마(지워도 다시 만들어진다) |
| `data/token` | `ADMIN_TOKEN`을 안 줬을 때 자동 생성된 토큰 |

백업은 `data/roadview.db*`와 `data/blobs/`를 복사하면 된다. 실행 중에도 `sqlite3 data/roadview.db ".backup backup.db"`로 일관된 사본을 만들 수 있다.

## 4. 동작 방식

1. 브라우저가 사진을 올린다(`PUT /api/blobs/{id}`). 서버가 다시 인코딩해서 EXIF를 지운다.
2. 지점을 저장한다(`PUT /api/nodes/{id}`). 서버가 revision을 올리고 렌더 대기열에 넣는다.
3. 워커가 파노라마를 만들어 `/pano/{id}/{rev}-high.jpg`, `-low.jpg`로 둔다.
4. 렌더가 끝나기 전에는 브라우저가 직접 합성해서 보여 주고, 끝나면 서버 파노라마로 바뀐다. 다음부터 이동은 이미지 한 장 받는 시간이다.
5. 사진이나 방향을 고치면 revision이 오르고 다시 만든다. URL이 바뀌므로 캐시를 비울 필요가 없다.

## 5. 아직 안 된 것

- 보기는 로그인 없이 열려 있다. 올린 사진 원본도 주소를 알면 누구나 볼 수 있으니, 외부에 열 때는 접근 제한(Tailscale, Cloudflare Access)을 함께 쓴다.
- 번호판·얼굴 자동 블러(검출 모델 추가 필요). 공개 전에는 반드시 필요하다.
- 타일 방식 전송. 지금은 4096×2048 한 장을 받는다.
- 사용자별 계정. 지금은 토큰 하나를 아는 사람이 모두 올리고 지울 수 있다.
- 브라우저에 저장해 둔 기존 사진을 서버로 옮기는 기능. 서버 모드로 처음 열면 서버가 비어 있으니 다시 올린다.
