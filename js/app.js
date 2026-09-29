// Entry point: top-level app state and screen routing. Wires storage,
// pacing, session engine, and question bank together with the ui.js
// rendering layer.

import { Storage, TOPICS, backupProblem } from './storage.js';
import { computeTodaysPlan } from './pacing.js';
import { startSession, pickNextQuestion, recordAnswer, classifyAnswer, isSessionComplete, finishSession, settleBossGate, bossProgress, hasReachedLength, settleDayClock } from './session.js';
import { getSimilarQuestion, rightFormHint } from './questionBank.js';
import { getBadgeDefinitions, evaluateBadges, highestTiersOnly } from './badges.js';
import { computePersonalBests, findNewRecords, computeFixedMistakes } from './records.js';
import { isChestAvailable, rollChest } from './chest.js';
import { localDateStr, daysBetweenLocalDates } from './dates.js';
import { parsePdfQuestions, loadPdfJs } from './pdfQuestions.js';
import { fetchWeatherForCity } from './weather.js';
import { getItem, isOwned, availableBalance, STREAK_SHIELD, MAX_STREAK_SHIELDS } from './shop.js';
import { ROADMAP_LAST_ITEM_NUMBER } from './changelog.js';
import { isSyncConfigured, pushSuggestion } from './roadmapSync.js';
import * as ui from './ui.js';

const BADGE_DEFINITIONS = getBadgeDefinitions(TOPICS, ui.TOPIC_LABELS);

const state = {
  meta: null,
  mastery: null,
  plan: null,
  shopState: null,
  session: null,
  currentQuestion: null,
  questionStartTime: null,
  timerInterval: null,
  // Roadmap #101: the "Try one like it" question on offer after a wrong
  // answer, or null. Only lives while that answer is on screen, so it isn't
  // saved with the in-progress session.
  followUp: null,
  // Roadmap #97: true once this question has had its one "Right number!"
  // retry. Lives only in memory, like the question itself.
  formRetryUsed: false,
};

function loadState() {
  state.meta = Storage.getMeta();
  state.mastery = Storage.getMastery();
  state.plan = computeTodaysPlan(new Date(), state.meta, state.mastery, TOPICS);
  state.shopState = Storage.getShopState();
}

// Earned badges, hardest-first, for the always-visible header strip. Only
// the best medal per topic shows there (#129).
function getEarnedBadgesSorted() {
  const earnedIds = Storage.getBadges();
  return highestTiersOnly(BADGE_DEFINITIONS.filter((b) => earnedIds.includes(b.id)))
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
  if (cache && cache.city === city && cache.date === localDateStr()) {
    ui.renderWeather(cache.data);
    return;
  }
  ui.renderWeather('loading');
  try {
    const data = await fetchWeatherForCity(city);
    Storage.setWeatherCache({ city, date: localDateStr(), data });
    ui.renderWeather(data);
  } catch (e) {
    ui.renderWeather({ error: e.message });
  }
}

// ---------- Backups (Roadmap #150) and the reminder on Home (#151) ----------

const BACKUP_DUE_AFTER_DAYS = 30;
const BACKUP_SNOOZE_DAYS = 7;
const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

// A backup is overdue once more than 30 whole local days have passed since
// the last one, or, if there's never been one, since the first session. No
// sessions means nothing to lose, so never. A date in the future (a wrong
// clock) isn't overdue. "Not now" hides it until the snooze date.
function isBackupReminderDue(meta, sessions, today = localDateStr()) {
  if (sessions.length === 0) return false;
  if (meta.backupReminderSnoozedUntil && today < meta.backupReminderSnoozedUntil) return false;
  const last = meta.lastBackupAt ? new Date(meta.lastBackupAt) : null;
  let anchor;
  if (last && !Number.isNaN(last.getTime())) {
    anchor = localDateStr(last);
  } else {
    const firstMs = Math.min(...sessions.map((s) => new Date(s.date).getTime()).filter((t) => !Number.isNaN(t)));
    if (!Number.isFinite(firstMs)) return false;
    anchor = localDateStr(new Date(firstMs));
  }
  return daysBetweenLocalDates(anchor, today) > BACKUP_DUE_AFTER_DAYS;
}

// The one backup routine, used by Settings and by the Home reminder.
// Returns '' when the file was handed to the browser (and records that), or
// a message saying it couldn't be made.
function backUpProgress() {
  try {
    ui.downloadJson(`sprint-backup-${localDateStr()}.json`, Storage.buildBackup());
  } catch (e) {
    return 'Sorry, the backup file couldn\u2019t be made. Please try again.';
  }
  state.meta = { ...Storage.getMeta(), lastBackupAt: new Date().toISOString() };
  Storage.setMeta(state.meta);
  return '';
}

