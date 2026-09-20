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

  // 끝부분을 아주 살짝 페이드 인/아웃 시켜 버퍼 경계에서 나는 디지털 클릭/치지직음을 없앤다
  function createNoiseBuffer(ctx, duration, fadeMs = 6) {
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    const fadeSamples = Math.min(length / 2, Math.floor((ctx.sampleRate * fadeMs) / 1000));
    for (let i = 0; i < length; i++) {
      let sample = Math.random() * 2 - 1;
      if (i < fadeSamples) sample *= i / fadeSamples;
      if (i > length - fadeSamples) sample *= (length - i) / fadeSamples;
      data[i] = sample;
    }
    return buffer;
  }

  // 책을 책장에서 스윽 뽑아내는 소리 (부드러운 바람 소리에 가깝게)
  function playPullSound() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    const duration = 0.5;

    const noise = ctx.createBufferSource();
    noise.buffer = createNoiseBuffer(ctx, duration, 10);

    // 날카로운 고음을 걸러내 "치지직"거리는 잡음을 부드러운 바람 소리로 만든다
    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.Q.value = 0.3;
    lowpass.frequency.setValueAtTime(1800, now);
    lowpass.frequency.exponentialRampToValueAtTime(420, now + duration);

    const highpass = ctx.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 180;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.16, now + 0.12);
    gain.gain.exponentialRampToValueAtTime(0.0008, now + duration);

    noise.connect(lowpass).connect(highpass).connect(gain).connect(ctx.destination);
    noise.start(now);
    noise.stop(now + duration);

    // 살짝 들어올려지는 느낌의 낮고 부드러운 톤
    const thump = ctx.createOscillator();
    thump.type = 'sine';
    const thumpStart = now + duration * 0.55;
    thump.frequency.setValueAtTime(130, thumpStart);
    thump.frequency.exponentialRampToValueAtTime(65, thumpStart + 0.22);

    const thumpGain = ctx.createGain();
    thumpGain.gain.setValueAtTime(0, thumpStart);
    thumpGain.gain.linearRampToValueAtTime(0.14, thumpStart + 0.04);
    thumpGain.gain.exponentialRampToValueAtTime(0.0008, thumpStart + 0.26);

    thump.connect(thumpGain).connect(ctx.destination);
    thump.start(thumpStart);
    thump.stop(thumpStart + 0.28);
  }

  // 책 표지가 열리며 종이가 스치는 소리 (부드러운 사각임)
  function playPageFlipSound() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    [0, 0.1, 0.19].forEach((offset, i) => {
      const dur = 0.15;
      const t0 = now + offset;

      const noise = ctx.createBufferSource();
      noise.buffer = createNoiseBuffer(ctx, dur, 10);

      const bandpass = ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.Q.value = 0.5;
      bandpass.frequency.value = 1400 - i * 150;

      const lowpass = ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 3200;

      const gain = ctx.createGain();
      const peak = 0.12 - i * 0.015;
      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(Math.max(peak, 0.05), t0 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);

      noise.connect(bandpass).connect(lowpass).connect(gain).connect(ctx.destination);
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
