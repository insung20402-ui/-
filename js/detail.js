window.addEventListener("DOMContentLoaded", () => {
  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const space = SPACES.find(s => s.id === id);
  const root = document.getElementById("detail-root");

  if (!space) {
    root.innerHTML = "<p>해당 공간 정보를 찾을 수 없습니다.</p>";
    return;
  }

  root.innerHTML = `
    <div class="detail-gallery">
      ${space.photos.map(p => `<img src="../assets/images/${p}" alt="${space.name}">`).join("")}
    </div>
    <div class="detail-card">
      <span class="floor-badge">${space.floor}</span>
      <h2>${space.name} <small style="color:#888;font-size:0.8rem;">${space.subtitle}</small></h2>
      <p>${space.desc}</p>
      <strong>주요 시설 / 기구</strong>
      <div class="equipment-list">
        ${space.equipment.map(e => `<span>${e}</span>`).join("")}
      </div>
      <a class="route-link" href="route.html?to=${space.id}">정문에서 여기까지 길찾기</a>
    </div>
  `;
});
