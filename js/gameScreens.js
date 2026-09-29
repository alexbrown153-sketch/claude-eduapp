// The Games screen and three of the games (Roadmap #143 Blitz, #144 Numbers
// Target, #145 Close Enough). The rules live in games.js; this module draws
// the screens, handles taps, and saves each game's own small storage key.
// The fourth game, Beat the Grown-Up (#147), runs on the question screen and
// lives in app.js.
//
// Nothing here writes sessions, mastery, badges or the in-progress session.
// The only shared value a game changes is meta.totalPoints, and only
// Numbers Target and Close Enough do that (Alex's decisions).

import { Storage } from './storage.js';
import {
  BLITZ_SECONDS, BLITZ_MIX, blitzQuestion, addBlitzRun,
  newNumbersRound, applyStep, replaySolution, numbersPoints, closestTile, formatStep, testHooks,
  ESTIMATE_ROUND, estimateQuestion, sliderScale, scoreEstimate, withinPercent, fmt,
} from './games.js';
import { playSound } from './sound.js';

const el = (id) => document.getElementById(id);
const show = (id, on) => { el(id).hidden = !on; };

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// Set by bindGames: how to show a screen, go Home, refresh the header
// after points are added, and start the guest round (app.js).
let hooks = null;

const soundOn = () => Boolean(Storage.getMeta().soundOn);
const shortDate = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

// ======================================================================
// Games screen
// ======================================================================

export function openGames() {
  const blitz = Storage.getBlitz(BLITZ_MIX);
  el('games-best-blitz').textContent = blitz.top.length ? `Best: ${blitz.top[0].correct}` : 'No runs yet';
  const ng = Storage.getNumbersGame();
  el('games-best-numbers').textContent = ng.roundsPlayed ? `Targets hit: ${ng.targetsHit}` : 'No rounds yet';
  const est = Storage.getEstimation();
  el('games-best-estimate').textContent = est.bestRoundScore !== null ? `Best round: ${est.bestRoundScore} points` : 'No rounds yet';
  const t = Storage.getGrownUpTally();
  const played = t.childWins + t.grownUpWins + t.draws;
  el('games-best-guest').textContent = played ? `You ${t.childWins}, grown-ups ${t.grownUpWins}${t.draws ? `, draws ${t.draws}` : ''}` : 'No games yet';
  hooks.showScreen('games');
}

// Called whenever the screen changes: leaving a game part-way stops its
// clocks and throws the unfinished round away (nothing is saved).
export function onScreenChange(name) {
  if (name !== 'blitz') stopBlitz();
  if (name !== 'numbers') numbers = null;
  if (name !== 'estimate') estimate = null;
}

// ======================================================================
// #143 60-second Blitz
// ======================================================================

let blitz = null; // the run in progress, or null
let blitzTimers = [];

function clearBlitzTimers() {
  blitzTimers.forEach((t) => { clearTimeout(t); clearInterval(t); });
  blitzTimers = [];
}

function stopBlitz() {
  clearBlitzTimers();
  blitz = null;
}

function blitzPanel(which) {
  ['blitz-countdown', 'blitz-run', 'blitz-results', 'blitz-interrupted'].forEach((id) => show(id, id === which));
  show('blitz-actions', which === 'blitz-results' || which === 'blitz-interrupted');
}

// One tap from the Games screen (or "One more go") goes straight to the
// 3-2-1. The clock starts only after it (AC2).
export function startBlitz() {
  stopBlitz();
  hooks.showScreen('blitz');
  blitz = { phase: 'countdown', correct: 0, wrong: 0, missed: [], buffer: '', q: null, endAt: 0, locked: false };
  blitzPanel('blitz-countdown');
  let n = 3;
  el('blitz-countdown-num').textContent = String(n);
  const tick = setInterval(() => {
    n -= 1;
    if (n > 0) {
      el('blitz-countdown-num').textContent = String(n);
      return;
    }
    clearInterval(tick);
    beginBlitzRun();
  }, 1000);
  blitzTimers.push(tick);
}

