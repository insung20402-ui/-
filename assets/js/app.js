async function loadTour() {
  const res = await fetch("data/tour.json");
  return res.json();
}

function buildFloorTabs(floors) {
  const tabs = document.getElementById("floor-tabs");
  floors.forEach((floor, index) => {
    const btn = document.createElement("button");
    btn.className = "floor-tab" + (index === 0 ? " active" : "");
    btn.textContent = floor.label;
    btn.dataset.floorId = floor.id;
    btn.addEventListener("click", () => selectFloor(floor.id));
    tabs.appendChild(btn);
  });
}

function buildFloorPanels(floors) {
  const panels = document.getElementById("floor-panels");
  floors.forEach((floor, index) => {
    const panel = document.createElement("section");
    panel.className = "floor-panel" + (index === 0 ? " active" : "");
    panel.id = `panel-${floor.id}`;

    const grid = document.createElement("div");
    grid.className = "location-grid";

    floor.locations.forEach((loc) => {
      const card = document.createElement("button");
      card.className = "location-card";
      card.innerHTML = `
        <div class="card-thumb">
          <img src="${loc.thumbnail}" alt="${loc.name}" loading="lazy">
          <div class="play-badge"></div>
        </div>
        <div class="card-body">
          <h3>${loc.name}</h3>
          <p>${loc.description ?? ""}</p>
        </div>
      `;
      card.addEventListener("click", () => openVideo(loc));
      grid.appendChild(card);
    });

    panel.appendChild(grid);
    panels.appendChild(panel);
  });
}

function selectFloor(floorId) {
  document.querySelectorAll(".floor-tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.floorId === floorId);
  });
  document.querySelectorAll(".floor-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `panel-${floorId}`);
  });
}

function openVideo(loc) {
  const modal = document.getElementById("video-modal");
  const player = document.getElementById("video-player");
  document.getElementById("video-title").textContent = loc.name;
  document.getElementById("video-description").textContent = loc.description ?? "";
  player.src = loc.video;
  player.poster = loc.thumbnail ?? "";
  modal.hidden = false;
  player.play().catch(() => {});
}

function closeVideo() {
  const modal = document.getElementById("video-modal");
  const player = document.getElementById("video-player");
  player.pause();
  player.removeAttribute("src");
  player.load();
  modal.hidden = true;
}

function initModalClose() {
  document.querySelectorAll("[data-close]").forEach((el) => {
    el.addEventListener("click", closeVideo);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeVideo();
  });
}

async function init() {
  const data = await loadTour();
  document.title = data.title ?? document.title;
  buildFloorTabs(data.floors);
  buildFloorPanels(data.floors);
  initModalClose();
}

init();
