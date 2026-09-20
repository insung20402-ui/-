(() => {
  'use strict';

  /* ---------------------------------------------------------------- */
  /* 사운드 (Web Audio API로 합성 - 별도 오디오 파일 불필요)                */
  /* ---------------------------------------------------------------- */

  let audioCtx = null;

  function getAudioContext() {
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function createNoiseBuffer(ctx, duration) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  // 책을 책장에서 스윽 뽑아내는 소리
  function playPullSound() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = 0.46;

    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, duration);

    const bandpass = ctx.createBiquadFilter();
    bandpass.type = 'bandpass';
    bandpass.Q.value = 0.8;
    bandpass.frequency.setValueAtTime(2000, now);
    bandpass.frequency.exponentialRampToValueAtTime(450, now + duration);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.32, now + 0.07);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    noise.connect(bandpass).connect(gain).connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);

    // 살짝 들어올려지는 느낌의 낮은 톤
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    const thumpStart = now + duration * 0.55;
    thump.frequency.setValueAtTime(140, thumpStart);
    thump.frequency.exponentialRampToValueAtTime(70, thumpStart + 0.22);

    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0.0001, thumpStart);
    thumpGain.gain.exponentialRampToValueAtTime(0.22, thumpStart + 0.03);
    thumpGain.gain.exponentialRampToValueAtTime(0.0001, thumpStart + 0.24);

    thump.connect(thumpGain).connect(ctx.destination);
    thump.start(thumpStart);
    thump.stop(thumpStart + 0.26);
  }

  // 책 표지가 열리며 종이가 스치는 소리
  function playPageFlipSound() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    [0, 0.1, 0.19].forEach((offset, i) => {
      const dur = 0.16;
      const t0 = now + offset;

      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, dur);

      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 1000 + i * 500;

      const gain = ctx.createGain();
      const peak = 0.26 - i * 0.05;
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.05), t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

      noise.connect(highpass).connect(gain).connect(ctx.destination);
      noise.start(t0);
      noise.stop(t0 + dur);
    });
  }

  /* ---------------------------------------------------------------- */
  /* 책 뽑기 -> 펼치기 애니메이션                                          */
  /* ---------------------------------------------------------------- */

  const LIFT_MS = 380;
  const COVER_MS = 560;
  const OPEN_MS = 520;

  document.addEventListener('DOMContentLoaded', () => {
    const shelfImg = document.getElementById('shelfImg');
    const hotspot = document.getElementById('hotspot-2024');
    const shelfGap = document.getElementById('shelfGap');
    const pulledBook = document.getElementById('pulledBook');
    const pulledSpine = document.getElementById('pulledSpine');
    const overlay = document.getElementById('bookOverlay');
    const closeBtn = document.getElementById('closeBook');
    const backdrop = document.getElementById('bookBackdrop');

    let isAnimating = false;
    let closeTimer = null;

    hotspot.addEventListener('click', () => {
      if (isAnimating || hotspot.classList.contains('is-active')) return;
      openBook();
    });

    closeBtn.addEventListener('click', closeBook);
    backdrop.addEventListener('click', closeBook);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && overlay.classList.contains('is-open')) {
        closeBook();
      }
    });

    function openBook() {
      isAnimating = true;
      hotspot.classList.add('is-active');
      shelfGap.classList.add('is-empty');

      const imgRect = shelfImg.getBoundingClientRect();
      const hotspotRect = hotspot.getBoundingClientRect();

      // 클론 책을 실제 책장 이미지와 픽셀 단위로 정확히 겹치도록 배치
      pulledSpine.style.backgroundImage = `url(${shelfImg.currentSrc || shelfImg.src})`;
      pulledSpine.style.backgroundSize = `${imgRect.width}px ${imgRect.height}px`;
      pulledSpine.style.backgroundPosition =
        `-${hotspotRect.left - imgRect.left}px -${hotspotRect.top - imgRect.top}px`;

      pulledBook.style.transition = 'none';
      pulledBook.classList.remove('phase-lift', 'phase-cover', 'phase-open');
      pulledBook.style.left = `${hotspotRect.left}px`;
      pulledBook.style.top = `${hotspotRect.top}px`;
      pulledBook.style.width = `${hotspotRect.width}px`;
      pulledBook.style.height = `${hotspotRect.height}px`;
      pulledBook.classList.add('is-visible');

      // 강제 리플로우: transition:none 상태에서 초기 위치를 확정시킨다
      void pulledBook.offsetWidth;
      pulledBook.style.transition = '';

      playPullSound();

      requestAnimationFrame(() => {
        pulledBook.classList.add('phase-lift');
      });

      window.setTimeout(() => {
        const targetWidth = Math.min(window.innerWidth * 0.42, 380);
        const targetHeight = targetWidth / 0.72;

        pulledBook.style.left = `${window.innerWidth / 2 - targetWidth / 2}px`;
        pulledBook.style.top = `${window.innerHeight / 2 - targetHeight / 2}px`;
        pulledBook.style.width = `${targetWidth}px`;
        pulledBook.style.height = `${targetHeight}px`;

        pulledBook.classList.remove('phase-lift');
        pulledBook.classList.add('phase-cover');
      }, LIFT_MS);

      window.setTimeout(() => {
        playPageFlipSound();
        pulledBook.classList.add('phase-open');
        overlay.classList.add('is-open');
      }, LIFT_MS + COVER_MS);

      window.setTimeout(() => {
        pulledBook.classList.remove('is-visible', 'phase-cover', 'phase-open');
        isAnimating = false;
      }, LIFT_MS + COVER_MS + OPEN_MS);
    }

    function closeBook() {
      if (!overlay.classList.contains('is-open')) return;

      window.clearTimeout(closeTimer);
      overlay.classList.remove('is-open');

      closeTimer = window.setTimeout(() => {
        hotspot.classList.remove('is-active');
        shelfGap.classList.remove('is-empty');
      }, 260);
    }
  });
})();