function beginBlitzRun() {
  if (!blitz) return;
  blitz.phase = 'run';
  // Wall time, not counted ticks: a stored end time (#143 step 2).
  blitz.endAt = Date.now() + BLITZ_SECONDS * 1000;
  blitzPanel('blitz-run');
  el('blitz-score').textContent = '✓ 0';
  nextBlitzQuestion();
  updateBlitzClock();
  blitzTimers.push(setInterval(updateBlitzClock, 200));
}

function updateBlitzClock() {
  if (!blitz || blitz.phase !== 'run') return;
  const leftMs = blitz.endAt - Date.now();
  const secs = Math.max(0, Math.ceil(leftMs / 1000));
  const clock = el('blitz-clock');
  clock.textContent = `⏱ ${secs}`;
  // The last 10 seconds look different (AC3): the Pill's warning state.
  clock.classList.toggle('pill-warn', secs <= 10);
  if (leftMs <= 0) finishBlitz();
}

function nextBlitzQuestion() {
  blitz.q = blitzQuestion();
  blitz.buffer = '';
  blitz.locked = false;
  el('blitz-prompt').textContent = blitz.q.prompt;
  el('blitz-display').innerHTML = '&nbsp;';
  el('blitz-flash').textContent = '';
  el('blitz-flash').className = 'blitz-flash';
}

function blitzKey(k) {
  if (!blitz || blitz.phase !== 'run' || blitz.locked) return;
  if (k === 'go') { blitzGo(); return; }
  if (k === 'back') blitz.buffer = blitz.buffer.slice(0, -1);
  else if (/^\d$/.test(k) && blitz.buffer.length < 6) blitz.buffer += k;
  el('blitz-display').textContent = blitz.buffer || ' ';
}

// Go with nothing typed does nothing (AC6). Otherwise mark it straight
// away. A wrong answer just shows a cross (Alex: the answer isn't shown
// mid-run; the misses are listed at the end). The clock keeps running.
function blitzGo() {
  if (blitz.buffer === '') return;
  const right = Number(blitz.buffer) === blitz.q.answer;
  blitz.locked = true;
  const flash = el('blitz-flash');
  if (right) {
    blitz.correct += 1;
    flash.textContent = '✓';
    flash.className = 'blitz-flash is-right';
    if (soundOn()) playSound('ding');
  } else {
    blitz.wrong += 1;
    blitz.missed.push({ prompt: blitz.q.prompt, answer: blitz.q.answer });
    flash.textContent = '✗';
    flash.className = 'blitz-flash is-wrong';
  }
  el('blitz-score').textContent = `✓ ${blitz.correct}`;
  blitzTimers.push(setTimeout(() => {
    if (blitz && blitz.phase === 'run') nextBlitzQuestion();
  }, right ? 350 : 700));
}

// Time's up: a half-typed answer is ignored (AC9), the run is saved to the
// top-5 table and the results appear.
function finishBlitz() {
  const run = { date: new Date().toISOString(), correct: blitz.correct, wrong: blitz.wrong };
  const missed = blitz.missed;
  stopBlitz();
  const saved = Storage.getBlitz(BLITZ_MIX);
  const result = addBlitzRun(saved.top, run);
  const next = { version: 1, mix: BLITZ_MIX, totalRuns: saved.totalRuns + 1, top: result.top };
  if (saved.archived) next.archived = saved.archived;
  Storage.setBlitz(next);
  renderBlitzResults(run, result, missed);
  if (result.newBest && soundOn()) playSound('fanfare');
}

