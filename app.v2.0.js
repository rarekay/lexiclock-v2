'use strict';

// ── Install Prompt ────────────────────────────────────────────────────────────
function showInstallPrompt() {
  const isAndroid = /android/i.test(navigator.userAgent);
  if (isAndroid) switchInstallTab('android');
  document.getElementById('install-prompt').classList.add('visible');
}
function closeInstallPrompt() {
  document.getElementById('install-prompt').classList.remove('visible');
  localStorage.setItem('lc_install_dismissed', '1');
}
function switchInstallTab(tab) {
  document.getElementById('tab-ios').classList.toggle('active', tab === 'ios');
  document.getElementById('tab-android').classList.toggle('active', tab === 'android');
  document.getElementById('steps-ios').style.display = tab === 'ios' ? 'flex' : 'none';
  document.getElementById('steps-android').style.display = tab === 'android' ? 'flex' : 'none';
}
function checkInstallPrompt() {
  const isInstalled = window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
  const dismissed = localStorage.getItem('lc_install_dismissed');
  const shown = localStorage.getItem('lc_install_shown');
  if (!isInstalled && !dismissed && !shown) {
    setTimeout(() => {
      showInstallPrompt();
      localStorage.setItem('lc_install_shown', '1');
    }, 90000);
  }
}

// ── Wake Lock ─────────────────────────────────────────────────────────────────
let wakeLock = null;

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch (e) {}
  }
}

async function releaseWakeLock() {
  if (wakeLock) {
    try { await wakeLock.release(); } catch (e) {}
    wakeLock = null;
  }
}

// Re-acquire wake lock when page becomes visible again
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && state.started && !state.paused) {
    requestWakeLock();
  }
});


function trackEvent(name, params = {}) {
  if (typeof gtag !== 'undefined') {
    gtag('event', name, params);
  }
}

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  mode: 'turn',
  selectedTime: 60,
  times: [60, 60],
  currentPlayer: 0,
  paused: false,
  started: false,
  waitingForFirstTap: false,
  interval: null,
  fromChallenge: false,
  nudgeShown: false,
  activeDict: 'csw',
  wordLists: { csw: null, nwl: null },
  settings: {
    sound: true,
    vibration: true,
    dict: 'csw'
  }
};

// ── Audio ────────────────────────────────────────────────────────────────────
let audioCtx = null;

function getAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playTick(freq = 880, duration = 0.06, vol = 0.3) {
  if (!state.settings.sound) return;
  try {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = freq;
    osc.type = 'sine';
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (e) {}
}

function playEndSound() {
  if (!state.settings.sound) return;
  try {
    const ctx = getAudio();
    [0, 0.15, 0.3].forEach((delay, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = i === 2 ? 440 : 523;
      osc.type = 'sine';
      gain.gain.setValueAtTime(0.4, ctx.currentTime + delay);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.25);
      osc.start(ctx.currentTime + delay);
      osc.stop(ctx.currentTime + delay + 0.25);
    });
  } catch (e) {}
}

function playNegativeSound() {
  if (!state.settings.sound) return;
  try {
    const ctx = getAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = 220;
    osc.type = 'sawtooth';
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}

function vibrate(pattern) {
  if (!state.settings.vibration) return;
  if ('vibrate' in navigator) navigator.vibrate(pattern);
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function fmt(s) {
  const neg = s < 0;
  const abs = Math.abs(s);
  const m = Math.floor(abs / 60);
  const sec = abs % 60;
  return (neg ? '-' : '') + m + ':' + String(sec).padStart(2, '0');
}

function playerName(idx) {
  const inputs = document.querySelectorAll('.name-input');
  const val = inputs[idx]?.value.trim();
  return val || `Player ${idx + 1}`;
}

function saveSettings() {
  localStorage.setItem('lc_settings', JSON.stringify(state.settings));
}

function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem('lc_settings'));
    if (s) Object.assign(state.settings, s);
  } catch (e) {}
  state.activeDict = state.settings.dict;
}

