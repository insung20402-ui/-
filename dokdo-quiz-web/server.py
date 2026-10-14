#!/usr/bin/env python3
"""
독도 사진 퀴즈 — 미니 PC용 서버 (파이썬만 있으면 됨, 추가 설치 없음)

  실행:  python server.py            (기본 포트 8000)
         python server.py 8080       (포트 지정)

  - 이 폴더의 웹사이트(index.html, images/ …)를 학교 네트워크에 띄웁니다.
  - 학생들이 퀴즈를 마치면 결과를 data/ 폴더에 저장합니다.
      data/results.jsonl : 앱이 읽는 원본 기록
      data/results.csv   : 엑셀로 바로 열 수 있는 표 (학년, 반, 번호, 이름, 점수, 풀이 완료 시간 …)
  - 통계 화면은 data/results.jsonl 을 읽어 그래프를 그립니다.
  - 한 휴대폰에서 한 번만 참여: 휴대폰마다 무작위 번호(deviceId)를 받아, 같은 번호로 두 번째 기록이 오면 거절합니다.
    특정 학생을 다시 참여시키려면 data/results.jsonl 에서 그 학생의 줄을 지우세요. (메모장으로 열림)
"""
import re
import csv
import json
import socket
import sys
import threading
from datetime import datetime, timedelta, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
JSONL = DATA / "results.jsonl"
CSV = DATA / "results.csv"
KST = timezone(timedelta(hours=9))
LOCK = threading.Lock()
SAVE_LOCK = threading.Lock()
CSV_HEADERS = ["풀이 완료 시간", "학년", "반", "번호", "이름", "점수", "정답 수", "걸린 시간(초)", "문항별 결과"]


def clean(rec):
    """받은 기록을 검사하고 필요한 칸만 남긴다. 잘못되면 None."""
    try:
        grade, klass, num = int(rec["grade"]), int(rec["klass"]), int(rec["num"])
        score = int(rec["score"])
        name = str(rec["name"]).strip()[:12]
    except (KeyError, TypeError, ValueError):
        return None
    if not (1 <= grade <= 6 and 1 <= klass <= 30 and 1 <= num <= 50 and 0 <= score <= 100 and name):
        return None
    answers = []
    for a in (rec.get("answers") or [])[:10]:
        if isinstance(a, dict):
            answers.append({"id": str(a.get("id", ""))[:20], "correct": bool(a.get("correct"))})
    now = datetime.now(KST)
    device = str(rec.get("deviceId") or "")
    return {
        "deviceId": device if re.fullmatch(r"[a-f0-9]{32}", device) else "",
        "grade": grade, "klass": klass, "num": num, "name": name, "score": score,
        "finishedAt": now.isoformat(timespec="seconds"),
        "finishedAtText": now.strftime("%Y-%m-%d %H:%M:%S"),
        "durationSec": max(0, int(rec.get("durationSec") or 0)),
        "correctCount": max(0, int(rec.get("correctCount") or 0)),
        "answers": answers,
    }


def read_all():
    if not JSONL.exists():
        return []
    rows = []
    with JSONL.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    rows.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return rows


def public(rec):
    """브라우저에 보낼 때는 휴대폰 번호(deviceId)를 뺀다."""
    return {k: v for k, v in rec.items() if k != "deviceId"}


def find_device(device):
    if not device:
        return None
    return next((r for r in read_all() if r.get("deviceId") == device), None)


def append(rec):
    DATA.mkdir(exist_ok=True)
    with LOCK:
        with JSONL.open("a", encoding="utf-8") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        new_csv = not CSV.exists()
        # utf-8-sig: 엑셀에서 한글이 깨지지 않게
        with CSV.open("a", encoding="utf-8-sig" if new_csv else "utf-8", newline="") as f:
            w = csv.writer(f)
            if new_csv:
                w.writerow(CSV_HEADERS)
            w.writerow([rec["finishedAtText"], rec["grade"], rec["klass"], rec["num"], rec["name"], rec["score"],
                        rec["correctCount"], rec["durationSec"],
                        " ".join(f'{a["id"]}:{"O" if a["correct"] else "X"}' for a in rec["answers"])])


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def _json(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/results":
            return self._json(200, [public(r) for r in read_all()])
        if path == "/api/check":
            m = re.search(r"device=([a-f0-9]{32})", self.path)
            found = find_device(m.group(1)) if m else None
            return self._json(200, {"played": bool(found), "record": public(found) if found else None})
        if path.startswith("/data/") or path.endswith(".py"):
            return self._json(403, {"error": "forbidden"})  # 원본 기록·서버 코드는 브라우저로 못 받게
        return super().do_GET()

    def do_POST(self):
        if self.path.split("?")[0] != "/api/results":
            return self._json(404, {"error": "not found"})
        length = int(self.headers.get("Content-Length") or 0)
        if length > 20000:
            return self._json(413, {"error": "too large"})
        try:
            rec = clean(json.loads(self.rfile.read(length).decode("utf-8")))
        except (json.JSONDecodeError, UnicodeDecodeError):
            rec = None
        if not rec:
            return self._json(400, {"error": "invalid"})
        with SAVE_LOCK:  # 두 탭에서 동시에 보내도 하나만 저장
            if rec["deviceId"] and find_device(rec["deviceId"]):
                return self._json(409, {"error": "already"})
            append(rec)
        return self._json(200, {"ok": True})

    def log_message(self, fmt, *args):
        if "/api/results" in (args[0] if args else "") and "POST" in (args[0] if args else ""):
            print(f"[{datetime.now(KST):%H:%M:%S}] 결과 저장됨")


def lan_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("10.255.255.255", 1))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    # src/ 에서 고친 문제·설정을 index.html 에 반영
    try:
        sys.path.insert(0, str(ROOT))
        import build
        build.build()
    except Exception as e:  # 합치기에 실패해도 기존 index.html 로 서버는 켬
        print(f"[알림] index.html 다시 만들기 실패 (기존 파일 사용): {e}")
    server = ThreadingHTTPServer(("0.0.0.0", port), Handler)
    print("=" * 56)
    print(" 독도 사진 퀴즈 서버가 켜졌습니다")
    print(f"  이 PC에서 열기  : http://localhost:{port}")
    print(f"  학생 접속 주소  : http://{lan_ip()}:{port}   ← QR 코드로 만들어 공유")
    print(f"  결과 저장 위치  : {CSV}")
    print("  끄려면 이 창에서 Ctrl + C")
    print("=" * 56)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버를 종료합니다.")
