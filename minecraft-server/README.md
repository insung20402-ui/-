# 마인크래프트 최신 버전 서버

두 가지 방법을 제공합니다. Docker를 안 쓰고 싶다면 **방법 1**을 사용하세요.

## 방법 1: 스크립트 한 번 실행 (Docker 불필요)

요구 사항: **Java 21 이상** ([Adoptium](https://adoptium.net)에서 설치)

- **Windows**: `run-server.ps1` 마우스 우클릭 → "PowerShell로 실행" (또는 PowerShell에서 `./run-server.ps1`)
- **macOS/Linux**: 터미널에서

```bash
cd minecraft-server
chmod +x run-server.sh
./run-server.sh
```

처음 실행하면 Mojang 공식 서버에서 최신 버전을 자동으로 확인하고 `server.jar`를 내려받은 뒤, EULA에 자동 동의하고 바로 서버를 실행합니다. 두 번째 실행부터는 이미 받은 `server.jar`를 그대로 사용합니다 (최신 버전으로 다시 받으려면 `server.jar`를 지우고 다시 실행).

콘솔에 `Done (...)! For help, type "help"` 가 뜨면 서버가 켜진 것입니다. 종료하려면 콘솔에 `stop` 입력.

## 방법 2: Docker

`itzg/minecraft-server` 이미지를 사용해 항상 최신 정식(Vanilla) 버전을 자동으로 받아 실행합니다.

### 요구 사항

- Docker, Docker Compose가 설치된 PC 또는 서버(VPS)
- 최소 2GB 이상의 여유 메모리

### 실행 방법

```bash
cd minecraft-server
cp .env.example .env   # 필요하면 값 수정 (메모리, 난이도 등)
docker compose up -d
docker compose logs -f
```

### 자주 쓰는 명령

```bash
docker compose stop        # 서버 중지
docker compose start       # 서버 재시작
docker compose down        # 서버 컨테이너 삭제 (world 데이터는 ./data 에 남음)
docker attach minecraft-server   # 콘솔 접속 (op 권한 부여 등)
```

## 공통: 외부 접속 방법

- 같은 네트워크(같은 공유기): `localhost:25565` 또는 서버를 실행 중인 PC의 내부 IP
- 외부(인터넷)에서 친구를 초대하려면: 공유기 포트포워딩(25565/TCP → 서버 PC)을 설정하거나, VPS의 공인 IP를 사용
- 관리자(운영자) 권한 부여: 서버 콘솔에 `op <내_마인크래프트_닉네임>` 입력

## 데이터

월드, 설정 파일 등은 `minecraft-server` 폴더(방법 1) 또는 `minecraft-server/data` 폴더(방법 2)에 저장됩니다. 백업하려면 해당 폴더를 통째로 복사하면 됩니다.
