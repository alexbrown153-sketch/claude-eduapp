// DOM rendering + event wiring for the 4 screens. Contains no business logic —
// app.js decides what happens; this module only reads/writes the DOM.

import { PHASE_LABELS } from './pacing.js';
import { comboMultiplier, regularCount } from './session.js';
import { computeStrengthSummary } from './mastery.js';
import { SHOP_CATEGORIES, itemsByCategory, getItem, isOwned, availableBalance, STREAK_SHIELD, MAX_STREAK_SHIELDS } from './shop.js';
import { getJokeOfTheDay, getRandomJoke } from './jokes.js';
import { getWordOfTheDay, getRandomWordOfDay } from './wordOfDay.js';
import { CHANGELOG } from './changelog.js';
import { answerShape, answerShapeExample, splitExplanationSteps } from './questionBank.js';
import { TOPIC_TIERS, MIN_TIER_QUESTIONS, displayedPct } from './badges.js';
import { mapPosition, MAP_STEPS_PER_AREA } from './records.js';
import { QUEST_BONUS } from './quests.js';
import { addDays, weekRange } from './dates.js';
import { TOPICS, YEAR7_TOPICS, ALL_TOPICS } from './storage.js';

export const TOPIC_LABELS = {
  arithmetic: 'Arithmetic',
  fdp: 'Fractions / %',
  geometry: 'Geometry',
  coordinates: 'Coordinates',
  wordProblems: 'Word problems',
  ratio: 'Ratio & proportion',
  algebra: 'Algebra',
  dataHandling: 'Data handling',
  // Roadmap #148: the same words on chips, Progress, badges and summaries.
  negatives: 'Negative numbers',
  powersRoots: 'Powers & roots',
  primes: 'Primes & factors',
  probability: 'Probability',
  bracketEquations: 'Equations with brackets',
};

const el = (id) => document.getElementById(id);

let numericBuffer = '';
let mcqSelected = null;
// Roadmap #146: the working line picked on a "Spot the mistake" question
// (its line number as a string, like an MCQ value), or null.
let spotSelected = null;
// Roadmap #148: the "−" key is on the pad for this question (every Year 7
// keypad question, whatever its answer's sign).
let minusAllowed = false;

// Roadmap #98: a typed ('text') answer made only of digits, spaces, '.', '/'
// and 'r' — a remainder like "12 r 3" or a fraction like "3/4" — is entered
// on the on-screen keypad (plus an r and / row) instead of the text box, so
// the iPad keyboard never slides up over the question. Ratios ("2:3"), times
// ("3:30") and words keep the text box.
let keypadExtra = false;
function usesKeypad(question) {
  if (question.answerType === 'numeric') return true;
  return question.answerType === 'text' && /^[0-9 ./r]+$/.test(String(question.correctAnswer));
}
// "12r3" is shown (and handed to marking) as "12 r 3"; marking ignores
// spaces anyway, so this is only for looks.
function keypadText() {
  return numericBuffer.replace('r', ' r ');
}
// What the answer box shows: the typed minus (saved as an ASCII "-" so
// marking's parseFloat reads it) is drawn as a true minus sign.
function displayText() {
  return keypadText().replace('-', '\u2212');
}

// True between checking an answer and moving to the next question. The
// answer controls are read-only in that window, so a stray keypad tap (or a
// physical keypress — see bindQuestionHandlers) can't rewrite the answer
// that's just been marked.
let answerLocked = false;

// Handle for the timer that retires the centred verdict overlay, kept so a
// second verdict (or a streak banner extending the first) can reset it.
let verdictTimer = null;

// Roadmap #124: the explanation steps not yet revealed after a wrong answer.
let pendingSteps = [];
// True when the latest touch was the one that dismissed the "Not quite"
// banner, so that same touch can't also reveal a step (#124 AC10).
let tapDismissedVerdict = false;

// Roadmap #133: called once the r-key tip has been dismissed, so app.js can
// remember it's been seen (set in bindQuestionHandlers).
let onRemainderTipSeen = () => {};

// Currently displayed joke/word, tracked so the refresh button (roadmap #86)
// can avoid repeating the one already on screen.
let currentJoke = null;
let currentWord = null;

// Screens with growing content (badges, mastery bars, session history) must
// never bury their primary nav button below the fold — those buttons live in
// the fixed footer instead of scrolling with the screen. The question screen
// has no page-level footer action; its Check/Next buttons stay inline since
// they're contextual to the question card, not page navigation.
export function showScreen(name) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  el(`screen-${name}`).classList.add('active');

  // Exiting mid-verdict (the HUD's Exit button, or finishing the session on
  // the same tap) would otherwise leave the overlay floating over Home.
  if (name !== 'question') hideVerdict(true);

  document.querySelectorAll('.footer-group').forEach((g) => g.classList.remove('active'));
  const footerGroup = el(`footer-${name}`);
  el('app-footer').hidden = !footerGroup;
  if (footerGroup) footerGroup.classList.add('active');

  // The Trophy cabinet (#134) belongs to Progress, so Progress stays lit.
  const navName = name === 'cabinet' ? 'progress' : name;
  document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.nav === navName));
  currentScreenName = name;
  screenListeners.forEach((fn) => fn(name));
}

// Roadmap #143-#147: games and the guest round listen for screen changes so
// that leaving part-way (the nav buttons, Home) stops their clocks and
// throws the unfinished round away.
const screenListeners = [];
export function onScreenChange(fn) {
  screenListeners.push(fn);
}

let currentScreenName = 'start';
export function currentScreen() {
  return currentScreenName;
}

export function bindGlobalHandlers({ onHome, onGotoProgress, onGotoShop, onGotoSettings, onGotoImport, onGotoSuggestions }) {
  el('nav-home-btn').addEventListener('click', onHome);
  el('nav-progress-btn').addEventListener('click', onGotoProgress);
  el('nav-shop-btn').addEventListener('click', onGotoShop);
  el('nav-suggestions-btn').addEventListener('click', onGotoSuggestions);
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

// The joke/word panels share the sidebar's card shell (see styles.css): a
// small labelled heading row (with a refresh button, roadmap #86), then the
// content itself, rather than one run-on line with the label buried in it.
// Both strings come from our own fixed lists, so they need no escaping.
function renderJokePanel(joke) {
  el('joke-of-day').innerHTML = `
    <div class="panel-head">
      <span class="panel-icon">😄</span><span class="panel-title">Joke of the day</span>
      <button type="button" class="panel-refresh-btn" id="joke-refresh-btn" aria-label="Get another joke">🔄</button>
    </div>
    <p class="joke-text">${joke}</p>`;
}

function renderWordPanel(word) {
  el('word-of-day').innerHTML = `
    <div class="panel-head">
      <span class="panel-icon">📖</span><span class="panel-title">Word of the day</span>
      <button type="button" class="panel-refresh-btn" id="word-refresh-btn" aria-label="Get another word">🔄</button>
    </div>
    <p class="word-term">${word.word}</p>
    <p class="word-meaning">${word.meaning}</p>`;
}

function renderTopicWeightingPreview(plan) {
  const rows = Object.entries(plan.topicWeighting)
    .sort((a, b) => b[1] - a[1])
    .map(([topic, w]) => `<div class="weighting-row"><span>${TOPIC_LABELS[topic] || topic}</span><span>${Math.round(w * 100)}%</span></div>`)
    .join('');
  el('topic-weighting-preview').innerHTML = `<p class="weighting-title">Today's mix if you practice all topics:</p>${rows}`;
}

// Roadmap #96 (SPEC §6a): the focus card names today's focus — the same
// weakest topic as the "Focus area" line, the Next session widget and the
// summary's "practise next time" line, so all of them always agree. Until
// there's enough data for that it falls back to the phase's own label, and
// during the diagnostic it shows the warm-up quiz title (#118).
function focusTitle(plan, mastery, checkupDue = false) {
  if (plan.phase === 'diagnostic') return PHASE_LABELS.diagnostic;
  if (checkupDue) return 'Check-up time!'; // Roadmap #149
  const summary = computeStrengthSummary(mastery);
  if (!summary) return PHASE_LABELS[plan.phase] || 'Daily practice';
  const topic = summary.weakest[0];
  return `Today's focus: ${TOPIC_LABELS[topic] || topic}`;
}

export function renderStart(plan, mastery, meta, hasInProgress, extras = {}) {
  const checkupDue = Boolean(extras.checkup && extras.checkup.due);
  const tone = checkupDue
    ? `A quick ${extras.checkup.length}-question quiz across every topic, to see how you\u2019re doing now.`
    : plan.framingTone;
  el('focus-phase').textContent = focusTitle(plan, mastery, checkupDue);
  el('focus-tone').textContent = meta.childName ? `Hi ${meta.childName}! ${tone}` : tone;
  el('checkup-btn').hidden = !checkupDue;
  renderGoalRing(extras.goal);
  renderParentNote(extras.parentNote);
  renderRecap(extras.recap);
  renderRewardGoalCard(extras.rewardGoal, meta);
  renderFixCard(extras.fix);
  renderQuests(extras.quests);
  renderAdventureCard(extras.map, extras.shopState);

  const summary = computeStrengthSummary(mastery);
  const summaryEl = el('strength-summary');
  if (!summary) {
    summaryEl.hidden = true;
  } else {
    summaryEl.hidden = false;
    const [weakTopic, weakRec] = summary.weakest;
    let strongText = 'We\u2019ll find out as you practise';
    if (summary.strongest) {
      const [strongTopic, strongRec] = summary.strongest;
      strongText = `<strong>${TOPIC_LABELS[strongTopic] || strongTopic}</strong> (${Math.round(strongRec.masteryScore * 100)}%)`;
    }
    summaryEl.innerHTML = `💪 Strongest: ${strongText}`
      + ` &nbsp;·&nbsp; 🎯 Focus area: <strong>${TOPIC_LABELS[weakTopic] || weakTopic}</strong> (${Math.round(weakRec.masteryScore * 100)}%)`;
  }

  currentJoke = getJokeOfTheDay();
  renderJokePanel(currentJoke);

  currentWord = getWordOfTheDay();
  renderWordPanel(currentWord);

  renderDateTime(new Date());
  renderHomeStreakWidget(meta, extras.chestAvailable);
  renderNextSessionWidget(mastery, plan);
  renderPersonalBestsWidget(extras.personalBests);

  selectClosestLengthButton(plan.sessionLengthSuggestion);
  el('custom-length-panel').hidden = true;

  document.querySelectorAll('.topic-grid .choice-btn').forEach((btn) => {
    btn.classList.toggle('selected', btn.dataset.topic === '');
  });
  renderYear7Chips(meta, mastery);
  renderTopicWeightingPreview(plan);
  el('topic-weighting-preview').hidden = false;
  hideStartWarning();

  el('resume-btn').hidden = !hasInProgress;
  el('home-notice').hidden = true;
  renderBackupReminder(Boolean(extras.backupReminderDue));
}

// Roadmap #148: the Year 7 chips appear only while the switch is on. Each
// carries a "New" tag until its topic has had one question answered.
function renderYear7Chips(meta, mastery) {
  el('year7-chips').hidden = !meta.year7PackEnabled;
  document.querySelectorAll('#year7-choices .choice-btn').forEach((btn) => {
    const t = btn.dataset.topic;
    const fresh = !mastery[t] || mastery[t].questionsSeen === 0;
    btn.innerHTML = `${escapeHtml(TOPIC_LABELS[t])}${fresh ? ' <span class="new-tag">New</span>' : ''}`;
  });
}

// ---------- Daily goal ring (Roadmap #130) ----------

// goal: { count, target, sparkle } — sparkle is true the first time Home
// is shown after the goal was reached today (app.js remembers that). The
// ring is a picture, not a button, and never overflows past full.
const RING_R = 18;
const RING_C = 2 * Math.PI * RING_R;
function renderGoalRing(goal) {
  const target = el('goal-ring');
  if (!goal) { target.hidden = true; return; }
  target.hidden = false;
  const done = goal.count >= goal.target;
  const filled = Math.min(1, goal.count / goal.target) * RING_C;
  target.className = `goal-ring${done ? ' goal-done' : ''}${done && goal.sparkle ? ' goal-sparkle' : ''}`;
  target.innerHTML = `
    <span class="goal-ring-pic" aria-hidden="true">
      <svg viewBox="0 0 44 44" class="goal-ring-svg">
        <circle class="goal-ring-track" cx="22" cy="22" r="${RING_R}" />
        ${filled > 0 ? `<circle class="goal-ring-fill" cx="22" cy="22" r="${RING_R}" stroke-dasharray="${filled.toFixed(2)} ${RING_C.toFixed(2)}" transform="rotate(-90 22 22)" />` : ''}
      </svg>
      <span class="goal-ring-star">${done ? '⭐' : ''}</span>
    </span>
    <span class="goal-ring-text"><span class="goal-ring-label">Today\u2019s goal</span>
      ${done ? `Goal done! ${goal.count} today` : `${goal.count} / ${goal.target} questions today`}</span>`;
}

// ---------- Note from a grown-up (Roadmap #139) ----------

// note: { text } or null. Plain text, line breaks kept (CSS pre-line).
export function renderParentNote(note) {
  el('parent-note-card').hidden = !note;
  el('parent-note-text').textContent = note ? note.text : '';
}

export function isParentNoteShowing() {
  return !el('parent-note-card').hidden;
}

// ---------- Monthly recap (Roadmap #141) ----------

function monthName(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'long' });
}

