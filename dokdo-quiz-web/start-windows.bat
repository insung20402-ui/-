@echo off
chcp 65001 > nul
cd /d "%~dp0"
title 독도 사진 퀴즈 서버

where python > nul 2>&1
if not errorlevel 1 goto run_python
where py > nul 2>&1
if not errorlevel 1 goto run_py

echo [오류] 파이썬이 설치되어 있지 않습니다.
echo https://www.python.org/downloads/ 에서 설치하세요.
echo 설치 첫 화면에서 "Add python.exe to PATH" 를 꼭 체크하세요.
goto end

:run_python
python server.py 8000
goto end

:run_py
py server.py 8000

:end
pause
