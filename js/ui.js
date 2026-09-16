// DOM rendering + event wiring for the 4 screens. Contains no business logic —
// app.js decides what happens; this module only reads/writes the DOM.

import { PHASE_LABELS } from './pacing.js';
import { SHOP_CATEGORIES, itemsByCategory, getItem, isOwned, availableBalance } from './shop.js';
import { getJokeOfTheDay } from './jokes.js';
import { getWordOfTheDay } from './wordOfDay.js';

export const TOPIC_LABELS = {
  arithmetic: 'Arithmetic',
  fdp: 'Fractions / %',
  geometry: 'Geometry',
  wordProblems: 'Word problems',
  ratio: 'Ratio & proportion',
  algebra: 'Algebra',
  dataHandling: 'Data handling',
};

const el = (id) => document.getElementById(id);

let numericBuffer = '';
let mcqSelected = null;

// Screens with growing content (badges, mastery bars, session history) must
// never bury their primary nav button below the fold — those buttons live in
// the fixed footer instead of scrolling with the screen. The question screen
// has no page-level footer action; its Check/Next buttons stay inline since
// they're contextual to the question card, not page navigation.
export function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  el(`screen-${name}`).classList.add('active');

  document.querySelectorAll('.footer-group').forEach((g) => g.classList.remove('active'));
  const footerGroup = el(`footer-${name}`);
  el('app-footer').hidden = !footerGroup;
  if (footerGroup) footerGroup.classList.add('active');

  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
}

export function bindGlobalHandlers({ onHome, onGotoProgress, onGotoShop, onGotoSettings, onGotoImport }) {
  el('nav-home-btn').addEventListener('click', onHome);
  el('nav-progress-btn').addEventListener('click', onGotoProgress);
  el('nav-shop-btn').addEventListener('click', onGotoShop);
  el('nav-import-btn').addEventListener('click', onGotoImport);
  el('nav-settings-btn').addEventListener('click', onGotoSettings);
}

// PDF text (question prompts, explanations, error messages that quote a
// snippet of the source PDF) is untrusted content injected via innerHTML —
// escape it so a stray "<" or "&" in someone's exam paper can't be
// interpreted as markup.
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Shows a fading chevron at the top/bottom edge of the content area whenever
// there's more to scroll to in that direction — content height varies a lot
// between screens (a tall Progress page vs. a short Question card), so this
// re-checks on scroll, on window resize, and whenever the content's own
// height changes (e.g. badges/heatmap re-rendering while staying on-screen).
export function initScrollIndicators() {
  const scrollEl = el('app-scroll');
  const update = () => {
    const canUp = scrollEl.scrollTop > 4;
    const canDown = scrollEl.scrollTop + scrollEl.clientHeight < scrollEl.scrollHeight - 4;
    el('scroll-indicator-top').hidden = !canUp;
    el('scroll-indicator-bottom').hidden = !canDown;
  };
  scrollEl.addEventListener('scroll', update);
  window.addEventListener('resize', update);
  new ResizeObserver(update).observe(el('app-inner'));
  update();

  // The chevrons double as scroll buttons — tap to page up/down by most of
  // a screenful, rather than only signalling that more content exists.
  el('scroll-indicator-top').addEventListener('click', () => {
    scrollEl.scrollBy({ top: -scrollEl.clientHeight * 0.75, behavior: 'smooth' });
  });
  el('scroll-indicator-bottom').addEventListener('click', () => {
    scrollEl.scrollBy({ top: scrollEl.clientHeight * 0.75, behavior: 'smooth' });
  });
}

export function updateHeader(plan, meta, shopState, earnedBadges = []) {
  el('header-points').textContent = `⭐ ${availableBalance(meta)}`;
  renderAvatar(el('header-avatar'), shopState);

  const badgesGroupEl = el('header-badges-group');
  if (earnedBadges.length === 0) {
    badgesGroupEl.hidden = true;
  } else {
    badgesGroupEl.hidden = false;
    el('header-badges').innerHTML = earnedBadges
      .map((b) => `<span class="header-badge-icon" title="${b.label}">${b.icon}</span>`)
      .join('');
  }
}