function renderBlitzResults(run, result, missed) {
  blitzPanel('blitz-results');
  el('app-scroll').scrollTop = 0;
  const tried = run.correct + run.wrong;
  el('blitz-final').textContent = String(run.correct);
  el('blitz-tried').textContent = `${run.correct} right out of ${tried} tried`;
  show('blitz-banner', result.newBest);
  const best = result.top[0].correct;
  el('blitz-encourage').textContent = result.place === -1
    ? `Your best is ${best}. One more go?`
    : result.newBest ? 'That’s your best ever!' : `That’s number ${result.place + 1} in your top 5!`;
  el('blitz-top').innerHTML = result.top.map((r, i) => `
    <li class="ranked-row${i === result.place ? ' is-highlight' : ''}">
      <span class="ranked-rank">${i + 1}</span>
      <span class="ranked-main">${r.correct} right</span>
      <span class="ranked-side">${escapeHtml(shortDate(r.date))}</span>
    </li>`).join('');
  show('blitz-missed-card', missed.length > 0);
  el('blitz-missed').innerHTML = missed.map((m) => `
    <li class="ranked-row"><span class="ranked-main">${escapeHtml(m.prompt.replace(/ = \?$/, ''))} = <strong>${m.answer}</strong></span></li>`).join('');
}

// AC13: Exit asks first; confirming goes Home and saves nothing.
function exitBlitz() {
  const wasRunning = blitz;
  if (wasRunning && !window.confirm('Stop this Blitz? This run won’t be saved.')) return;
  stopBlitz();
  hooks.goHome();
}

// AC14: hiding the app mid-run (Home button, lock, another app) voids it.
function voidBlitzIfRunning() {
  if (!blitz) return;
  stopBlitz();
  blitzPanel('blitz-interrupted');
}

// ======================================================================
// #144 Numbers Target
// ======================================================================

let numbers = null; // the round in progress, or null
let numbersLevel = 'starter';
let numbersBig = 1;
let tileId = 0;

function renderNumbersStats() {
  const s = Storage.getNumbersGame();
  el('numbers-stats').textContent = `Targets hit: ${s.targetsHit} · Best run of hits in a row: ${s.bestHitRun}`;
}

export function openNumbers() {
  numbers = null;
  hooks.showScreen('numbers');
  show('numbers-setup', true);
  show('numbers-board', false);
  renderNumbersStats();
  syncNumbersSetup();
}

function syncNumbersSetup() {
  document.querySelectorAll('#numbers-levels .choice-btn').forEach((b) => b.classList.toggle('selected', b.dataset.level === numbersLevel));
  document.querySelectorAll('#numbers-big .choice-btn').forEach((b) => b.classList.toggle('selected', Number(b.dataset.big) === numbersBig));
  show('numbers-big-row', numbersLevel === 'classic');
}

function startNumbersRound() {
  const round = newNumbersRound(numbersLevel, numbersBig);
  if (!round) {
    // Should never happen: every round is checked before it's shown.
    el('numbers-stats').textContent = 'Sprint couldn’t make a round just now. Try again!';
    return;
  }
  numbers = {
    ...round,
    tiles: round.numbers.map((value) => ({ id: (tileId += 1), value })),
    history: [],
    selected: null,
    op: null,
    over: false,
  };
  show('numbers-setup', false);
  show('numbers-board', true);
  show('numbers-result', false);
  show('numbers-controls', true);
  el('numbers-target').textContent = String(round.target);
  el('app-scroll').scrollTop = 0;
  numbersMessage('');
  renderNumbersBoard();
}

function numbersMessage(text) {
  el('numbers-msg').textContent = text;
}

function renderNumbersBoard() {
  const n = numbers;
  el('numbers-tiles').innerHTML = n.tiles.map((t) => `
    <button type="button" class="game-tile numbers-tile${n.selected === t.id ? ' is-selected' : ''}${t.value === n.target ? ' is-target' : ''}"
      data-tile="${t.id}" ${n.over ? 'disabled' : ''}>${t.value}</button>`).join('');
  document.querySelectorAll('#numbers-ops .numbers-op').forEach((b) => {
    b.classList.toggle('is-selected', n.op === b.dataset.op);
    b.disabled = n.over;
  });
  el('numbers-steps').innerHTML = n.history.map((h, i) => `
    <li class="ranked-row"><span class="ranked-rank">${i + 1}</span><span class="ranked-main">${escapeHtml(h.text)}</span></li>`).join('');
  el('numbers-undo-btn').disabled = n.over || n.history.length === 0;
  el('numbers-reset-btn').disabled = n.over || n.history.length === 0;
  el('numbers-done-btn').disabled = n.over;
}

