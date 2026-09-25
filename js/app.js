// Entry point: top-level app state and screen routing. Wires storage,
// pacing, session engine, and question bank together with the ui.js
// rendering layer.

import { Storage, TOPICS } from './storage.js';
import { computeTodaysPlan } from './pacing.js';
import { startSession, pickNextQuestion, recordAnswer, isSessionComplete, finishSession } from './session.js';
import { getBadgeDefinitions, evaluateBadges } from './badges.js';
import { parsePdfQuestions } from './pdfQuestions.js';
import { fetchWeatherForCity } from './weather.js';
import { getItem, isOwned, availableBalance } from './shop.js';
import { ROADMAP_LAST_ITEM_NUMBER } from './changelog.js';
import { isSyncConfigured, pushSuggestion } from './roadmapSync.js';
import * as ui from './ui.js';

const BADGE_DEFINITIONS = getBadgeDefinitions(TOPICS, ui.TOPIC_LABELS);

if (window.pdfjsLib) {
  window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

const state = {
  meta: null,
  mastery: null,
  plan: null,
  shopState: null,
  session: null,
  currentQuestion: null,
  questionStartTime: null,
  timerInterval: null,
};

function loadState() {
  state.meta = Storage.getMeta();
  state.mastery = Storage.getMastery();
  state.plan = computeTodaysPlan(new Date(), state.meta, state.mastery, TOPICS);
  state.shopState = Storage.getShopState();
}

// Earned badges, hardest-first, for the always-visible header strip.
function getEarnedBadgesSorted() {
  const earnedIds = Storage.getBadges();
  return BADGE_DEFINITIONS
    .filter((b) => earnedIds.includes(b.id))
    .sort((a, b) => b.difficulty - a.difficulty);
}

// Cosmetic shop purchases (theme colours, font) apply globally via data
// attributes on <body> — see the [data-theme]/[data-font] rules in styles.css.
function applyCosmetics(shopState) {
  document.body.dataset.theme = shopState.equipped.theme;
  document.body.dataset.font = shopState.equipped.font;
}

// Light/dark mode (Roadmap #87). 'auto' follows the device's own setting and
// keeps following it while the app is open. The inline script in index.html
// applies the same rule before first paint; this is the source of truth.
const darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
function applyColourMode(pref) {
  const dark = pref === 'dark' || (pref === 'auto' && Boolean(darkQuery && darkQuery.matches));
  document.documentElement.dataset.mode = dark ? 'dark' : 'light';
}
if (darkQuery && darkQuery.addEventListener) {
  darkQuery.addEventListener('change', () => applyColourMode(Storage.getMeta().colourMode));
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Fetches today's weather for the child's chosen city (see weather.js),
// cached per city per day so revisiting Home repeatedly doesn't re-fetch.
// Runs in the background — the Start screen renders immediately either way.
async function refreshWeather() {
  const city = state.meta.weatherCity;
  if (!city) {
    ui.renderWeather('no-city');
    return;
  }
  const cache = Storage.getWeatherCache();
  if (cache && cache.city === city && cache.date === todayStr()) {
    ui.renderWeather(cache.data);
    return;
  }
  ui.renderWeather('loading');
  try {
    const data = await fetchWeatherForCity(city);
    Storage.setWeatherCache({ city, date: todayStr(), data });
    ui.renderWeather(data);
  } catch (e) {
    ui.renderWeather({ error: e.message });
  }
}

function goToStart() {
  stopTimer();
  loadState();
  ui.updateHeader(state.plan, state.meta, state.shopState, getEarnedBadgesSorted());
  ui.renderStart(state.plan, state.mastery, state.meta, !!Storage.getInProgress());
  ui.showScreen('start');
  refreshWeather();
}

function goToProgress() {
  const mastery = Storage.getMastery();
  const meta = Storage.getMeta();
  ui.renderProgress(mastery, meta, Storage.getSessions(), BADGE_DEFINITIONS, Storage.getBadges());
  ui.showScreen('progress');
}

function goToShop() {
  ui.renderShop(Storage.getShopState(), Storage.getMeta());
  ui.showScreen('shop');
}

function goToSettings() {
  ui.renderSettings(Storage.getMeta(), Storage.getSyncConfig());
  ui.showScreen('settings');
}

function goToSuggestions() {
  refreshSuggestions();
  ui.clearSuggestionInput();
  ui.showSuggestionStatus('');
  ui.showScreen('suggestions');
}

function refreshSuggestions() {
  ui.renderSuggestions(Storage.getSuggestions(), isSyncConfigured(Storage.getSyncConfig()));
}

function goToImport() {
  ui.renderImportSummary(Storage.getCustomQuestions());
  ui.renderImportErrors([]);
  ui.renderImportPreview([]);
  ui.showScreen('import');
}

function onNameChange(name) {
  state.meta = { ...state.meta, childName: name };
  Storage.setMeta(state.meta);
  ui.renderSettings(state.meta, Storage.getSyncConfig());
}

function onColourModeChange(mode) {
  state.meta = { ...state.meta, colourMode: mode };
  Storage.setMeta(state.meta);
  applyColourMode(mode);
  ui.renderSettings(state.meta, Storage.getSyncConfig());
}

function onCityChange(city) {
  state.meta = { ...state.meta, weatherCity: city };
  Storage.setMeta(state.meta);
  ui.renderSettings(state.meta, Storage.getSyncConfig());
  refreshWeather();
}

// Roadmap #82: suggestions are destined to be pasted into the roadmap file as
// numbered items, and the roadmap file explicitly allows rewording them so
// they read as roadmap entries. Only safe, mechanical tidying happens here —
// collapse the line breaks and double spaces a typed-in idea picks up, give
// it a capital letter and a full stop. The wording itself is left alone;
// changing what was actually meant isn't the app's call to make.
function normaliseSuggestion(raw) {
  const text = String(raw).replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const capitalised = text.charAt(0).toUpperCase() + text.slice(1);
  return /[.!?]$/.test(capitalised) ? capitalised : `${capitalised}.`;
}

// Suggestions continue the roadmap file's own numbering so a submitted idea
// can be pasted straight onto the end of it. Numbering from the highest
// number already handed out (not from the count of suggestions) keeps
// existing numbers stable after some have been merged into the file and
// cleared, and after ROADMAP_LAST_ITEM_NUMBER moves up to cover them.
function nextSuggestionNumber(existing) {
  const highestUsed = existing.reduce((max, sg) => Math.max(max, sg.number || 0), 0);
  return Math.max(ROADMAP_LAST_ITEM_NUMBER, highestUsed) + 1;
}

function onSyncConfigChange(config) {
  Storage.setSyncConfig(config);
  ui.renderSettings(Storage.getMeta(), config);
}

// Save first, send second. The suggestion is never lost to a failed request,
// and the screen behaves the same offline as it did before the relay existed.
async function handleSubmitSuggestion() {
  const text = normaliseSuggestion(ui.getSuggestionInput());
  if (!text) {
    ui.showSuggestionStatus('Write your idea first.', 'warn');
    return;
  }
  const record = {
    id: Storage.newId('sg'),
    number: nextSuggestionNumber(Storage.getSuggestions()),
    text,
    submittedAt: new Date().toISOString(),
    syncedAt: null,
  };
  Storage.addSuggestion(record);
  ui.clearSuggestionInput();
  refreshSuggestions();

  const config = Storage.getSyncConfig();
  if (!isSyncConfigured(config)) {
    ui.showSuggestionStatus(`Thanks! Saved as roadmap idea ${record.number}.`);
    return;
  }

  ui.showSuggestionStatus('Thanks! Sending to GitHub…', 'busy');
  const { sent, message } = await sendOne(config, record);
  ui.showSuggestionStatus(message, sent ? 'ok' : 'warn');
  refreshSuggestions();
}

// Pushes one stored suggestion and folds the result back into storage. The
// relay numbers the item from the roadmap file itself, so its number replaces
// the provisional one guessed here.
async function sendOne(config, record) {
  try {
    const { number, text } = await pushSuggestion(config, record.text);
    Storage.updateSuggestion(record.id, { number, text, syncedAt: new Date().toISOString() });
    return { sent: true, message: `Added to the roadmap file as idea ${number}.` };
  } catch (e) {
    return { sent: false, message: e.message };
  }
}

// Retry for everything still sitting on the device — one at a time, because
// each write depends on the file state the one before it left behind.
async function handleSendPendingSuggestions() {
  const config = Storage.getSyncConfig();
  if (!isSyncConfigured(config)) return;
  const pending = Storage.getSuggestions().filter((sg) => !sg.syncedAt);
  if (pending.length === 0) return;

  ui.showSuggestionStatus(`Sending ${pending.length} to GitHub…`, 'busy');
  let sentCount = 0;
  let lastError = '';
  for (const record of pending) {
    const { sent, message } = await sendOne(config, record);
    if (sent) sentCount += 1;
    else { lastError = message; break; }
    refreshSuggestions();
  }
  refreshSuggestions();
  if (sentCount === pending.length) {
    ui.showSuggestionStatus(`Sent ${sentCount} to the roadmap file.`);
  } else {
    ui.showSuggestionStatus(lastError, 'warn');
  }
}

function handleClearSuggestions() {
  const sure = window.confirm(
    'This deletes the suggestions you\'ve written. Copy them into the roadmap file first if you haven\'t already. Delete them?',
  );
  if (!sure) return;
  Storage.setSuggestions([]);
  refreshSuggestions();
  ui.showSuggestionStatus('Suggestions cleared.');
}

function handleClearProgress() {
  // The relay address and app key are settings, so a reset clears them too —
  // say so, because the child can't restore the key and sync would otherwise
  // just quietly stop working.
  const connected = isSyncConfigured(Storage.getSyncConfig())
    ? ' The GitHub connection will need setting up again.'
    : '';
  const sure = window.confirm(
    `This will permanently erase all progress, points, badges, purchases, and settings.${connected} This cannot be undone. Are you sure?`,
  );
  if (!sure) return;
  Storage.resetAll();
  applyCosmetics(Storage.getShopState());
  applyColourMode(Storage.getMeta().colourMode);
  goToStart();
}

function handleImportPdfFile(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    const { valid, errors } = await parsePdfQuestions(reader.result, TOPICS);
    if (valid.length > 0) Storage.addCustomQuestions(valid);
    ui.renderImportErrors(errors);
    ui.renderImportPreview(valid);
    ui.renderImportSummary(Storage.getCustomQuestions());
  };
  reader.onerror = () => ui.renderImportErrors([{ message: 'Could not read that file.', hint: 'Make sure it\'s a valid PDF and try again.' }]);
  reader.readAsArrayBuffer(file);
}

function handleClearImportedQuestions() {
  Storage.setCustomQuestions([]);
  ui.renderImportSummary([]);
  ui.renderImportErrors([]);
  ui.renderImportPreview([]);
}

function handlePurchaseOrEquip(itemId) {
  const item = getItem(itemId);
  const shopState = Storage.getShopState();
  const meta = Storage.getMeta();

  if (!isOwned(itemId, shopState.ownedItemIds)) {
    if (availableBalance(meta) < item.cost) return;
    meta.spentPoints = (meta.spentPoints || 0) + item.cost;
    shopState.ownedItemIds = [...shopState.ownedItemIds, itemId];
    Storage.setMeta(meta);
  }
  shopState.equipped[item.category] = itemId;
  Storage.setShopState(shopState);

  state.meta = meta;
  state.shopState = shopState;
  applyCosmetics(shopState);
  ui.updateHeader(state.plan, state.meta, shopState, getEarnedBadgesSorted());
  ui.renderShop(shopState, state.meta);
}

function beginSession({ lengthType, lengthValue, topicFocus }) {
  state.session = startSession({
    topicWeighting: state.plan.topicWeighting,
    topicFocus,
    lengthType,
    lengthValue,
    mode: state.plan.phase,
  });
  ui.showScreen('question');
  startTimerIfNeeded();
  nextQuestion();
}

function resumeSession() {
  const raw = Storage.getInProgress();
  state.session = { ...raw, usedWordProblemIds: new Set(raw.usedWordProblemIds) };
  ui.showScreen('question');
  startTimerIfNeeded();
  nextQuestion();
}

function startTimerIfNeeded() {
  stopTimer();
  if (!state.plan.timerVisible || state.session.lengthType !== 'minutes') return;
  const endAt = state.session.startedAt + state.session.lengthValue * 60 * 1000;
  ui.updateTimer(endAt - Date.now());
  state.timerInterval = setInterval(() => {
    ui.updateTimer(Math.max(0, endAt - Date.now()));
  }, 1000);
}

function stopTimer() {
  if (state.timerInterval) {
    clearInterval(state.timerInterval);
    state.timerInterval = null;
  }
}

function nextQuestion() {
  state.currentQuestion = pickNextQuestion(state.session, state.mastery);
  state.questionStartTime = Date.now();
  ui.renderHud(state.session, state.plan);
  if (state.currentQuestion.blocked) {
    ui.renderBlockedQuestion(state.currentQuestion.topic);
  } else {
    ui.renderQuestion(state.currentQuestion);
  }
}

function onCheck() {
  const answer = ui.getCurrentAnswer(state.currentQuestion.answerType);
  const timeMs = Date.now() - state.questionStartTime;
  const { correct, streak } = recordAnswer(state.session, state.mastery, state.currentQuestion, answer, timeMs);
  ui.renderHud(state.session, state.plan);
  ui.renderFeedback(correct, state.currentQuestion.explanation, state.currentQuestion.correctAnswer);
  if (streak === 2) ui.triggerStreakAnimation();
}

function onNext() {
  if (isSessionComplete(state.session)) {
    stopTimer();
    const { entry, meta } = finishSession(state.session, state.meta);
    state.meta = meta;

    const badgeCtx = { meta: state.meta, mastery: state.mastery, sessionCount: Storage.getSessions().length };
    const { earnedIds, newlyEarnedIds } = evaluateBadges(BADGE_DEFINITIONS, badgeCtx, Storage.getBadges());
    Storage.setBadges(earnedIds);
    const newlyEarnedBadges = BADGE_DEFINITIONS.filter((b) => newlyEarnedIds.includes(b.id));

    ui.updateHeader(state.plan, state.meta, state.shopState, getEarnedBadgesSorted());
    ui.renderSummary(entry, newlyEarnedBadges, state.meta, state.shopState);
    ui.showScreen('summary');
  } else {
    nextQuestion();
  }
}

// Roadmap ideas.md #80: question sourcing no longer depends on imports (see
// questionBank.js), so Start no longer needs a pre-check for import
// coverage before every session — it always has something to generate.
ui.bindStartHandlers({
  onStart: () => {
    const length = ui.getSelectedLength();
    const topicFocus = ui.getSelectedTopic();
    beginSession({ lengthType: length.type, lengthValue: length.value, topicFocus });
  },
  onResume: resumeSession,
});

ui.bindSettingsHandlers({
  onNameChange,
  onCityChange,
  onColourModeChange,
  onClearProgress: handleClearProgress,
  onSyncConfigChange,
});

ui.bindQuestionHandlers({ onCheck, onNext, onExit: goToStart });

ui.bindSummaryHandlers({ onRestart: goToStart });

ui.bindImportHandlers({
  onPdfFileSelected: handleImportPdfFile,
  onClear: handleClearImportedQuestions,
});

ui.bindShopHandlers({ onPurchaseOrEquip: handlePurchaseOrEquip });

ui.bindSuggestionsHandlers({
  onSubmit: handleSubmitSuggestion,
  onClear: handleClearSuggestions,
  onSendPending: handleSendPendingSuggestions,
});

ui.bindGlobalHandlers({
  onHome: goToStart,
  onGotoProgress: goToProgress,
  onGotoShop: goToShop,
  onGotoSettings: goToSettings,
  onGotoImport: goToImport,
  onGotoSuggestions: goToSuggestions,
});

applyCosmetics(Storage.getShopState());
applyColourMode(Storage.getMeta().colourMode);
ui.initScrollIndicators();
goToStart();

// Keeps the home-screen clock ticking while the app is left open — updating
// even while another screen is active is harmless (the element just sits
// hidden), and saves having to start/stop the interval on navigation.
setInterval(() => ui.renderDateTime(new Date()), 30000);
