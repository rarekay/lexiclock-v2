'use strict';

// ── Explore State ─────────────────────────────────────────────────────────────
const explore = {
  wordLists: null,
  wotd: null,
  wotdRevealed: false,
  anagramResults: [],
  patternResults: [],
  currentSection: 'home'
};

// ── Load resources ────────────────────────────────────────────────────────────
async function loadExploreData() {
  if (!explore.wotd) {
    try {
      const res = await fetch('/words/wotd.json');
      explore.wotd = await res.json();
    } catch(e) { explore.wotd = []; }
  }
  if (!explore.wordLists) {
    const dictKey = state.settings.dict === 'csw' ? 'csw' : 'nwl';
    explore.wordLists = await loadWordList(dictKey);
  }
}

// ── Word of the Day ───────────────────────────────────────────────────────────
function getWotdIndex() {
  const start = new Date('2026-06-24').getTime();
  const now = new Date().setHours(0,0,0,0);
  const day = Math.floor((now - start) / 86400000);
  return Math.abs(day) % (explore.wotd?.length || 1);
}

function renderWotd() {
  if (!explore.wotd || !explore.wotd.length) return;
  const idx = getWotdIndex();
  const entry = explore.wotd[idx];
  const dictName = state.settings.dict === 'csw' ? 'Collins CSW' : 'NWL2023';

  document.getElementById('wotd-word').textContent = entry.word;
  document.getElementById('wotd-pts').textContent = `${entry.pts} pts`;
  document.getElementById('wotd-letters').textContent = `${entry.letters} letters · ${dictName}`;
  document.getElementById('wotd-def').textContent = entry.def;
  document.getElementById('wotd-def').style.display = 'none';
  document.getElementById('wotd-reveal-btn').textContent = '▼ Tap to reveal definition';
  explore.wotdRevealed = false;
}

function toggleWotdDef() {
  explore.wotdRevealed = !explore.wotdRevealed;
  const defEl = document.getElementById('wotd-def');
  const btn = document.getElementById('wotd-reveal-btn');
  defEl.style.display = explore.wotdRevealed ? 'block' : 'none';
  btn.textContent = explore.wotdRevealed ? '▲ Hide definition' : '▼ Tap to reveal definition';
}

// ── Navigation within Explore ─────────────────────────────────────────────────
function showExploreSection(section) {
  document.querySelectorAll('.explore-section').forEach(s => s.style.display = 'none');
  document.getElementById(`explore-${section}`).style.display = 'flex';
  explore.currentSection = section;

  if (section === 'home') renderWotd();
  if (section === 'highvalue') renderHighValue();
  if (section === 'vowelheavy') renderVowelHeavy();
  if (section === 'tournament') renderTournament();
}

function exploreBack() {
  showExploreSection('home');
}