function renderAvatar(target, shopState) {
  if (!shopState) return;
  const avatarItem = getItem(shopState.equipped.avatar) || getItem('avatar-default');
  const frameId = shopState.equipped.frame || 'frame-none';
  const accessoryItem = getItem(shopState.equipped.accessory);
  const moodItem = getItem(shopState.equipped.mood);
  const colorItem = getItem(shopState.equipped.avatarColor);
  target.dataset.frame = frameId;
  target.style.backgroundColor = colorItem && colorItem.swatch ? colorItem.swatch : '';
  const accessoryHtml = accessoryItem && accessoryItem.emoji
    ? `<span class="avatar-accessory">${accessoryItem.emoji}</span>` : '';
  const moodHtml = moodItem && moodItem.emoji
    ? `<span class="avatar-mood">${moodItem.emoji}</span>` : '';
  target.innerHTML = `<span class="avatar-emoji">${avatarItem.emoji}</span>${accessoryHtml}${moodHtml}`;
}

// ---------- Start screen ----------

// The preset length buttons (10/20 questions, 5/10 min) won't always exactly
// match a pacing-plan suggestion (e.g. 12 or 15 questions) — fall back to the
// closest preset of the same type so a button is always selected.
function selectClosestLengthButton(suggestion) {
  const buttons = [...document.querySelectorAll('#length-choices .choice-btn')];
  let best = buttons.find((b) => b.dataset.lengthType === suggestion.type
    && Number(b.dataset.lengthValue) === suggestion.value);
  if (!best) {
    const sameType = buttons.filter((b) => b.dataset.lengthType === suggestion.type);
    const pool = sameType.length ? sameType : buttons;
    best = pool.reduce((closest, b) => {
      const diff = Math.abs(Number(b.dataset.lengthValue) - suggestion.value);
      const closestDiff = Math.abs(Number(closest.dataset.lengthValue) - suggestion.value);
      return diff < closestDiff ? b : closest;
    });
  }
  buttons.forEach((b) => b.classList.toggle('selected', b === best));
}

// Only shown once there's enough real practice data to be meaningful —
// before that, every topic sits at the same default mastery score and
// "strongest/weakest" would just be noise.
function computeStrengthSummary(mastery) {
  const entries = Object.entries(mastery).filter(([, rec]) => rec.questionsSeen > 0);
  const totalSeen = entries.reduce((sum, [, rec]) => sum + rec.questionsSeen, 0);
  if (totalSeen < 5) return null;
  const sorted = [...entries].sort((a, b) => b[1].masteryScore - a[1].masteryScore);
  const strongest = sorted[0];
  const weakest = sorted[sorted.length - 1];
  if (strongest[0] === weakest[0]) return null;
  return { strongest, weakest };
}

function renderTopicWeightingPreview(plan) {
  const rows = Object.entries(plan.topicWeighting)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, w]) => `<div class="weighting-row"><span>${TOPIC_LABELS[topic] || topic}</span><span>${Math.round(w * 100)}%</span></div>`)
    .join('');
  el('topic-weighting-preview').innerHTML = `<p class="weighting-title">Today's mix if you practice all topics:</p>${rows}`;
}

export function renderStart(plan, mastery, meta, hasInProgress) {
  el('focus-phase').textContent = PHASE_LABELS[plan.phase] || 'Practice';
  el('focus-tone').textContent = meta.childName
    ? `Hi ${meta.childName}! ${plan.framingTone}`
    : plan.framingTone;
  el('focus-countdown').textContent = plan.daysRemaining >= 0
    ? `${plan.daysRemaining} day${plan.daysRemaining === 1 ? '' : 's'} to go`
    : 'Exam day!';

  const summary = computeStrengthSummary(mastery);
  const summaryEl = el('strength-summary');
  if (!summary) {
    summaryEl.hidden = true;
  } else {
    summaryEl.hidden = false;
    const [strongTopic, strongRec] = summary.strongest;
    const [weakTopic, weakRec] = summary.weakest;
    summaryEl.innerHTML = `💪 Strongest: <strong>${TOPIC_LABELS[strongTopic] || strongTopic}</strong> (${Math.round(strongRec.masteryScore * 100)}%)`
      + ` &nbsp;·&nbsp; 🎯 Focus area: <strong>${TOPIC_LABELS[weakTopic] || weakTopic}</strong> (${Math.round(weakRec.masteryScore * 100)}%)`;
  }

  el('joke-of-day').textContent = `😄 Joke of the day: ${getJokeOfTheDay()}`;

  const word = getWordOfTheDay();
  el('word-of-day').innerHTML = `📖 Word of the day: <strong>${word.word}</strong> — ${word.meaning}`;

  renderDateTime(new Date());
  renderHomeStreakWidget(meta);

  selectClosestLengthButton(plan.sessionLengthSuggestion);
  el('custom-length-panel').hidden = true;

  document.querySelectorAll('#topic-choices .choice-btn').forEach((btn, i) => {
    btn.classList.toggle('selected', i === 0);
  });
  renderTopicWeightingPreview(plan);
  el('topic-weighting-preview').hidden = false;
  hideStartWarning();

  el('resume-btn').hidden = !hasInProgress;
}

