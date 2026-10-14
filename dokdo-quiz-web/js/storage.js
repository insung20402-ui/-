/**
 * 결과 저장소 어댑터
 * 어떤 백엔드를 쓰든 화면 코드는 아래 세 함수만 사용합니다.
 *   Storage.save(record)          → Promise
 *   Storage.subscribe(onRows)     → 결과 목록이 바뀔 때마다 onRows(rows) 호출 (Firebase는 실시간)
 *   Storage.label                 → 현재 저장소 이름
 *
 * record 형식
 * {
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
  const firebaseReady = () => APP_CONFIG.BACKEND === "firebase" && APP_CONFIG.FIREBASE.apiKey && APP_CONFIG.FIREBASE.projectId;
  const sheetsReady = () => APP_CONFIG.BACKEND === "sheets" && APP_CONFIG.SHEETS_URL;

  const api = { label: "이 브라우저 (테스트 모드)" };
  let impl = null;

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
      async save(rec) { await fs.addDoc(col, { ...rec, createdAt: fs.serverTimestamp() }); },
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

  // ── claude.ai 아티팩트에서 열었을 때: 아티팩트 공유 DB ──
  async function makeClaudeDb() {
    if (!(window.claude && window.claude.use)) return null;
    const db = await window.claude.use("db").catch(() => null);
    if (!db) return null;
    const col = db.collection("results");
    return {
      label: "공유 기록 (실시간)",
      async save(rec) { await col.add(rec); },
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
    try { await s.save(rec); return true; }
    catch (e) { console.error(e); if (s !== local) await local.save(rec); return false; }
  };
  api.subscribe = async (fn) => (await ready).subscribe(fn);
  return api;
})();
