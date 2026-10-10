"""손떨림 보정: 프레임 간 움직임을 추정해 떨림(상하/기울기/급한 좌우)만 제거하고 천천히 도는 움직임은 유지.

사용법: python3 tools/stabilize.py 영상.mp4 출력폴더 [fps=20] [max_w=1280]
"""
import cv2, numpy as np, sys, os

src, out = sys.argv[1], sys.argv[2]
fps = float(sys.argv[3]) if len(sys.argv) > 3 else 20
mw = int(sys.argv[4]) if len(sys.argv) > 4 else 1280
os.makedirs(out, exist_ok=True)
for f in os.listdir(out): os.remove(os.path.join(out, f))

cap = cv2.VideoCapture(src); sfps = cap.get(cv2.CAP_PROP_FPS); n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
step = sfps / fps; frames = []; t = 0.0
for i in range(n):
    ok, f = cap.read()
    if not ok: break
    if i + 1e-6 >= t:
        s = mw / max(f.shape[:2]); frames.append(cv2.resize(f, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)); t += step
gray = [cv2.cvtColor(f, cv2.COLOR_BGR2GRAY) for f in frames]

# 1) 프레임 간 이동량 (dx, dy, 회전)
tr = [(0, 0, 0)]
for a, b in zip(gray[:-1], gray[1:]):
    p0 = cv2.goodFeaturesToTrack(a, 400, 0.01, 12)
    dx = dy = da = 0
    if p0 is not None:
        p1, st, _ = cv2.calcOpticalFlowPyrLK(a, b, p0, None)
        ok = st.ravel() == 1
        if ok.sum() >= 8:
            m, _ = cv2.estimateAffinePartial2D(p0[ok], p1[ok], method=cv2.RANSAC, ransacReprojThreshold=3)
            if m is not None: dx, dy, da = m[0, 2], m[1, 2], np.arctan2(m[1, 0], m[0, 0])
    tr.append((dx, dy, da))
path = np.cumsum(np.array(tr), axis=0)

def smooth(x, sigma):
    r = int(sigma * 3) or 1; k = np.exp(-np.arange(-r, r + 1) ** 2 / (2 * sigma ** 2)); k /= k.sum()
    xp = np.pad(x, (r, r), mode='edge'); return np.convolve(xp, k, mode='valid')

# 2) 의도한 움직임(느린 성분)만 남기도록 강하게 평활화
sm = np.stack([smooth(path[:, 0], fps * 0.35), smooth(path[:, 1], fps * 0.8), smooth(path[:, 2], fps * 0.8)], 1)
corr = sm - path
def jitter(p): return float(np.mean(np.abs(np.diff(p[:, :2], 2, axis=0))))
print(f"프레임 {len(frames)}장, 떨림(2차 변화량) {jitter(path):.2f}px -> {jitter(sm):.2f}px")

# 3) 보정 적용 + 가장자리 잘라내기(확대)
Z = 1.12
for k, f in enumerate(frames):
    h, w = f.shape[:2]; dx, dy, da = corr[k]
    M = cv2.getRotationMatrix2D((w / 2, h / 2), -np.degrees(da), Z)
    M[0, 2] += dx; M[1, 2] += dy
    g = cv2.warpAffine(f, M, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
    cv2.imwrite(os.path.join(out, f"{k:03d}.jpg"), g, [cv2.IMWRITE_JPEG_QUALITY, 74])
print(len(frames))