export function getSelectedLength() {
  const btn = document.querySelector('#length-choices .choice-btn.selected');
  return { type: btn.dataset.lengthType, value: Number(btn.dataset.lengthValue) };
}

export function getSelectedTopic() {
  const btn = document.querySelector('#topic-choices .choice-btn.selected');
  return btn.dataset.topic || null;
}

export function showStartWarning(message) {
  const target = el('start-warning');
  target.textContent = message;
  target.hidden = false;
}

export function hideStartWarning() {
  el('start-warning').hidden = true;
}

function syncCustomLengthButton() {
  const value = Math.min(100, Math.max(1, parseInt(el('custom-length-value').value, 10) || 15));
  const unit = document.querySelector('#custom-length-unit .unit-btn.selected').dataset.unit;
  const btn = el('length-custom-btn');
  btn.dataset.lengthType = unit;
  btn.dataset.lengthValue = String(value);
}

export function bindStartHandlers({ onStart, onResume }) {
  document.querySelectorAll('#length-choices .choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#length-choices .choice-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      el('custom-length-panel').hidden = btn.id !== 'length-custom-btn';
      if (btn.id === 'length-custom-btn') syncCustomLengthButton();
    });
  });

  el('custom-length-value').addEventListener('input', syncCustomLengthButton);
  document.querySelectorAll('#custom-length-unit .unit-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#custom-length-unit .unit-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      syncCustomLengthButton();
    });
  });

  document.querySelectorAll('#topic-choices .choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#topic-choices .choice-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      el('topic-weighting-preview').hidden = btn.dataset.topic !== '';
      hideStartWarning();
    });
  });

  el('start-btn').addEventListener('click', onStart);
  el('resume-btn').addEventListener('click', onResume);
}

// ---------- Settings screen ----------

export function renderSettings(meta) {
  el('child-name-input').value = meta.childName || '';
  el('weather-city-input').value = meta.weatherCity || '';
}

export function bindSettingsHandlers({ onNameChange, onCityChange, onClearProgress }) {
  el('child-name-input').addEventListener('change', () => {
    onNameChange(el('child-name-input').value.trim().slice(0, 20));
  });
  el('weather-city-input').addEventListener('change', () => {
    onCityChange(el('weather-city-input').value.trim().slice(0, 40));
  });
  el('clear-progress-btn').addEventListener('click', onClearProgress);
}

// ---------- Import screen ----------

export function renderImportSummary(questions) {
  const count = questions.length;
  if (count === 0) {
    el('import-count').textContent = 'No questions imported yet.';
    return;
  }
  const computedCount = questions.filter((q) => q.answerSource === 'computed').length;
  const guessedCount = questions.filter((q) => q.answerSource === 'guessed').length;
  let text = `${count} imported question${count === 1 ? '' : 's'} in total — mixed into matching topics.`;
  const notes = [];
  if (computedCount > 0) notes.push(`${computedCount} answer${computedCount === 1 ? '' : 's'} worked out automatically`);
  if (guessedCount > 0) notes.push(`${guessedCount} answer${guessedCount === 1 ? '' : 's'} guessed from the wording — worth double-checking`);
  if (notes.length > 0) text += ` (${notes.join('; ')}.)`;
  el('import-count').textContent = text;
}