// recap: computeMonthlyRecap() for last month, or null. Only ever good news:
// nothing here says anything went down.
export function renderRecap(recap) {
  const card = el('recap-card');
  card.hidden = !recap;
  if (!recap) return;
  const month = monthName(recap.month);
  el('recap-title').textContent = `🗓️ Your ${month} in Sprint`;
  const lines = [`You answered <strong>${recap.questions}</strong> question${recap.questions === 1 ? '' : 's'} in ${month}!`];
  if (recap.improved) {
    const { topic, fromPct, toPct } = recap.improved;
    lines.push(`📈 Most improved: <strong>${escapeHtml(TOPIC_LABELS[topic] || topic)}</strong>, ${fromPct}% \u2192 ${toPct}%`);
  } else if (recap.mostPractised) {
    const { topic, count } = recap.mostPractised;
    lines.push(`💪 Most practised: <strong>${escapeHtml(TOPIC_LABELS[topic] || topic)}</strong> (${count} question${count === 1 ? '' : 's'})`);
  }
  const broken = RECORD_ROWS.filter((r) => recap.records.includes(r.key) && recap.recordValues[r.key] !== null);
  if (broken.length) {
    broken.forEach((r) => lines.push(`${r.icon} New record: ${escapeHtml(r.label)}, ${escapeHtml(r.format(recap.recordValues[r.key]))}`));
  } else if (recap.bestCombo > 0) {
    lines.push(`🔥 Best combo in ${month}: ${recap.bestCombo} in a row`);
  }
  el('recap-lines').innerHTML = lines.map((l) => `<li>${l}</li>`).join('');
}

// ---------- Reward goal (Roadmap #138) ----------

const fmtPoints = (n) => Number(n).toLocaleString('en-GB');
// The celebration plays once per app load, not on every Home visit.
let rewardCelebrated = false;

// goal: { label, targetPoints, baselinePoints } or null. Progress is points
// earned since the goal was saved (lifetime total minus the total then), so
// spending in the Shop never moves it back; clamped to 0..target.
function renderRewardGoalCard(goal, meta) {
  const card = el('reward-goal-card');
  card.hidden = !goal;
  if (!goal) return;
  const progress = Math.max(0, Math.min(goal.targetPoints, (meta.totalPoints || 0) - goal.baselinePoints));
  const pct = goal.targetPoints > 0 ? (progress / goal.targetPoints) * 100 : 0;
  const reached = progress >= goal.targetPoints;
  const celebrate = reached && !rewardCelebrated;
  if (reached) rewardCelebrated = true;
  card.classList.toggle('reward-reached', reached);
  card.classList.toggle('reward-celebrate', celebrate);
  const text = reached
    ? `Goal reached! Show a grown-up to claim your ${escapeHtml(goal.label)} 🎉`
    : `${fmtPoints(progress)} / ${fmtPoints(goal.targetPoints)} points \u00b7 ${fmtPoints(goal.targetPoints - progress)} to go`;
  card.innerHTML = `
    <p class="home-card-title">🎯 ${escapeHtml(goal.label)}</p>
    <div class="reward-track" aria-hidden="true"><div class="reward-fill" style="width:${pct.toFixed(1)}%"></div></div>
    <p class="reward-text">${text}</p>`;
}

// ---------- Fix my mistakes card (Roadmap #128) ----------

// fix: { count, hadAny }. Hidden with no mistakes in the last 7 days; "all
// fixed" (no button) when there were some and every one is fixed.
function renderFixCard(fix) {
  const card = el('fix-card');
  if (!fix || (!fix.count && !fix.hadAny)) { card.hidden = true; return; }
  card.hidden = false;
  el('fix-btn').hidden = !fix.count;
  el('fix-card-detail').textContent = fix.count
    ? `${fix.count} to fix from this week${fix.count > 10 ? ' (10 at a time)' : ''}. New numbers, same kind of question.`
    : 'All this week\u2019s mistakes fixed ✅';
}

// ---------- Weekly quests (Roadmap #136) ----------

// quests: { state, progress, firstBadge } or null (before the warm-up quiz).
function questLabel(q, topic) {
  if (q.id === 'topic') return `Answer ${q.target} ${TOPIC_LABELS[topic] || topic} questions`;
  if (q.id === 'perfect') return 'Have one perfect session (10 or more questions, all right)';
  return q.target === 1 ? 'Practise on 1 day' : `Practise on ${q.target} different days`;
}
const QUEST_ICONS = { topic: '🎯', perfect: '💯', days: '📅' };

function renderQuests(quests) {
  const target = el('quests-widget');
  if (!quests) { target.hidden = true; return; }
  target.hidden = false;
  const { state, progress } = quests;
  const rows = state.quests.map((q) => {
    const done = Boolean(q.completedAt) || (progress[q.id] || 0) >= q.target;
    const shown = Math.min(progress[q.id] || 0, q.target);
    return `
      <div class="quest-row${done ? ' quest-done' : ''}">
        <span class="quest-icon" aria-hidden="true">${QUEST_ICONS[q.id] || '⭐'}</span>
        <div class="quest-body">
          <div class="quest-label">${escapeHtml(questLabel(q, state.topic))}</div>
          <div class="quest-bar-row">
            <div class="quest-track" aria-hidden="true"><div class="quest-fill" style="width:${((shown / q.target) * 100).toFixed(1)}%"></div></div>
            <span class="quest-count">${done ? '✅' : `${shown} / ${q.target}`}</span>
          </div>
        </div>
      </div>`;
  }).join('');
  const allDone = state.quests.every((q) => q.completedAt);
  const footer = allDone
    ? 'All done this week! 🎉'
    : `Finish all 3 for +${QUEST_BONUS} ⭐${quests.firstBadge ? ' and a badge' : ''}`;
  target.innerHTML = `<div class="next-session-title">🗺️ This week\u2019s quests</div>${rows}<p class="quest-footer">${footer}</p>`;
}

// ---------- Adventure map (Roadmap #137) ----------

// One area per topic, in TOPICS order. Decoration only: being in an area
// never changes which questions are asked.
export const MAP_AREAS = {
  arithmetic: { name: 'Number Peaks', icon: '⛰️' },
  fdp: { name: 'Fraction Forest', icon: '🌲' },
  geometry: { name: 'Shape Canyon', icon: '🔺' },
  coordinates: { name: 'Grid Islands', icon: '🏝️' },
  wordProblems: { name: 'Story Village', icon: '🏘️' },
  ratio: { name: 'Ratio River', icon: '🌊' },
  algebra: { name: 'Algebra Caves', icon: '🕳️' },
  dataHandling: { name: 'Data Desert', icon: '🏜️' },
};
const areaOf = (i) => MAP_AREAS[TOPICS[i]] || { name: TOPIC_LABELS[TOPICS[i]] || TOPICS[i], icon: '📍' };

function renderAdventureCard(map, shopState) {
  const card = el('adventure-card');
  if (!map) { card.hidden = true; return; }
  card.hidden = false;
  const pos = mapPosition(map.steps);
  const here = areaOf(pos.area);
  const next = areaOf((pos.area + 1) % TOPICS.length);
  const left = MAP_STEPS_PER_AREA - pos.step;
  card.innerHTML = `
    <span class="adventure-avatar header-avatar" aria-hidden="true"></span>
    <span class="adventure-body">
      <span class="adventure-title">🗺️ Adventure${pos.lap > 1 ? ` \u00b7 Lap ${pos.lap}` : ''}</span>
      <span class="adventure-where">${here.icon} ${here.name}</span>
      <span class="adventure-next">${left} step${left === 1 ? '' : 's'} to ${next.name}</span>
    </span>`;
  card.setAttribute('aria-label', `Adventure map: you're in ${here.name}, ${left} step${left === 1 ? '' : 's'} to ${next.name}`);
  renderAvatar(card.querySelector('.adventure-avatar'), shopState);
}

// The map itself: every area of the current lap, top to bottom, with its
// five steps winding left and right. `fromSteps` (opened from the summary)
// starts the avatar on its old step and moves it to the new one, unless
// the child has asked the iPad to reduce motion.
export function renderMap(steps, shopState, fromSteps = null) {
  const pos = mapPosition(steps);
  const here = pos.area * MAP_STEPS_PER_AREA + pos.step;
  el('map-lap').textContent = pos.lap > 1 ? `Lap ${pos.lap}` : 'Every session of 5 or more questions moves you one step.';
  let n = 0;
  const areas = TOPICS.map((t, a) => {
    const area = areaOf(a);
    const dots = Array.from({ length: MAP_STEPS_PER_AREA }, (_, i) => {
      const idx = a * MAP_STEPS_PER_AREA + i;
      // A gentle zig-zag: x from 15% to 85% of the width.
      const x = 50 + 35 * Math.sin((n += 1) * 0.9);
      const cls = idx < here ? 'visited' : (idx === here ? 'current' : 'future');
      return `<span class="map-step map-step-${cls}" data-step="${idx}" style="left:${x.toFixed(1)}%"></span>`;
    }).join('');
    return `
      <div class="map-area map-area-${a % 4}">
        <p class="map-area-name"><span aria-hidden="true">${area.icon}</span> ${area.name}</p>
        <div class="map-steps">${dots}</div>
      </div>`;
  }).join('');
  const path = el('map-path');
  path.innerHTML = `<svg class="map-line" aria-hidden="true"></svg>${areas}<span class="map-avatar header-avatar" aria-label="You are here"></span>`;
  renderAvatar(path.querySelector('.map-avatar'), shopState);
  requestAnimationFrame(() => placeMapAvatar(here, fromSteps));
}

// Centre of step `idx`, in the path's own coordinates.
function stepCentre(idx) {
  const path = el('map-path');
  const dot = path.querySelector(`.map-step[data-step="${idx}"]`);
  if (!dot) return null;
  const p = path.getBoundingClientRect();
  const r = dot.getBoundingClientRect();
  return { x: r.left - p.left + r.width / 2, y: r.top - p.top + r.height / 2 };
}

function drawMapLine() {
  const path = el('map-path');
  const svg = path.querySelector('.map-line');
  if (!svg) return;
  const pts = [...path.querySelectorAll('.map-step')].map((d) => stepCentre(Number(d.dataset.step)));
  svg.setAttribute('width', path.clientWidth);
  svg.setAttribute('height', path.clientHeight);
  svg.innerHTML = `<polyline points="${pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')}" />`;
}