// ── Word Lists ────────────────────────────────────────────────────────────────
async function loadWordList(dict) {
  if (state.wordLists[dict]) return state.wordLists[dict];
  const file = dict === 'csw' ? '/words/csw.txt' : '/words/nwl2023.txt';
  const res = await fetch(file);
  const text = await res.text();
  const set = new Set(text.split('\n').map(w => w.trim().toUpperCase()).filter(Boolean));
  state.wordLists[dict] = set;
  return set;
}

// ── Navigation ───────────────────────────────────────────────────────────────
function goTo(screen, opts = {}) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById(`screen-${screen}`).classList.add('active');
  document.getElementById(`nav-${screen}`).classList.add('active');

  if (screen === 'timer') {
    // Timer is part of Play — highlight Play tab
    document.getElementById('nav-setup').classList.add('active');
    const isEmpty = !state.started;
    document.getElementById('timer-empty').style.display = isEmpty ? 'flex' : 'none';
    document.getElementById('timer-body').style.display = isEmpty ? 'none' : 'flex';
    document.getElementById('timer-controls').style.display = isEmpty ? 'none' : 'flex';
    if (opts.fromChallenge) {
      state.fromChallenge = true;
      document.getElementById('challenge-banner').classList.add('visible');
    } else if (!opts.keepChallengeBanner) {
      state.fromChallenge = false;
      document.getElementById('challenge-banner').classList.remove('visible');
    }
    if (state.started && !state.paused && !state.waitingForFirstTap) startTick();
    updateTimerUI();
  } else {
    clearInterval(state.interval);
  }

  if (screen === 'explore') {
    if (typeof initExplore === 'function' && !explore.wotd) initExplore();
    else if (typeof renderWotd === 'function') renderWotd();
  }

  if (screen === 'train') {
    if (typeof renderTrainHome === 'function') renderTrainHome();
    showTrainSection('home');
  }

  if (screen === 'challenge') {
    const banner = document.getElementById('challenge-paused-banner');
    if (opts.pausing || state.fromChallenge) {
      banner.classList.add('visible');
      document.getElementById('challenge-header-sub').textContent = 'clock paused';
    } else {
      banner.classList.remove('visible');
      document.getElementById('challenge-header-sub').textContent = 'word challenge';
    }
    const dictKey = state.activeDict === 'csw' ? 'csw' : 'nwl';
    loadWordList(dictKey).catch(() => {});
  }
}

// ── Reset Modal ───────────────────────────────────────────────────────────────
function resetGame() {
  clearInterval(state.interval);
  document.getElementById('reset-modal').classList.add('visible');
}

function closeResetModal() {
  document.getElementById('reset-modal').classList.remove('visible');
}

function playAgain() {
  closeResetModal();
  state.times = [state.selectedTime, state.selectedTime];
  if (state.mode === 'total') {
    state.times = getPlayerTimes();
  }
  state.currentPlayer = 0;
  state.paused = false;
  state.started = true;
  state.waitingForFirstTap = true;
  state.fromChallenge = false;
  document.getElementById('challenge-banner').classList.remove('visible');
  document.getElementById('p1-timesup').classList.remove('visible');
  document.getElementById('p2-timesup').classList.remove('visible');
  updateTimerUI();
  goTo('timer');
  requestWakeLock();
  trackEvent('game_started', { mode: state.mode, type: 'rematch' });
}

function newGame() {
  closeResetModal();
  clearInterval(state.interval);
  releaseWakeLock();
  state.started = false;
  state.paused = false;
  state.waitingForFirstTap = false;
  state.fromChallenge = false;
  document.getElementById('challenge-banner').classList.remove('visible');
  document.getElementById('challenge-paused-banner').classList.remove('visible');
  // Clear player names
  document.querySelectorAll('.name-input').forEach(i => i.value = '');
  goTo('setup');
  // Show nudge once per session
  if (!state.nudgeShown) {
    setTimeout(() => {
      document.getElementById('donation-nudge').classList.add('visible');
      state.nudgeShown = true;
    }, 700);
  }
}

