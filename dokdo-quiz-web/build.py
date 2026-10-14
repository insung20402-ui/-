#!/usr/bin/env python3
"""
index.html 만들기 — src/ 폴더의 화면·디자인·코드를 index.html 한 파일로 합칩니다.

  python build.py

- 그래서 index.html 은 어디서 열어도(압축 파일 안, 다른 폴더로 옮긴 경우 포함) 디자인이 깨지지 않습니다.
- 문제나 설정을 고칠 때는 src/js/questions.js, src/js/config.js 를 고치세요.
  server.py(start-windows.bat)를 실행하면 자동으로 다시 합쳐지고,
  서버 없이 쓸 때는 이 파일을 한 번 실행하면 됩니다.
- 사진은 합치지 않습니다. index.html 옆의 images/ 폴더에 두세요.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "src"
OUT = ROOT / "index.html"

NOTICE = "<!-- 자동 생성 파일입니다. 직접 고치지 말고 src/ 폴더를 고친 뒤 build.py(또는 start-windows.bat)를 실행하세요. -->\n"


def build():
    html = (SRC / "index.html").read_text(encoding="utf-8")

    def css(m):
        text = (SRC / m.group(1)).read_text(encoding="utf-8")
        return f"<style>/* {m.group(1)} */\n{text}\n</style>"

    def js(m):
        text = (SRC / m.group(1)).read_text(encoding="utf-8").replace("</script", "<\\/script")
        return f"<script>/* {m.group(1)} */\n{text}\n</script>"

    html = re.sub(r'<link rel="stylesheet" href="((?:css|vendor)/[^"]+)">', css, html)
    html = re.sub(r'<script src="((?:js|vendor)/[^"]+)"></script>', js, html)
    left = re.findall(r'(?:href|src)="(?!https?:|data:|#)([^"]+)"', html)
    if left:
        raise SystemExit(f"합치지 못한 파일이 있습니다: {left}")
    html = html.replace("<!doctype html>", "<!doctype html>\n" + NOTICE, 1)
    OUT.write_text(html, encoding="utf-8")
    return OUT


if __name__ == "__main__":
    print(f"완료: {build()}")