function placeMapAvatar(here, fromSteps) {
  if (!el('screen-map').classList.contains('active')) return;
  drawMapLine();
  const avatar = el('map-path').querySelector('.map-avatar');
  const put = (idx) => {
    const c = stepCentre(idx);
    if (c) avatar.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px) translate(-50%, -50%)`;
  };
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let from = null;
  if (fromSteps !== null && !reduce) {
    const before = mapPosition(fromSteps);
    const idx = before.area * MAP_STEPS_PER_AREA + before.step;
    // Only animate along this lap's path; a new lap simply starts at the top.
    if (idx < here) from = idx;
  }
  avatar.classList.remove('map-avatar-moving');
  put(from ?? here);
  const scroller = el('app-scroll');
  const c = stepCentre(here);
  if (c) {
    const p = el('map-path').getBoundingClientRect();
    const view = scroller.getBoundingClientRect();
    scroller.scrollBy({ top: p.top + c.y - (view.top + view.height / 2) });
  }
  if (from !== null) {
    void avatar.offsetWidth;
    avatar.classList.add('map-avatar-moving');
    setTimeout(() => put(here), 300);
  }
}

// The path is drawn from measured positions, so redraw it when the iPad is
// turned round.
window.addEventListener('resize', () => {
  if (!el('screen-map').classList.contains('active')) return;
  const cur = el('map-path').querySelector('.map-step-current');
  if (cur) placeMapAvatar(Number(cur.dataset.step), null);
});

// A one-off message under the focus card, e.g. "Progress restored" (#150).
// Cleared by the next renderStart.
export function showHomeNotice(message) {
  el('home-notice').textContent = message;
  el('home-notice').hidden = false;
}

// Roadmap #151: app.js decides whether a backup is due; this only shows the
// card, plus #150's error message if a save from it failed.
export function renderBackupReminder(show, error = '') {
  el('backup-reminder').hidden = !show;
  el('backup-reminder-error').textContent = error;
  el('backup-reminder-error').hidden = !error;
}

export function getSelectedLength() {
  const btn = document.querySelector('#length-choices .choice-btn.selected');
  return { type: btn.dataset.lengthType, value: Number(btn.dataset.lengthValue) };
}

export function getSelectedTopic() {
  const btn = document.querySelector('.topic-grid .choice-btn.selected');
  return btn ? btn.dataset.topic || null : null;
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

export function bindStartHandlers({ onStart, onResume, onBackupReminderSave, onBackupReminderSnooze, onStartCheckup, onStartFix, onNoteThanks, onRecapDismiss, onOpenMap, onOpenGames }) {
  el('games-btn').addEventListener('click', onOpenGames);
  el('checkup-btn').addEventListener('click', onStartCheckup);
  el('fix-btn').addEventListener('click', onStartFix);
  el('parent-note-thanks').addEventListener('click', onNoteThanks);
  el('recap-dismiss').addEventListener('click', onRecapDismiss);
  el('adventure-card').addEventListener('click', onOpenMap);
  el('backup-reminder-save').addEventListener('click', onBackupReminderSave);
  el('backup-reminder-snooze').addEventListener('click', onBackupReminderSnooze);
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

  // One selection across the core chips and the Year 7 chips (#148).
  document.querySelectorAll('.topic-grid .choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.topic-grid .choice-btn').forEach((b) => b.classList.remove('selected'));
      btn.classList.add('selected');
      el('topic-weighting-preview').hidden = btn.dataset.topic !== '';
      hideStartWarning();
    });
  });

  el('start-btn').addEventListener('click', onStart);
  el('resume-btn').addEventListener('click', onResume);

  // Delegated on the panel container (not the button itself), since
  // renderJokePanel/renderWordPanel replace the button element on every
  // re-render of the Start screen.
  el('joke-of-day').addEventListener('click', (e) => {
    if (!e.target.closest('.panel-refresh-btn')) return;
    currentJoke = getRandomJoke(currentJoke);
    renderJokePanel(currentJoke);
  });
  el('word-of-day').addEventListener('click', (e) => {
    if (!e.target.closest('.panel-refresh-btn')) return;
    currentWord = getRandomWordOfDay(currentWord && currentWord.word);
    renderWordPanel(currentWord);
  });
}

// ---------- Settings screen ----------

export function renderSettings(meta, syncConfig) {
  el('child-name-input').value = meta.childName || '';
  el('weather-city-input').value = meta.weatherCity || '';
  document.querySelectorAll('#colour-mode-choices .choice-btn').forEach((btn) => {
    const on = btn.dataset.colourMode === (meta.colourMode || 'light');
    btn.classList.toggle('selected', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  // Roadmap #142
  document.querySelectorAll('#sound-choices .choice-btn').forEach((btn) => {
    const on = btn.dataset.sound === (meta.soundOn ? 'on' : 'off');
    btn.classList.toggle('selected', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  // Roadmap #148
  document.querySelectorAll('#year7-choices-setting .choice-btn').forEach((btn) => {
    const on = btn.dataset.year7 === (meta.year7PackEnabled ? 'on' : 'off');
    btn.classList.toggle('selected', on);
    btn.setAttribute('aria-pressed', String(on));
  });
  el('note-heading').textContent = `Note for ${meta.childName || 'your child'}`;
  renderSyncSettings(syncConfig);
  renderChangelog();
  const last = meta.lastBackupAt ? new Date(meta.lastBackupAt) : null;
  el('backup-last').textContent = last && !Number.isNaN(last.getTime())
    ? `Last backup: ${last.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}`
    : 'Never backed up';
}

// ---------- For grown-ups: note (#139) and reward goal (#138) ----------

// Once saved, the note's text isn't left on screen (so the child can't
// spoil it by opening Settings): just whether it's been seen, plus Edit and
// Delete. `editing` reopens the box with the text filled in. Kept apart
// from renderSettings so changing the name or colour mode never wipes a
// half-written note.
export function renderNoteSettings(note, childName, editing = false) {
  const showEditor = !note || editing;
  el('note-editor').hidden = !showEditor;
  el('note-saved').hidden = showEditor;
  if (showEditor) {
    el('note-input').value = note && editing ? note.text : '';
    updateNoteCount();
    return;
  }
  const who = childName || 'your child';
  if (note.seenAt) {
    const when = new Date(note.seenAt);
    const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    el('note-status').textContent = `Seen ${shortDay(note.seenAt)}, ${time}`;
  } else {
    el('note-status').textContent = `Waiting for ${who} to see it`;
  }
}

function updateNoteCount() {
  const text = el('note-input').value;
  el('note-count').textContent = `${text.length} / 200`;
  el('note-save-btn').disabled = text.trim() === '';
}

// Fills the reward goal fields from the saved goal (or empties them).
export function renderRewardGoalSettings(goal) {
  el('reward-label-input').value = goal ? goal.label : '';
  el('reward-target-input').value = goal ? String(goal.targetPoints) : '';
  el('reward-remove-btn').hidden = !goal;
  el('reward-save-btn').textContent = goal ? 'Save changes' : 'Save goal';
}

export function showRewardGoalStatus(message, tone = 'ok') {
  const target = el('reward-goal-status');
  target.textContent = message;
  target.hidden = !message;
  target.classList.toggle('backup-status-warn', tone === 'warn');
}

// ---------- Backup and restore (Roadmap #150) ----------

// Hands a JSON file to the browser as a download. On iPad Safari that's the
// "Do you want to download…?" prompt, saving to Files > Downloads. Throws if
// the browser can't build the file; there's no way to know whether the
// person then kept it.
export function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked later, not straight away: Safari may still be reading it.
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function showBackupStatus(message, tone = 'ok') {
  const target = el('backup-status');
  target.textContent = message;
  target.hidden = !message;
  target.classList.toggle('backup-status-warn', tone === 'warn');
}

// The app key is write-only in the UI: it round-trips so it can be edited,
// but it's a password field so it isn't left legible on a shared iPad.
function renderSyncSettings(syncConfig = {}) {
  el('sync-url-input').value = syncConfig.workerUrl || '';
  el('sync-key-input').value = syncConfig.appKey || '';
  const ready = Boolean(syncConfig.workerUrl && syncConfig.appKey);
  el('sync-state').textContent = ready
    ? 'Connected — new suggestions go straight to the roadmap file.'
    : 'Not set up — suggestions are saved here and copied across by hand.';
  el('sync-state').className = `sync-state ${ready ? 'sync-state-on' : ''}`;
}

// Settings > Changes (Roadmap #81). CHANGELOG is already newest-first and
// append-only (see changelog.js), so this renders it verbatim — no slicing
// or "show more", because the whole point is that nothing is ever dropped.
function renderChangelog() {
  el('changelog-list').innerHTML = CHANGELOG.map((entry) => {
    const when = new Date(entry.at);
    const stamp = Number.isNaN(when.getTime())
      ? entry.at
      : `${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}, ${when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    const bullets = entry.changes.map((c) => `<li>${escapeHtml(c)}</li>`).join('');
    return `
      <div class="changelog-entry">
        <div class="changelog-head">
          <span class="changelog-when">${escapeHtml(stamp)}</span>
          ${entry.label ? `<span class="changelog-items">${escapeHtml(entry.label)}</span>` : ''}
        </div>
        <ul class="changelog-changes">${bullets}</ul>
      </div>
    `;
  }).join('');
}

export function bindSettingsHandlers({ onNameChange, onCityChange, onColourModeChange, onClearProgress, onSyncConfigChange, onBackup, onRestoreFile, onSoundChange, onNoteSave, onNoteEdit, onNoteDelete, onRewardSave, onRewardRemove, onYear7Change }) {
  document.querySelectorAll('#sound-choices .choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => onSoundChange(btn.dataset.sound === 'on'));
  });
  document.querySelectorAll('#year7-choices-setting .choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => onYear7Change(btn.dataset.year7 === 'on'));
  });
  el('note-input').addEventListener('input', updateNoteCount);
  el('note-save-btn').addEventListener('click', () => {
    const text = el('note-input').value.slice(0, 200);
    if (text.trim()) onNoteSave(text);
  });
  el('note-edit-btn').addEventListener('click', onNoteEdit);
  el('note-delete-btn').addEventListener('click', onNoteDelete);
  el('reward-save-btn').addEventListener('click', () => onRewardSave({
    label: el('reward-label-input').value,
    target: el('reward-target-input').value,
  }));
  el('reward-remove-btn').addEventListener('click', onRewardRemove);
  el('backup-btn').addEventListener('click', onBackup);
  // Cancelling the picker fires no change event, so it does nothing.
  el('restore-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) onRestoreFile(file);
  });
  document.querySelectorAll('#colour-mode-choices .choice-btn').forEach((btn) => {
    btn.addEventListener('click', () => onColourModeChange(btn.dataset.colourMode));
  });

  const pushSyncConfig = () => onSyncConfigChange({
    workerUrl: el('sync-url-input').value.trim(),
    appKey: el('sync-key-input').value.trim(),
  });
  el('sync-url-input').addEventListener('change', pushSyncConfig);
  el('sync-key-input').addEventListener('change', pushSyncConfig);

  el('child-name-input').addEventListener('change', () => {
    onNameChange(el('child-name-input').value.trim().slice(0, 20));
  });
  el('weather-city-input').addEventListener('change', () => {
    onCityChange(el('weather-city-input').value.trim().slice(0, 40));
  });
  el('clear-progress-btn').addEventListener('click', onClearProgress);
}

// ---------- Suggestions screen (Roadmap #82) ----------

// A suggestion is saved locally first and pushed to GitHub second (see
// roadmapSync.js), so this screen has to show both states honestly: which
// ideas are already numbered lines in the roadmap file, and which are still
// only on this device. The ones still here are the ones that can be copied
// across by hand, so the export box lists exactly those.
export function renderSuggestions(suggestions, syncReady = false) {
  el('suggestions-intro').textContent = syncReady
    ? 'Got an idea for making this app better? Write it down here and it goes straight onto the roadmap list.'
    : 'Got an idea for making this app better? Write it down here. Each suggestion is given the number it will have in the roadmap list, ready to be added to it.';

  const listEl = el('suggestion-list');
  if (!suggestions || suggestions.length === 0) {
    listEl.innerHTML = '<p class="empty-state">No suggestions yet — your first idea goes here.</p>';
    el('suggestion-export').hidden = true;
    el('suggestion-export-text').value = '';
    return;
  }

  listEl.innerHTML = [...suggestions].reverse().map((sg) => {
    const when = new Date(sg.submittedAt);
    const stamp = Number.isNaN(when.getTime())
      ? ''
      : `${when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}, ${when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}`;
    const sent = Boolean(sg.syncedAt);
    const tag = sent
      ? '<span class="suggestion-tag suggestion-tag-sent">On GitHub</span>'
      : '<span class="suggestion-tag">Saved here</span>';
    // An unsent suggestion's number is only a guess, and the relay will
    // renumber it from the file. Show it while that guess is what gets
    // pasted in by hand, but not next to real numbers once sending is on —
    // two rows showing the same number is just confusing.
    const label = sent || !syncReady ? sg.number : '&hellip;';
    return `
      <div class="suggestion-row">
        <span class="suggestion-number${sent ? ' suggestion-number-sent' : ''}">${label}</span>
        <div class="suggestion-body">
          <p class="suggestion-text">${escapeHtml(sg.text)}</p>
          <p class="suggestion-when">${tag}${stamp ? `<span>${escapeHtml(stamp)}</span>` : ''}</p>
        </div>
      </div>
    `;
  }).join('');

  // Only the unsent ones need a manual route out; anything already committed
  // would be a duplicate if it were pasted in again.
  const pending = suggestions.filter((sg) => !sg.syncedAt);
  el('suggestion-export').hidden = pending.length === 0;
  el('suggestion-export-text').value = pending.map((sg) => `${sg.number}. ${sg.text}`).join('\n');
  el('suggestion-send-btn').hidden = !syncReady || pending.length === 0;
  el('suggestion-export-hint').textContent = syncReady
    ? 'These didn\u2019t reach GitHub — send them again, or copy them across by hand.'
    : 'Copy these lines and paste them onto the end of \u201cRoadmap ideas and debug.md\u201d.';
}

export function getSuggestionInput() {
  return el('suggestion-input').value;
}

export function clearSuggestionInput() {
  el('suggestion-input').value = '';
}

export function showSuggestionStatus(message, tone = 'ok') {
  const statusEl = el('suggestion-status');
  statusEl.textContent = message;
  statusEl.className = `suggestion-status suggestion-status-${tone}`;
}