function handleBackup() {
  const error = backUpProgress();
  ui.renderSettings(Storage.getMeta(), Storage.getSyncConfig());
  ui.showBackupStatus(error || 'Your backup file is ready. Keep it somewhere safe, like iCloud Drive.', error ? 'warn' : 'ok');
}

function handleBackupReminderSave() {
  const error = backUpProgress();
  ui.renderBackupReminder(Boolean(error), error);
}

function handleBackupReminderSnooze() {
  const now = new Date();
  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + BACKUP_SNOOZE_DAYS);
  state.meta = { ...Storage.getMeta(), backupReminderSnoozedUntil: localDateStr(until) };
  Storage.setMeta(state.meta);
  ui.renderBackupReminder(false);
}

// "5 sessions, 120 stars to spend and a 3-day streak", for the restore
// confirmation.
function describeProgress(meta, sessionCount) {
  const m = { totalPoints: 0, spentPoints: 0, currentStreakDays: 0, ...meta };
  return `${sessionCount} session${sessionCount === 1 ? '' : 's'}, ${availableBalance(m)} stars to spend and a ${m.currentStreakDays || 0}-day streak`;
}

function handleRestoreFile(file) {
  ui.showBackupStatus('');
  const notOurs = 'That file isn\u2019t a Sprint backup, so nothing was changed.';
  if (file.size > MAX_BACKUP_BYTES) {
    ui.showBackupStatus('That file is too big to be a Sprint backup, so nothing was changed.', 'warn');
    return;
  }
  const reader = new FileReader();
  reader.onerror = () => ui.showBackupStatus('That file couldn\u2019t be read, so nothing was changed.', 'warn');
  reader.onload = () => {
    let backup;
    try {
      backup = JSON.parse(reader.result);
    } catch (e) {
      ui.showBackupStatus(notOurs, 'warn');
      return;
    }
    const problem = backupProblem(backup);
    if (problem) {
      ui.showBackupStatus(problem, 'warn');
      return;
    }
    const when = new Date(backup.exportedAt);
    const whenText = Number.isNaN(when.getTime())
      ? 'an unknown date'
      : when.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    const sure = window.confirm(
      `Restore the backup from ${whenText}? It has ${describeProgress(backup.data.meta, backup.data.sessions.length)}. `
      + `This iPad has ${describeProgress(Storage.getMeta(), Storage.getSessions().length)} now. `
      + 'Your progress here will be replaced by the backup.',
    );
    if (!sure) return;
    try {
      Storage.restoreBackup(backup);
    } catch (e) {
      ui.showBackupStatus('Something went wrong while restoring, so your progress has been left just as it was.', 'warn');
      return;
    }
    settleDayClockIfNeeded(); // an older backup may predate the local-day switch
    applyCosmetics(Storage.getShopState());
    applyColourMode(Storage.getMeta().colourMode);
    goToStart();
    ui.showHomeNotice('Progress restored');
  };
  reader.readAsText(file);
}

function goToStart() {
  stopTimer();
  loadState();
  ui.updateHeader(state.plan, state.meta, state.shopState, getEarnedBadgesSorted());
  ui.renderStart(state.plan, state.mastery, state.meta, !!Storage.getInProgress(), {
    personalBests: computePersonalBests(Storage.getSessions()),
    chestAvailable: isChestAvailable(state.meta),
    backupReminderDue: isBackupReminderDue(state.meta, Storage.getSessions()),
  });
  ui.showScreen('start');
  refreshWeather();
}

function goToProgress() {
  const mastery = Storage.getMastery();
  const meta = Storage.getMeta();
  const sessions = Storage.getSessions();
  ui.renderProgress(mastery, meta, sessions, BADGE_DEFINITIONS, Storage.getBadges(), computeFixedMistakes(sessions));
  ui.showScreen('progress');
}

function goToShop() {
  ui.renderShop(Storage.getShopState(), Storage.getMeta());
  ui.showScreen('shop');
}