function tapTile(id) {
  const n = numbers;
  if (!n || n.over) return;
  const tile = n.tiles.find((t) => t.id === id);
  if (!tile) return;
  numbersMessage('');
  if (n.selected === null || (n.op === null && n.selected !== id)) {
    n.selected = id;
  } else if (n.selected === id) {
    n.selected = null;
    n.op = null;
  } else {
    const first = n.tiles.find((t) => t.id === n.selected);
    const step = applyStep(first.value, n.op, tile.value);
    if (!step.ok) {
      numbersMessage(step.reason);
      n.selected = null;
      n.op = null;
    } else {
      // The two tiles become one, where the first one was.
      const text = formatStep({ a: first.value, op: n.op, b: tile.value, value: step.value });
      const result = { id: (tileId += 1), value: step.value };
      const at = n.tiles.indexOf(first);
      const before = n.tiles.map((t) => ({ ...t }));
      n.tiles = n.tiles.filter((t) => t.id !== first.id && t.id !== tile.id);
      n.tiles.splice(Math.min(at, n.tiles.length), 0, result);
      n.history.push({ text, before });
      n.selected = null;
      n.op = null;
      if (step.value === n.target) {
        renderNumbersBoard();
        finishNumbers(step.value, false);
        return;
      }
    }
  }
  renderNumbersBoard();
}

function tapOp(op) {
  const n = numbers;
  if (!n || n.over) return;
  if (n.selected === null) {
    numbersMessage('Tap a number first.');
    return;
  }
  numbersMessage('');
  n.op = n.op === op ? null : op;
  renderNumbersBoard();
}

function undoNumbers() {
  const n = numbers;
  if (!n || n.over || !n.history.length) return;
  n.tiles = n.history.pop().before;
  n.selected = null;
  n.op = null;
  numbersMessage('');
  renderNumbersBoard();
}

function resetNumbers() {
  const n = numbers;
  if (!n || n.over) return;
  n.tiles = n.numbers.map((value) => ({ id: (tileId += 1), value }));
  n.history = [];
  n.selected = null;
  n.op = null;
  numbersMessage('');
  renderNumbersBoard();
}

// The app's way, but only once the replay check has passed (#144 step 6).
// Returns the steps, or null (with a console warning) if the check fails.
function checkedWay() {
  const n = numbers;
  let steps = n.solution;
  if (testHooks.breakReveal) {
    testHooks.breakReveal = false;
    steps = steps.map((s, i) => (i === steps.length - 1 ? { ...s, value: s.value + 1 } : s));
  }
  const check = replaySolution(n.numbers, steps, n.target);
  if (!check.ok) {
    console.warn('Sprint Numbers Target: a solution failed its self-check, so it was not shown.', { numbers: n.numbers, target: n.target, steps, reason: check.reason });
    return null;
  }
  return steps;
}

function showWay() {
  const way = checkedWay();
  show('numbers-way-card', true);
  if (!way) {
    el('numbers-way').innerHTML = '<li class="ranked-row"><span class="ranked-main">I couldn’t find a way I’m sure of for this one.</span></li>';
    return false;
  }
  el('numbers-way').innerHTML = way.map((s, i) => `
    <li class="ranked-row"><span class="ranked-rank">${i + 1}</span><span class="ranked-main">${escapeHtml(formatStep(s))}</span></li>`).join('');
  return true;
}

// "Show me a way": before the round ends it banks the closest tile now and
// ends the round; after it, it just shows the way.
function revealNumbers() {
  const n = numbers;
  if (!n) return;
  if (n.over) { showWay(); return; }
  const closest = closestTile(n.tiles.map((t) => t.value), n.target);
  finishNumbers(closest, true);
}