export function bindSuggestionsHandlers({ onSubmit, onClear, onSendPending }) {
  el('suggestion-submit-btn').addEventListener('click', onSubmit);
  el('suggestion-send-btn').addEventListener('click', onSendPending);

  // Enter submits, Shift+Enter makes a new line — matches the Enter-to-answer
  // behaviour during a session (Roadmap #72/#73).
  el('suggestion-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  });

  el('suggestion-clear-btn').addEventListener('click', onClear);

  el('suggestion-copy-btn').addEventListener('click', async () => {
    const textarea = el('suggestion-export-text');
    // navigator.clipboard needs a secure context, which opening index.html
    // straight off the disk (file://) isn't always — fall back to selecting
    // the text so it can be copied by hand either way.
    try {
      await navigator.clipboard.writeText(textarea.value);
      showSuggestionStatus('Copied — paste onto the end of the roadmap file.');
    } catch (e) {
      textarea.focus();
      textarea.select();
      showSuggestionStatus('Select-all done — press Ctrl/Cmd + C to copy.');
    }
  });
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
// Styled after the iPhone lock screen: small date above a large thin time
// (see .datetime-widget in styles.css), so the date comes first in the markup.
export function renderDateTime(date) {
  const dateStr = date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
  const timeStr = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  el('datetime-widget').innerHTML = `
    <div class="datetime-date">${dateStr}</div>
    <div class="datetime-time">${timeStr}</div>
  `;
}

// Streak/points widget — moved here from the Progress screen and mirrored
// on the right of the home page, opposite the weather/time sidebar on the
// left (see .start-side-right in styles.css).
// The chest line (Roadmap #91) sits here because the chest and the day
// streak reward the same thing: turning up today.
function renderHomeStreakWidget(meta, chestAvailable) {
  const target = el('home-streak-widget');
  const chestLine = chestAvailable
    ? '<div class="streak-widget-chest">🎁 Today\u2019s mystery chest opens when you finish a session</div>'
    : '<div class="streak-widget-chest streak-widget-chest-done">🎁 Chest opened today — back tomorrow!</div>';
  // Roadmap #112: a held Streak Shield, ready to cover one missed day.
  const shieldLine = (meta.streakShields || 0) > 0
    ? '<div class="streak-widget-shield">🛡️ Shield ready</div>'
    : '';
  if (meta.currentStreakDays > 0) {
    target.innerHTML = `
      <div class="streak-widget-main">🔥 ${meta.currentStreakDays}</div>
      <div class="streak-widget-label">day streak</div>
      <div class="streak-widget-points">⭐ ${meta.totalPoints || 0} total points</div>
      ${shieldLine}
      ${chestLine}
    `;
  } else {
    target.innerHTML = `
      <div class="streak-widget-main">⭐ ${meta.totalPoints || 0}</div>
      <div class="streak-widget-label">total points</div>
      <div class="streak-widget-points">Start today's streak!</div>
      ${shieldLine}
      ${chestLine}
    `;
  }
}

// Roadmap #89. The four records, as display rows. Shared by the Home widget
// and the summary screen's NEW RECORD banner so both word them the same.
const RECORD_ROWS = [
  { key: 'bestAccuracy', icon: '🎯', label: 'Best accuracy', format: (v) => `${Math.round(v * 100)}%` },
  { key: 'longestCombo', icon: '🔥', label: 'Longest combo', format: (v) => `${v} in a row` },
  { key: 'fastestCorrectMs', icon: '⚡', label: 'Fastest correct answer', format: (v) => `${(v / 1000).toFixed(1)}s` },
  { key: 'mostQuestionsInDay', icon: '📅', label: 'Most questions in a day', format: (v) => `${v}` },
];

function renderPersonalBestsWidget(bests) {
  const target = el('personal-bests-widget');
  if (!bests) { target.hidden = true; return; }
  target.hidden = false;
  const rows = RECORD_ROWS.map(({ key, icon, label, format }) => `
    <div class="pb-row">
      <span class="pb-label">${icon} ${label}</span>
      <span class="pb-value">${bests[key] === null ? '—' : format(bests[key])}</span>
    </div>`).join('');
  target.innerHTML = `<div class="next-session-title">🏆 Personal bests</div>${rows}`;
}

// Roadmap #85: a small "what to practice next" widget under the streak
// widget, right sidebar. Reuses computeStrengthSummary's weakest topic once
// there's enough data; before that (or during the diagnostic phase) falls
// back to the pacing plan's own framing, since there's no real weak spot yet.
function renderNextSessionWidget(mastery, plan) {
  const target = el('next-session-widget');
  const summary = computeStrengthSummary(mastery);
  const lengthLabel = plan.sessionLengthSuggestion.type === 'minutes'
    ? `${plan.sessionLengthSuggestion.value} min`
    : `${plan.sessionLengthSuggestion.value} questions`;

  if (!summary) {
    target.innerHTML = `
      <div class="next-session-title">🎯 Next session</div>
      <p class="next-session-body">Keep practicing a mix of topics — once there's more data we'll point you at your weakest spot.</p>
      <p class="next-session-length">Suggested: ${lengthLabel}</p>
    `;
    return;
  }

  const [weakTopic, weakRec] = summary.weakest;
  target.innerHTML = `
    <div class="next-session-title">🎯 Next session</div>
    <p class="next-session-body">Focus on <strong>${TOPIC_LABELS[weakTopic] || weakTopic}</strong> — your weakest area right now at ${Math.round(weakRec.masteryScore * 100)}%.</p>
    <p class="next-session-length">Suggested: ${lengthLabel}</p>
  `;
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

// `boss` is true while the boss challenge (Roadmap #92/#95) is on screen —
// it sits on top of the chosen length, so "Q11 / 10" would look like a bug.
// Roadmap #96: a timed session always shows its clock.
// Roadmap #116: `checked` is true while a question's feedback is on screen.
// That question has already been added to session.questions, so the number
// on show is the count answered (not + 1) until the next question appears.
// The score and combo still update straight away.
export function renderHud(session, boss = false, checked = false) {
  const regular = regularCount(session);
  const onScreen = checked ? regular : regular + 1;
  let count;
  if (boss) count = '👹 Boss challenge';
  else if (session.lengthType === 'questions') count = `Q${Math.min(onScreen, session.lengthValue)} / ${session.lengthValue}`;
  else count = `Q${onScreen}`;
  el('hud-progress').textContent = count;
  el('hud-score').textContent = `⭐ ${session.score}`;
  renderComboMeter(session.streak);
  el('hud-timer').hidden = session.lengthType !== 'minutes';
}

// Roadmap #88: the combo meter. The flame grows a size at each multiplier
// step (x2 at 3 in a row, x3 at 6), and the multiplier shows once it's
// earning anything. A wrong answer just clears it — no "combo lost"
// message, per SPEC §8's non-punitive rule.
function renderComboMeter(streak) {
  const target = el('hud-streak');
  const mult = comboMultiplier(streak);
  target.dataset.combo = String(mult);
  if (streak < 2) {
    target.textContent = '';
    return;
  }
  target.innerHTML = `<span class="combo-flame">🔥</span> ${streak}${mult > 1 ? ` <strong class="combo-mult">x${mult}</strong>` : ''}`;
}

// Celebrates the moment a streak "starts" — i.e. exactly when the 🔥 badge
// first appears (session.streak reaching 2) — distinct from the per-answer
// burst. Called straight after renderFeedback (a streak can only start on a
// correct answer), so the centred verdict card is already on screen and the
// banner joins it there; the HUD badge still pulses as a secondary cue, but
// the HUD is exactly what scrolls out of sight on a long question, which is
// why the celebration itself no longer lives up there.
export function triggerStreakAnimation(text) {
  const streakEl = el('verdict-streak');
  streakEl.textContent = text;
  streakEl.hidden = false;
  // Restart the animation in case a previous verdict left it mid-flight.
  streakEl.style.animation = 'none';
  void streakEl.offsetWidth;
  streakEl.style.animation = '';
  // Give the extra banner time to be read before the card retires.
  scheduleVerdictDismiss(2400);

  const badge = el('hud-streak');
  badge.classList.remove('streak-pulse');
  void badge.offsetWidth;
  badge.classList.add('streak-pulse');
}

// Writes the text even while the clock is still hidden: the first call comes
// just before renderHud reveals it, and skipping it left the clock blank for
// up to a second at the start of a timed session.
export function updateTimer(remainingMs) {
  const timerEl = el('hud-timer');
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  timerEl.textContent = `⏱ ${m}:${String(s).padStart(2, '0')}`;
}

// options.remainderTip: the one-time r-key tip (#133) hasn't been dismissed
// yet, so show it if this is a remainder question.
export function renderQuestion(question, boss = null, options = {}) {
  el('question-blocked').hidden = true;
  document.querySelector('.question-card').classList.remove('is-blocked');
  el('question-prompt').hidden = false;
  document.querySelector('.action-slot').hidden = false;

  clearFeedbackState();
  el('feedback-inline').hidden = true;
  el('check-btn').hidden = false;
  el('check-btn').disabled = false;
  el('next-btn').hidden = true;
  el('retry-btn').hidden = true;

  el('question-prompt').textContent = question.prompt;
  // Roadmap #146: "Spot the mistake" adds a heading and an instruction.
  const spot = question.format === 'spotMistake';
  el('spot-heading').hidden = !spot;
  el('spot-intro').hidden = !spot;
  el('spot-intro').textContent = spot ? `${question.workerName} worked it out like this. One line has a mistake. Tap it.` : '';
  el('spot-hint').hidden = true;
  // Roadmap #123: only improper-fraction questions carry this line.
  el('question-answer-hint').textContent = question.answerHint || '';
  el('question-answer-hint').hidden = !question.answerHint;
  renderBossBanner(question.isBoss ? boss : null);

  // Two kinds of diagram: an image captured from an imported PDF, or SVG
  // markup the generator drew itself (coordinates.js). Neither, either, but
  // never both.
  el('question-diagram').hidden = !question.diagramImage && !question.diagramSvg;
  el('question-diagram-img').hidden = !question.diagramImage;
  if (question.diagramImage) {
    el('question-diagram-img').src = question.diagramImage;
  } else {
    // Setting src to '' resolves to the current page URL rather than
    // clearing it, triggering a pointless request for it as an image on
    // every non-diagram question — remove the attribute instead.
    el('question-diagram-img').removeAttribute('src');
  }
  el('question-diagram-svg').hidden = !question.diagramSvg;
  el('question-diagram-svg').innerHTML = question.diagramSvg || '';

  numericBuffer = '';
  mcqSelected = null;
  spotSelected = null;
  el('right-form-msg').hidden = true;
  el('numeric-display').innerHTML = '&nbsp;';
  el('text-input').value = '';

  const keypad = usesKeypad(question);
  keypadExtra = keypad && question.answerType === 'text';
  el('answer-numeric').hidden = !keypad;
  el('keypad-extra').hidden = !keypadExtra;
  el('answer-text').hidden = question.answerType !== 'text' || keypad;
  el('answer-mcq').hidden = question.answerType !== 'mcq';
  el('answer-spot').hidden = question.answerType !== 'spot';
  minusAllowed = keypad && YEAR7_TOPICS.includes(question.topic);
  el('keypad-minus').hidden = !minusAllowed;
  renderRemainderTip(question, keypadExtra && Boolean(options.remainderTip));

  if (question.answerType === 'spot') {
    const spotEl = el('answer-spot');
    spotEl.innerHTML = question.lines.map((line, i) => `
      <div class="spot-line">
        <button type="button" class="choice-btn spot-row" data-line="${i + 1}">
          <span class="spot-num">${i + 1}</span><span class="spot-text">${escapeHtml(line)}</span>
        </button>
        <p class="spot-note" hidden></p>
      </div>`).join('');
    spotEl.querySelectorAll('.spot-row').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (answerLocked) return;
        spotEl.querySelectorAll('.spot-row').forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        spotSelected = btn.dataset.line;
        el('spot-hint').hidden = true;
      });
    });
  }

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

  if (question.answerType === 'text' && !keypad) {
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
// ---------- Boss challenge (Roadmap #92, #94, #95) ----------

// The beast is drawn here rather than in index.html because it's drawn
// twice: once per half, each clipped along the same zig-zag crack, so that
// on the final hit the two halves can split apart and fly off (see
// .boss-beast.destroyed in styles.css). Damage from earlier hits is shown by
// the .dmg-N parts, which CSS reveals as data-damage climbs: first a horn
// snaps and a crack appears, then the other horn goes, an eye is knocked
// out and a tooth falls out.
const BEAST_CRACK = '100,18 92,48 108,72 90,100 110,128 96,152 104,176';

function beastArt() {
  return `
    <g class="beast-arms">
      <path d="M38 112 Q14 108 10 132 L22 128 L20 142 L32 132 L34 144 Q44 128 48 122 Z" class="beast-limb dmg-hide-2" />
      <path d="M162 112 Q186 108 190 132 L178 128 L180 142 L168 132 L166 144 Q156 128 152 122 Z" class="beast-limb" />
    </g>
    <path d="M60 46 L40 6 L78 38 Z" class="beast-horn dmg-hide-1" />
    <path d="M60 46 L54 32 L70 38 Z" class="beast-horn dmg-show-1" />
    <path d="M140 46 L160 6 L122 38 Z" class="beast-horn dmg-hide-2" />
    <path d="M140 46 L146 32 L130 38 Z" class="beast-horn dmg-show-2" />
    <path d="M100 26 C150 26 172 62 170 108 C168 150 140 174 100 174 C60 174 32 150 30 108 C28 62 50 26 100 26 Z" class="beast-body" />
    <path d="M100 118 C130 118 150 132 152 150 C140 166 122 172 100 172 C78 172 60 166 48 150 C50 132 70 118 100 118 Z" class="beast-belly" />
    <path d="M52 64 L86 80" class="beast-brow" />
    <path d="M148 64 L114 80" class="beast-brow" />
    <circle cx="72" cy="88" r="12" class="beast-eye" />
    <circle cx="74" cy="90" r="5" class="beast-pupil" />
    <circle cx="128" cy="88" r="12" class="beast-eye dmg-hide-2" />
    <circle cx="126" cy="90" r="5" class="beast-pupil dmg-hide-2" />
    <path d="M118 80 L138 98 M138 80 L118 98" class="beast-x-eye dmg-show-2" />
    <path d="M62 116 Q100 140 138 116 Q132 150 100 152 Q68 150 62 116 Z" class="beast-mouth" />
    <path d="M72 120 L78 132 L84 123 Z M116 123 L122 132 L128 120 Z" class="beast-tooth" />
    <path d="M94 128 L100 140 L106 128 Z" class="beast-tooth dmg-hide-2" />
    <path d="M86 146 L92 138 L98 147 Z M102 147 L108 138 L114 146 Z" class="beast-tooth" />
    <path d="M${BEAST_CRACK.split(' ').slice(0, 4).join(' L')}" class="beast-crack dmg-show-1" />
    <path d="M${BEAST_CRACK.split(' ').join(' L')}" class="beast-crack dmg-show-2" />
    <path d="M150 60 L138 74 L146 80 L136 92" class="beast-crack dmg-show-2" />
  `;
}

function beastSvg() {
  // Everything left of the crack, and everything right of it. The polygons
  // run well past the art on the outer sides so nothing gets trimmed, and
  // the left one reaches 1 unit over the crack so the two halves overlap
  // instead of leaving a hairline seam down the beast's face.
  const leftEdge = BEAST_CRACK.split(' ').map((p) => {
    const [x, y] = p.split(',').map(Number);
    return `${x + 1},${y}`;
  }).join(' ');
  const left = `-40,-20 101,-20 ${leftEdge} 101,220 -40,220`;
  const right = `240,-20 100,-20 ${BEAST_CRACK} 100,220 240,220`;
  return `
    <svg class="boss-beast" id="boss-beast" viewBox="0 0 200 190" data-damage="0" role="img" aria-label="An angry boss monster">
      <defs>
        <clipPath id="beast-clip-l"><polygon points="${left}" /></clipPath>
        <clipPath id="beast-clip-r"><polygon points="${right}" /></clipPath>
      </defs>
      <g class="beast-half beast-half-l" clip-path="url(#beast-clip-l)">${beastArt()}</g>
      <g class="beast-half beast-half-r" clip-path="url(#beast-clip-r)">${beastArt()}</g>
    </svg>
  `;
}

// One pip per challenge question: filled for a hit, grey for a miss, empty
// for one still to come.
function renderBossPips(boss) {
  el('boss-pips').innerHTML = Array.from({ length: boss.total }, (_, i) => {
    const state = boss.results[i] === undefined ? '' : (boss.results[i] ? ' hit' : ' miss');
    return `<span class="boss-pip${state}"></span>`;
  }).join('');
}

// Shown for every question of the challenge. `boss` is bossProgress() from
// session.js, or null for an ordinary question. The first challenge question
// draws a fresh beast; later ones keep it, battered, as it was.
function renderBossBanner(boss) {
  const banner = el('boss-banner');
  const isBoss = Boolean(boss);
  document.querySelector('.question-card').classList.toggle('boss-question', isBoss);
  el('screen-question').classList.toggle('boss-mode', isBoss);
  banner.hidden = !isBoss;
  if (!isBoss) return;

  if (boss.asked === 0 || !el('boss-beast')) el('boss-stage').innerHTML = beastSvg();
  const beast = el('boss-beast');
  beast.dataset.damage = String(boss.hits);
  beast.classList.remove('hit', 'roar', 'destroyed');
  el('boss-health-fill').style.width = `${((boss.total - boss.hits) / boss.total) * 100}%`;
  el('boss-round').textContent = `Question ${boss.asked + 1} of ${boss.total}`;
  el('boss-status').textContent = boss.asked === 0
    ? 'You scored over 80%, so the boss has come out to fight! Three hits destroy it. Triple points for every hit.'
    : `${boss.total - boss.hits} hit${boss.total - boss.hits === 1 ? '' : 's'} left to destroy it.`;
  renderBossPips(boss);
}

// `boss` is bossProgress() taken after the answer was recorded, so hits
// already includes this one. `bonus` is the extra for destroying the beast
// completely (0 until the third hit).
export function renderBossResult(correct, pointsEarned, boss, bonus = 0) {
  renderBossPips(boss);
  const beast = el('boss-beast');
  el('boss-round').textContent = `Question ${boss.asked} of ${boss.total}`;

  // Restart the hit/roar animation even if the last answer played the same.
  beast.classList.remove('hit', 'roar');
  void beast.getBoundingClientRect();

  if (correct) {
    beast.dataset.damage = String(boss.hits);
    beast.classList.add('hit');
    requestAnimationFrame(() => {
      el('boss-health-fill').style.width = `${((boss.total - boss.hits) / boss.total) * 100}%`;
    });
  } else {
    beast.classList.add('roar');
  }

  const finished = boss.asked >= boss.total;
  if (correct && bonus > 0) {
    beast.classList.add('destroyed');
    el('boss-status').textContent = `BOSS DESTROYED! +${pointsEarned} points and a +${bonus} bonus!`;
    triggerStreakAnimation(`💥 Boss destroyed! +${bonus} bonus`);
  } else if (correct) {
    el('boss-status').textContent = finished
      ? `Hit! +${pointsEarned} points. The boss limps away with ${boss.hits} of ${boss.total} hits — finish it off next time.`
      : `Hit! +${pointsEarned} points. ${boss.total - boss.hits} more to destroy it.`;
    triggerStreakAnimation('👹 Direct hit! x3 points');
  } else {
    el('boss-status').textContent = finished
      ? `The boss blocked that one. It escapes with ${boss.hits} of ${boss.total} hits — you’ll get it next time.`
      : 'The boss blocked that one — keep going!';
  }
}

export function renderBlockedQuestion(topic) {
  clearFeedbackState();
  renderBossBanner(null);
  // One centred column, even where the landscape layout (#132) splits.
  document.querySelector('.question-card').classList.add('is-blocked');
  el('question-prompt').hidden = true;
  el('question-answer-hint').hidden = true;
  el('remainder-tip').hidden = true;
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
  if (answerType === 'spot') return spotSelected || '';
  if (!el('answer-numeric').hidden) return keypadText();
  return el('text-input').value;
}

// Roadmap #97: the answer had the right value in the wrong form. Not a
// verdict: no overlay, no colours, no lock. Say which form is wanted, clear
// the display, and leave the keypad and Check live for the one more try.
// It doesn't repeat what was typed (Alex's call).
export function showRightFormRetry(hint) {
  dismissRemainderTip(); // Check was tapped (#133)
  const msg = el('right-form-msg');
  msg.innerHTML = `<strong>Right number!</strong> ${escapeHtml(hint)}`;
  msg.hidden = false;
  numericBuffer = '';
  el('numeric-display').innerHTML = '&nbsp;';
}

// Roadmap #146 AC4: Check with no line picked records nothing.
export function showSpotHint() {
  el('spot-hint').hidden = false;
}

// ---------- One-time r-key tip (Roadmap #133) ----------

// Shown under the pad, pointing up at the r key, on a remainder question
// ("9 r 1" shape; never a fraction) until the child dismisses it once. The
// example never equals this question's own answer.
function renderRemainderTip(question, allowed) {
  const tip = el('remainder-tip');
  const show = allowed && answerShape(question.correctAnswer) === 'remainder';
  tip.hidden = !show;
  if (!show) return;
  const example = answerShapeExample('remainder', question.correctAnswer);
  const [whole, rem] = example.split(' r ');
  el('remainder-tip-text').textContent = `Type ${example} like this: ${whole}, then r, then ${rem}.`;
}

// Dismissing marks the tip as seen for good: "Got it", the r key itself, or
// checking the answer. Just showing it doesn't, so a tip that was never
// dismissed comes back next time.
function dismissRemainderTip() {
  const tip = el('remainder-tip');
  if (tip.hidden) return;
  tip.hidden = true;
  onRemainderTipSeen();
}

function pressNumericKey(k) {
  // The answer has been marked and the keypad is folded away; a physical
  // keypress must not quietly rewrite the number now on show.
  if (answerLocked) return;
  if (k === 'r' && keypadExtra) dismissRemainderTip();
  if (k === 'back') {
    numericBuffer = numericBuffer.slice(0, -1);
  } else if (k === '-') {
    // Roadmap #148: only on Year 7 questions, and only as the first
    // character; a second tap, or a tap after digits, does nothing.
    if (minusAllowed && numericBuffer === '') numericBuffer = '-';
  } else if ((k === 'r' || k === '/') && !keypadExtra) {
    // only remainder/fraction questions have these keys
  } else if ((k === '.' || k === 'r' || k === '/') && numericBuffer.includes(k)) {
    // ignore a second decimal point, remainder "r" or fraction bar
  } else {
    numericBuffer += k;
  }
  el('numeric-display').textContent = displayText() || ' ';
}

export function bindQuestionHandlers({ onCheck, onNext, onExit, onTryOneLikeIt, onTipSeen }) {
  if (onTipSeen) onRemainderTipSeen = onTipSeen;
  el('remainder-tip-btn').addEventListener('click', dismissRemainderTip);
  el('next-step-btn').addEventListener('click', revealNextStep);
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
    else if (minusAllowed && (e.key === '-' || e.key === '\u2212')) pressNumericKey('-');
    else if (keypadExtra && (e.key === 'r' || e.key === 'R' || e.key === '/')) pressNumericKey(e.key.toLowerCase());
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
    // Enter never picks "Try one like it" (Roadmap #101) — Next stays the
    // keyboard's forward action.
    const active = document.activeElement;
    if ([el('check-btn'), el('next-btn'), el('retry-btn'), el('hud-exit-btn')].includes(active)) return;
    e.preventDefault();
    if (!el('check-btn').hidden) onCheck();
    else if (!el('next-btn').hidden) onNext();
  });

  // Roadmap #100: any touch while the wrong-answer card is up starts its
  // fade straight away. Passive, and the overlay itself never takes pointer
  // events, so the tap still does its normal job (e.g. Next moves on).
  // Correct answers keep their full celebration.
  document.addEventListener('pointerdown', () => {
    const overlay = el('verdict-overlay');
    tapDismissedVerdict = !overlay.hidden && overlay.classList.contains('incorrect') && !overlay.classList.contains('leaving');
    if (tapDismissedVerdict) hideVerdict(false);
  }, { passive: true });

  el('check-btn').addEventListener('click', onCheck);
  el('next-btn').addEventListener('click', onNext);
  el('retry-btn').addEventListener('click', onTryOneLikeIt);
  el('hud-exit-btn').addEventListener('click', onExit);
  el('question-blocked-home-btn').addEventListener('click', onExit);
}

