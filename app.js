(() => {
  'use strict';

  // Rights-safe ambient assets are hosted locally with the site.
  const SOUNDS = {
    rain:   { label: '髮ｨ',     src: 'audio/rain.mp3',   level: 0.72 },
    wave:   { label: '豕｢',     src: 'audio/wave.mp3',   level: 0.68 },
    breeze: { label: '縺昴ｈ鬚ｨ', src: 'audio/breeze.mp3', level: 1.00 },
    forest: { label: '譽ｮ縺ｮ螂･', src: 'audio/forest.mp3', level: 1.00 },
    fire:   { label: '辟壹″轣ｫ', src: 'audio/fire.mp3',   level: 0.90 },
    none:   { label: '辟｡髻ｳ',   src: null,               level: 0.00 },
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
  const remainingMenu = document.getElementById('remainingMenu');
  const soundChoices = [...document.querySelectorAll('.sound-choice')];
  const timeChoices = [...document.querySelectorAll('.time-choice')];
  const customTimeWrap = document.getElementById('customTimeWrap');
  const customMinutes = document.getElementById('customMinutes');
  const volume = document.getElementById('volume');
  const fullscreenButton = document.getElementById('fullscreenButton');
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
  const fullscreenSupported = Boolean(document.fullscreenEnabled && document.documentElement.requestFullscreen);
  if (!wakeLockSupported) wakeWarning.hidden = false;
  if (!fullscreenSupported) {
    fullscreenButton.disabled = true;
    fullscreenButton.textContent = '全画面不可';
  }

  function initBackgroundEffect() {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const counts = { rain: 203, wave: 126, breeze: 135, forest: 96, fire: 110, none: 72 };
    const depthSize = [0.48, 0.78, 1.18];
    const depthAlpha = [0.34, 0.58, 0.88];
    const depthSpeed = [0.48, 0.82, 1.28];

    document.querySelectorAll('[data-bnto-bgdots]').forEach(bg => {
      if (bg.dataset.bntoInit) return;
      bg.dataset.bntoInit = '1';

      const canvas = document.createElement('canvas');
      bg.appendChild(canvas);
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      let particles = [];
      let mode = body.dataset.sound || DEFAULT_SOUND;
      let width = 1;
      let height = 1;
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

      function makeParticle(index) {
        const depth = index % 3;
        const scale = depthSize[depth];
        const x = Math.random() * width;
        const y = Math.random() * height;
        return {
          depth,
          x,
          y,
          originX: x,
          originY: y,
          baseY: y,
          radius: (1.1 + Math.random() * 1.65) * scale * (2 + Math.random()),
          alpha: depthAlpha[depth] * (0.72 + Math.random() * 0.28),
          speed: (0.45 + Math.random() * 0.52) * depthSpeed[depth],
          phase: Math.random() * Math.PI * 2,
          phase2: Math.random() * Math.PI * 2,
          amplitude: (16 + Math.random() * 34) * scale,
        };
      }

      function seed(nextMode = body.dataset.sound || DEFAULT_SOUND) {
        mode = nextMode;
        const count = counts[mode] || counts.none;
        particles = Array.from({ length: count }, (_, index) => makeParticle(index));
      }

      function wrapRain(particle) {
        if (particle.y <= height + 14) return;
        particle.y = -14 - Math.random() * height * 0.12;
        particle.x = Math.random() * width;
        particle.originX = particle.x;
      }

      function wrapBreeze(particle) {
        if (particle.x <= width + 20) return;
        particle.x = -20 - Math.random() * width * 0.16;
        particle.baseY = Math.random() * height;
        particle.y = particle.baseY;
      }

      function wrapFire(particle) {
        if (particle.y >= -24) return;
        particle.y = height + 18 + Math.random() * height * 0.10;
        particle.originX = Math.random() * width;
        particle.x = particle.originX;
      }

      function advance(particle, now) {
        const scale = depthSize[particle.depth];

        if (mode === 'rain') {
          particle.y += particle.speed * 3.75;
          particle.x += Math.sin(now * 0.00018 + particle.phase) * 0.165 * scale;
          wrapRain(particle);
          return;
        }

        if (mode === 'wave') {
          // Cohesive swash/backwash: all lights share one phase, so the whole field
          // moves in one direction, eases to a stop, then accelerates smoothly back.
          const wavePhase = now * 0.00028;
          const waveTravel = Math.sin(wavePhase);
          const span = width * (0.16 + particle.depth * 0.055);
          const shorelineCurve = 0.86 + 0.14 * Math.sin((particle.originY / Math.max(1, height)) * Math.PI);
          particle.x = particle.originX + waveTravel * span * shorelineCurve;
          particle.y = particle.originY;
          return;
        }

        if (mode === 'breeze') {
          particle.x += particle.speed * 2.16;
          const meander = Math.sin(particle.x * 0.010 + particle.phase + now * 0.00022) * particle.amplitude;
          const secondary = Math.sin(particle.x * 0.0036 + particle.phase2 - now * 0.00011) * particle.amplitude * 0.38;
          particle.y = particle.baseY + meander + secondary;
          wrapBreeze(particle);
          return;
        }

        if (mode === 'fire') {
          particle.y -= particle.speed * 1.95;
          particle.x = particle.originX + Math.sin(now * 0.00105 + particle.phase) * particle.amplitude * 0.22;
          wrapFire(particle);
          return;
        }
        if (mode === 'forest') {
          particle.x = particle.originX + Math.sin(now * 0.00007 + particle.phase) * (10 + particle.amplitude * 0.24) * 3;
          particle.y = particle.originY + Math.cos(now * 0.00006 + particle.phase2) * (12 + particle.amplitude * 0.28) * 3;
          return;
        }

        particle.x = particle.originX + Math.sin(now * 0.000055 + particle.phase) * (7 + particle.amplitude * 0.14) * 3;
        particle.y = particle.originY + Math.cos(now * 0.00005 + particle.phase2) * (8 + particle.amplitude * 0.16) * 3;
      }

      function drawParticle(particle, color, now) {
        const pulse = 0.58 + 0.42 * (0.5 + 0.5 * Math.sin(now * 0.00022 + particle.phase * 0.16));
        const alpha = Math.min(1, particle.alpha * pulse);
        const radius = particle.radius;

        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = color;

        // Broad halo: deliberately soft and faint so each particle reads as light, not a flat disk.
        ctx.globalAlpha = alpha * 0.12;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius * 6.4, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha * 0.48;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius * 4.1, 0, Math.PI * 2);
        ctx.fill();

        ctx.globalAlpha = alpha * 0.48;
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius * 2.25, 0, Math.PI * 2);
        ctx.fill();

        // Bright core + blur creates the actual luminous bloom.
        ctx.globalAlpha = Math.min(1, alpha * 1.45);
        ctx.shadowColor = color;
        ctx.shadowBlur = Math.max(16, radius * 5.2);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Small white-hot centre makes the particle read as a light source rather than a coloured disc.
        ctx.shadowBlur = 0;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
        ctx.globalAlpha = Math.min(1, alpha * 0.82);
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, Math.max(0.7, radius * 0.34), 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
      }

      function draw(now = performance.now()) {
        ctx.clearRect(0, 0, width, height);
        const color = getComputedStyle(bg).getPropertyValue('--c1').trim() || '#9cc4ee';
        particles.forEach(particle => drawParticle(particle, color, now));
        ctx.globalAlpha = 1;
      }

      function tick(now) {
        if (!lastFrame || now - lastFrame >= 40) {
          particles.forEach(particle => advance(particle, now));
          draw(now);
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

      document.addEventListener('ambient-sound-change', event => {
        seed(event.detail?.sound || body.dataset.sound || DEFAULT_SOUND);
        draw();
      });

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

  initBackgroundEffect();

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

  function clearAudioElement() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
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
    const soundLevel = SOUNDS[selectedSound]?.level ?? 1;
    const target = Math.max(0, Number(volume.value) / 100) * soundLevel;
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
    const totalSeconds = Math.max(1, durationMs / 1000);
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

  async function playSelectedSound(durationMs) {
    const sound = SOUNDS[selectedSound];
    if (!sound.src) {
      clearAudioElement();
      return;
    }

    await ensureAudioGraph();
    audio.pause();
    audio.src = sound.src;
    audio.loop = true;
    audio.load();
    audio.currentTime = 0;
    scheduleFade(durationMs);
    await audio.play();
  }

  function setSound(soundKey) {
    if (!SOUNDS[soundKey]) return;
    selectedSound = soundKey;
    body.dataset.sound = soundKey;
    currentSoundLabel.textContent = SOUNDS[soundKey].label;
    soundChoices.forEach(btn => btn.classList.toggle('active', btn.dataset.sound === soundKey));
    volume.disabled = soundKey === 'none';
    document.dispatchEvent(new CustomEvent('ambient-sound-change', { detail: { sound: soundKey } }));

    if (isPlaying && endTimeMs) {
      const remainingMs = Math.max(1000, endTimeMs - Date.now());
      playSelectedSound(remainingMs).catch(() => {});
    } else if (SOUNDS[soundKey].src) {
      audio.src = SOUNDS[soundKey].src;
      audio.load();
    } else {
      clearAudioElement();
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

  async function requestWakeLock() {
    if (!wakeLockSupported || !isPlaying || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
      }, { once: true });
    } catch (_) {
      wakeLock = null;
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;
    try { await wakeLock.release(); } catch (_) {}
    wakeLock = null;
  }

  function updateFullscreenButton() {
    if (!fullscreenSupported) return;
    fullscreenButton.textContent = document.fullscreenElement ? '全画面解除' : '全画面';
  }

  async function toggleFullscreen() {
    if (!fullscreenSupported) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      }
    } catch (_) {
      // Fullscreen is user-gesture and browser-policy dependent; leave the app usable if denied.
    }
    updateFullscreenButton();
    scheduleMenuHide();
  }

  function tick() {
    if (!isPlaying || !endTimeMs) return;
    const remaining = endTimeMs - Date.now();
    const text = formatRemaining(remaining);
    remainingMenu.textContent = text;
    if (remaining <= 0) stopPlayback(true);
  }

  async function startPlayback() {
    const durationMs = configuredDurationMs();
    endTimeMs = Date.now() + durationMs;
    isPlaying = true;

    try {
      await playSelectedSound(durationMs);
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

  fullscreenButton.addEventListener('click', () => {
    toggleFullscreen();
  });

  startButton.addEventListener('click', () => {
    startPlayback().catch(() => {
      startButton.disabled = false;
      startButton.textContent = '再生開始';
    });
  });

  stopButton.addEventListener('click', () => stopPlayback(false));

  document.addEventListener('fullscreenchange', updateFullscreenButton);
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
  volume.disabled = selectedSound === 'none';
  updateIdleRemaining();
  updateFullscreenButton();

  const hintSeen = localStorage.getItem('ambientSleepHintSeen') === '1';
  if (!hintSeen) {
    requestAnimationFrame(() => firstHint.classList.add('visible'));
    setTimeout(() => {
      firstHint.classList.remove('visible');
      localStorage.setItem('ambientSleepHintSeen', '1');
    }, FIRST_HINT_MS);
  }
})();