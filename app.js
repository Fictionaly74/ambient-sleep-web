(() => {
  'use strict';

  // Rights-safe ambient assets are hosted locally with the site.
  const SOUNDS = {
    rain:   { label: '雨',     src: 'audio/rain.mp3' },
    wave:   { label: '波',     src: 'audio/wave.mp3' },
    breeze: { label: 'そよ風', src: 'audio/breeze.mp3' },
    forest: { label: '森の奥', src: 'audio/forest.mp3' },
  };

  const DEFAULT_SOUND = 'rain';
  const DEFAULT_MINUTES = 30;
  const MENU_HIDE_MS = 5000;
  const FIRST_HINT_MS = 4200;
  const MAX_FADE_SECONDS = 5 * 60;

  const body = document.body;
  const audio = document.getElementById('ambientAudio');
  const stageTap = document.getElementById('stageTap');
  const menu = document.getElementById('menu');
  const firstHint = document.getElementById('firstHint');
  const wakeWarning = document.getElementById('wakeWarning');
  const currentSoundLabel = document.getElementById('currentSoundLabel');
  const remainingGhost = document.getElementById('remainingGhost');
  const remainingMenu = document.getElementById('remainingMenu');
  const soundChoices = [...document.querySelectorAll('.sound-choice')];
  const timeChoices = [...document.querySelectorAll('.time-choice')];
  const customTimeWrap = document.getElementById('customTimeWrap');
  const customMinutes = document.getElementById('customMinutes');
  const volume = document.getElementById('volume');
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');

  let selectedSound = DEFAULT_SOUND;
  let selectedMinutes = DEFAULT_MINUTES;
  let menuHideTimer = null;
  let timerInterval = null;
  let endTimeMs = null;
  let isPlaying = false;
  let wakeLock = null;
  let audioContext = null;
  let mediaSource = null;
  let sessionGain = null;
  let volumeGain = null;

  const wakeLockSupported = 'wakeLock' in navigator;
  if (!wakeLockSupported) wakeWarning.hidden = false;

  function initBackgroundDots() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.querySelectorAll('[data-bnto-bgdots]').forEach(bg => {
      if (bg.dataset.bntoInit) return;
      bg.dataset.bntoInit = '1';

      const canvas = document.createElement('canvas');
      bg.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const count = Number.parseInt(bg.dataset.count, 10) || 40;
      let dots = [];
      let width = 0;
      let height = 0;
      let raf = 0;
      let shown = true;
      let lastFrame = 0;

      function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        width = Math.max(1, bg.clientWidth);
        height = Math.max(1, bg.clientHeight);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      function seed() {
        dots = Array.from({ length: count }, () => {
          const angle = Math.random() * Math.PI * 2;
          const speed = 0.045 + Math.random() * 0.11;
          return {
            x: Math.random() * width,
            y: Math.random() * height,
            r: 1.2 + Math.random() * 3.2,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            a: 0.24 + Math.random() * 0.54,
            phase: Math.random() * Math.PI * 2,
            pulse: 0.002 + Math.random() * 0.004,
          };
        });
      }

      function draw() {
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = getComputedStyle(bg).getPropertyValue('--c1').trim() || '#9cc4ee';

        dots.forEach(dot => {
          const pulse = 0.82 + Math.sin(dot.phase) * 0.18;
          ctx.globalAlpha = dot.a * pulse;
          ctx.beginPath();
          ctx.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
          ctx.fill();
        });

        ctx.globalAlpha = 1;
      }

      function stepDot(dot) {
        const sound = document.body.dataset.sound;
        if (sound === 'rain') {
          dot.x += dot.vx * 0.35;
          dot.y += Math.abs(dot.vy) + 0.06;
        } else if (sound === 'wave') {
          dot.x += dot.vx * 1.35;
          dot.y += dot.vy * 0.28;
        } else if (sound === 'breeze') {
          dot.x += Math.abs(dot.vx) + 0.05;
          dot.y += dot.vy * 0.65;
        } else {
          dot.x += dot.vx * 0.45;
          dot.y += dot.vy * 0.45;
        }

        dot.phase += dot.pulse;

        if (dot.x < -8) dot.x = width + 8;
        if (dot.x > width + 8) dot.x = -8;
        if (dot.y < -8) dot.y = height + 8;
        if (dot.y > height + 8) dot.y = -8;
      }

      function tick(now) {
        if (!lastFrame || now - lastFrame >= 33) {
          dots.forEach(stepDot);
          draw();
          lastFrame = now;
        }
        raf = requestAnimationFrame(tick);
      }

      function start() {
        if (!raf && shown && !reduced) raf = requestAnimationFrame(tick);
      }

      function stop() {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      }

      function rebuild() {
        resize();
        seed();
        draw();
      }

      rebuild();
      start();

      if ('ResizeObserver' in window) {
        new ResizeObserver(rebuild).observe(bg);
      } else {
        window.addEventListener('resize', rebuild, { passive: true });
      }

      if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
          shown = entries.length ? entries[0].isIntersecting : true;
          if (shown) start();
          else stop();
        }).observe(bg);
      }
    });
  }

  initBackgroundDots();

  function formatRemaining(ms) {
    const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function configuredDurationMs() {
    if (selectedMinutes === 'custom') {
      const parsed = Number.parseInt(customMinutes.value, 10);
      const safe = Number.isFinite(parsed) ? Math.min(720, Math.max(1, parsed)) : 1;
      customMinutes.value = String(safe);
      return safe * 60_000;
    }
    return Number(selectedMinutes) * 60_000;
  }

  function updateIdleRemaining() {
    if (isPlaying && endTimeMs) return;
    const text = formatRemaining(configuredDurationMs());
    remainingGhost.textContent = text;
    remainingMenu.textContent = text;
  }

  function showMenu() {
    menu.classList.add('visible');
    menu.setAttribute('aria-hidden', 'false');
    scheduleMenuHide();
  }

  function hideMenu() {
    menu.classList.remove('visible');
    menu.setAttribute('aria-hidden', 'true');
    if (menuHideTimer) clearTimeout(menuHideTimer);
    menuHideTimer = null;
  }

  function scheduleMenuHide() {
    if (menuHideTimer) clearTimeout(menuHideTimer);
    menuHideTimer = setTimeout(hideMenu, MENU_HIDE_MS);
  }

  function setSound(soundKey) {
    selectedSound = soundKey;
    body.dataset.sound = soundKey;
    currentSoundLabel.textContent = SOUNDS[soundKey].label;
    soundChoices.forEach(btn => btn.classList.toggle('active', btn.dataset.sound === soundKey));

    if (isPlaying) {
      const currentEnd = endTimeMs;
      audio.pause();
      audio.src = SOUNDS[soundKey].src;
      audio.load();
      audio.play().catch(() => {});
      endTimeMs = currentEnd;
    } else {
      audio.src = SOUNDS[soundKey].src;
      audio.load();
    }
    scheduleMenuHide();
  }

  function setMinutes(value) {
    selectedMinutes = value === 'custom' ? 'custom' : Number(value);
    timeChoices.forEach(btn => {
      const key = btn.dataset.minutes === 'custom' ? 'custom' : Number(btn.dataset.minutes);
      btn.classList.toggle('active', key === selectedMinutes);
    });
    customTimeWrap.hidden = selectedMinutes !== 'custom';
    updateIdleRemaining();
    scheduleMenuHide();
  }

  async function ensureAudioGraph() {
    if (!audioContext) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioContext = new Ctx();
      mediaSource = audioContext.createMediaElementSource(audio);
      sessionGain = audioContext.createGain();
      volumeGain = audioContext.createGain();
      mediaSource.connect(sessionGain).connect(volumeGain).connect(audioContext.destination);
    }
    if (audioContext.state === 'suspended') await audioContext.resume();
    setVolumeFromUi(false);
  }

  function setVolumeFromUi(smooth = true) {
    if (!volumeGain || !audioContext) return;
    const target = Math.max(0, Number(volume.value) / 100);
    const now = audioContext.currentTime;
    volumeGain.gain.cancelScheduledValues(now);
    if (smooth) {
      volumeGain.gain.setTargetAtTime(target, now, 0.08);
    } else {
      volumeGain.gain.setValueAtTime(target, now);
    }
  }

  function scheduleFade(durationMs) {
    if (!sessionGain || !audioContext) return;
    const totalSeconds = durationMs / 1000;
    const fadeSeconds = totalSeconds < MAX_FADE_SECONDS
      ? Math.max(1, totalSeconds * 0.4)
      : MAX_FADE_SECONDS;
    const now = audioContext.currentTime;
    const fadeStart = now + Math.max(0, totalSeconds - fadeSeconds);
    const end = now + totalSeconds;

    sessionGain.gain.cancelScheduledValues(now);
    sessionGain.gain.setValueAtTime(1, now);
    sessionGain.gain.setValueAtTime(1, fadeStart);
    sessionGain.gain.linearRampToValueAtTime(0.0001, end);
  }

  async function requestWakeLock() {
    if (!wakeLockSupported || !isPlaying || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      }, { once: true });
    } catch (_) {
      // A transient denial must not break playback or disturb the screen.
      wakeLock = null;
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;
    try { await wakeLock.release(); } catch (_) {}
    wakeLock = null;
  }

  function tick() {
    if (!isPlaying || !endTimeMs) return;
    const remaining = endTimeMs - Date.now();
    const text = formatRemaining(remaining);
    remainingGhost.textContent = text;
    remainingMenu.textContent = text;
    if (remaining <= 0) stopPlayback(true);
  }

  async function startPlayback() {
    const durationMs = configuredDurationMs();
    await ensureAudioGraph();

    audio.src = SOUNDS[selectedSound].src;
    audio.loop = true;
    audio.currentTime = 0;
    endTimeMs = Date.now() + durationMs;
    isPlaying = true;
    scheduleFade(durationMs);

    try {
      await audio.play();
    } catch (error) {
      isPlaying = false;
      endTimeMs = null;
      throw error;
    }

    startButton.textContent = '再生中';
    startButton.disabled = true;
    stopButton.disabled = false;

    if (timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(tick, 1000);
    tick();
    await requestWakeLock();
    scheduleMenuHide();
  }

  async function stopPlayback(endedNaturally = false) {
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;

    if (sessionGain && audioContext) {
      const now = audioContext.currentTime;
      sessionGain.gain.cancelScheduledValues(now);
      sessionGain.gain.setValueAtTime(0.0001, now);
    }

    audio.pause();
    audio.currentTime = 0;
    isPlaying = false;
    endTimeMs = null;
    await releaseWakeLock();

    startButton.textContent = '再生開始';
    startButton.disabled = false;
    stopButton.disabled = true;
    updateIdleRemaining();
    if (!endedNaturally) scheduleMenuHide();
  }

  stageTap.addEventListener('click', () => {
    if (menu.classList.contains('visible')) hideMenu();
    else showMenu();
  });

  menu.addEventListener('pointerdown', scheduleMenuHide);
  menu.addEventListener('input', scheduleMenuHide);
  menu.addEventListener('change', scheduleMenuHide);

  soundChoices.forEach(btn => btn.addEventListener('click', () => setSound(btn.dataset.sound)));
  timeChoices.forEach(btn => btn.addEventListener('click', () => setMinutes(btn.dataset.minutes)));

  customMinutes.addEventListener('input', updateIdleRemaining);
  customMinutes.addEventListener('change', () => {
    updateIdleRemaining();
    scheduleMenuHide();
  });

  volume.addEventListener('input', () => {
    setVolumeFromUi(true);
    scheduleMenuHide();
  });

  startButton.addEventListener('click', () => {
    startPlayback().catch(() => {
      startButton.disabled = false;
      startButton.textContent = '再生開始';
    });
  });

  stopButton.addEventListener('click', () => stopPlayback(false));

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      tick();
      if (isPlaying && !wakeLock) requestWakeLock();
    }
  });

  window.addEventListener('pagehide', () => {
    releaseWakeLock();
  });

  audio.src = SOUNDS[selectedSound].src;
  updateIdleRemaining();

  const hintSeen = localStorage.getItem('ambientSleepHintSeen') === '1';
  if (!hintSeen) {
    requestAnimationFrame(() => firstHint.classList.add('visible'));
    setTimeout(() => {
      firstHint.classList.remove('visible');
      localStorage.setItem('ambientSleepHintSeen', '1');
    }, FIRST_HINT_MS);
  }
})();