// Errors are { message, hint } pairs — message says what happened (and,
// for a skipped question, exactly which one), hint says what to do about
// it, shown as a quieter second line so the list stays scannable.
export function renderImportErrors(errors) {
  const errEl = el('import-errors');
  if (!errors || errors.length === 0) {
    errEl.hidden = true;
    errEl.innerHTML = '';
    return;
  }
  errEl.hidden = false;
  const items = errors.map((e) => {
    const message = typeof e === 'string' ? e : e.message;
    const hint = typeof e === 'string' ? '' : e.hint;
    return `<li>${escapeHtml(message)}${hint ? `<span class="import-error-hint">${escapeHtml(hint)}</span>` : ''}</li>`;
  }).join('');
  errEl.innerHTML = `<p>${errors.length} question${errors.length === 1 ? '' : 's'} skipped:</p><ul>${items}</ul>`;
}

// Shows the questions from the import that just ran (not the whole
// accumulated history) so the quality of THIS upload can be inspected
// directly, card by card, the way they'll actually appear in a session.
export function renderImportPreview(questions) {
  const target = el('import-preview');
  if (!questions || questions.length === 0) {
    target.hidden = true;
    target.innerHTML = '';
    return;
  }
  target.hidden = false;
  const cards = questions.map((q, i) => {
    const sourceTag = q.answerSource && q.answerSource !== 'given'
      ? `<span class="import-tag import-tag-${q.answerSource}">${q.answerSource === 'computed' ? 'worked out' : 'guessed'}</span>`
      : '';
    // The question's own ×/÷/− symbol was reconstructed from the answer key
    // rather than read from the PDF (see examberryPdfParser.js) — worth its
    // own tag so this specific spot can be double-checked, distinct from
    // the answer itself (always 'given'/real here, never guessed).
    const recoveredTag = q.symbolsRecovered
      ? '<span class="import-tag import-tag-recovered">symbol recovered</span>'
      : '';
    const choicesHtml = q.choices
      ? `<div class="import-choices">${q.choices.map((c) => `<span class="import-choice${c === q.correctAnswer ? ' import-choice-correct' : ''}">${escapeHtml(c)}</span>`).join('')}</div>`
      : `<p class="import-answer"><strong>Answer:</strong> ${escapeHtml(q.correctAnswer)}</p>`;
    const diagramHtml = q.diagramImage
      ? `<img class="import-diagram" src="${escapeHtml(q.diagramImage)}" alt="Diagram captured from the PDF for this question" />`
      : '';
    return `
      <div class="import-card">
        <div class="import-card-head">
          <span class="import-tag">${escapeHtml(TOPIC_LABELS[q.topic] || q.topic)}</span>
          <span class="import-tag">Tier ${q.difficulty}</span>
          ${sourceTag}
          ${recoveredTag}
        </div>
        <p class="import-prompt">${i + 1}. ${escapeHtml(q.prompt)}</p>
        ${diagramHtml}
        ${choicesHtml}
        ${q.explanation ? `<p class="import-explanation">${escapeHtml(q.explanation)}</p>` : ''}
      </div>
    `;
  }).join('');
  target.innerHTML = `
    <h3 class="section-subheading">This import (${questions.length} question${questions.length === 1 ? '' : 's'})</h3>
    <div class="import-preview-list">${cards}</div>
  `;
}

export function bindImportHandlers({ onPdfFileSelected, onClear }) {
  el('import-pdf-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) onPdfFileSelected(file);
    e.target.value = '';
  });
  el('import-clear-btn').addEventListener('click', onClear);
}

// Live clock + today's date shown above the weather widget — re-called on
// an interval from app.js so it keeps ticking while the start screen is open.
export function renderDateTime(date) {
  const dateStr = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  el('datetime-widget').innerHTML = `
    <div class="datetime-time">${timeStr}</div>
    <div class="datetime-date">${dateStr}</div>
  `;
}

// Streak/points widget — moved here from the Progress screen and mirrored
// on the right of the home page, opposite the weather/time sidebar on the
// left (see .start-side-right in styles.css).
function renderHomeStreakWidget(meta) {
  const target = el('home-streak-widget');
  if (meta.currentStreakDays > 0) {
    target.innerHTML = `
      <div class="streak-widget-main">🔥 ${meta.currentStreakDays}</div>
      <div class="streak-widget-label">day streak</div>
      <div class="streak-widget-points">⭐ ${meta.totalPoints || 0} total points</div>
    `;
  } else {
    target.innerHTML = `
      <div class="streak-widget-main">⭐ ${meta.totalPoints || 0}</div>
      <div class="streak-widget-label">total points</div>
      <div class="streak-widget-points">Start today's streak!</div>
    `;
  }
}

