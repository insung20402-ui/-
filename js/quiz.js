let qIndex = 0;
let score = 0;
let answered = false;

function renderQuiz() {
  const root = document.getElementById("quiz-root");

  if (qIndex >= QUIZ.length) {
    root.innerHTML = `
      <div class="quiz-card">
        <h3>퀴즈 완료!</h3>
        <p class="quiz-score">${QUIZ.length}문제 중 ${score}개를 맞혔어요.</p>
        <div class="quiz-footer">
          <button id="restart">다시 풀기</button>
        </div>
      </div>
    `;
    document.getElementById("restart").addEventListener("click", () => {
      qIndex = 0; score = 0; answered = false; renderQuiz();
    });
    return;
  }

  const item = QUIZ[qIndex];
  answered = false;
  root.innerHTML = `
    <div class="quiz-card">
      <h3>Q${qIndex + 1}. ${item.q}</h3>
      <div class="quiz-choices">
        ${item.choices.map((c, i) => `<button data-i="${i}">${c}</button>`).join("")}
      </div>
      <div class="quiz-footer">
        <span class="quiz-score">${qIndex + 1} / ${QUIZ.length}</span>
        <button id="next" style="display:none;">다음 문제</button>
      </div>
    </div>
  `;

  const choiceBtns = root.querySelectorAll(".quiz-choices button");
  choiceBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      if (answered) return;
      answered = true;
      const i = Number(btn.dataset.i);
      choiceBtns.forEach(b => {
        if (Number(b.dataset.i) === item.answer) b.classList.add("correct");
        else if (b === btn) b.classList.add("wrong");
      });
      if (i === item.answer) score++;
      document.getElementById("next").style.display = "inline-block";
    });
  });

  document.getElementById("next").addEventListener("click", () => {
    qIndex++;
    renderQuiz();
  });
}

window.addEventListener("DOMContentLoaded", renderQuiz);