// Check-answer and Next-question occupy the exact same slot (one hidden,
// one shown at a time) so a second tap lands in the same place with no
// cursor/finger travel between answering and advancing.
//
// Getting the verdict across on a tablet is the job here. A long prompt, a
// diagram and a 12-key pad easily add up to more than an iPad screen, which
// used to leave the inline panel below the fold — the child tapped Check and
// nothing visibly happened. Four things now work together:
//   1. a big verdict card centred on the screen, wherever you're scrolled;
//   2. the question card itself takes the verdict's colour;
//   3. the answer controls collapse into a read-only record of what was
//      entered, which shortens the card by roughly a keypad;
//   4. what's left is scrolled so the verdict and the Next button are
//      actually in view.
// Roadmap #124: explanations from our own generators and word-problem bank
// are written one sentence per step, so they can be revealed a step at a
// time. Imported (PDF) explanations aren't: their line breaks are just where
// the PDF wrapped, so they're always shown in full.
const STEPWISE_SOURCES = ['generated', 'authored'];

export function renderFeedback(correct, question) {
  if (question.format === 'spotMistake') {
    renderSpotFeedback(correct, question);
    return;
  }
  const { explanation = '', correctAnswer } = question;
  el('check-btn').hidden = true;
  el('next-btn').hidden = false;
  const panel = el('feedback-inline');
  panel.hidden = false;
  panel.classList.toggle('correct', correct);
  panel.classList.toggle('incorrect', !correct);
  el('feedback-result').textContent = correct ? 'Correct! 🎉' : `Not quite — the answer was ${correctAnswer}`;

  // A wrong answer with 2+ steps shows step 1 and a "Show next step"
  // button; anything else (a right answer, a one-line explanation) shows in
  // full, as before.
  const steps = !correct && STEPWISE_SOURCES.includes(question.source) ? splitExplanationSteps(explanation) : [];
  const stepwise = steps.length >= 2;
  el('feedback-explanation').textContent = stepwise ? '' : explanation;
  el('feedback-explanation').hidden = stepwise;
  el('feedback-steps').innerHTML = '';
  el('feedback-steps').hidden = !stepwise;
  pendingSteps = stepwise ? steps.slice(1) : [];
  if (stepwise) appendStep(steps[0]);
  el('next-step-btn').hidden = pendingSteps.length === 0;

  // Roadmap #122: a picture that belongs with the explanation (bar model).
  el('feedback-diagram').innerHTML = question.explanationSvg || '';
  el('feedback-diagram').hidden = !question.explanationSvg;

  const card = document.querySelector('.question-card');
  card.classList.toggle('answered-correct', correct);
  card.classList.toggle('answered-incorrect', !correct);

  dismissRemainderTip();
  el('right-form-msg').hidden = true;
  lockAnswerArea(correct, correctAnswer);
  showVerdict(correct, correctAnswer);
  scrollFeedbackIntoView(correct);
}

// Roadmap #146: the faulty line turns red with its correction under it, a
// line picked wrongly says "this line is fine", and the panel shows the
// whole correct working at once (it's short, and the point is to compare).
function renderSpotFeedback(correct, question) {
  el('check-btn').hidden = true;
  el('next-btn').hidden = false;
  el('spot-hint').hidden = true;
  const panel = el('feedback-inline');
  panel.hidden = false;
  panel.classList.toggle('correct', correct);
  panel.classList.toggle('incorrect', !correct);
  const n = question.wrongLine;
  el('feedback-result').textContent = correct ? 'Mistake found! 🎉' : `Not quite. The mistake was in line ${n}`;
  el('feedback-explanation').textContent = 'The right working:';
  el('feedback-explanation').hidden = false;
  el('feedback-steps').innerHTML = '';
  el('feedback-steps').hidden = false;
  question.correctLines.forEach((line) => appendStep(line));
  pendingSteps = [];
  el('next-step-btn').hidden = true;
  el('feedback-diagram').hidden = true;

  const card = document.querySelector('.question-card');
  card.classList.toggle('answered-correct', correct);
  card.classList.toggle('answered-incorrect', !correct);

  answerLocked = true;
  const spotEl = el('answer-spot');
  spotEl.classList.add('answer-checked');
  spotEl.querySelectorAll('.spot-row').forEach((btn) => {
    btn.disabled = true;
    const line = Number(btn.dataset.line);
    const note = btn.parentElement.querySelector('.spot-note');
    if (line === n) {
      btn.classList.add('spot-faulty');
      note.textContent = `Should be: ${question.correction}`;
      note.classList.add('spot-note-fix');
      note.hidden = false;
    } else if (btn.classList.contains('selected')) {
      btn.classList.add('spot-fine');
      note.textContent = 'This line is fine.';
      note.hidden = false;
    }
  });
  showVerdict(correct, '');
  el('verdict-headline').textContent = correct ? 'Mistake found!' : 'Not quite';
  el('verdict-detail').textContent = correct ? '' : `The mistake was in line ${n}`;
  scrollFeedbackIntoView(correct);
}