// ── Setup ────────────────────────────────────────────────────────────────────
function selectMode(m) {
  state.mode = m;
  document.getElementById('mode-turn').classList.toggle('selected', m === 'turn');
  document.getElementById('mode-total').classList.toggle('selected', m === 'total');
  document.getElementById('time-label').textContent = m === 'turn' ? 'Time per turn' : 'Time per player';
  document.getElementById('turn-times').classList.toggle('hidden', m !== 'turn');
  document.getElementById('total-presets').classList.toggle('hidden', m !== 'total');
  document.getElementById('custom-time-wrap').classList.toggle('visible', m === 'total');

  if (m === 'turn') {
    state.selectedTime = 60;
    document.querySelectorAll('#turn-times .time-btn').forEach((b, i) => b.classList.toggle('selected', i === 0));
  } else {
    state.selectedTime = 1200;
    document.querySelectorAll('#total-presets .time-btn').forEach((b, i) => b.classList.toggle('selected', i === 1));
  }
}

function selectTime(el, t) {
  const group = el.closest('.time-row');
  group.querySelectorAll('.time-btn').forEach(b => b.classList.remove('selected'));
  el.classList.add('selected');
  state.selectedTime = t;
  if (state.mode === 'total') {
    document.querySelector('#custom-p1').value = '';
    document.querySelector('#custom-p2').value = '';
  }
}

function clearPresetSelection() {
  document.querySelectorAll('#total-presets .time-btn').forEach(b => b.classList.remove('selected'));
}

function getPlayerTimes() {
  if (state.mode === 'turn') return [state.selectedTime, state.selectedTime];
  const p1val = document.querySelector('#custom-p1').value.trim();
  const p2val = document.querySelector('#custom-p2').value.trim();
  function parseTime(v) {
    if (!v) return state.selectedTime;
    if (v.includes(':')) {
      const [m, s] = v.split(':');
      return parseInt(m) * 60 + (parseInt(s) || 0);
    }
    return parseInt(v) * 60;
  }
  return [parseTime(p1val), parseTime(p2val)];
}

function startGame() {
  state.times = getPlayerTimes();
  state.currentPlayer = 0;
  state.paused = false;
  state.started = true;
  state.waitingForFirstTap = true;
  state.nudgeShown = false;
  document.getElementById('donation-nudge').classList.remove('visible');
  document.getElementById('p1-timesup').classList.remove('visible');
  document.getElementById('p2-timesup').classList.remove('visible');
  updateTimerUI();
  goTo('timer');
  requestWakeLock();
  trackEvent('game_started', { mode: state.mode, type: 'new' });
}

// ── Timer ────────────────────────────────────────────────────────────────────
function startTick() {
  clearInterval(state.interval);
  state.interval = setInterval(tick, 1000);
}

function tick() {
  if (state.paused || state.waitingForFirstTap) return;
  const idx = state.currentPlayer;

  if (state.mode === 'turn') {
    state.times[idx]--;
    if (state.times[idx] === 60) {
      playTick(660, 0.08, 0.35); vibrate(100);
    } else if (state.times[idx] <= 5 && state.times[idx] > 0) {
      playTick(880 + (5 - state.times[idx]) * 40, 0.06, 0.3); vibrate(50);
    } else if (state.times[idx] === 0) {
      playEndSound(); vibrate([100, 80, 100]);
      clearInterval(state.interval);
    }
  } else {
    state.times[idx]--;
    if (state.times[idx] === 60) {
      playTick(660, 0.08, 0.35); vibrate(100);
    } else if (state.times[idx] <= 5 && state.times[idx] > 0) {
      playTick(880 + (5 - state.times[idx]) * 40, 0.06, 0.3); vibrate(50);
    } else if (state.times[idx] === 0) {
      playEndSound(); vibrate([100, 80, 100]);
    } else if (state.times[idx] === -1) {
      playNegativeSound();
    }
  }
  updateTimerUI();
}