// state: 'no-city' | 'loading' | { error } | { placeName, tempC, icon, label }
export function renderWeather(state) {
  const target = el('weather-widget');
  if (state === 'no-city') {
    target.innerHTML = '<p class="weather-empty">Add your city in Settings to see today’s weather.</p>';
  } else if (state === 'loading') {
    target.innerHTML = '<p class="weather-empty">Loading weather…</p>';
  } else if (state && state.error) {
    target.innerHTML = `<p class="weather-empty">${state.error}</p>`;
  } else if (state) {
    target.innerHTML = `
      <div class="weather-icon">${state.icon}</div>
      <div class="weather-temp">${state.tempC}°C</div>
      <div class="weather-label">${state.label}</div>
      <div class="weather-place">${state.placeName}</div>
    `;
  }
}

// ---------- Question screen ----------

export function renderHud(session, plan) {
  const count = session.lengthType === 'questions'
    ? `Q${session.questions.length + 1} / ${session.lengthValue}`
    : `Q${session.questions.length + 1}`;
  el('hud-progress').textContent = count;
  el('hud-score').textContent = `⭐ ${session.score}`;
  el('hud-streak').textContent = session.streak > 1 ? `🔥 ${session.streak}` : '';
  el('hud-timer').hidden = !plan.timerVisible || session.lengthType !== 'minutes';
}

// Celebrates the moment a streak "starts" — i.e. exactly when the 🔥 badge
// first appears (session.streak reaching 2) — with a floating toast and a
// pulse on the streak badge itself, distinct from the per-answer burst.
export function triggerStreakAnimation() {
  const hud = document.querySelector('.session-hud');
  const old = hud.querySelector('.streak-toast');
  if (old) old.remove();
  const toast = document.createElement('div');
  toast.className = 'streak-toast';
  toast.textContent = '🔥 Streak!';
  hud.appendChild(toast);
  setTimeout(() => toast.remove(), 1300);

  const badge = el('hud-streak');
  badge.classList.remove('streak-pulse');
  void badge.offsetWidth;
  badge.classList.add('streak-pulse');
}

export function updateTimer(remainingMs) {
  const timerEl = el('hud-timer');
  if (timerEl.hidden) return;
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  timerEl.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
}

export function renderQuestion(question) {
  el('question-blocked').hidden = true;
  el('question-prompt').hidden = false;
  document.querySelector('.action-slot').hidden = false;

  el('feedback-inline').hidden = true;
  el('check-btn').hidden = false;
  el('check-btn').disabled = false;
  el('next-btn').hidden = true;

  el('question-prompt').textContent = question.prompt;

  el('question-diagram').hidden = !question.diagramImage;
  if (question.diagramImage) {
    el('question-diagram-img').src = question.diagramImage;
  } else {
    // Setting src to '' resolves to the current page URL rather than
    // clearing it, triggering a pointless request for it as an image on
    // every non-diagram question — remove the attribute instead.
    el('question-diagram-img').removeAttribute('src');
  }

  numericBuffer = '';
  mcqSelected = null;
  el('numeric-display').innerHTML = '&nbsp;';
  el('text-input').value = '';

  el('answer-numeric').hidden = question.answerType !== 'numeric';
  el('answer-text').hidden = question.answerType !== 'text';
  el('answer-mcq').hidden = question.answerType !== 'mcq';

  if (question.answerType === 'mcq') {
    const mcqEl = el('answer-mcq');
    mcqEl.innerHTML = '';
    question.choices.forEach((choice) => {
      const btn = document.createElement('button');
      btn.className = 'choice-btn';
      btn.textContent = choice;
      btn.dataset.value = choice;
      btn.addEventListener('click', () => {
        mcqEl.querySelectorAll('.choice-btn').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        mcqSelected = choice;
      });
      mcqEl.appendChild(btn);
    });
  }

  if (question.answerType === 'text') {
    el('text-input').focus();
  }
}

