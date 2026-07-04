#!/usr/bin/env bash
# 최신 버전 마인크래프트 서버를 자동으로 받아서 실행합니다. (Linux/macOS)
# 요구사항: Java 21 이상, curl, python3
set -e

cd "$(dirname "$0")"

if ! command -v java >/dev/null 2>&1; then
  echo "Java가 설치되어 있지 않습니다. https://adoptium.net 에서 Java 21(LTS) 이상을 설치한 뒤 다시 실행하세요."
  exit 1
fi

if [ ! -f server.jar ]; then
  echo "최신 버전 정보를 확인하는 중..."
  MANIFEST=$(curl -fsSL https://piston-meta.mojang.com/mc/game/version_manifest_v2.json)
  LATEST=$(echo "$MANIFEST" | python3 -c "import json,sys; print(json.load(sys.stdin)['latest']['release'])")
  VERSION_URL=$(echo "$MANIFEST" | python3 -c "
import json, sys
data = json.load(sys.stdin)
latest = data['latest']['release']
for v in data['versions']:
    if v['id'] == latest:
        print(v['url'])
        break
")
  echo "최신 버전: $LATEST"

  VERSION_JSON=$(curl -fsSL "$VERSION_URL")
  SERVER_URL=$(echo "$VERSION_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['downloads']['server']['url'])")

  echo "서버 파일 다운로드 중..."
  curl -fSL -o server.jar "$SERVER_URL"
fi

echo "eula=true" > eula.txt

if [ ! -f server.properties ]; then
  cat > server.properties <<'EOF'
motd=A Minecraft Server
difficulty=normal
gamemode=survival
max-players=20
online-mode=true
EOF
fi

echo "서버를 시작합니다. (종료하려면 콘솔에 stop 입력)"
java -Xms1G -Xmx2G -jar server.jar nogui