// Ends the round and saves it. A reveal whose self-check fails leaves the
// round unscored (no points, and it doesn't count as a round).
function finishNumbers(closest, revealed) {
  const n = numbers;
  n.over = true;
  n.selected = null;
  n.op = null;
  renderNumbersBoard();
  show('numbers-controls', false);
  const distance = Math.abs(closest - n.target);
  const exact = distance === 0;
  let wayOk = true;
  if (revealed || !exact) wayOk = showWay();
  else show('numbers-way-card', false);
  // After a win the app's way is still there on request (#144 step 5).
  show('numbers-way-btn', exact && !revealed);

  const points = wayOk ? numbersPoints(distance) : 0;
  if (wayOk) {
    const stats = Storage.getNumbersGame();
    stats.roundsPlayed += 1;
    if (exact) {
      stats.targetsHit += 1;
      stats.currentHitRun += 1;
      stats.bestHitRun = Math.max(stats.bestHitRun, stats.currentHitRun);
    } else {
      stats.currentHitRun = 0;
    }
    stats.recent = [...stats.recent, {
      date: new Date().toISOString(), level: n.level, bigCount: n.bigCount, numbers: n.numbers,
      target: n.target, closest, exact, revealed, pointsEarned: points,
    }].slice(-20);
    Storage.setNumbersGame(stats);
    if (points > 0) {
      Storage.addPoints(points);
      hooks.refreshHeader();
    }
  }

  show('numbers-result', true);
  show('numbers-result-banner', exact);
  el('numbers-result-banner').textContent = `🎯 You hit ${n.target} exactly! +${points} ⭐`;
  let text;
  if (!wayOk) text = 'This round doesn’t count, so nothing was scored. Try another one!';
  else if (exact) text = 'Brilliant working!';
  else if (points > 0) text = `You got to ${closest}, just ${distance} away. +${points} ⭐`;
  else text = `You got to ${closest}, ${distance} away. Good try! Every round makes you quicker.`;
  el('numbers-result-text').textContent = text;
  if (exact && soundOn()) playSound('ding');
  else if (points > 0 && soundOn()) playSound('coin');
}

// ======================================================================
// #145 Close Enough
// ======================================================================

let estimate = null; // the round in progress, or null

export function startEstimate() {
  estimate = { index: 0, stars: 0, points: 0, q: null };
  hooks.showScreen('estimate');
  show('estimate-play', true);
  show('estimate-summary', false);
  nextEstimate();
}

function nextEstimate() {
  const q = estimateQuestion();
  const scale = sliderScale(q.answer);
  estimate.q = { ...q, ...scale, guess: 0, moved: false, locked: false };
  el('estimate-progress').textContent = `${estimate.index + 1} of ${ESTIMATE_ROUND}`;
  el('estimate-stars').textContent = `⭐ ${estimate.stars}`;
  el('estimate-calc').textContent = q.text;
  el('estimate-lock-btn').disabled = true;
  show('estimate-lock-btn', true);
  show('estimate-reveal', false);
  show('estimate-marker', false);
  el('estimate-slider').classList.remove('is-locked');
  el('estimate-thumb').setAttribute('aria-valuemax', String(scale.max));
  el('estimate-ticks').innerHTML = [0, 1, 2, 3, 4]
    .map((i) => `<span style="left:${i * 25}%">${fmt((scale.max * i) / 4)}</span>`).join('');
  el('app-scroll').scrollTop = 0;
  setGuess(0, false);
}

// Every guess sits on the step grid (AC5), clamped to 0..max.
function setGuess(value, moved = true) {
  const q = estimate.q;
  if (!q || q.locked) return;
  const steps = Math.round(Math.max(0, Math.min(q.max, value)) / q.step);
  q.guess = steps * q.step;
  if (moved) q.moved = true;
  const pct = (q.guess / q.max) * 100;
  el('estimate-thumb').style.left = `${pct}%`;
  el('estimate-fill').style.width = `${pct}%`;
  el('estimate-thumb').setAttribute('aria-valuenow', String(q.guess));
  el('estimate-thumb').setAttribute('aria-valuetext', fmt(q.guess));
  el('estimate-readout').textContent = fmt(q.guess);
  // AC6: nothing can be scored until the guess has been moved at least once.
  el('estimate-lock-btn').disabled = !q.moved;
}