// Shown instead of a normal question when session.js's pickNextQuestion
// finds neither an imported question for the exact topic+tier it picked NOR
// any basis to generate one — questionBank.js's getQuestion() only generates
// a filler question for a topic that's had at least one import (any tier),
// so this now only fires for a topic with zero imports anywhere (e.g.
// wordProblems, which has no procedural generator at all — see
// questionBank.js's header comment). Hides everything a real question would
// show; the only way forward is back to Home (this panel's own button, or
// the HUD's).
export function renderBlockedQuestion(topic) {
  el('question-prompt').hidden = true;
  el('question-diagram').hidden = true;
  el('answer-numeric').hidden = true;
  el('answer-text').hidden = true;
  el('answer-mcq').hidden = true;
  el('feedback-inline').hidden = true;
  document.querySelector('.action-slot').hidden = true;

  el('question-blocked').hidden = false;
  el('question-blocked-detail').textContent =
    `There's no imported question for "${TOPIC_LABELS[topic] || topic}" yet, and nothing to base a generated one on. `
    + 'Import at least one question covering this topic on the Import page, or head back and try a different topic focus.';
}

export function getCurrentAnswer(answerType) {
  if (answerType === 'numeric') return numericBuffer;
  if (answerType === 'mcq') return mcqSelected || '';
  return el('text-input').value;
}

function pressNumericKey(k) {
  if (k === 'back') {
    numericBuffer = numericBuffer.slice(0, -1);
  } else if (k === '.' && numericBuffer.includes('.')) {
    // ignore extra decimal point
  } else {
    numericBuffer += k;
  }
  el('numeric-display').textContent = numericBuffer || ' ';
}

export function bindQuestionHandlers({ onCheck, onNext, onExit }) {
  document.querySelectorAll('.key').forEach((key) => {
    key.addEventListener('click', () => pressNumericKey(key.dataset.key));
  });

  // Lets a physical keyboard drive numeric entry directly, with no need to
  // tap into the on-screen keypad first - it's a plain div, not a focusable
  // input, so typing otherwise does nothing until it's tapped.
  document.addEventListener('keydown', (e) => {
    if (el('answer-numeric').hidden) return;
    if (e.key >= '0' && e.key <= '9') pressNumericKey(e.key);
    else if (e.key === '.') pressNumericKey('.');
    else if (e.key === 'Backspace') pressNumericKey('back');
    else return;
    e.preventDefault();
  });

  // Enter drives whichever of Check/Next is currently showing — the two
  // buttons already share one slot (see renderFeedback below), so this is
  // the same "same action, no travel" idea extended to the keyboard: type
  // an answer, hit Enter to check it, hit Enter again to move on.
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (!el('screen-question').classList.contains('active')) return;
    // If Check/Next/Exit itself already has focus (e.g. after a desktop
    // mouse click), the browser's own "Enter activates the focused button"
    // behaviour already fires its click handler — dispatching onCheck/
    // onNext here too would run it a second time (double-scoring, etc).
    const active = document.activeElement;
    if (active === el('check-btn') || active === el('next-btn') || active === el('hud-exit-btn')) return;
    e.preventDefault();
    if (!el('check-btn').hidden) onCheck();
    else if (!el('next-btn').hidden) onNext();
  });

  el('check-btn').addEventListener('click', onCheck);
  el('next-btn').addEventListener('click', onNext);
  el('hud-exit-btn').addEventListener('click', onExit);
  el('question-blocked-home-btn').addEventListener('click', onExit);
}

// Check-answer and Next-question occupy the exact same slot (one hidden,
// one shown at a time) so a second tap lands in the same place with no
// cursor/finger travel between answering and advancing.
export function renderFeedback(correct, explanation, correctAnswer) {
  el('check-btn').hidden = true;
  el('next-btn').hidden = false;
  const panel = el('feedback-inline');
  panel.hidden = false;
  panel.classList.toggle('correct', correct);
  panel.classList.toggle('incorrect', !correct);
  el('feedback-result').textContent = correct ? 'Correct! 🎉' : `Not quite — the answer was ${correctAnswer}`;
  el('feedback-explanation').textContent = explanation;

  if (correct) triggerCorrectBurst();
}

// A small celebratory particle burst on a correct answer — purely CSS
// keyframes (see .correct-burst / .burst-particle), no animation library.
function triggerCorrectBurst() {
  const card = document.querySelector('.question-card');
  const old = card.querySelector('.correct-burst');
  if (old) old.remove();
  const burst = document.createElement('div');
  burst.className = 'correct-burst';
  const particles = ['⭐', '✨', '🎉', '✨', '⭐'];
  burst.innerHTML = particles
    .map((p, i) => `<span class="burst-particle" style="--dx:${(i - 2) * 26}px; animation-delay:${i * 40}ms">${p}</span>`)
    .join('');
  card.appendChild(burst);
  setTimeout(() => burst.remove(), 1200);
}

