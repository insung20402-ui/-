/* ============================================================
   방구석 심야식당 — app.js
   ============================================================ */

'use strict';

// ============================================================
// RECOMMENDATION DATA
// ============================================================

const DRINK_DATA = {
  '우울함': {
    high: {
      items: ['따뜻한 코코아', '핫초코', '유자차'],
      emojis: ['☕', '🍫', '🍋'],
      desc: '따뜻하게 마음을 녹여줄 위로의 음료예요. 한 모금 마시면 스르르 풀릴 거예요.',
      name: '위로의 온기 드링크'
    },
    low: {
      items: ['딸기라떼', '바나나우유', '복숭아아이스티'],
      emojis: ['🍓', '🍌', '🍑'],
      desc: '달콤하고 부드러운 맛이 우울함을 살살 달래줄 거예요.',
      name: '달콤 위로 음료'
    }
  },
  '분노': {
    any: {
      items: ['사이다', '탄산수', '레몬에이드'],
      emojis: ['🥤', '💧', '🍋'],
      desc: '짜릿한 탄산이 폭발하듯 속을 시원하게 뚫어줄 거예요. 꿀꺽!',
      name: '분노 해소 탄산'
    }
  },
  '뿌듯함': {
    any: {
      items: ['버블티', '딸기스무디', '망고주스'],
      emojis: ['🧋', '🍓', '🥭'],
      desc: '오늘 잘 해낸 나에게 주는 달콤한 보상! 충분히 받을 자격 있어요.',
      name: '셀프 보상 드링크'
    }
  },
  '피곤함': {
    high: {
      items: ['에너지드링크', '아이스 아메리카노', '비타민음료'],
      emojis: ['⚡', '☕', '💊'],
      desc: '지친 몸에 에너지 충전! 졸음을 날려버릴 파워 드링크예요.',
      name: '에너지 부스터'
    },
    low: {
      items: ['따뜻한 밀크티', '캐모마일차', '꿀물'],
      emojis: ['🍵', '🌼', '🍯'],
      desc: '편안하게 쉬어갈 시간이에요. 포근하고 달콤하게 몸을 녹여요.',
      name: '릴랙스 힐링티'
    }
  },
  '설렘': {
    any: {
      items: ['딸기라떼', '핑크레모네이드', '복숭아아이스티'],
      emojis: ['🍓', '🌸', '🍑'],
      desc: '두근두근 설레는 마음처럼 예쁘고 상큼한 음료예요.',
      name: '설렘 핑크 드링크'
    }
  },
  '심심함': {
    any: {
      items: ['콜라', '사이다', '초코우유'],
      emojis: ['🥤', '🫧', '🍫'],
      desc: '심심할 땐 역시 익숙하고 맛있는 게 최고죠. 편하게 즐겨요.',
      name: '무난하게 최고'
    }
  }
};

const SNACK_DATA = {
  '우울함': {
    high: {
      items: ['라면', '치킨', '떡볶이'],
      emojis: ['🍜', '🍗', '🌶️'],
      desc: '위로가 필요할 때는 역시 든든한 한 끼! 맛있는 거 먹으면 다 해결돼요.',
      name: '최강 위로 야식'
    },
    low: {
      items: ['과자', '아이스크림', '초콜릿'],
      emojis: ['🍪', '🍦', '🍫'],
      desc: '달달한 간식으로 기분 전환! 소소하게 먹으면서 힐링해요.',
      name: '달달 힐링 간식'
    }
  },
  '분노': {
    any: {
      items: ['매운라면', '불닭볶음면', '떡볶이'],
      emojis: ['🔥', '🌶️', '😤'],
      desc: '화날 때는 매운 거로 해소! 땀 흘리며 먹다 보면 화가 싹 풀려요.',
      name: '분노 폭발 매운맛'
    }
  },
  '뿌듯함': {
    any: {
      items: ['피자', '치킨', '족발'],
      emojis: ['🍕', '🍗', '🥩'],
      desc: '오늘 잘한 나를 위한 파티 메뉴! 거하게 먹을 자격 충분해요.',
      name: '셀프 파티 야식'
    }
  },
  '피곤함': {
    high: {
      items: ['편의점 도시락', '삼각김밥', '컵라면'],
      emojis: ['🍱', '🍙', '🍜'],
      desc: '힘들 때는 빠르고 간편하게! 최소한의 노력으로 최대의 배부름.',
      name: '초간편 편의점 세트'
    },
    low: {
      items: ['과자', '포테이토칩', '크래커'],
      emojis: ['🍟', '🥔', '🍘'],
      desc: '가볍게 바삭바삭하면서 쉬어가요. 무거운 건 내일의 나에게.',
      name: '가벼운 바삭 스낵'
    }
  },
  '설렘': {
    any: {
      items: ['떡볶이', '순대', '핫도그'],
      emojis: ['🌶️', '🥩', '🌭'],
      desc: '두근거리는 마음처럼 활기찬 길거리 음식! 분위기도 맛도 최고.',
      name: '설레는 길거리 분식'
    }
  },
  '심심함': {
    any: {
      items: ['과자세트', '팝콘', '젤리'],
      emojis: ['🍿', '🍬', '🍭'],
      desc: '영화 한 편 틀어놓고 뒹굴뒹굴. 이 조합이 제일 행복하죠.',
      name: '뒹굴이 심야 스낵'
    }
  }
};