function goToSettings() {
  ui.renderSettings(Storage.getMeta(), Storage.getSyncConfig());
  ui.showBackupStatus('');
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
  // Roadmap #114: start fetching pdf.js now, so it's likely ready by the
  // time a file is picked. A failure is reported when a file is picked.
  loadPdfJs().catch(() => {});
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
    `This will permanently erase all progress, points, badges, purchases, and settings.${connected} This cannot be undone. Tip: back up your progress first if you might want it back. Are you sure?`,
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
    // If pdf.js can't load (offline), parsePdfQuestions shows its own
    // "PDF support didn't load" message, so the error needs nothing more.
    try {
      await loadPdfJs();
    } catch (e) { /* reported by parsePdfQuestions */ }
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
    if (item.chestOnly) return; // only the daily chest hands these out
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

// Roadmap #112: buying a Streak Shield. It's a counter on meta, not an owned
// item, and only one can be held, so a second tap (or a stale button) does
// nothing.
function handleBuyStreakShield() {
  const meta = Storage.getMeta();
  if ((meta.streakShields || 0) >= MAX_STREAK_SHIELDS) return;
  if (availableBalance(meta) < STREAK_SHIELD.cost) return;
  meta.spentPoints = (meta.spentPoints || 0) + STREAK_SHIELD.cost;
  meta.streakShields = (meta.streakShields || 0) + 1;
  Storage.setMeta(meta);

  state.meta = meta;
  ui.updateHeader(state.plan, state.meta, state.shopState, getEarnedBadgesSorted());
  ui.renderShop(Storage.getShopState(), state.meta);
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
  // Through onNext rather than straight to nextQuestion: a session left
  // right after its last regular answer still needs the boss gate (#94)
  // settled, and one left after its final answer just needs finishing.
  onNext();
}

function startTimerIfNeeded() {
  stopTimer();
  if (state.session.lengthType !== 'minutes') return;
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
  showQuestion(pickNextQuestion(state.session, state.mastery));
}

function showQuestion(question) {
  state.followUp = null;
  state.formRetryUsed = false;
  state.currentQuestion = question;
  state.questionStartTime = Date.now();
  ui.renderHud(state.session, Boolean(state.currentQuestion.isBoss));
  if (state.currentQuestion.blocked) {
    ui.renderBlockedQuestion(state.currentQuestion.topic);
  } else {
    ui.renderQuestion(state.currentQuestion, bossProgress(state.session), { remainderTip: !state.meta.remainderTipSeen });
  }
}

function onCheck() {
  const answer = ui.getCurrentAnswer(state.currentQuestion.answerType);
  // Roadmap #97: the right value in the wrong form (0.3 for 3/10) gets one
  // more try, once per question. Nothing is recorded yet — no mastery,
  // points, streak or boss hit — and the question's clock keeps running.
  if (!state.formRetryUsed) {
    const { outcome, typed } = classifyAnswer(state.currentQuestion, answer);
    if (outcome === 'rightForm') {
      state.formRetryUsed = true;
      ui.showRightFormRetry(rightFormHint(state.currentQuestion, typed));
      return;
    }
  }
  const timeMs = Date.now() - state.questionStartTime;
  const { correct, streak, pointsEarned, bossBonus } = recordAnswer(
    state.session, state.mastery, state.currentQuestion, answer, timeMs, { formRetry: state.formRetryUsed },
  );
  ui.renderHud(state.session, Boolean(state.currentQuestion.isBoss), true);
  ui.renderFeedback(correct, state.currentQuestion);
  offerFollowUp(correct);
  if (state.currentQuestion.isBoss) {
    ui.renderBossResult(correct, pointsEarned, bossProgress(state.session), bossBonus);
  } else if (streak === 2) {
    ui.triggerStreakAnimation('🔥 Streak!');
  } else if (streak === 3 || streak === 6) {
    // The moments the combo meter (Roadmap #88) steps up.
    ui.triggerStreakAnimation(`🔥 Combo x${streak === 3 ? 2 : 3}!`);
  }
}

// Roadmap #101: after a wrong answer, maybe offer one more question of the
// same kind with new numbers. One per miss — the follow-up itself never
// offers another, so no wrong-answer loop can form (SPEC §6). Never for the
// boss, word problems or imported questions (getSimilarQuestion only works
// for generated ones), and only while the session still has room: the
// follow-up counts towards the chosen length like any other question.
function offerFollowUp(correct) {
  const q = state.currentQuestion;
  state.followUp = null;
  if (!correct && !q.isFollowUp && !q.isBoss && !hasReachedLength(state.session)) {
    const similar = getSimilarQuestion(q);
    if (similar) state.followUp = { ...similar, isFollowUp: true };
  }
  ui.showTryOneLikeIt(Boolean(state.followUp));
}

// Roadmap #133: the r-key tip has been dismissed, so it never shows again.
// state.meta is updated too: finishSession saves from it at the end of the
// session, and a stale copy would put the flag back to false.
function onRemainderTipSeen() {
  state.meta = { ...Storage.getMeta(), remainderTipSeen: true };
  Storage.setMeta(state.meta);
}

function onTryOneLikeIt() {
  const followUp = state.followUp;
  state.followUp = null;
  if (!followUp) return; // a second quick tap
  // A timed session can run out while the explanation is being read; the
  // button then just does what Next would (boss gate or summary).
  if (hasReachedLength(state.session)) {
    onNext();
    return;
  }
  showQuestion(followUp);
}

// Roadmap #91. Opened by the first session finished on a given day. Points
// are added to the total straight away, an item goes straight into the
// owned list (not auto-equipped — that's the child's call in the Shop).
function openDailyChestIfDue() {
  const today = localDateStr();
  if (!isChestAvailable(state.meta, today)) return null;
  const shopState = Storage.getShopState();
  const reward = rollChest(shopState.ownedItemIds);
  const meta = { ...state.meta, lastChestDate: today };
  if (reward.type === 'points') {
    meta.totalPoints = (meta.totalPoints || 0) + reward.points;
  } else {
    shopState.ownedItemIds = [...shopState.ownedItemIds, reward.itemId];
    Storage.setShopState(shopState);
    state.shopState = shopState;
  }
  Storage.setMeta(meta);
  state.meta = meta;
  return reward;
}

function onNext() {
  // Roadmap #94: the moment the regular questions run out, decide whether
  // the boss challenge unlocks; if not, the session simply ends here.
  settleBossGate(state.session);
  if (isSessionComplete(state.session)) {
    stopTimer();
    const recordsBefore = computePersonalBests(Storage.getSessions());
    const { entry, meta, shieldUsed } = finishSession(state.session, state.meta);
    state.meta = meta;
    const newRecords = findNewRecords(recordsBefore, computePersonalBests(Storage.getSessions()));
    // Before badges, so chest points count towards the points badges.
    const chestReward = openDailyChestIfDue();

    const badgeCtx = { meta: state.meta, mastery: state.mastery, sessionCount: Storage.getSessions().length };
    const { earnedIds, newlyEarnedIds } = evaluateBadges(BADGE_DEFINITIONS, badgeCtx, Storage.getBadges());
    Storage.setBadges(earnedIds);
    // Both ids are saved, but a session that crosses two medals in one
    // topic shows only the higher one (#129).
    const newlyEarnedBadges = highestTiersOnly(BADGE_DEFINITIONS.filter((b) => newlyEarnedIds.includes(b.id)));

    ui.updateHeader(state.plan, state.meta, state.shopState, getEarnedBadgesSorted());
    ui.renderSummary(entry, newlyEarnedBadges, state.meta, state.shopState, {
      newRecords,
      personalBests: computePersonalBests(Storage.getSessions()),
      chestReward,
      fixedToday: computeFixedMistakes(Storage.getSessions()).filter((f) => f.sessionId === entry.sessionId),
      mastery: state.mastery,
      shieldUsed,
    });
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
  onBackupReminderSave: handleBackupReminderSave,
  onBackupReminderSnooze: handleBackupReminderSnooze,
});

ui.bindSettingsHandlers({
  onNameChange,
  onCityChange,
  onColourModeChange,
  onClearProgress: handleClearProgress,
  onSyncConfigChange,
  onBackup: handleBackup,
  onRestoreFile: handleRestoreFile,
});

ui.bindQuestionHandlers({ onCheck, onNext, onExit: goToStart, onTryOneLikeIt, onTipSeen: onRemainderTipSeen });

ui.bindSummaryHandlers({ onRestart: goToStart });

ui.bindImportHandlers({
  onPdfFileSelected: handleImportPdfFile,
  onClear: handleClearImportedQuestions,
});

ui.bindShopHandlers({ onPurchaseOrEquip: handlePurchaseOrEquip, onBuyStreakShield: handleBuyStreakShield });

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

// UTC→local date fix: the one-off changeover of saved streak data to local
// days (see settleDayClock). A no-op once done, and on a fresh install.
function settleDayClockIfNeeded() {
  const settled = settleDayClock(Storage.getMeta(), Storage.getSessions());
  if (settled) Storage.setMeta(settled);
}

settleDayClockIfNeeded();
applyCosmetics(Storage.getShopState());
applyColourMode(Storage.getMeta().colourMode);
ui.initScrollIndicators();
goToStart();

// Keeps the home-screen clock ticking while the app is left open — updating
// even while another screen is active is harmless (the element just sits
// hidden), and saves having to start/stop the interval on navigation.
setInterval(() => ui.renderDateTime(new Date()), 30000);
