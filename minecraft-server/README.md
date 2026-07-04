# 마인크래프트 최신 버전 서버 (Docker)

`itzg/minecraft-server` 이미지를 사용해 항상 최신 정식(Vanilla) 버전을 자동으로 받아 실행합니다.

## 요구 사항

- Docker, Docker Compose가 설치된 PC 또는 서버(VPS)
- 최소 2GB 이상의 여유 메모리
- 방화벽/공유기에서 `25565` 포트(TCP)를 열어야 외부에서 접속 가능

## 실행 방법

```bash
cd minecraft-server
cp .env.example .env   # 필요하면 값 수정 (메모리, 난이도 등)
docker compose up -d
```

첫 실행 시 최신 서버 파일을 내려받기 때문에 몇 분 정도 걸릴 수 있습니다. 아래 명령으로 진행 상황을 확인하세요.

```bash
docker compose logs -f
```

로그에 `Done (...)! For help, type "help"` 가 뜨면 서버가 정상적으로 켜진 것입니다.

## 접속 방법

- 같은 네트워크(같은 공유기): `localhost:25565` 또는 서버를 실행 중인 PC의 내부 IP
- 외부(인터넷)에서 접속하려면: 공유기 포트포워딩(25565/TCP → 서버 PC)을 설정하거나, VPS의 공인 IP를 사용

## 자주 쓰는 명령

```bash
docker compose stop        # 서버 중지
docker compose start       # 서버 재시작
docker compose down        # 서버 컨테이너 삭제 (world 데이터는 ./data 에 남음)
docker attach minecraft-server   # 콘솔 접속 (op 권한 부여 등)
```

콘솔에서 관리자(운영자) 권한 부여:

```
op <내_마인크래프트_닉네임>
```

## 데이터

월드, 설정 파일 등은 모두 `minecraft-server/data` 폴더에 저장됩니다. 서버를 백업하려면 이 폴더를 통째로 복사하면 됩니다.

## 업데이트

`docker compose pull && docker compose up -d` 를 실행하면 최신 버전으로 갱신됩니다 (VERSION=LATEST 설정이라 재시작 시 자동으로 최신 버전을 확인합니다).