// ── Anagrammer ────────────────────────────────────────────────────────────────
async function runAnagram() {
  const input = document.getElementById('anagram-input').value.trim().toUpperCase();
  if (!input || input.length < 2) return;

  document.getElementById('anagram-results').innerHTML = '';
  document.getElementById('anagram-loading').style.display = 'flex';
  document.getElementById('anagram-run').disabled = true;

  await loadExploreData();

  const letters = input.split('');
  const blanks = letters.filter(l => l === '?').length;
  const fixed = letters.filter(l => l !== '?');
  const results = new Set();

  function permute(arr, current = '') {
    if (current.length >= 2) {
      if (explore.wordLists.has(current)) results.add(current);
    }
    if (current.length === arr.length) return;
    const used = new Set();
    for (let i = 0; i < arr.length; i++) {
      if (used.has(arr[i])) continue;
      used.add(arr[i]);
      const rest = [...arr.slice(0,i), ...arr.slice(i+1)];
      permute(rest, current + arr[i]);
    }
  }

  if (blanks === 0) {
    permute(fixed);
  } else if (blanks === 1) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    alphabet.forEach(letter => {
      permute([...fixed, letter]);
    });
  } else {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    alphabet.forEach(l1 => {
      alphabet.forEach(l2 => {
        permute([...fixed, l1, l2]);
      });
    });
  }

  // Group by length
  const grouped = {};
  [...results].forEach(word => {
    const len = word.length;
    if (!grouped[len]) grouped[len] = [];
    grouped[len].push(word);
  });

  const container = document.getElementById('anagram-results');
  const lengths = Object.keys(grouped).map(Number).sort((a,b) => b-a);

  if (lengths.length === 0) {
    container.innerHTML = '<div class="explore-empty">No valid words found from those letters.</div>';
  } else {
    let html = `<div class="anagram-count">${results.size} word${results.size !== 1 ? 's' : ''} found</div>`;
    lengths.forEach(len => {
      const words = grouped[len].sort();
      html += `<div class="anagram-group">`;
      html += `<div class="anagram-group-label">${len} letters (${words.length})</div>`;
      html += `<div class="anagram-words">${words.map(w =>
        `<span class="anagram-word">${w}</span>`).join('')}</div>`;
      html += `</div>`;
    });
    container.innerHTML = html;
  }

  document.getElementById('anagram-loading').style.display = 'none';
  document.getElementById('anagram-run').disabled = false;
  trackEvent('anagram_used', { letters: input.length, results: results.size });
}

// ── Pattern Search ────────────────────────────────────────────────────────────
async function runPattern() {
  const input = document.getElementById('pattern-input').value.trim().toUpperCase();
  if (!input || input.length < 2) return;

  document.getElementById('pattern-results').innerHTML = '';
  document.getElementById('pattern-loading').style.display = 'flex';
  document.getElementById('pattern-run').disabled = true;

  await loadExploreData();

  const regexStr = '^' + input.split('').map(c => c === '?' ? '[A-Z]' : c).join('') + '$';
  const regex = new RegExp(regexStr);
  const results = [...explore.wordLists].filter(w => regex.test(w)).sort();

  const container = document.getElementById('pattern-results');
  if (results.length === 0) {
    container.innerHTML = '<div class="explore-empty">No words match that pattern.</div>';
  } else {
    let html = `<div class="anagram-count">${results.length} word${results.length !== 1 ? 's' : ''} found</div>`;
    html += `<div class="anagram-words">${results.map(w =>
      `<span class="anagram-word">${w}</span>`).join('')}</div>`;
    container.innerHTML = html;
  }

  document.getElementById('pattern-loading').style.display = 'none';
  document.getElementById('pattern-run').disabled = false;
  trackEvent('pattern_used', { pattern: input, results: results.length });
}

// ── High Value Words ──────────────────────────────────────────────────────────
const letterValues = {A:1,B:3,C:3,D:2,E:1,F:4,G:2,H:4,I:1,J:8,K:5,L:1,M:3,N:1,O:1,P:3,Q:10,R:1,S:1,T:1,U:1,V:4,W:4,X:8,Y:4,Z:10};
function wordScore(word) { return word.split('').reduce((s,l) => s + (letterValues[l] || 0), 0); }

async function renderHighValue() {
  await loadExploreData();
  const words = [...explore.wordLists];

  const sections = {
    'Q without U': words.filter(w => w.includes('Q') && !w.includes('U') && w.length <= 8).sort((a,b) => a.length - b.length),
    'Z words (2-5 letters)': words.filter(w => w.includes('Z') && w.length <= 5).sort((a,b) => wordScore(b) - wordScore(a)).slice(0,60),
    'X words (2-5 letters)': words.filter(w => w.includes('X') && w.length <= 5).sort((a,b) => wordScore(b) - wordScore(a)).slice(0,60),
    'J words (2-5 letters)': words.filter(w => w.includes('J') && w.length <= 5).sort((a,b) => wordScore(b) - wordScore(a)).slice(0,60),
    'K words (3-5 letters)': words.filter(w => w.includes('K') && w.length >= 3 && w.length <= 5).sort((a,b) => wordScore(b) - wordScore(a)).slice(0,60),
  };

  const container = document.getElementById('highvalue-content');
  let html = '';
  Object.entries(sections).forEach(([title, list]) => {
    if (!list.length) return;
    html += `<div class="wl-section">`;
    html += `<div class="wl-section-title">${title} <span class="wl-count">${list.length}</span></div>`;
    html += `<div class="anagram-words">${list.map(w =>
      `<span class="anagram-word hv-word" title="${wordScore(w)} pts">${w}<sup>${wordScore(w)}</sup></span>`
    ).join('')}</div></div>`;
  });
  container.innerHTML = html;
}

