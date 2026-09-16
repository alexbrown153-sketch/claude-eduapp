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
  ui.renderSettings(Storage.getMeta());
  ui.showScreen('settings');
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
  ui.renderSettings(state.meta);
}

function onCityChange(city) {
  state.meta = { ...state.meta, weatherCity: city };
  Storage.setMeta(state.meta);
  ui.renderSettings(state.meta);
  refreshWeather();
}

function handleClearProgress() {
  const sure = window.confirm(
    'This will permanently erase all progress, points, badges, purchases, and settings. This cannot be undone. Are you sure?',
  );
  if (!sure) return;
  Storage.resetAll();
  applyCosmetics(Storage.getShopState());
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
  state.session = Storage.getInProgress();
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

ui.bindStartHandlers({
  onStart: () => {
    const length = ui.getSelectedLength();
    const topicFocus = ui.getSelectedTopic();
    const customQuestions = Storage.getCustomQuestions();
    if (customQuestions.length === 0) {
      ui.showStartWarning('No questions imported yet — import a practice paper on the Import page before starting a session.');
      return;
    }
    if (topicFocus && !customQuestions.some((q) => q.topic === topicFocus)) {
      ui.showStartWarning(`No imported questions for "${ui.TOPIC_LABELS[topicFocus] || topicFocus}" yet — import more questions covering this topic, or choose "All topics" instead.`);
      return;
    }
    ui.hideStartWarning();
    beginSession({ lengthType: length.type, lengthValue: length.value, topicFocus });
  },
  onResume: resumeSession,
});

ui.bindSettingsHandlers({
  onNameChange,
  onCityChange,
  onClearProgress: handleClearProgress,
});

ui.bindQuestionHandlers({ onCheck, onNext, onExit: goToStart });

ui.bindSummaryHandlers({ onRestart: goToStart });

ui.bindImportHandlers({
  onPdfFileSelected: handleImportPdfFile,
  onClear: handleClearImportedQuestions,
});

ui.bindShopHandlers({ onPurchaseOrEquip: handlePurchaseOrEquip });

ui.bindGlobalHandlers({
  onHome: goToStart,
  onGotoProgress: goToProgress,
  onGotoShop: goToShop,
  onGotoSettings: goToSettings,
  onGotoImport: goToImport,
});

applyCosmetics(Storage.getShopState());
ui.initScrollIndicators();
goToStart();

// Keeps the home-screen clock ticking while the app is left open — updating
// even while another screen is active is harmless (the element just sits
// hidden), and saves having to start/stop the interval on navigation.
setInterval(() => ui.renderDateTime(new Date()), 30000);
