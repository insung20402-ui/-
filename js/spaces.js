function allTags() {
  const set = new Set();
  SPACES.forEach(s => s.tags.forEach(t => set.add(t)));
  return Array.from(set);
}

function renderSpaceCards(filterTag) {
  const grid = document.getElementById("space-grid");
  const list = filterTag ? SPACES.filter(s => s.tags.includes(filterTag)) : SPACES;
  grid.innerHTML = list.map(s => `
    <div class="space-card">
      <img src="../assets/images/${s.photos[0]}" alt="${s.name}" data-icon="${s.icon}">
      <div class="body">
        <h3>${s.name}</h3>
        <p class="summary">${s.summary}</p>
        <div class="tag-row">${s.tags.map(t => `<span class="tag">${t}</span>`).join("")}</div>
        <a class="detail-btn" href="detail.html?id=${s.id}">자세히 보기</a>
      </div>
    </div>
  `).join("");
}

function renderFilterBar() {
  const bar = document.getElementById("filter-bar");
  const tags = ["전체", ...allTags()];
  bar.innerHTML = tags.map((t, i) =>
    `<button data-tag="${t}" class="${i === 0 ? "active" : ""}">${t}</button>`
  ).join("");
  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    bar.querySelectorAll("button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tag = btn.dataset.tag;
    renderSpaceCards(tag === "전체" ? null : tag);
  });
}

window.addEventListener("DOMContentLoaded", () => {
  renderFilterBar();
  renderSpaceCards(null);
});
