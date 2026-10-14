/**
 * 통계 집계 + Chart.js 그래프
 */
const Stats = (() => {
  const byId = new Map(QUESTION_BANK.map((q) => [q.id, q]));
  const charts = {};
  const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  // rows(결과 목록) → 문항별 { id, n, ok, wrong, rate, q }
  function perQuestion(rows) {
    const m = new Map();
    (rows || []).forEach((r) => (r.answers || []).forEach((a) => {
      const s = m.get(a.id) || { id: a.id, n: 0, ok: 0 };
      s.n++; if (a.correct) s.ok++;
      m.set(a.id, s);
    }));
    return [...m.values()].map((s) => ({ ...s, wrong: s.n - s.ok, rate: s.ok / s.n, q: byId.get(s.id) }));
  }
  const topCorrect = (list, n = 3) => list.filter((s) => s.ok > 0).sort((a, b) => b.ok - a.ok || b.rate - a.rate).slice(0, n);
  const topWrong = (list, n = 3) => list.filter((s) => s.wrong > 0).sort((a, b) => b.wrong - a.wrong || a.rate - b.rate).slice(0, n);

  const short = (s) => {
    const t = s.q ? s.q.question : s.id;
    return [`${s.id}`, t.length > 8 ? t.slice(0, 8) + "…" : t];
  };

  function baseOptions(horizontal, max) {
    const tick = css("--ink-2"), grid = "rgba(255,255,255,0.08)";
    return {
      responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? "y" : "x",
      animation: { duration: 400 },
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: tick, font: { family: "Noto Sans KR" }, maxRotation: 0, autoSkip: false }, grid: { color: horizontal ? grid : "transparent" },
             ...(horizontal && max ? { max } : {}), beginAtZero: true },
        y: { ticks: { color: tick, font: { family: "Noto Sans KR" }, precision: 0 }, grid: { color: horizontal ? "transparent" : grid },
             beginAtZero: true, ...(!horizontal && max ? { max } : {}) }
      }
    };
  }

  // 툴팁: 문제 전체 문장 + 응답 수치
  function tooltip(items, valueText) {
    return {
      backgroundColor: "rgba(2,12,27,0.92)", borderColor: "rgba(255,255,255,0.2)", borderWidth: 1,
      titleFont: { family: "Noto Sans KR", weight: "700" }, bodyFont: { family: "Noto Sans KR" }, padding: 10,
      callbacks: {
        title: (ctx) => {
          const s = items[ctx[0].dataIndex];
          const text = `${s.id} · ${s.q ? s.q.question : "(삭제된 문항)"}`;
          return text.match(/.{1,28}/g); // 길면 여러 줄로
        },
        label: (ctx) => valueText(items[ctx.dataIndex])
      }
    };
  }

  function draw(canvasId, config, emptyText) {
    const el = document.getElementById(canvasId);
    if (!el || !window.Chart) return;
    if (charts[canvasId]) { charts[canvasId].destroy(); delete charts[canvasId]; }
    const box = el.parentElement;
    if (!config.data.labels.length) { box.dataset.empty = emptyText || "아직 데이터가 없어요"; return; }
    delete box.dataset.empty;
    Chart.defaults.font.family = "Noto Sans KR, system-ui, sans-serif";
    charts[canvasId] = new Chart(el, config);
  }

  function barChart(canvasId, items, kind) {
    const isOk = kind === "ok";
    const color = isOk ? css("--series-ok") : css("--series-bad");
    const opts = baseOptions(false);
    opts.plugins.tooltip = tooltip(items, (s) => `응답 ${s.n}명 · 맞힘 ${s.ok} · 틀림 ${s.wrong} · 정답률 ${Math.round(s.rate * 100)}%`);
    draw(canvasId, {
      type: "bar",
      data: {
        labels: items.map(short),
        datasets: [{ data: items.map((s) => (isOk ? s.ok : s.wrong)), backgroundColor: color,
          borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: "bottom", maxBarThickness: 56 }]
      },
      options: opts
    }, isOk ? "아직 맞힌 문제가 없어요" : "아직 틀린 문제가 없어요 👏");
  }

  function rateChart(canvasId, list) {
    const items = list.slice().sort((a, b) => a.rate - b.rate);
    const box = document.getElementById(canvasId).parentElement;
    box.style.height = Math.max(160, items.length * 30 + 40) + "px";
    const opts = baseOptions(true, 100);
    opts.scales.x.ticks.callback = (v) => v + "%";
    opts.plugins.tooltip = tooltip(items, (s) => `정답률 ${Math.round(s.rate * 100)}% (응답 ${s.n}명 중 ${s.ok}명)`);
    draw(canvasId, {
      type: "bar",
      data: {
        labels: items.map((s) => s.id),
        datasets: [{ data: items.map((s) => Math.round(s.rate * 100)), backgroundColor: css("--series-ok"),
          borderRadius: { topRight: 4, bottomRight: 4 }, borderSkipped: "left", maxBarThickness: 18 }]
      },
      options: opts
    });
  }

  return { perQuestion, topCorrect, topWrong, barChart, rateChart };
})();