const MUSIC_VIBES = {
  '우울함': ['잔잔한 재즈 🎷', '감성적인 인디음악 🎸', '로파이 힙합 🎧'],
  '분노': ['신나는 K-pop 🎤', '강렬한 록 음악 🎸', '빠른 비트의 EDM 🎵'],
  '뿌듯함': ['신나는 K-pop 🎤', '업비트 팝송 🎵', '흥겨운 펑크 🎺'],
  '피곤함': ['잔잔한 재즈 🎷', '힐링 어쿠스틱 🎸', '수면 유도 피아노 🎹'],
  '설렘': ['감성적인 인디음악 🎸', '로맨틱 팝 🎵', '두근두근 J-pop 🌸'],
  '심심함': ['편안한 플레이리스트 🎧', '유튜브 믹스 🎵', '레트로 팝송 📻']
};

// ============================================================
// STATE
// ============================================================

const state = {
  stressLevel: 5,
  selectedMoods: [],
  cravingType: null
};

// ============================================================
// HELPERS
// ============================================================

function isHighStress(level) {
  return level >= 7;
}

function getStressEmoji(level) {
  if (level <= 3) return { emoji: '😌', text: '꽤 평온해요' };
  if (level <= 5) return { emoji: '😐', text: '보통이에요' };
  if (level <= 7) return { emoji: '😟', text: '좀 힘드네요' };
  if (level <= 9) return { emoji: '😤', text: '많이 지쳤어요' };
  return { emoji: '💥', text: '폭발 직전이에요!' };
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ============================================================
// SCREEN NAVIGATION
// ============================================================

function showScreen(id) {
  const current = document.querySelector('.screen.active');
  if (current) {
    current.classList.add('exit-left');
    current.classList.remove('active');
    setTimeout(() => current.classList.remove('exit-left'), 400);
  }

  const next = document.getElementById(id);
  if (next) {
    // Small delay so transition looks smooth
    setTimeout(() => {
      next.classList.add('active');
      // Scroll to top
      next.scrollTop = 0;
    }, 50);
  }
}

// ============================================================
// STEP 1 — STRESS SLIDER
// ============================================================

function initStressSlider() {
  const slider = document.getElementById('stress-slider');
  const emojiEl = document.getElementById('stress-emoji');
  const textEl = document.getElementById('stress-level-text');

  function updateSlider(val) {
    const { emoji, text } = getStressEmoji(parseInt(val));
    emojiEl.textContent = emoji;
    textEl.textContent = `${val}단계 — ${text}`;

    // Pulse animation
    emojiEl.classList.remove('pulse');
    void emojiEl.offsetWidth; // reflow
    emojiEl.classList.add('pulse');

    // Update CSS gradient position
    const percent = ((val - 1) / 9) * 100;
    slider.style.background = `linear-gradient(90deg,
      var(--neon-cyan) 0%,
      var(--neon-purple) ${percent}%,
      rgba(255,255,255,0.1) ${percent}%)`;
  }

  // Init
  updateSlider(slider.value);

  slider.addEventListener('input', (e) => {
    state.stressLevel = parseInt(e.target.value);
    updateSlider(e.target.value);
  });
}

// ============================================================
// STEP 2 — MOOD SELECTION
// ============================================================

function initMoodCards() {
  const cards = document.querySelectorAll('.mood-card');

  cards.forEach(card => {
    card.addEventListener('click', () => {
      const mood = card.dataset.mood;
      card.classList.toggle('selected');

      if (card.classList.contains('selected')) {
        if (!state.selectedMoods.includes(mood)) {
          state.selectedMoods.push(mood);
        }
      } else {
        state.selectedMoods = state.selectedMoods.filter(m => m !== mood);
      }
    });
  });
}

// ============================================================
// STEP 3 — CRAVING TYPE
// ============================================================

function initCravingCards() {
  const cards = document.querySelectorAll('.craving-card');

  cards.forEach(card => {
    card.addEventListener('click', () => {
      cards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      state.cravingType = card.dataset.craving;
    });
  });
}

// ============================================================
// GET RECOMMENDATIONS
// ============================================================

function getRecommendations() {
  const moods = state.selectedMoods.length > 0
    ? state.selectedMoods
    : ['심심함']; // fallback

  const high = isHighStress(state.stressLevel);
  const results = { drinks: [], snacks: [] };

  moods.forEach(mood => {
    // DRINKS
    const drinkMood = DRINK_DATA[mood];
    if (drinkMood) {
      let entry = drinkMood.any || (high ? drinkMood.high : drinkMood.low)
        || drinkMood.high || drinkMood.low;
      if (entry && !results.drinks.find(d => d.name === entry.name)) {
        results.drinks.push({ ...entry, mood });
      }
    }

    // SNACKS
    const snackMood = SNACK_DATA[mood];
    if (snackMood) {
      let entry = snackMood.any || (high ? snackMood.high : snackMood.low)
        || snackMood.high || snackMood.low;
      if (entry && !results.snacks.find(s => s.name === entry.name)) {
        results.snacks.push({ ...entry, mood });
      }
    }
  });

  return results;
}

function getMusicVibe() {
  const moods = state.selectedMoods;
  if (moods.length === 0) return pickRandom(MUSIC_VIBES['심심함']);
  const mood = moods[0];
  const vibes = MUSIC_VIBES[mood] || MUSIC_VIBES['심심함'];
  return pickRandom(vibes);
}

// ============================================================
// RENDER RESULTS
// ============================================================

function createItemTags(items, emojis, type) {
  return items.map((item, i) =>
    `<span class="rec-item-tag">${emojis[i] || '✨'} ${item}</span>`
  ).join('');
}

function createRecCard(data, type) {
  const typeLabel = type === 'snack' ? '🍜 야식 추천' : type === 'drink' ? '🧋 음료 추천' : '🍿 오늘의 조합';
  const btnText = '이걸로 어때요? 👍';

  return `
    <div class="rec-card type-${type}">
      <div class="rec-card-type">${typeLabel}</div>
      <div class="rec-card-body">
        <span class="rec-card-emoji">${data.emojis[0] || '✨'}</span>
        <div class="rec-card-info">
          <div class="rec-card-name">${data.name}</div>
          <div class="rec-card-desc">${data.desc}</div>
          <div class="rec-card-items">
            ${createItemTags(data.items, data.emojis, type)}
          </div>
          <button class="rec-card-btn" onclick="this.textContent='✅ 골랐어요!'">
            ${btnText}
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderResults() {
  const { drinks, snacks } = getRecommendations();
  const craving = state.cravingType;
  const container = document.getElementById('result-cards');
  const subtitle = document.getElementById('result-subtitle');
  const musicVibeEl = document.getElementById('music-vibe');

  // Build subtitle
  const moodText = state.selectedMoods.length > 0
    ? state.selectedMoods.join(' + ')
    : '심심함';
  const stressText = isHighStress(state.stressLevel)
    ? '높은 스트레스'
    : '보통 상태';

  subtitle.textContent = `스트레스 ${state.stressLevel}단계 · ${moodText} · ${stressText}`;

  // Render cards
  let html = '';

  if (craving === 'snack' || craving === 'both') {
    if (snacks.length > 0) {
      html += createRecCard(snacks[0], 'snack');
    }
  }

  if (craving === 'drink' || craving === 'both') {
    if (drinks.length > 0) {
      html += createRecCard(drinks[0], 'drink');
    }
  }

  // Pairing suggestion if both
  if (craving === 'both' && snacks.length > 0 && drinks.length > 0) {
    const pairingData = {
      name: '오늘의 완벽 조합',
      desc: `${snacks[0].items[0]}에 ${drinks[0].items[0]} 조합은 어때요? 이 조합이면 오늘 밤은 완벽할 거예요! 🌙`,
      items: [snacks[0].items[0], drinks[0].items[0]],
      emojis: [snacks[0].emojis[0], drinks[0].emojis[0]]
    };
    html += createRecCard(pairingData, 'pairing');
  }

  // Fallback if nothing matched
  if (!html) {
    const fallbackSnack = SNACK_DATA['심심함'].any;
    html += createRecCard(fallbackSnack, 'snack');
  }

  container.innerHTML = html;

  // Music vibe
  const vibe = getMusicVibe();
  musicVibeEl.innerHTML = `
    <div class="music-vibe-icon">🎵</div>
    <div class="music-vibe-info">
      <div class="music-vibe-label">오늘 밤의 사운드트랙</div>
      <div class="music-vibe-text">${vibe}</div>
    </div>
    <div class="music-vibe-bars">
      <div class="music-bar"></div>
      <div class="music-bar"></div>
      <div class="music-bar"></div>
      <div class="music-bar"></div>
      <div class="music-bar"></div>
    </div>
  `;
}

// ============================================================
// RESET
// ============================================================

function resetApp() {
  // Reset state
  state.stressLevel = 5;
  state.selectedMoods = [];
  state.cravingType = null;

  // Reset slider
  const slider = document.getElementById('stress-slider');
  if (slider) {
    slider.value = 5;
    slider.dispatchEvent(new Event('input'));
  }

  // Reset mood cards
  document.querySelectorAll('.mood-card').forEach(c => c.classList.remove('selected'));

  // Reset craving cards
  document.querySelectorAll('.craving-card').forEach(c => c.classList.remove('selected'));

  // Go back to landing
  showScreen('screen-landing');
}

// ============================================================
// VALIDATION HELPERS
// ============================================================

function showValidationToast(message) {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toast.style.cssText = `
    position: fixed;
    bottom: 80px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(177, 79, 255, 0.15);
    border: 1px solid var(--neon-purple);
    color: var(--neon-purple);
    padding: 10px 24px;
    border-radius: 99px;
    font-size: 0.9rem;
    font-weight: 600;
    z-index: 9999;
    text-shadow: 0 0 8px rgba(177,79,255,0.6);
    box-shadow: 0 0 16px rgba(177,79,255,0.3);
    animation: toastIn 0.3s ease;
    pointer-events: none;
  `;

  // Toast animation
  if (!document.getElementById('toast-style')) {
    const style = document.createElement('style');
    style.id = 'toast-style';
    style.textContent = `
      @keyframes toastIn {
        from { opacity: 0; transform: translateX(-50%) translateY(10px); }
        to   { opacity: 1; transform: translateX(-50%) translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 2000);
}

// ============================================================
// INIT
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  // Init slider
  initStressSlider();

  // Init mood cards
  initMoodCards();

  // Init craving cards
  initCravingCards();

  // Landing → Step 1
  document.getElementById('btn-start').addEventListener('click', () => {
    showScreen('screen-step1');
  });

  // Step 1 → Step 2
  document.getElementById('btn-step1-next').addEventListener('click', () => {
    showScreen('screen-step2');
  });

  // Step 2 → Step 3
  document.getElementById('btn-step2-next').addEventListener('click', () => {
    if (state.selectedMoods.length === 0) {
      showValidationToast('기분을 최소 하나 골라주세요! 😊');
      return;
    }
    showScreen('screen-step3');
  });

  // Step 3 → Result
  document.getElementById('btn-get-result').addEventListener('click', () => {
    if (!state.cravingType) {
      showValidationToast('뭐가 당기는지 골라주세요! 😋');
      return;
    }
    renderResults();
    showScreen('screen-result');
  });

  // Reset
  document.getElementById('btn-reset').addEventListener('click', () => {
    resetApp();
  });
});