// ── Vowel Heavy Words ─────────────────────────────────────────────────────────
function countVowels(word) { return word.split('').filter(l => 'AEIOU'.includes(l)).length; }

async function renderVowelHeavy() {
  await loadExploreData();
  const words = [...explore.wordLists];

  const sections = {
    '5+ vowels': words.filter(w => countVowels(w) >= 5 && w.length <= 10).sort((a,b) => a.length - b.length).slice(0,80),
    '4 vowels (short words)': words.filter(w => countVowels(w) === 4 && w.length <= 6).sort((a,b) => a.length - b.length).slice(0,80),
    '3 vowels (3-4 letters)': words.filter(w => countVowels(w) === 3 && w.length <= 4).sort((a,b) => a.length - b.length).slice(0,60),
  };

  const container = document.getElementById('vowelheavy-content');
  let html = '';
  Object.entries(sections).forEach(([title, list]) => {
    if (!list.length) return;
    html += `<div class="wl-section">`;
    html += `<div class="wl-section-title">${title} <span class="wl-count">${list.length}</span></div>`;
    html += `<div class="anagram-words">${list.map(w =>
      `<span class="anagram-word">${w}</span>`).join('')}</div></div>`;
  });
  container.innerHTML = html;
}

// ── Tournament Essentials ─────────────────────────────────────────────────────
async function renderTournament() {
  await loadExploreData();
  const words = [...explore.wordLists];

  const twoLetters = words.filter(w => w.length === 2).sort();
  const threeLetterQ = words.filter(w => w.length === 3 && (w.includes('Q') || w.includes('Z') || w.includes('X') || w.includes('J'))).sort();
  const shortQ = words.filter(w => w.includes('Q') && !w.includes('U') && w.length <= 6).sort((a,b) => a.length - b.length);

  const container = document.getElementById('tournament-content');
  let html = '';

  const sections = [
    { title: 'All 2-letter words', desc: 'Every valid 2-letter word — essential knowledge', list: twoLetters },
    { title: 'Q without U words', desc: 'Play your Q without needing a U', list: shortQ },
    { title: '3-letter power tile words', desc: 'Q, Z, X, J in 3-letter combinations', list: threeLetterQ },
  ];

  sections.forEach(({title, desc, list}) => {
    html += `<div class="wl-section">`;
    html += `<div class="wl-section-title">${title} <span class="wl-count">${list.length}</span></div>`;
    html += `<div class="wl-section-desc">${desc}</div>`;
    html += `<div class="anagram-words">${list.map(w =>
      `<span class="anagram-word">${w}</span>`).join('')}</div></div>`;
  });
  container.innerHTML = html;
}

// ── Init Explore ──────────────────────────────────────────────────────────────
function initExplore() {
  loadExploreData().then(() => {
    renderWotd();
  });

  document.getElementById('anagram-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') runAnagram();
  });
  document.getElementById('anagram-input').addEventListener('input', e => {
    const clean = e.target.value.toUpperCase().replace(/[^A-Z?]/g, '');
    e.target.value = clean;
  });

  document.getElementById('pattern-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') runPattern();
  });
  document.getElementById('pattern-input').addEventListener('input', e => {
    const clean = e.target.value.toUpperCase().replace(/[^A-Z?]/g, '');
    e.target.value = clean;
  });
}