// ---------- Summary screen ----------

export function renderSummary(entry, newlyEarnedBadges = [], meta = {}, shopState = null) {
  const { summary } = entry;
  const accuracyPct = Math.round(summary.accuracy * 100);
  const avgSec = Math.round(summary.avgTimeMs / 1000);
  const topics = [...new Set(entry.questions.map((q) => TOPIC_LABELS[q.topic] || q.topic))].join(', ');

  el('summary-heading').textContent = meta.childName ? `Nice work, ${meta.childName}!` : 'Session complete!';
  renderAvatar(el('summary-avatar'), shopState);

  el('summary-card').innerHTML = `
    <div class="summary-row"><span class="label">Score</span><span class="value">${summary.correctCount} / ${summary.totalQuestions}</span></div>
    <div class="summary-row"><span class="label">Accuracy</span><span class="value">${accuracyPct}%</span></div>
    <div class="summary-row"><span class="label">Avg. time / question</span><span class="value">${avgSec}s</span></div>
    <div class="summary-row"><span class="label">Topics practiced</span><span class="value">${topics || '—'}</span></div>
    <div class="summary-row"><span class="label">Points earned</span><span class="value">⭐ ${summary.pointsEarned}</span></div>
    <div class="summary-row"><span class="label">Best streak</span><span class="value">🔥 ${summary.bestStreak}</span></div>
  `;

  const badgeEl = el('new-badges');
  if (newlyEarnedBadges.length === 0) {
    badgeEl.hidden = true;
  } else {
    badgeEl.hidden = false;
    badgeEl.innerHTML = `
      <p class="new-badges-title">New badge${newlyEarnedBadges.length > 1 ? 's' : ''} unlocked!</p>
      <div class="new-badges-row">
        ${newlyEarnedBadges.map((b, i) => `
          <div class="badge-card earned badge-card-reveal" style="animation-delay:${i * 150}ms">
            <span class="badge-sparkle">✨</span>
            <div class="badge-icon">${b.icon}</div>
            <div class="badge-label">${b.label}</div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

export function bindSummaryHandlers({ onRestart }) {
  el('summary-restart-btn').addEventListener('click', onRestart);
}

// ---------- Progress screen ----------

// A trend sparkline of recent mastery-score history — hand-rolled inline SVG,
// no charting library needed at this scale (SPEC.md §7).
function renderSparkline(history) {
  if (!history || history.length < 2) return '';
  const points = history.slice(-20);
  const w = 72;
  const h = 24;
  const pad = 2;
  const xStep = (w - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * xStep;
    const y = pad + (1 - p.masteryScore) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg class="sparkline" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>`;
}

// A simple strong/weak-at-a-glance list, sorted best to worst — replaces an
// earlier, more detailed topic x tier heatmap that was more than needed here
// (the per-topic mastery bars above already give the detailed view).
function renderStrengthOverview(mastery, topics) {
  const sorted = [...topics].sort((a, b) => mastery[b].masteryScore - mastery[a].masteryScore);
  const rows = sorted.map((t) => {
    const pct = Math.round(mastery[t].masteryScore * 100);
    const level = pct >= 70 ? 'strong' : pct >= 40 ? 'medium' : 'weak';
    const label = pct >= 70 ? 'Strong' : pct >= 40 ? 'Developing' : 'Needs work';
    return `
      <div class="strength-row strength-${level}">
        <span class="strength-topic">${TOPIC_LABELS[t] || t}</span>
        <span class="strength-detail">
          <span class="strength-pct">${pct}%</span>
          <span class="strength-tag">${label}</span>
        </span>
      </div>
    `;
  }).join('');
  el('strength-overview').innerHTML = rows;
}

export function renderProgress(mastery, meta, sessions, badgeDefinitions = [], earnedBadgeIds = []) {
  renderStrengthOverview(mastery, Object.keys(mastery));

  const barsEl = el('mastery-bars');
  barsEl.innerHTML = '';
  Object.keys(mastery).forEach((topic) => {
    const rec = mastery[topic];
    const pct = Math.round(rec.masteryScore * 100);
    const row = document.createElement('div');
    row.className = 'mastery-row';
    row.innerHTML = `
      <div class="mastery-label"><span>${TOPIC_LABELS[topic] || topic}</span><span>${pct}%</span></div>
      <div class="mastery-row-bottom">
        <div class="mastery-track"><div class="mastery-fill" style="width:${pct}%"></div></div>
        ${renderSparkline(rec.history)}
      </div>
    `;
    barsEl.appendChild(row);
  });

  const badgesEl = el('badges-grid');
  badgesEl.innerHTML = '';
  badgeDefinitions.forEach((b) => {
    const earned = earnedBadgeIds.includes(b.id);
    const card = document.createElement('div');
    card.className = `badge-card ${earned ? 'earned' : 'locked'}`;
    card.innerHTML = `
      <div class="badge-icon">${earned ? b.icon : '🔒'}</div>
      <div class="badge-label">${b.label}</div>
      <div class="badge-desc">${b.description}</div>
    `;
    badgesEl.appendChild(card);
  });

  const historyEl = el('session-history');
  historyEl.innerHTML = '';
  const recent = [...sessions].reverse().slice(0, 10);
  if (recent.length === 0) {
    historyEl.innerHTML = '<p class="empty-state">No sessions yet — get started above!</p>';
  } else {
    recent.forEach((s) => {
      const sessionDate = new Date(s.date);
      const dateStr = sessionDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const timeStr = sessionDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      const accuracyPct = Math.round(s.summary.accuracy * 100);
      const row = document.createElement('div');
      row.className = 'session-history-row';
      row.innerHTML = `<span>${dateStr}, ${timeStr}</span><span class="value">${s.summary.correctCount}/${s.summary.totalQuestions} (${accuracyPct}%)</span>`;
      historyEl.appendChild(row);
    });
  }
}

// ---------- Shop screen ----------

export function renderShop(shopState, meta) {
  el('shop-balance').textContent = `⭐ ${availableBalance(meta)} available to spend`;

  const container = el('shop-categories');
  container.innerHTML = SHOP_CATEGORIES.map(({ key, label }) => {
    const items = itemsByCategory(key).map((item) => {
      const owned = isOwned(item.id, shopState.ownedItemIds);
      const equipped = shopState.equipped[key] === item.id;
      let preview = '';
      if (item.category === 'theme' || item.category === 'avatarColor') preview = `<div class="shop-item-swatch" style="background:${item.swatch}"></div>`;
      else if (item.category === 'avatar') preview = `<div class="shop-item-emoji">${item.emoji}</div>`;
      else if (item.category === 'accessory' || item.category === 'mood') preview = `<div class="shop-item-emoji">${item.emoji || '—'}</div>`;
      else if (item.category === 'font') preview = `<div class="shop-item-font-sample" style="font-family:${item.id === 'font-rounded' ? '\'Comic Sans MS\', cursive' : item.id === 'font-mono' ? 'monospace' : 'inherit'}">Aa</div>`;
      else if (item.category === 'frame') preview = `<div class="shop-item-frame-sample frame-${item.id}"></div>`;

      let actionLabel;
      let disabled = false;
      if (equipped) actionLabel = 'Equipped';
      else if (owned) actionLabel = 'Equip';
      else {
        actionLabel = `Buy ⭐${item.cost}`;
        disabled = availableBalance(meta) < item.cost;
      }

      return `
        <div class="shop-item ${equipped ? 'equipped' : ''}">
          ${preview}
          <div class="shop-item-label">${item.label}</div>
          <button class="shop-item-action ${owned ? 'owned' : ''}" data-item-id="${item.id}" ${equipped || disabled ? 'disabled' : ''}>${actionLabel}</button>
        </div>
      `;
    }).join('');

    return `
      <div class="shop-category">
        <h3 class="shop-category-title">${label}</h3>
        <div class="shop-grid">${items}</div>
      </div>
    `;
  }).join('');
}

export function bindShopHandlers({ onPurchaseOrEquip }) {
  el('shop-categories').addEventListener('click', (e) => {
    const btn = e.target.closest('.shop-item-action');
    if (!btn || btn.disabled) return;
    onPurchaseOrEquip(btn.dataset.itemId);
  });
}
