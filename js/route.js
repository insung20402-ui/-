function buildToOptions(select, presetId) {
  select.innerHTML = '<option value="">목적지를 선택하세요</option>' +
    SPACES.map(s => `<option value="${s.id}" ${s.id === presetId ? "selected" : ""}>${s.name} (${s.floor})</option>`).join("");
}

function renderRoute(toId) {
  const result = document.getElementById("result");
  if (!toId) {
    result.innerHTML = "<p>목적지를 선택해주세요.</p>";
    return;
  }
  const space = SPACES.find(s => s.id === toId);
  const steps = ROUTES[toId] || [];

  result.innerHTML = `
    <h3 style="margin-bottom:10px;color:#1b2a6b;">정문 &rarr; ${space.name}</h3>
    <div class="step-card-list">
      ${steps.map((s, i) => `
        <div class="step-card">
          <span class="step-num">${i + 1}</span>
          <span>${s}</span>
        </div>
      `).join("")}
    </div>
    <p class="route-note">※ 정확한 층별 평면도가 등록되면 더 자세한 경로로 업데이트됩니다.</p>
  `;
}

window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const presetId = params.get("to");
  const select = document.getElementById("to");
  buildToOptions(select, presetId);
  document.getElementById("find-route").addEventListener("click", () => renderRoute(select.value));
  if (presetId) renderRoute(presetId);
});
