/**
 * 결과 저장소 어댑터
 * 어떤 백엔드를 쓰든 화면 코드는 아래 세 함수만 사용합니다.
 *   Storage.save(record)          → Promise
 *   Storage.subscribe(onRows)     → 결과 목록이 바뀔 때마다 onRows(rows) 호출 (Firebase는 실시간)
 *   Storage.label                 → 현재 저장소 이름
 *   Storage.checkPlayed()         → 이 휴대폰으로 이미 참여했으면 그 기록, 아니면 null
 *   Storage.save() 결과           → "ok" | "already"(이 휴대폰은 이미 참여) | "failed"
 *
 * record 형식
 * {
 *   grade: 1, klass: 3, num: 12,              // 학년, 반, 번호
 *   name: "홍길동",
 *   score: 85,
 *   finishedAt: "2026-10-20T08:15:32.000Z",   // 풀이 완료 시각
 *   finishedAtText: "2026-10-20 17:15:32",    // 보기 좋은 한국 시각
 *   durationSec: 143,                         // 걸린 시간(초)
 *   correctCount: 8,
 *   answers: [{ id: "Q005", correct: true }, …]  // 문항별 맞춤/틀림 (통계용)
 * }
 */
const Storage = (() => {
  const LOCAL_KEY = "dokdoQuizWebResults";
  const want = (name) => APP_CONFIG.BACKEND === "auto" || APP_CONFIG.BACKEND === name;
  const firebaseReady = () => want("firebase") && APP_CONFIG.FIREBASE.apiKey && APP_CONFIG.FIREBASE.projectId;
  const sheetsReady = () => want("sheets") && APP_CONFIG.SHEETS_URL;

  const api = { label: "이 브라우저 (테스트 모드)" };
  let impl = null;
  const ONE_TRY = !!APP_CONFIG.ONE_TRY_PER_DEVICE;
  const ALREADY = new Error("already");
  const PLAYED_KEY = "dokdoQuizWebPlayed";

  // 휴대폰(브라우저)마다 하나씩 만드는 무작위 번호. localStorage와 쿠키 두 곳에 보관
  const deviceId = (() => {
    const fromCookie = (document.cookie.match(/(?:^|; )dokdoDevice=([a-f0-9]{32})/) || [])[1];
    let id = null;
    try { id = localStorage.getItem("dokdoQuizDeviceId"); } catch {}
    id = id || fromCookie;
    if (!id) {
      const b = new Uint8Array(16);
      crypto.getRandomValues(b);
      id = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    }
    try { localStorage.setItem("dokdoQuizDeviceId", id); } catch {}
    document.cookie = `dokdoDevice=${id}; max-age=${60 * 60 * 24 * 400}; path=/; SameSite=Lax`;
    return id;
  })();
  const localPlayed = () => { try { return JSON.parse(localStorage.getItem(PLAYED_KEY) || "null"); } catch { return null; } };
  const markPlayed = (rec) => { try { localStorage.setItem(PLAYED_KEY, JSON.stringify(rec)); } catch {} };

  // ── 이 브라우저에만 저장 ──
  const local = {
    label: "이 브라우저 (테스트 모드)",
    read() { try { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "[]"); } catch { return []; } },
    async save(rec) {
      const rows = local.read(); rows.push(rec);
      try { localStorage.setItem(LOCAL_KEY, JSON.stringify(rows.slice(-1000))); } catch {}
      local.listeners.forEach((fn) => fn(rows));
    },
    listeners: [],
    subscribe(fn) { local.listeners.push(fn); fn(local.read()); }
  };

  // ── Firebase Firestore ──
  async function makeFirebase() {
    const V = "10.12.2";
    const { initializeApp } = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`);
    const fs = await import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`);
    const db = fs.getFirestore(initializeApp(APP_CONFIG.FIREBASE));
    const col = fs.collection(db, APP_CONFIG.FIREBASE_COLLECTION);
    return {
      label: "Firebase (실시간)",
      // 한 번만 모드: 문서 번호를 휴대폰 번호로 저장 → 보안 규칙이 같은 번호로 두 번 저장(수정)하는 것을 막음
      async check() { const d = await fs.getDoc(fs.doc(col, deviceId)); return d.exists() ? d.data() : null; },
      async save(rec) {
        const data = { ...rec, createdAt: fs.serverTimestamp() };
        if (!ONE_TRY) return void await fs.addDoc(col, data);
        if ((await fs.getDoc(fs.doc(col, deviceId))).exists()) throw ALREADY;
        await fs.setDoc(fs.doc(col, deviceId), data);
      },
      subscribe(fn) {
        const q = fs.query(col, fs.orderBy("finishedAt", "desc"), fs.limit(2000));
        fs.onSnapshot(q, (snap) => fn(snap.docs.map((d) => d.data())), (err) => {
          console.error(err); fn(null, "Firebase에서 기록을 읽지 못했어요. (보안 규칙을 확인하세요)");
        });
      }
    };
  }

  // ── 구글 스프레드시트 (Apps Script) ──
  function makeSheets() {
    return {
      label: "구글 스프레드시트",
      async save(rec) {
        await fetch(APP_CONFIG.SHEETS_URL, {
          method: "POST", mode: "no-cors",
          headers: { "Content-Type": "text/plain;charset=utf-8" },
          body: JSON.stringify(rec)
        });
      },
      subscribe(fn) {
        const pull = () => fetch(APP_CONFIG.SHEETS_URL).then((r) => r.json()).then((rows) => fn(rows))
          .catch(() => fn(null, "구글 스프레드시트에서 기록을 읽지 못했어요."));
        pull();
        setInterval(pull, 30000); // 30초마다 새로고침
      }
    };
  }

  // ── 미니 PC 서버 (server.py) ──
  async function makeServer() {
    if (!want("server") || !/^https?:$/.test(location.protocol)) return null;
    try {
      const res = await fetch("api/results", { cache: "no-store" });
      if (!res.ok || !(res.headers.get("content-type") || "").includes("json")) return null;
    } catch { return null; }
    let pull = null;
    return {
      label: "미니 PC 서버",
      async check() {
        const res = await fetch("api/check?device=" + deviceId, { cache: "no-store" });
        const j = await res.json();
        return j.played ? j.record : null;
      },
      async save(rec) {
        const res = await fetch("api/results", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify(ONE_TRY ? { ...rec, deviceId } : rec)
        });
        if (res.status === 409) throw ALREADY;
        if (!res.ok) throw new Error("server " + res.status);
        if (pull) pull(); // 저장 직후 통계 바로 갱신
      },
      subscribe(fn) {
        pull = () => fetch("api/results", { cache: "no-store" }).then((r) => r.json()).then((rows) => fn(rows))
          .catch(() => fn(null, "미니 PC 서버에 연결하지 못했어요."));
        pull();
        setInterval(pull, 5000); // 5초마다 새 기록 확인
      }
    };
  }

  // ── claude.ai 아티팩트에서 열었을 때: 아티팩트 공유 DB ──
  async function makeClaudeDb() {
    if (!(window.claude && window.claude.use)) return null;
    const db = await window.claude.use("db").catch(() => null);
    if (!db) return null;
    const col = db.collection("results");
    return {
      label: "공유 기록 (실시간)",
      async check() { const d = await col.doc(deviceId).get(); return d.exists ? d.data() : null; },
      async save(rec) {
        if (!ONE_TRY) return void await col.add(rec);
        if ((await col.doc(deviceId).get()).exists) throw ALREADY;
        await col.doc(deviceId).set(rec);
      },
      subscribe(fn) {
        col.orderBy("finishedAt", "desc").limit(1000).onSnapshot(
          (snap) => fn(snap.docs.map((d) => d.data())),
          () => fn(null, "공유 기록을 읽지 못했어요."));
      }
    };
  }

  const ready = (async () => {
    try {
      impl = (await makeClaudeDb())
        || (firebaseReady() ? await makeFirebase() : null)
        || (await makeServer())
        || (sheetsReady() ? makeSheets() : null)
        || local;
    } catch (e) {
      console.error("저장소 연결 실패, 테스트 모드로 전환", e);
      impl = local;
    }
    api.label = impl.label;
    return impl;
  })();

  api.ready = ready;
  api.save = async (rec) => {
    const s = await ready;
    try { await s.save(rec); if (ONE_TRY) markPlayed(rec); return "ok"; }
    catch (e) {
      if (e === ALREADY) return "already";
      console.error(e);
      if (s !== local) await local.save(rec);
      if (ONE_TRY) markPlayed(rec);
      return "failed";
    }
  };
  // 서버·Firebase처럼 기록을 모으는 곳이 있으면 그쪽 판단을 따름 (선생님이 기록을 지우면 다시 참여 가능)
  api.checkPlayed = async () => {
    if (!ONE_TRY) return null;
    const s = await ready;
    if (s.check) {
      try { return await s.check(); } catch (e) { console.error(e); }
    }
    return localPlayed();
  };
  api.subscribe = async (fn) => (await ready).subscribe(fn);
  return api;
})();