function updateTimerUI() {
  const tiles = [document.getElementById('tile-p1'), document.getElementById('tile-p2')];
  const timeEls = [document.getElementById('time-p1'), document.getElementById('time-p2')];
  const statusEls = [document.getElementById('status-p1'), document.getElementById('status-p2')];
  const hintEls = [document.getElementById('hint-p1'), document.getElementById('hint-p2')];
  const nameEls = [document.getElementById('display-name-p1'), document.getElementById('display-name-p2')];

  nameEls[0].textContent = playerName(0).toUpperCase();
  nameEls[1].textContent = playerName(1).toUpperCase();

  [0, 1].forEach(i => {
    const t = state.times[i];
    timeEls[i].textContent = fmt(t);
    const isActive = i === state.currentPlayer && state.started;
    const isWarning = isActive && t <= 10 && t > 0 && state.mode === 'turn';
    const isNegative = t < 0;
    const isTimesUp = state.mode === 'turn' && t <= 0 && isActive;

    tiles[i].className = 'player-tile';
    if (!state.started) {
      tiles[i].classList.add('inactive');
    } else if (state.waitingForFirstTap) {
      // Player 2 (idx 1) taps to start Player 1's clock
      const starterIdx = state.currentPlayer === 0 ? 1 : 0;
      tiles[i].classList.add(i === starterIdx ? 'waiting' : 'inactive');
    } else if (isNegative) {
      tiles[i].classList.add('negative');
    } else if (isWarning) {
      tiles[i].classList.add('warning');
    } else if (isActive) {
      tiles[i].classList.add('active');
    } else {
      tiles[i].classList.add('inactive');
    }

    document.getElementById(i === 0 ? 'p1-timesup' : 'p2-timesup')
      .classList.toggle('visible', isTimesUp);

    const starterIdx = state.currentPlayer === 0 ? 1 : 0;
    if (!state.started) {
      statusEls[i].textContent = 'Ready';
      hintEls[i].textContent = '';
    } else if (state.waitingForFirstTap && i === starterIdx) {
      statusEls[i].textContent = 'Tap to start';
      hintEls[i].textContent = "tap to start their clock";
    } else if (state.waitingForFirstTap && i !== starterIdx) {
      statusEls[i].textContent = 'Get ready...';
      hintEls[i].textContent = '';
    } else if (isActive) {
      statusEls[i].textContent = state.paused ? 'Paused' : 'Your turn';
      hintEls[i].textContent = state.paused ? 'tap to resume' : 'tap when done';
    } else {
      statusEls[i].textContent = 'Waiting';
      hintEls[i].textContent = '';
    }
  });

  document.getElementById('timer-mode-tag').textContent =
    state.mode === 'turn' ? 'per turn' : 'total time';

  const pauseIcon = document.getElementById('pause-icon');
  const pauseLabel = document.getElementById('pause-label');
  if (state.paused) {
    pauseIcon.className = 'ti ti-player-play';
    pauseLabel.textContent = 'Resume';
  } else {
    pauseIcon.className = 'ti ti-player-pause';
    pauseLabel.textContent = 'Pause';
  }
}

function switchTurn(idx) {
  if (!state.started) return;

  // Player 2 taps to start Player 1's clock
  if (state.waitingForFirstTap) {
    const starterIdx = state.currentPlayer === 0 ? 1 : 0;
    if (idx !== starterIdx) return;
    state.waitingForFirstTap = false;
    startTick();
    updateTimerUI();
    return;
  }

  // Paused — tap to resume
  if (state.paused) {
    if (idx !== state.currentPlayer) return;
    state.paused = false;
    startTick();
    updateTimerUI();
    return;
  }

  if (idx !== state.currentPlayer) return;
  if (state.mode === 'turn' && state.times[idx] <= 0) return;

  playTick(440, 0.05, 0.2);
  vibrate(60);
  if (state.mode === 'turn') state.times[idx] = state.selectedTime;
  state.currentPlayer = idx === 0 ? 1 : 0;
  updateTimerUI();
  startTick();
}

function togglePause() {
  if (!state.started || state.waitingForFirstTap) return;
  state.paused = !state.paused;
  if (!state.paused) {
    startTick();
    requestWakeLock();
  } else {
    releaseWakeLock();
  }
  updateTimerUI();
}