function guessFromPointer(e) {
  const rect = el('estimate-slider').getBoundingClientRect();
  const frac = (e.clientX - rect.left) / rect.width;
  setGuess(frac * estimate.q.max);
}

function lockEstimate() {
  const q = estimate && estimate.q;
  if (!q || q.locked || !q.moved) return;
  q.locked = true;
  el('estimate-slider').classList.add('is-locked');
  const result = scoreEstimate(q.guess, q.answer);
  estimate.stars += result.stars;
  estimate.points += result.points;
  // Points are banked as each question is scored (#145 step 8), so leaving
  // part-way keeps them.
  if (result.points > 0) {
    Storage.addPoints(result.points);
    hooks.refreshHeader();
  }
  const marker = el('estimate-marker');
  marker.style.left = `${(q.answer / q.max) * 100}%`;
  marker.textContent = fmt(q.answer);
  show('estimate-marker', true);
  show('estimate-lock-btn', false);
  const starText = result.stars ? `${'⭐'.repeat(result.stars)} +${result.points}` : '';
  const title = ['Good try!', 'Close enough!', 'Really close!', 'Bullseye!'][result.stars];
  el('estimate-reveal-title').textContent = `${title} ${starText}`.trim();
  let text;
  if (result.off === 0) text = `It was exactly ${fmt(q.answer)}. Spot on!`;
  else if (result.stars === 0) text = `Good try, it was ${fmt(q.answer)}.`;
  else text = `It was ${fmt(q.answer)}. You were ${fmt(result.off)} away, within ${withinPercent(q.guess, q.answer)}%!`;
  el('estimate-reveal-text').textContent = text;
  el('estimate-next-btn').textContent = estimate.index + 1 < ESTIMATE_ROUND ? 'Next' : 'See my score';
  el('estimate-stars').textContent = `⭐ ${estimate.stars}`;
  show('estimate-reveal', true);
  if (result.stars === 3 && soundOn()) playSound('ding');
}

function nextOrFinishEstimate() {
  if (!estimate) return;
  estimate.index += 1;
  if (estimate.index < ESTIMATE_ROUND) { nextEstimate(); return; }
  const saved = Storage.getEstimation();
  // "New best!" only when strictly higher than a best that already
  // existed: the first round just sets it (AC12).
  const newBest = saved.bestRoundScore !== null && estimate.points > saved.bestRoundScore;
  const best = saved.bestRoundScore === null ? estimate.points : Math.max(saved.bestRoundScore, estimate.points);
  Storage.setEstimation({ bestRoundScore: best, roundsPlayed: saved.roundsPlayed + 1 });
  show('estimate-play', false);
  show('estimate-summary', true);
  show('estimate-banner', newBest);
  el('estimate-total-stars').textContent = String(estimate.stars);
  el('estimate-total-points').textContent = `${estimate.points} points out of 50`;
  el('estimate-best-line').textContent = newBest ? 'That’s your best round ever!' : `Your best round: ${best} points.`;
  if (newBest && soundOn()) playSound('fanfare');
  estimate = null;
  el('app-scroll').scrollTop = 0;
}