function appendStep(textContent) {
  const li = document.createElement('li');
  li.textContent = textContent;
  el('feedback-steps').appendChild(li);
  return li;
}

// "Show next step": adds the next step under the ones already shown, and
// brings it (and the button, while there is one) into view if it's fallen
// below the fold. Next stays where it is, above the panel.
function revealNextStep() {
  // The touch that dismissed the "Not quite" banner doesn't also count.
  if (tapDismissedVerdict) {
    tapDismissedVerdict = false;
    return;
  }
  if (pendingSteps.length === 0) return;
  const li = appendStep(pendingSteps.shift());
  const btn = el('next-step-btn');
  btn.hidden = pendingSteps.length === 0;
  const scroller = el('app-scroll');
  const view = scroller.getBoundingClientRect();
  const bottom = (btn.hidden ? li : btn).getBoundingClientRect().bottom;
  if (bottom > view.bottom - 16) {
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollBy({ top: bottom - (view.bottom - 16), behavior: smooth ? 'smooth' : 'auto' });
  }
}

// Roadmap #101: app.js decides whether a follow-up is on offer; this only
// shows or hides the button (renderQuestion hides it again).
export function showTryOneLikeIt(show) {
  el('retry-btn').hidden = !show;
}

// Turns the answer controls into a record of the answer given: the keypad
// folds away (leaving the entered number), a typed answer becomes read-only,
// and multiple choice marks both the right answer and the one picked.
function lockAnswerArea(correct, correctAnswer) {
  answerLocked = true;
  const verdictClass = correct ? 'answer-checked-correct' : 'answer-checked-incorrect';

  ['answer-numeric', 'answer-text'].forEach((id) => {
    const area = el(id);
    if (area.hidden) return;
    area.classList.add('answer-checked', verdictClass);
  });
  el('text-input').readOnly = true;

  const mcq = el('answer-mcq');
  if (!mcq.hidden) {
    mcq.classList.add('answer-checked');
    mcq.querySelectorAll('.choice-btn').forEach((btn) => {
      btn.disabled = true;
      if (btn.dataset.value === String(correctAnswer)) btn.classList.add('choice-correct');
      else if (btn.classList.contains('selected')) btn.classList.add('choice-wrong');
    });
  }
}

// Clears everything renderFeedback/lockAnswerArea applied, ready for the
// next question.
function clearFeedbackState() {
  answerLocked = false;
  hideVerdict(true);
  pendingSteps = [];
  el('feedback-steps').innerHTML = '';
  el('feedback-steps').hidden = true;
  el('next-step-btn').hidden = true;
  el('feedback-explanation').hidden = false;
  el('feedback-diagram').innerHTML = '';
  el('feedback-diagram').hidden = true;

  const card = document.querySelector('.question-card');
  card.classList.remove('answered-correct', 'answered-incorrect');

  ['answer-numeric', 'answer-text', 'answer-mcq', 'answer-spot'].forEach((id) => {
    el(id).classList.remove('answer-checked', 'answer-checked-correct', 'answer-checked-incorrect');
  });
  el('text-input').readOnly = false;
}

// ---------- Centred verdict overlay ----------

// The overlay is a child of #app rather than of the question card, so it's
// centred on the visible content area and doesn't move with the scroll
// position of a long question.
function showVerdict(correct, correctAnswer) {
  const overlay = el('verdict-overlay');
  overlay.classList.remove('leaving');
  overlay.classList.toggle('correct', correct);
  overlay.classList.toggle('incorrect', !correct);
  el('verdict-icon').textContent = correct ? '✓' : '✗';
  el('verdict-headline').textContent = correct ? 'Correct!' : 'Not quite';
  el('verdict-detail').textContent = correct ? '' : `The answer was ${correctAnswer}`;
  el('verdict-streak').hidden = true;
  overlay.hidden = false;

  // Restart the pop animation — the same element is reused every question.
  const card = el('verdict-card');
  card.style.animation = 'none';
  void card.offsetWidth;
  card.style.animation = '';

  if (correct) triggerCorrectBurst();
  // Roadmap #100: a wrong answer's card goes quickly (and on any touch, see
  // bindQuestionHandlers) so the worked explanation under it can be read.
  scheduleVerdictDismiss(correct ? 1500 : 1200);
}

function scheduleVerdictDismiss(afterMs) {
  clearTimeout(verdictTimer);
  verdictTimer = setTimeout(() => hideVerdict(false), afterMs);
}

// immediate=true skips the fade — used when the question or screen changes
// out from under a verdict that's still showing.
function hideVerdict(immediate) {
  clearTimeout(verdictTimer);
  verdictTimer = null;
  const overlay = el('verdict-overlay');
  if (immediate) {
    overlay.classList.remove('leaving');
    overlay.hidden = true;
    return;
  }
  if (overlay.hidden) return;
  overlay.classList.add('leaving');
  verdictTimer = setTimeout(() => {
    overlay.hidden = true;
    overlay.classList.remove('leaving');
    verdictTimer = null;
  }, 350);
}

// A small celebratory particle burst on a correct answer — purely CSS
// keyframes (see .correct-burst / .burst-particle), no animation library.
// Anchored to the middle of the verdict card, so it goes off in the centre
// of the screen rather than at the top of a question card that may well be
// scrolled out of view.
function triggerCorrectBurst() {
  const host = el('verdict-card');
  const old = host.querySelector('.correct-burst');
  if (old) old.remove();
  const burst = document.createElement('div');
  burst.className = 'correct-burst';
  const particles = ['⭐', '✨', '🎉', '✨', '⭐'];
  burst.innerHTML = particles
    .map((p, i) => `<span class="burst-particle" style="--dx:${(i - 2) * 52}px; animation-delay:${i * 40}ms">${p}</span>`)
    .join('');
  host.appendChild(burst);
  setTimeout(() => burst.remove(), 1300);
}

// Brings the Next button and the feedback panel into view together. #app-scroll
// (not the window) is the scroll container here, and scrollIntoView on a
// nested scroller is inconsistent across browsers, so measure and scroll it
// directly.
//
// Roadmap #117: after a wrong answer the block kept in view also starts at
// the answer record (the marked multiple-choice buttons, or the collapsed
// answer box), and the "Not quite" banner pinned to the top of the screen
// counts as part of the top margin, so the banner never sits on top of what
// the child picked. Roadmap #132: in the landscape layout Next and the panel
// sit side by side, so the block is measured as the box round all of them.
function scrollFeedbackIntoView(correct = true) {
  const scroller = el('app-scroll');
  const parts = [document.querySelector('.action-slot'), el('feedback-inline')];
  if (!correct) {
    const record = ['answer-mcq', 'answer-spot', 'answer-numeric', 'answer-text'].map(el).find((a) => !a.hidden);
    if (record) parts.push(record);
  }

  // Wait a frame so the collapsed keypad has been laid out before measuring.
  requestAnimationFrame(() => {
    const view = scroller.getBoundingClientRect();
    const rects = parts.map((p) => p.getBoundingClientRect());
    const top = Math.min(...rects.map((r) => r.top));
    const bottom = Math.max(...rects.map((r) => r.bottom));
    const blockHeight = bottom - top;
    const margin = 16;
    // The banner's own height, untransformed (offsetTop/offsetHeight ignore
    // its slide-in animation). The overlay and the scroller both fill #app,
    // so the numbers line up.
    const card = el('verdict-card');
    const topMargin = correct ? margin : card.offsetTop + card.offsetHeight + margin;

    // A short question needs no help — leave the view alone rather than
    // scrolling the question itself off the top to centre something that's
    // already on screen.
    if (top >= view.top + topMargin && bottom <= view.bottom - margin) return;

    // Centre the block (below the banner) when it fits; otherwise pin its
    // top just below the banner so the answer record and verdict are on
    // screen and the explanation carries on below.
    const room = view.height - topMargin - margin;
    const target = blockHeight <= room
      ? view.top + topMargin + (room - blockHeight) / 2
      : view.top + topMargin;

    const delta = top - target;
    if (Math.abs(delta) < 4) return;
    const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    scroller.scrollBy({ top: delta, behavior: smooth ? 'smooth' : 'auto' });
  });
}

// ---------- Summary screen ----------