function triggerChallenge() {
  if (state.started && !state.paused && !state.waitingForFirstTap) {
    state.paused = true;
    updateTimerUI();
  }
  state.fromChallenge = true;
  document.getElementById('word-input').value = '';
  document.getElementById('verdict-screen').classList.remove('visible');
  goTo('challenge', { pausing: true });
  trackEvent('challenge_triggered', { dict: state.activeDict });
}

// ── Word Checking ─────────────────────────────────────────────────────────────
function selectDict(d) {
  state.activeDict = d;
  document.getElementById('dict-csw').classList.toggle('selected', d === 'csw');
  document.getElementById('dict-nwl').classList.toggle('selected', d === 'nwl');
  document.getElementById('verdict-screen').classList.remove('visible');
  document.getElementById('word-input').value = '';
  const dictKey = d === 'csw' ? 'csw' : 'nwl';
  loadWordList(dictKey).catch(() => {});
}

async function checkWords() {
  const raw = document.getElementById('word-input').value.trim();
  if (!raw) return;

  const words = raw.split(/[\s,]+/).map(w => w.trim().toUpperCase()).filter(Boolean);
  if (!words.length) return;

  document.getElementById('check-btn').disabled = true;
  document.getElementById('loading-dots').classList.add('visible');
  document.getElementById('verdict-screen').classList.remove('visible');

  try {
    const dictKey = state.activeDict === 'csw' ? 'csw' : 'nwl';
    const wordSet = await loadWordList(dictKey);
    const dictLabel = state.activeDict === 'csw' ? 'Collins (CSW)' : 'NWL2023';

    const invalid = words.filter(w => !wordSet.has(w));
    const allValid = invalid.length === 0;

    const vs = document.getElementById('verdict-screen');
    vs.className = 'verdict-screen visible ' + (allValid ? 'valid' : 'invalid');

    document.getElementById('verdict-icon').className =
      'verdict-icon ti ' + (allValid ? 'ti-circle-check' : 'ti-circle-x');
    document.getElementById('verdict-line1').textContent =
      allValid ? 'Yes, the play is' : 'No, the play is';
    document.getElementById('verdict-main').textContent =
      allValid ? 'VALID' : 'NOT VALID';
    document.getElementById('verdict-words').textContent = words.join(', ');
    document.getElementById('verdict-dict').textContent = `Lexicon: ${dictLabel}`;
    document.getElementById('verdict-invalid-list').style.display = 'none';

    trackEvent('word_checked', { dict: dictLabel, valid: allValid, word_count: words.length });

  } catch (e) {
    alert('Could not load word list. Please check your connection.');
  }

  document.getElementById('loading-dots').classList.remove('visible');
  document.getElementById('check-btn').disabled = false;
}

function closeVerdict() {
  document.getElementById('verdict-screen').classList.remove('visible');
  document.getElementById('word-input').value = '';
  if (state.fromChallenge) {
    state.fromChallenge = false;
    document.getElementById('challenge-paused-banner').classList.remove('visible');
    document.getElementById('challenge-header-sub').textContent = 'word challenge';
    goTo('timer');
  }
}

// ── Settings ──────────────────────────────────────────────────────────────────
function applyTheme(light) {
  document.body.classList.toggle('light', light);
}

function initSettings() {
  document.getElementById('toggle-sound').checked = state.settings.sound;
  document.getElementById('toggle-vibration').checked = state.settings.vibration;
  document.getElementById('toggle-theme').checked = state.settings.lightMode || false;
  applyTheme(state.settings.lightMode || false);

  document.getElementById('toggle-sound').addEventListener('change', e => {
    state.settings.sound = e.target.checked;
    saveSettings();
  });
  document.getElementById('toggle-vibration').addEventListener('change', e => {
    state.settings.vibration = e.target.checked;
    saveSettings();
  });
  document.getElementById('toggle-theme').addEventListener('change', e => {
    state.settings.lightMode = e.target.checked;
    applyTheme(e.target.checked);
    saveSettings();
  });
}

