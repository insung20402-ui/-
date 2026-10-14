#!/bin/sh
# 독도 사진 퀴즈 서버 실행 (macOS / Linux)
cd "$(dirname "$0")"
exec python3 server.py "${1:-8000}"
