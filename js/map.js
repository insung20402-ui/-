const places = [
  { id: "gym1", name: "헬스장 1 (메인 웨이트존)", floor: "층 정보 입력 필요", desc: "스미스 머신, 벤치프레스, 레그머신 등 메인 웨이트 트레이닝 공간" },
  { id: "gym2", name: "헬스장 2 (보조 트레이닝존)", floor: "층 정보 입력 필요", desc: "랫풀다운, 백 익스텐션, 풀업 스테이션 등 보조 운동기구" },
  { id: "multi", name: "다목적실 (당구·탁구·양궁장)", floor: "층 정보 입력 필요", desc: "당구대, 탁구대, 양궁 사격존" },
  { id: "mansuro", name: "만수로 (학생 휴게공간)", floor: "3층", desc: "쿠션 벤치와 모둠 테이블이 있는 휴게 공간" },
  { id: "art", name: "미술실", floor: "4층", desc: "모둠 작업 테이블과 작품 전시 게시판이 있는 미술 교실" },
  { id: "homebase", name: "홈베이스", floor: "4층 중앙", desc: "나무 평상 테이블이 있는 다목적 휴게 공간" },
  { id: "library", name: "도서관", floor: "층 정보 입력 필요", desc: "분야별 서가와 열람공간이 있는 도서관" },
  { id: "basketball", name: "농구장", floor: "운동장 (실외)", desc: "농구 골대 2개가 설치된 실외 코트" }
];

function buildOptions(select) {
  select.innerHTML = '<option value="">선택하세요</option>' +
    places.map(p => `<option value="${p.id}">${p.name} (${p.floor})</option>`).join("");
}

function findPlace(id) {
  return places.find(p => p.id === id);
}

function renderRoute() {
  const fromId = document.getElementById("from").value;
  const toId = document.getElementById("to").value;
  const result = document.getElementById("result");

  if (!fromId || !toId) {
    result.innerHTML = "<p>출발지와 목적지를 모두 선택해주세요.</p>";
    return;
  }
  if (fromId === toId) {
    result.innerHTML = "<p>출발지와 목적지가 동일합니다.</p>";
    return;
  }

  const from = findPlace(fromId);
  const to = findPlace(toId);

  result.innerHTML = `
    <div class="route-card">
      <p><strong>${from.name}</strong> (${from.floor}) → <strong>${to.name}</strong> (${to.floor})</p>
      <ol>
        <li>${from.name}에서 나와 가장 가까운 계단 또는 복도로 이동합니다.</li>
        <li>${to.floor}로 이동합니다.</li>
        <li>${to.name} 표지판을 따라가면 도착합니다 — ${to.desc}</li>
      </ol>
      <p class="route-note">※ 정확한 층별 평면도가 등록되면 더 자세한 경로로 업데이트됩니다.</p>
    </div>
  `;
}

window.addEventListener("DOMContentLoaded", () => {
  const from = document.getElementById("from");
  const to = document.getElementById("to");
  buildOptions(from);
  buildOptions(to);
  document.getElementById("find-route").addEventListener("click", renderRoute);

  const list = document.getElementById("place-list");
  list.innerHTML = places.map(p => `
    <li><strong>${p.name}</strong> <span class="floor-tag">${p.floor}</span><br>${p.desc}</li>
  `).join("");
});