function bindEstimate() {
  const slider = el('estimate-slider');
  // Dragging the thumb, or tapping anywhere on the track (AC3). Pointer
  // capture keeps the drag going off the track; touch-action: none (CSS)
  // stops the page scrolling or bouncing while dragging.
  slider.addEventListener('pointerdown', (e) => {
    if (!estimate || !estimate.q || estimate.q.locked) return;
    slider.setPointerCapture(e.pointerId);
    guessFromPointer(e);
    e.preventDefault();
  });
  slider.addEventListener('pointermove', (e) => {
    if (!estimate || !estimate.q || !slider.hasPointerCapture(e.pointerId)) return;
    guessFromPointer(e);
  });
  el('estimate-thumb').addEventListener('keydown', (e) => {
    const q = estimate && estimate.q;
    if (!q) return;
    const moves = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 };
    if (e.key in moves) setGuess(q.guess + moves[e.key] * q.step);
    else if (e.key === 'Home') setGuess(0);
    else if (e.key === 'End') setGuess(q.max);
    else return;
    e.preventDefault();
  });
  el('estimate-minus').addEventListener('click', () => estimate && estimate.q && setGuess(estimate.q.guess - estimate.q.step));
  el('estimate-plus').addEventListener('click', () => estimate && estimate.q && setGuess(estimate.q.guess + estimate.q.step));
  el('estimate-lock-btn').addEventListener('click', lockEstimate);
  el('estimate-next-btn').addEventListener('click', nextOrFinishEstimate);
  el('estimate-again-btn').addEventListener('click', startEstimate);
  el('estimate-home-btn').addEventListener('click', () => hooks.goHome());
  // Leaving mid-round keeps the points already banked; nothing else is saved.
  el('estimate-exit-btn').addEventListener('click', () => { estimate = null; hooks.goHome(); });
}

// ======================================================================
// Wiring
// ======================================================================

export function bindGames(h) {
  hooks = h;
  document.querySelectorAll('#screen-games .game-tile-card').forEach((b) => {
    b.addEventListener('click', () => {
      const g = b.dataset.game;
      if (g === 'blitz') startBlitz();
      else if (g === 'numbers') openNumbers();
      else if (g === 'estimate') startEstimate();
      else if (g === 'guest') hooks.startGuest();
    });
  });

  // Blitz
  document.querySelectorAll('#screen-blitz [data-bkey]').forEach((k) => {
    k.addEventListener('click', () => blitzKey(k.dataset.bkey));
  });
  el('blitz-exit-btn').addEventListener('click', exitBlitz);
  el('blitz-again-btn').addEventListener('click', startBlitz);
  el('blitz-home-btn').addEventListener('click', () => hooks.goHome());
  document.addEventListener('keydown', (e) => {
    if (!blitz || blitz.phase !== 'run') return;
    if (e.key >= '0' && e.key <= '9') blitzKey(e.key);
    else if (e.key === 'Backspace') blitzKey('back');
    else if (e.key === 'Enter') blitzKey('go');
    else return;
    e.preventDefault();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') voidBlitzIfRunning();
  });

  // Numbers Target
  el('numbers-back-btn').addEventListener('click', openGames);
  document.querySelectorAll('#numbers-levels .choice-btn').forEach((b) => {
    b.addEventListener('click', () => { numbersLevel = b.dataset.level; syncNumbersSetup(); });
  });
  document.querySelectorAll('#numbers-big .choice-btn').forEach((b) => {
    b.addEventListener('click', () => { numbersBig = Number(b.dataset.big); syncNumbersSetup(); });
  });
  el('numbers-start-btn').addEventListener('click', startNumbersRound);
  el('numbers-tiles').addEventListener('click', (e) => {
    const t = e.target.closest('[data-tile]');
    if (t) tapTile(Number(t.dataset.tile));
  });
  document.querySelectorAll('#numbers-ops .numbers-op').forEach((b) => b.addEventListener('click', () => tapOp(b.dataset.op)));
  el('numbers-undo-btn').addEventListener('click', undoNumbers);
  el('numbers-reset-btn').addEventListener('click', resetNumbers);
  el('numbers-done-btn').addEventListener('click', () => {
    if (!numbers || numbers.over) return;
    finishNumbers(closestTile(numbers.tiles.map((t) => t.value), numbers.target), false);
  });
  el('numbers-reveal-btn').addEventListener('click', revealNumbers);
  el('numbers-again-btn').addEventListener('click', startNumbersRound);
  el('numbers-way-btn').addEventListener('click', () => { showWay(); show('numbers-way-btn', false); });
  el('numbers-home-btn').addEventListener('click', () => hooks.goHome());

  bindEstimate();
}