// ── Onboarding ────────────────────────────────────────────────────────────────
function initOnboarding() {
  if (localStorage.getItem('lc_onboarded')) {
    document.getElementById('onboarding').classList.add('hidden');
    return;
  }
  let card = 0;
  const cards = document.querySelectorAll('.ob-card');
  const dots = document.querySelectorAll('.ob-dot');
  const nextBtn = document.getElementById('ob-next');

  function showCard(n) {
    cards.forEach((c, i) => c.classList.toggle('active', i === n));
    dots.forEach((d, i) => d.classList.toggle('active', i === n));
    nextBtn.textContent = n === cards.length - 1 ? "Let's play" : 'Next';
  }

  nextBtn.addEventListener('click', () => {
    if (card < cards.length - 1) { card++; showCard(card); }
    else dismissOnboarding();
  });
  document.getElementById('ob-skip').addEventListener('click', dismissOnboarding);
  showCard(0);
}

function dismissOnboarding() {
  localStorage.setItem('lc_onboarded', '1');
  document.getElementById('onboarding').classList.add('hidden');
}

const APP_VERSION = 'v2.0';

// ── Update Detection ──────────────────────────────────────────────────────────
let newWorker = null;

// Force reload if cached version is old — fixes Safari stale cache issue
function checkAppVersion() {
  const cached = localStorage.getItem('lc_app_version');
  if (cached && cached !== APP_VERSION) {
    localStorage.setItem('lc_app_version', APP_VERSION);
    // Clear all caches and reload
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => window.location.reload());
    } else {
      window.location.reload();
    }
    return;
  }
  localStorage.setItem('lc_app_version', APP_VERSION);
}

function applyUpdate() {
  if (newWorker) {
    newWorker.postMessage({ action: 'skipWaiting' });
  } else {
    // Fallback — clear cache and reload
    if ('caches' in window) {
      caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))))
        .then(() => window.location.reload());
    } else {
      window.location.reload();
    }
  }
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/sw.js').then(reg => {
    const showBanner = (worker) => {
      newWorker = worker;
      document.getElementById('update-banner').classList.add('visible');
    };

    // New SW already waiting when page loads
    if (reg.waiting) {
      showBanner(reg.waiting);
    }

    // New SW found while page is open
    reg.addEventListener('updatefound', () => {
      const installing = reg.installing;
      installing.addEventListener('statechange', () => {
        if (installing.state === 'installed') {
          if (navigator.serviceWorker.controller) {
            // Update available — show banner
            showBanner(installing);
          }
          // If no controller this is a fresh install — no banner needed
        }
      });
    });

    // Poll for updates every 60 seconds
    setInterval(() => reg.update(), 60000);

  }).catch(() => {});

  // When controller changes (after skipWaiting), reload to get fresh content
  // We use a flag to prevent this firing on initial load
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  checkAppVersion();
  loadSettings();
  initSettings();
  initOnboarding();
  initExplore();
  initTrain();
  registerSW();
  updateTimerUI();
  checkInstallPrompt();

  document.addEventListener('touchstart', () => { if (!audioCtx) getAudio(); }, { once: true });
  document.addEventListener('click', () => { if (!audioCtx) getAudio(); }, { once: true });

  document.getElementById('word-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') checkWords();
  });

  // Auto uppercase + block special characters (allow letters, space, comma only)
  document.getElementById('word-input').addEventListener('input', e => {
    const pos = e.target.selectionStart;
    const clean = e.target.value.toUpperCase().replace(/[^A-Z\s,]/g, '');
    e.target.value = clean;
    e.target.setSelectionRange(pos, pos);
  });

  // Clear preset selection when custom time is typed
  document.getElementById('custom-p1').addEventListener('input', clearPresetSelection);
  document.getElementById('custom-p2').addEventListener('input', clearPresetSelection);

  // Preload default word list
  const dictKey = state.settings.dict === 'csw' ? 'csw' : 'nwl';
  loadWordList(dictKey).catch(() => {});
});