export function renderSummary(entry, newlyEarnedBadges = [], meta = {}, shopState = null, extras = {}) {
  const questPoints = extras.quests ? extras.quests.points : 0;
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
    ${pointsRows(summary, meta, extras.chestReward, questPoints)}
    <div class="summary-row"><span class="label">Best combo</span><span class="value">🔥 ${summary.bestStreak}</span></div>
    ${bossRow(entry)}
  `;

  renderSummaryNotes(extras.fixedToday || [], extras.shieldUsed ? meta.currentStreakDays : 0, extras.fixResult);
  renderTakeaways(entry, extras.mastery);
  renderWrongList(extras.wrongList || [], Boolean(extras.canRetry));
  renderSummaryMore(extras);
  renderNewRecords(extras.newRecords || [], extras.personalBests);
  renderChestReward(extras.chestReward);

  const badgeEl = el('new-badges');
  if (newlyEarnedBadges.length === 0) {
    badgeEl.hidden = true;
  } else {
    badgeEl.hidden = false;
    // Roadmap #135: a secret badge gets its own title (and its real name).
    // Only when every new badge is secret; otherwise the normal title,
    // with a small "Secret" tag on the secret ones.
    const title = newlyEarnedBadges.every((b) => b.hidden)
      ? 'Secret badge unlocked!'
      : `New badge${newlyEarnedBadges.length > 1 ? 's' : ''} unlocked!`;
    badgeEl.innerHTML = `
      <p class="new-badges-title">${title}</p>
      <div class="new-badges-row">
        ${newlyEarnedBadges.map((b, i) => `
          <div class="badge-card earned badge-card-reveal" style="animation-delay:${i * 150}ms">
            <span class="badge-sparkle">✨</span>
            <div class="badge-icon">${b.icon}</div>
            <div class="badge-label">${b.label}${b.hidden ? ' <span class="trophy-tag">Secret</span>' : ''}</div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

// Roadmap #111: how the points add up, so the jump in the top-bar ⭐ is
// explained. pointsEarned already includes the boss bonus, so it's split
// back out here rather than shown twice. Each part shows only when it's
// above 0; with nothing but question points there's no sum to show, so it
// stays the one "Points earned" row. "You now have" is the spendable
// balance — the same number as the top bar — not the lifetime total.
// Weekly quest rewards (#136) are one more part.
function pointsRows(summary, meta, chestReward, questPts = 0) {
  const row = (label, value, cls = '') => `<div class="summary-row${cls}"><span class="label">${label}</span><span class="value">⭐ ${value}</span></div>`;
  const bossBonus = summary.bossBonus || 0;
  const questionPts = summary.pointsEarned - bossBonus;
  const chestPts = chestReward && chestReward.type === 'points' ? chestReward.points : 0;
  const balance = row('You now have', availableBalance(meta), ' summary-row-total');
  if (bossBonus === 0 && chestPts === 0 && questPts === 0) {
    return row('Points earned', summary.pointsEarned) + balance;
  }
  return [
    questionPts > 0 ? row('Questions', questionPts, ' summary-row-part') : '',
    bossBonus > 0 ? row('Boss bonus', bossBonus, ' summary-row-part') : '',
    chestPts > 0 ? row('Mystery chest', chestPts, ' summary-row-part') : '',
    questPts > 0 ? row('Weekly quests', questPts, ' summary-row-part') : '',
    row('Added today', questionPts + bossBonus + chestPts + questPts, ' summary-row-total'),
    balance,
  ].join('');
}

// Sessions from before the boss existed have no boss row at all; ones from
// the single boss question days (#92) keep their old wording.
function bossRow(entry) {
  const { summary } = entry;
  const bossQs = entry.questions.filter((q) => q.boss).length;
  const row = (label, value) => `<div class="summary-row"><span class="label">${label}</span><span class="value">${value}</span></div>`;
  if (summary.bossLocked) return row('Boss challenge', '🔒 Get over 80% right to unlock it');
  if (bossQs === 0) return '';
  if (bossQs === 1 && summary.bossHits === undefined) {
    return row('Boss question', summary.bossDefeated ? '👾 Defeated!' : 'Survived — next time!');
  }
  // The bonus itself is in the points breakdown (#111), so it isn't repeated.
  if (summary.bossDefeated) return row('Boss challenge', '💥 Destroyed!');
  return row('Boss challenge', `👹 ${summary.bossHits} of ${bossQs} hits — next time!`);
}

// Roadmap #105: how a kind of question is named — "Fractions / %:
// Percentages", or just the topic when there's no useful subtopic.
function mistakeKindLabel(fix) {
  const topic = TOPIC_LABELS[fix.topic] || fix.topic;
  if (!fix.subtopic) return topic;
  const sub = fix.subtopic.replace(/-/g, ' ');
  return `${topic}: ${sub.charAt(0).toUpperCase()}${sub.slice(1)}`;
}

// "Mon 5 Oct", on the child's own calendar day. Built by hand because
// browsers disagree on the short format ("Mon, 5 Oct", "Mon 5 Oct.").
const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDay(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'an earlier day';
  return `${SHORT_DAYS[d.getDay()]} ${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

// The one-line notes under the summary card. Nothing to say, no box.
// shieldStreak is the streak a Streak Shield (#112) just saved, or 0.
// fixResult: { fixed, total, left } after a Fix my mistakes session (#128).
function renderSummaryNotes(fixedToday, shieldStreak = 0, fixResult = null) {
  const lines = [];
  if (shieldStreak > 0) lines.push(`🛡️ Your shield saved your ${shieldStreak}-day streak!`);
  if (fixResult) {
    // "You fixed 0 of 6" would read as a telling-off (SPEC §8), so a
    // session that fixed none just says they'll be there next time.
    const left = fixResult.left > 0 ? `${fixResult.left} still to fix` : '';
    lines.push(fixResult.fixed > 0
      ? `🔧 You fixed ${fixResult.fixed} of ${fixResult.total}!${left ? ` ${left}.` : ''}`
      : `🔧 ${left || 'Nothing left to fix'}. They\u2019ll be on Home for another go.`);
  }
  // After a Fix session the "fixed X of Y" line above says it, counted
  // per queued question; this line groups kinds differently (topic and
  // subtopic only), so showing both would disagree.
  if (fixedToday.length > 0 && !fixResult) {
    const n = fixedToday.length;
    const kinds = [...new Set(fixedToday.map(mistakeKindLabel))].join(', ');
    lines.push(`✅ You fixed ${n} old mistake${n === 1 ? '' : 's'} today: ${kinds}`);
  }
  const target = el('summary-notes');
  target.hidden = lines.length === 0;
  target.innerHTML = lines.map((l) => `<p class="summary-note">${escapeHtml(l)}</p>`).join('');
}

// Roadmap #110, line 1: the best thing about this session, from its own
// questions only (boss questions included). The first rule that applies:
// the topic with 2+ right and the best accuracy (ties: more right, then
// faster on average); else a combo of 3+; else any right answer at all;
// else a kind word for having a go. Never a telling-off (SPEC §8).
function bestThingToday(entry) {
  const byTopic = {};
  entry.questions.forEach((q) => {
    const t = byTopic[q.topic] || (byTopic[q.topic] = { topic: q.topic, right: 0, total: 0, timeMs: 0 });
    t.total += 1;
    t.timeMs += q.timeMs || 0;
    if (q.correct) t.right += 1;
  });
  const best = Object.values(byTopic)
    .filter((t) => t.right >= 2)
    .sort((a, b) => (b.right / b.total - a.right / a.total)
      || (b.right - a.right)
      || (a.timeMs / a.total - b.timeMs / b.total))[0];
  if (best) {
    return `You got ${best.right} out of ${best.total} right in ${TOPIC_LABELS[best.topic] || best.topic}!`;
  }
  const { bestStreak, correctCount } = entry.summary;
  if (bestStreak >= 3) return `You got ${bestStreak} right in a row!`;
  if (correctCount > 0) {
    return `You got ${correctCount} question${correctCount === 1 ? '' : 's'} right. Every one counts!`;
  }
  return 'You had a go at every question. That\u2019s how you get better.';
}

// Roadmap #110, line 2: the overall weakest topic — the same one the Home
// focus card and Next session widget name, from mastery already updated
// with this session — so all of them agree. No percentages here.
function practiseNextTime(mastery) {
  const summary = mastery ? computeStrengthSummary(mastery) : null;
  if (!summary) return 'A mix of topics. You\u2019re building up your skills.';
  const topic = summary.weakest[0];
  return `${TOPIC_LABELS[topic] || topic}. A few more goes will make it click.`;
}

function renderTakeaways(entry, mastery) {
  el('summary-takeaways').innerHTML = `
    <div class="takeaway">
      <p class="takeaway-title">🌟 Best thing today</p>
      <p class="takeaway-body">${escapeHtml(bestThingToday(entry))}</p>
    </div>
    <div class="takeaway">
      <p class="takeaway-title">🎯 One thing to practise next time</p>
      <p class="takeaway-body">${escapeHtml(practiseNextTime(mastery))}</p>
    </div>`;
}

// Roadmap #89: the NEW RECORD banner, one line per record beaten.
function renderNewRecords(newRecords, bests) {
  const target = el('new-records');
  if (!newRecords.length || !bests) {
    target.hidden = true;
    target.innerHTML = '';
    return;
  }
  const lines = RECORD_ROWS
    .filter((r) => newRecords.includes(r.key))
    .map((r) => `<li>${r.icon} ${r.label}: <strong>${r.format(bests[r.key])}</strong></li>`)
    .join('');
  target.hidden = false;
  target.innerHTML = `<p class="new-records-title">NEW RECORD!</p><ul class="new-records-list">${lines}</ul>`;
}

// Roadmap #91: the chest simply opens on what's inside — no reel, no
// near-miss, nothing to tease.
function renderChestReward(reward) {
  const target = el('chest-reward');
  if (!reward) {
    target.hidden = true;
    target.innerHTML = '';
    return;
  }
  let prize;
  if (reward.type === 'points') {
    prize = `<p class="chest-prize">⭐ +${reward.points} bonus points</p>`;
  } else {
    const item = getItem(reward.itemId);
    prize = `<p class="chest-prize">${item.emoji || '🎁'} ${item.label}</p>
      <p class="chest-note">A chest-only item — it's in the Shop now, ready to equip.</p>`;
  }
  target.hidden = false;
  target.innerHTML = `
    <div class="chest-icon">🎁</div>
    <p class="chest-title">Daily mystery chest</p>
    ${prize}
  `;
}

// ---------- Questions I got wrong (Roadmap #127) ----------

// rows: [{ prompt, correctAnswer, explanation, diagramSvg }] in the order
// they were asked. The answer is shown exactly as "Not quite" showed it.
// Prompts and explanations are escaped (text, never HTML); the diagram is
// SVG drawn by our own generators, as on the question screen. canRetry
// shows "Try these again" (never after a retry round, and only when
// something can be re-asked).
function renderWrongList(rows, canRetry) {
  const target = el('summary-wrong');
  target.hidden = rows.length === 0;
  if (rows.length === 0) { target.innerHTML = ''; return; }
  const items = rows.map((r) => `
    <li class="wrong-row">
      <p class="wrong-prompt">${escapeHtml(r.prompt)}</p>
      ${r.diagramSvg ? `<div class="wrong-diagram">${r.diagramSvg}</div>` : ''}
      <p class="wrong-answer">Answer: <strong>${escapeHtml(r.correctAnswer)}</strong></p>
      ${r.explanation ? `<details class="wrong-how"><summary>How to work it out</summary><p>${escapeHtml(r.explanation)}</p></details>` : ''}
    </li>`).join('');
  target.innerHTML = `
    <p class="summary-wrong-title">Questions I got wrong</p>
    <ol class="wrong-list">${items}</ol>
    ${canRetry ? '<button id="retry-round-btn" type="button" class="secondary-btn retry-round-btn">Try these again</button>' : ''}`;
}

export function hideRetryButton() {
  const btn = el('retry-round-btn');
  if (btn) btn.remove();
}

// Quests finished (#136), the map step (#137), the daily goal (#130) and
// the check-up line (#149), one line each, in that order.
function renderSummaryMore(extras) {
  const lines = [];
  const q = extras.quests;
  if (q) {
    q.completed.forEach((quest) => {
      lines.push(`<p class="summary-line">🗺️ Quest complete: ${escapeHtml(questLabel(quest, q.topic))} (+${quest.reward} ⭐)</p>`);
    });
    if (q.bonus) lines.push(`<p class="summary-line">🏆 All three quests done! +${QUEST_BONUS} ⭐ bonus</p>`);
  }
  const m = extras.mapStep;
  if (m && m.after > m.before) {
    const pos = mapPosition(m.after);
    let text;
    if (pos.step === 0 && pos.area === 0) text = `🎉 Lap ${pos.lap} begins!`;
    else if (pos.step === 0) text = `🎉 You\u2019ve reached ${areaOf(pos.area).name}!`;
    else {
      const left = MAP_STEPS_PER_AREA - pos.step;
      text = `👣 You moved 1 step! ${left} more to reach ${areaOf((pos.area + 1) % TOPICS.length).name}.`;
    }
    lines.push(`<button type="button" id="summary-map-btn" class="summary-line summary-map-btn${pos.step === 0 ? ' summary-map-arrive' : ''}">${text} <span class="summary-map-go">See the map \u203a</span></button>`);
  }
  const g = extras.goal;
  if (g) {
    lines.push(`<p class="summary-line">${g.count >= g.target ? `⭐ Daily goal done! 🎉 ${g.count} today` : `⭐ Daily goal: ${g.count} / ${g.target}`}</p>`);
  }
  if (extras.checkupDone) lines.push('<p class="summary-line">🩺 Check-up done! Next check-up in 4 weeks.</p>');
  const target = el('summary-more');
  target.hidden = lines.length === 0;
  target.innerHTML = lines.join('');
}

export function bindSummaryHandlers({ onRestart, onTryAgain, onOpenMap }) {
  el('summary-restart-btn').addEventListener('click', onRestart);
  // Delegated: both buttons are redrawn with every summary.
  el('screen-summary').addEventListener('click', (e) => {
    if (e.target.closest('#retry-round-btn')) onTryAgain();
    else if (e.target.closest('#summary-map-btn')) onOpenMap();
  });
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

const MAX_FIXED_ROWS = 10;

// Roadmap #105: the "Mistakes I fixed" card, newest fix first.
function renderFixedMistakes(fixes) {
  const target = el('fixed-mistakes');
  if (fixes.length === 0) {
    target.innerHTML = '<p class="empty-state">Get one wrong, then right in a later session, and it\u2019ll show up here.</p>';
    return;
  }
  const rows = fixes.slice(0, MAX_FIXED_ROWS).map((f) => `
    <div class="fixed-row">
      <span class="fixed-kind">✅ ${escapeHtml(mistakeKindLabel(f))}</span>
      <span class="fixed-dates">Tricky on ${shortDay(f.wrongDate)}, nailed it ${shortDay(f.fixedDate)}</span>
    </div>`).join('');
  const more = fixes.length > MAX_FIXED_ROWS
    ? `<p class="fixed-more">and ${fixes.length - MAX_FIXED_ROWS} more</p>`
    : '';
  target.innerHTML = rows + more;
}

// Roadmap #129: the medal a topic has earned (kept even if the score later
// drops) and a plain-words next target, shown on its row.
function topicMedalLine(topic, rec, earnedBadgeIds) {
  const earned = TOPIC_TIERS.filter((t) => earnedBadgeIds.includes(`topic-${topic}-${t.tier}`));
  const best = earned[earned.length - 1] || null;
  const next = TOPIC_TIERS.find((t) => !earned.includes(t));
  let target;
  if (!next) target = 'Gold!';
  else if (rec.questionsSeen < MIN_TIER_QUESTIONS) {
    const left = MIN_TIER_QUESTIONS - rec.questionsSeen;
    target = `Answer ${left} more question${left === 1 ? '' : 's'} to start winning medals`;
  } else {
    const gap = next.pct - displayedPct(rec);
    target = gap > 0 ? `${gap}% to ${next.name}` : `${next.name} when you finish your next session`;
  }
  return {
    medal: best ? `<span class="mastery-medal" role="img" aria-label="${best.name} medal">${best.icon}</span>` : '',
    target,
  };
}

// extras.topics: the active topics (#148), the core eight plus the Year 7
// five while that switch is on.
export function renderProgress(mastery, meta, sessions, badgeDefinitions = [], earnedBadgeIds = [], fixedMistakes = [], extras = {}) {
  const topics = extras.topics || TOPICS;
  renderStrengthOverview(mastery, topics);
  renderFixedMistakes(fixedMistakes);

  const barsEl = el('mastery-bars');
  barsEl.innerHTML = '';
  topics.forEach((topic) => {
    const rec = mastery[topic];
    const pct = Math.round(rec.masteryScore * 100);
    const { medal, target } = topicMedalLine(topic, rec, earnedBadgeIds);
    const row = document.createElement('div');
    row.className = 'mastery-row';
    row.innerHTML = `
      <div class="mastery-label"><span>${TOPIC_LABELS[topic] || topic}</span><span>${medal}${pct}%</span></div>
      <div class="mastery-row-bottom">
        <div class="mastery-track"><div class="mastery-fill" style="width:${pct}%"></div></div>
        ${renderSparkline(rec.history)}
      </div>
      <div class="mastery-target">${target}</div>
    `;
    barsEl.appendChild(row);
  });

  // Roadmap #134: the badge grid moved to the Trophy cabinet.
  const earnedCount = badgeDefinitions.filter((b) => earnedBadgeIds.includes(b.id)).length;
  el('cabinet-btn').textContent = `🏆 Trophy cabinet: ${earnedCount} of ${badgeDefinitions.length} collected`;

  renderPracticeCalendar(extras.calendar);
  renderWeekCompare(extras.weekCompare);

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

// ---------- My practice days (Roadmap #140) ----------

// cal: { today, practised: Set, shielded: Set, streak } — local days. Five
// Monday-to-Sunday rows ending with this week. A practised day gets a tick,
// a day a Streak Shield covered gets 🛡️, any other day is a plain cell:
// never a cross or "missed" (SPEC §8). Days after today are dimmed.
const WEEKDAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
function renderPracticeCalendar(cal) {
  const target = el('practice-calendar');
  if (!cal) { target.innerHTML = ''; return; }
  const first = addDays(weekRange(cal.today).start, -28);
  let practisedInWindow = 0;
  const cells = Array.from({ length: 35 }, (_, i) => {
    const day = addDays(first, i);
    const future = day > cal.today;
    const ticked = !future && cal.practised.has(day);
    const shield = !future && !ticked && cal.shielded.has(day);
    if (ticked) practisedInWindow += 1;
    const cls = ['cal-cell', ticked ? 'cal-ticked' : '', shield ? 'cal-shield' : '', future ? 'cal-future' : '', day === cal.today ? 'cal-today' : '']
      .filter(Boolean).join(' ');
    const label = `${shortDay(`${day}T12:00:00`)}${ticked ? ': practised' : ''}${shield ? ': shield used' : ''}${day === cal.today ? ' (today)' : ''}`;
    return `<span class="${cls}" role="img" aria-label="${label}">${ticked ? '✓' : (shield ? '🛡️' : '')}</span>`;
  }).join('');
  const days = `${practisedInWindow} practice day${practisedInWindow === 1 ? '' : 's'} in the last 5 weeks`;
  const caption = cal.streak > 0 ? `🔥 ${cal.streak}-day streak \u00b7 ${days}` : days;
  target.innerHTML = `
    <p class="cal-caption">${caption}</p>
    <div class="cal-grid">
      ${WEEKDAY_LETTERS.map((d) => `<span class="cal-head" aria-hidden="true">${d}</span>`).join('')}
      ${cells}
    </div>
    ${practisedInWindow === 0 ? '<p class="empty-state">Finish a session and today gets its first tick.</p>' : ''}`;
}

// ---------- This week vs last week (Roadmap #131) ----------

// wc: { compare (compareTopicAccuracy: A = last week, B = this week),
// isMonday, thisWeekCount }. Only good-news colour: up is green, a drop is
// grey and worded gently.
const ARROWS = {
  up: { icon: '▲', label: 'Up', cls: 'wc-up' },
  steady: { icon: '▬', label: 'Steady', cls: 'wc-steady' },
  down: { icon: '▼', label: 'A bit lower', cls: 'wc-down' },
};
const pct = (side) => Math.round((side.right / side.total) * 100);
function renderWeekCompare(wc) {
  const target = el('week-compare');
  if (!wc) { target.innerHTML = ''; return; }
  const entries = Object.entries(wc.compare);
  // Core topics first, then Year 7 (#148), then anything else.
  const order = (t) => (ALL_TOPICS.includes(t) ? ALL_TOPICS.indexOf(t) : ALL_TOPICS.length);
  const rank = { up: 0, steady: 1, down: 2 };
  const compared = entries.filter(([, t]) => t.comparable)
    .sort((a, b) => (rank[a[1].direction] - rank[b[1].direction])
      || (a[1].direction === 'up' ? b[1].rise - a[1].rise : 0)
      || (order(a[0]) - order(b[0])));
  const partial = entries.filter(([, t]) => !t.comparable).map(([topic]) => topic)
    .sort((a, b) => order(a) - order(b));
  const parts = [];
  if (compared.length === 0) {
    const empty = wc.isMonday && wc.thisWeekCount === 0
      ? 'New week! Practise to start your arrows.'
      : 'Practise a topic this week and last week to see your arrows here.';
    parts.push(`<p class="empty-state">${empty}</p>`);
  } else {
    const ups = compared.filter(([, t]) => t.direction === 'up').length;
    parts.push(`<p class="wc-headline">${ups > 0
      ? `${ups} topic${ups === 1 ? '' : 's'} went up this week!`
      : 'Holding steady \u2014 keep practising to push a topic up.'}</p>`);
    parts.push(compared.map(([topic, t]) => {
      const a = ARROWS[t.direction];
      return `
        <div class="wc-row">
          <span class="wc-topic">${escapeHtml(TOPIC_LABELS[topic] || topic)}</span>
          <span class="wc-pcts">${pct(t.a)}% \u2192 ${pct(t.b)}%</span>
          <span class="wc-arrow ${a.cls}"><span aria-hidden="true">${a.icon}</span> ${a.label}</span>
        </div>`;
    }).join(''));
  }
  if (partial.length) {
    parts.push(`<p class="wc-partial">Practise these in both weeks to get an arrow: ${partial.map((t) => escapeHtml(TOPIC_LABELS[t] || t)).join(', ')}</p>`);
  }
  target.innerHTML = parts.join('');
}

// ---------- Trophy cabinet (Roadmap #134) ----------

const SHELVES = [
  { key: 'start', label: 'Getting started' },
  { key: 'streaks', label: 'Streaks' },
  { key: 'points', label: 'Points' },
  { key: 'topics', label: 'Topics' },
  { key: 'challenges', label: 'Challenges' },
  { key: 'secret', label: 'Secret badges' },
];

// Earned badges are lit; locked ones are a grey silhouette of their own
// emoji with the hint (and progress, where the badge has one). A locked
// secret badge (#135) is "???" with no icon, name or hint anywhere, not
// even in an attribute.
function cabinetCard(b, earned, ctx) {
  if (!earned && b.hidden) {
    return `
      <div class="trophy trophy-locked trophy-secret">
        <div class="trophy-icon" aria-hidden="true">❓</div>
        <div class="trophy-name">???</div>
        <div class="trophy-hint">Secret badge. Keep practising to find it.</div>
      </div>`;
  }
  const hint = earned ? b.description : `${b.description}${b.progressHint ? ` ${b.progressHint(ctx)}` : ''}`;
  return `
    <div class="trophy ${earned ? 'trophy-earned' : 'trophy-locked'}">
      <div class="trophy-icon" aria-hidden="true">${b.icon}</div>
      <div class="trophy-name">${escapeHtml(b.label)}${earned && b.hidden ? ' <span class="trophy-tag">Secret</span>' : ''}</div>
      <div class="trophy-hint">${escapeHtml(hint)}</div>
    </div>`;
}

export function renderCabinet(definitions, earnedIds, ctx) {
  el('app-scroll').scrollTop = 0;
  const isEarned = (b) => earnedIds.includes(b.id);
  const earnedCount = definitions.filter(isEarned).length;
  el('cabinet-count').textContent = `${earnedCount} of ${definitions.length} collected`;
  const byDifficulty = (a, b) => a.difficulty - b.difficulty;
  const shelfKeys = SHELVES.map((sh) => sh.key);
  const shelves = [...SHELVES];
  // Any shelf a later badge names but this list doesn't, at the end.
  definitions.forEach((b) => {
    if (!shelfKeys.includes(b.shelf)) { shelfKeys.push(b.shelf); shelves.push({ key: b.shelf, label: 'More badges' }); }
  });
  el('cabinet-shelves').innerHTML = shelves.map((shelf) => {
    const badges = definitions.filter((b) => b.shelf === shelf.key);
    if (badges.length === 0) return '';
    let body;
    if (shelf.key === 'topics') {
      // One row per topic: its medals (#129) and Master badge, easiest first.
      const topics = [...new Set(badges.map((b) => b.topic))];
      body = topics.map((t) => `
        <p class="shelf-topic">${escapeHtml(TOPIC_LABELS[t] || t)}</p>
        <div class="shelf-row">${badges.filter((b) => b.topic === t).sort(byDifficulty).map((b) => cabinetCard(b, isEarned(b), ctx)).join('')}</div>`).join('');
    } else {
      body = `<div class="shelf-row">${badges.sort(byDifficulty).map((b) => cabinetCard(b, isEarned(b), ctx)).join('')}</div>`;
    }
    return `<section class="shelf"><h3 class="section-subheading shelf-title">${shelf.label}</h3>${body}</section>`;
  }).join('');
}

export function bindCabinetAndMapHandlers({ onOpenCabinet, onCabinetBack, onMapBack }) {
  el('header-badges-group').addEventListener('click', onOpenCabinet);
  el('cabinet-btn').addEventListener('click', onOpenCabinet);
  el('cabinet-back-btn').addEventListener('click', onCabinetBack);
  el('map-back-btn').addEventListener('click', onMapBack);
}

// ---------- Beat the Grown-Up (Roadmap #147) ----------

// The HUD on a guest turn: whose turn, which question, how many right so
// far. No points, combo or timer.
export function renderGuestHud(who, number, total, correct) {
  el('hud-progress').textContent = `${who} \u00b7 ${number} / ${total}`;
  el('hud-score').textContent = `\u2713 ${correct} right`;
  const streak = el('hud-streak');
  streak.textContent = '';
  streak.dataset.combo = '1';
  el('hud-timer').hidden = true;
}

// The hand-over screen never shows the child's score (AC4).
export function showGuestHandover() {
  el('guest-handover').hidden = false;
  el('guest-result').hidden = true;
  showScreen('guest');
  el('app-scroll').scrollTop = 0;
}

// r: { childName, child: { correct, timeMs }, grownUp: {...}, outcome, tally }
export function showGuestResult(r) {
  el('guest-handover').hidden = true;
  el('guest-result').hidden = false;
  el('guest-child-score').textContent = `${r.child.correct}`;
  el('guest-child-label').textContent = r.childName || 'You';
  el('guest-adult-score').textContent = `${r.grownUp.correct}`;
  const { winner, byTime } = r.outcome;
  let banner;
  if (winner === 'child') banner = `🏆 ${r.childName ? `${r.childName} beat` : 'You beat'} the grown-up!`;
  else if (winner === 'grownUp') banner = 'The grown-up won this time. Rematch?';
  else banner = 'It\u2019s a draw!';
  el('guest-banner').textContent = banner;
  let how = `${r.child.correct} out of 10 against ${r.grownUp.correct} out of 10.`;
  if (byTime) {
    const who = winner === 'child' ? (r.childName ? `${r.childName} was` : 'you were') : 'the grown-up was';
    how = `Tie on ${r.child.correct}, and ${who} faster!`;
  } else if (winner === 'draw') {
    how = `Tie on ${r.child.correct}, in exactly the same time!`;
  }
  el('guest-how').textContent = how;
  const t = r.tally;
  el('guest-tally').textContent = `${r.childName ? `${r.childName} has` : 'You\u2019ve'} beaten the grown-up ${t.childWins} time${t.childWins === 1 ? '' : 's'}. Grown-up wins: ${t.grownUpWins}${t.draws ? `. Draws: ${t.draws}` : ''}.`;
  showScreen('guest');
  el('app-scroll').scrollTop = 0;
}

export function bindGuestHandlers({ onGrownUpStart, onRematch, onHome }) {
  el('guest-start-btn').addEventListener('click', onGrownUpStart);
  el('guest-rematch-btn').addEventListener('click', onRematch);
  el('guest-home-btn').addEventListener('click', onHome);
}

// ---------- Shop screen ----------

// Roadmap #112: the Power-ups section — just the Streak Shield. Held
// shields are a count on meta, so the card shows that instead of Equip.
function renderPowerUps(meta) {
  const held = meta.streakShields || 0;
  const full = held >= MAX_STREAK_SHIELDS;
  const canAfford = availableBalance(meta) >= STREAK_SHIELD.cost;
  return `
    <div class="shop-category">
      <h3 class="shop-category-title">Power-ups</h3>
      <div class="powerup-card">
        <div class="powerup-icon">${STREAK_SHIELD.emoji}</div>
        <div class="powerup-body">
          <div class="powerup-name">${STREAK_SHIELD.label} <span class="powerup-price">⭐ ${STREAK_SHIELD.cost}</span></div>
          <div class="powerup-desc">${STREAK_SHIELD.description}</div>
          ${held > 0 ? `<div class="powerup-held">You have ${held} shield${held === 1 ? '' : 's'}</div>` : ''}
        </div>
        <button class="powerup-buy-btn" data-powerup="streak-shield" ${full || !canAfford ? 'disabled' : ''}>Buy ⭐${STREAK_SHIELD.cost}</button>
      </div>
    </div>
  `;
}

export function renderShop(shopState, meta) {
  el('shop-balance').textContent = `⭐ ${availableBalance(meta)} available to spend`;

  const container = el('shop-categories');
  container.innerHTML = renderPowerUps(meta) + SHOP_CATEGORIES.map(({ key, label }) => {
    const items = itemsByCategory(key).map((item) => {
      const owned = isOwned(item.id, shopState.ownedItemIds);
      const equipped = shopState.equipped[key] === item.id;
      let preview = '';
      if (item.category === 'theme' || item.category === 'avatarColor') preview = `<div class="shop-item-swatch" style="background:${item.swatch}"></div>`;
      else if (item.category === 'avatar') preview = `<div class="shop-item-emoji">${item.emoji}</div>`;
      else if (item.category === 'accessory' || item.category === 'mood') preview = `<div class="shop-item-emoji">${item.emoji || '—'}</div>`;
      else if (item.category === 'font') preview = `<div class="shop-item-font-sample" style="font-family:var(--font-stack-${item.id === 'font-rounded' ? 'bubbly' : item.id === 'font-mono' ? 'robot' : 'classic'})">Aa</div>`;
      else if (item.category === 'frame') preview = `<div class="shop-item-frame-sample frame-${item.id}"></div>`;

      let actionLabel;
      let disabled = false;
      if (equipped) actionLabel = 'Equipped';
      else if (owned) actionLabel = 'Equip';
      else if (item.chestOnly) {
        actionLabel = '🎁 Chest only';
        disabled = true;
      } else {
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

export function bindShopHandlers({ onPurchaseOrEquip, onBuyStreakShield }) {
  el('shop-categories').addEventListener('click', (e) => {
    const powerUp = e.target.closest('.powerup-buy-btn');
    if (powerUp) {
      if (!powerUp.disabled) onBuyStreakShield();
      return;
    }
    const btn = e.target.closest('.shop-item-action');
    if (!btn || btn.disabled) return;
    onPurchaseOrEquip(btn.dataset.itemId);
  });
}
