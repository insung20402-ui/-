"""영상 -> 로드뷰 프레임 변환 (흔들린 프레임 제거 + 사람 블러).

사용법: python3 tools/build_frames.py tours.config.json
"""
import json, sys, os, cv2, numpy as np

cfg = json.load(open(sys.argv[1]))
OUT = cfg.get("out", "site")
hog = cv2.HOGDescriptor()
hog.setSVMDetector(cv2.HOGDescriptor_getDefaultPeopleDetector())
face = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
profile = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_profileface.xml")

def sharp(img):
    return cv2.Laplacian(cv2.cvtColor(img, cv2.COLOR_BGR2GRAY), cv2.CV_64F).var()

def pixelate(img, box, pad=0.25, blocks=8):
    x, y, w, h = box
    px, py = int(w * pad), int(h * pad)
    x0, y0 = max(0, x - px), max(0, y - py)
    x1, y1 = min(img.shape[1], x + w + px), min(img.shape[0], y + h + py)
    roi = img[y0:y1, x0:x1]
    if roi.size == 0: return
    small = cv2.resize(roi, (max(1, (x1 - x0) // blocks * 0 + blocks), max(1, blocks * (y1 - y0) // max(1, x1 - x0) + 1)),
                       interpolation=cv2.INTER_LINEAR)
    img[y0:y1, x0:x1] = cv2.resize(small, (x1 - x0, y1 - y0), interpolation=cv2.INTER_NEAREST)

def hide_people(img, mode, manual):
    if mode == "none" and not manual: return 0
    """얼굴 + 사람 몸 감지 후 모자이크. manual: 비율 좌표 [x,y,w,h] 고정 영역."""
    H, W = img.shape[:2]
    scale = 640 / W
    small = cv2.resize(img, None, fx=scale, fy=scale)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    n = 0
    for cl in (face, profile):
        for (x, y, w, h) in cl.detectMultiScale(gray, 1.1, 5, minSize=(20, 20)):
            pixelate(img, tuple(int(v / scale) for v in (x, y, w, h)), 0.3); n += 1
    if mode == "body":
        rects, wts = hog.detectMultiScale(small, winStride=(8, 8), padding=(8, 8), scale=1.05)
        for (x, y, w, h), wt in zip(rects, np.ravel(wts)):
            # 신뢰도 낮거나 사람 비율(세로로 길쭉)이 아닌 것은 오탐으로 보고 무시
            if wt < 1.3 or h < 1.6 * w: continue
            pixelate(img, tuple(int(v / scale) for v in (x, y, w, h)), 0.05, 12); n += 1
    for (fx, fy, fw, fh) in manual:
        pixelate(img, (int(fx * W), int(fy * H), int(fw * W), int(fh * H)), 0, 10); n += 1
    return n

tours = []
for t in cfg["tours"]:
    d = os.path.join(OUT, "frames", t["id"]); os.makedirs(d, exist_ok=True)
    for f in os.listdir(d): os.remove(os.path.join(d, f))
    cap = cv2.VideoCapture(t["video"])
    fps = cap.get(cv2.CAP_PROP_FPS); total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    step = max(1, round(fps / t.get("fps", 2)))
    cands = []
    for i in range(0, total, step):
        cap.set(cv2.CAP_PROP_POS_FRAMES, i); ok, fr = cap.read()
        if not ok: break
        s = t.get("max_w", 1280) / max(fr.shape[:2])
        fr = cv2.resize(fr, None, fx=s, fy=s, interpolation=cv2.INTER_AREA) if s < 1 else fr
        cands.append((sharp(fr), fr))
    # 흔들린 프레임 제거: 이웃 프레임보다 선명도가 크게 낮으면 버림
    keep = []
    for k, (sc, fr) in enumerate(cands):
        nb = [cands[j][0] for j in range(max(0, k - 2), min(len(cands), k + 3)) if j != k]
        if nb and sc < 0.55 * np.median(nb): continue
        keep.append(fr)
    blurred = 0
    # pick: 흐린 프레임을 거른 뒤 N장만 일정한 간격으로 선택 (예: 복도 5장)
    if t.get("pick") and len(keep) > t["pick"]:
        keep = [keep[round(j * (len(keep) - 1) / (t["pick"] - 1))] for j in range(t["pick"])]
    # drop: 사람이 크게 나오는 프레임 번호(0부터, 흔들린 프레임 제거 후 기준)는 통째로 제외
    drop = set(t.get("drop", []))
    keep = [fr for k, fr in enumerate(keep) if k not in drop]
    for k, fr in enumerate(keep):
        n = hide_people(fr, t.get("people", "body"), t.get("manual_mask", []))
        if n: print("  가림:", t["id"], k, n)
        blurred += n
        cv2.imwrite(os.path.join(d, f"{k:03d}.jpg"), fr, [cv2.IMWRITE_JPEG_QUALITY, 74])
    print(f'{t["id"]}: {len(cands)}장 중 {len(keep)}장 사용, 가린 영역 {blurred}곳')
    tours.append({"id": t["id"], "title": t["title"], "type": t.get("type", "walk"),
                  "count": len(keep), "ext": "jpg"})
json.dump({"tours": tours}, open(os.path.join(OUT, "tours.json"), "w"), ensure_ascii=False, indent=1)
# file:// 로 바로 열어도 동작하도록 같은 내용을 tours.js 로도 저장
open(os.path.join(OUT, "tours.js"), "w").write("window.TOURS = " + json.dumps({"tours": tours}, ensure_ascii=False) + ";")
