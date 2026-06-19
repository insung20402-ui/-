function renderTopNav(activeId, basePath) {
  const items = [
    { id: "home", label: "홈", href: basePath + "index.html" },
    { id: "exterior", label: "학교 외관", href: basePath + "pages/exterior.html" },
    { id: "spaces", label: "공간 둘러보기", href: basePath + "pages/spaces.html" },
    { id: "route", label: "정문에서 길찾기", href: basePath + "pages/route.html" },
    { id: "courses", label: "추천 방문 코스", href: basePath + "pages/courses.html" },
    { id: "qna", label: "도슨트 Q&A", href: basePath + "pages/qna.html" },
    { id: "quiz", label: "공간 퀴즈", href: basePath + "pages/quiz.html" }
  ];
  const nav = document.getElementById("top-nav");
  if (!nav) return;
  nav.innerHTML = items.map(it =>
    `<a href="${it.href}" class="${it.id === activeId ? "active" : ""}">${it.label}</a>`
  ).join("");
}
