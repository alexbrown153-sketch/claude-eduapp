// Entry point: top-level app state and screen routing. Wires storage,
// pacing, session engine, and question bank together with the ui.js
// rendering layer.

import { Storage, TOPICS, YEAR7_TOPICS, ALL_TOPICS, activeTopics, backupProblem } from './storage.js';
import { computeTodaysPlan } from './pacing.js';
import { startSession, pickNextQuestion, recordAnswer, classifyAnswer, checkAnswer, isSessionComplete, finishSession, settleBossGate, bossProgress, hasReachedLength, settleDayClock, buildRetryQueue, buildCheckupQueue } from './session.js';
import { getSimilarQuestion, rightFormHint } from './questionBank.js';
import { getBadgeDefinitions, evaluateBadges, highestTiersOnly } from './badges.js';
import {
  computePersonalBests, findNewRecords, computeFixedMistakes, computeMistakesToFix, questionsOnDay,
  compareTopicAccuracy, computeMonthlyRecap, countMapSteps, countsAsPractice,
} from './records.js';
import { createWeekQuests, questProgress, settleQuests } from './quests.js';
import { isChestAvailable, rollChest } from './chest.js';
import {
  localDateStr, daysBetweenLocalDates, sessionLocalDay, weekRange, previousWeekRange, weekdayIndex, inRange,
  localMonthStr, previousMonthStr,
} from './dates.js';
import { playSound } from './sound.js';
import { parsePdfQuestions, loadPdfJs } from './pdfQuestions.js';
import { fetchWeatherForCity } from './weather.js';
import { getItem, isOwned, availableBalance, STREAK_SHIELD, MAX_STREAK_SHIELDS } from './shop.js';
import { ROADMAP_LAST_ITEM_NUMBER } from './changelog.js';
import { isSyncConfigured, pushSuggestion } from './roadmapSync.js';
import * as ui from './ui.js';
import * as games from './gameScreens.js';
import { pickGuestQuestions, guestOutcome } from './games.js';
import { WORKER_NAMES } from './spotMistake.js';

// Every topic's badges, Year 7 included (#148), so a Year 7 badge can be
// earned and is never lost. visibleBadges() hides the locked Year 7 ones
// while the switch is off.
const BADGE_DEFINITIONS = getBadgeDefinitions(ALL_TOPICS, ui.TOPIC_LABELS);
function visibleBadges(meta, earnedIds) {
  if (meta.year7PackEnabled) return BADGE_DEFINITIONS;
  return BADGE_DEFINITIONS.filter((b) => !YEAR7_TOPICS.includes(b.topic) || earnedIds.includes(b.id));
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
  // Roadmap #101: the "Try one like it" question on offer after a wrong
  // answer, or null. Only lives while that answer is on screen, so it isn't
  // saved with the in-progress session.
  followUp: null,
  // Roadmap #97: true once this question has had its one "Right number!"
  // retry. Lives only in memory, like the question itself.
  formRetryUsed: false,
  // Roadmap #127: the "Try these again" round on offer on the summary
  // screen, ready-made, or null. Memory only: closing the app on the
  // summary simply drops it.
  retryQueue: null,
  // Roadmap #139: when this visit began — the page loading, or the app
  // coming back to the foreground. A note saved before then is shown.
  visitStartedAt: Date.now(),
  // Roadmap #141: the month whose recap card is on Home right now, or null.
  recapShownFor: null,
  // Where Back goes from the Trophy cabinet (#134) and the map (#137), and
  // the step count to animate the map from when opened from the summary.
  cabinetReturn: 'progress',
  mapReturn: 'start',
  mapFromSteps: null,
  // Roadmap #147: the Beat the Grown-Up round in progress, or null. Memory
  // only: leaving part-way (or reloading) throws it away, and nothing about
  // it is ever saved except the tally at the very end.
  guest: null,
};

const DAILY_GOAL = 20; // questions a day — Roadmap #130 (Alex's decision)
const RETRY_CAP = 5; // "Try these again" round — #127
const FIX_CAP = 10; // one Fix my mistakes session — #128
const CHECKUP_INTERVAL_DAYS = 28; // #149
const IMPORTED_SUBTOPICS = ['examberry', 'custom-pdf'];

// Reads meta fresh, applies `changes`, saves it and keeps state.meta in
// step, so a stale copy in memory can't undo a change made elsewhere.
function updateMeta(changes) {
  state.meta = { ...Storage.getMeta(), ...changes };
  Storage.setMeta(state.meta);
}

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

// ---------- Build 2 Home helpers ----------

// Roadmap #149: a check-up is due once the warm-up quiz is done and at
// least 28 whole local days have passed since the later of that and the
// last finished check-up. Only saved progress decides it.
function isCheckupDue(meta, today = localDateStr()) {
  if (!meta.diagnosticCompletedAt) return false;
  const times = [meta.diagnosticCompletedAt, meta.lastCheckupCompletedAt]
    .map((iso) => (iso ? new Date(iso).getTime() : NaN))
    .filter((t) => !Number.isNaN(t));
  if (times.length === 0) return false;
  return daysBetweenLocalDates(localDateStr(new Date(Math.max(...times))), today) >= CHECKUP_INTERVAL_DAYS;
}

// Roadmap #136: this week's quests, made the first time they're needed in
// a new week (only once the warm-up quiz is done), or null.
function ensureWeekQuests(today = localDateStr()) {
  if (!state.meta.diagnosticCompletedAt) return null;
  let quests = Storage.getQuests();
  if (!quests || quests.weekStart !== weekRange(today).start) {
    quests = createWeekQuests(today, state.mastery, quests);
    Storage.setQuests(quests);
  }
  return quests;
}

// Pays any quest finished by the session just saved (once each, plus the
// all-three bonus once a week) into the lifetime total. Returns what to
// show on the summary, or null.
function settleWeekQuests(sessions) {
  const quests = ensureWeekQuests();
  if (!quests) return null;
  const result = settleQuests(quests, sessions);
  Storage.setQuests(result.state);
  if (result.points > 0 || result.bonus) {
    state.meta = {
      ...state.meta,
      totalPoints: (state.meta.totalPoints || 0) + result.points,
      questWeeksCompleted: (state.meta.questWeeksCompleted || 0) + (result.bonus ? 1 : 0),
    };
    Storage.setMeta(state.meta);
  }
  return { ...result, topic: quests.topic };
}

// Roadmap #141: last month's recap if it's due, else null. The first visit
// after the update (no marker yet), or a month after one with no sessions,
// just moves the marker on without showing anything.
function monthlyRecapDue(sessions) {
  const month = localMonthStr();
  const last = state.meta.lastRecapMonth;
  if (!last) {
    updateMeta({ lastRecapMonth: month });
    return null;
  }
  if (month <= last) return null;
  const recap = computeMonthlyRecap(sessions, previousMonthStr(month));
  if (!recap) updateMeta({ lastRecapMonth: month });
  return recap;
}

function dismissRecap() {
  updateMeta({ lastRecapMonth: localMonthStr() });
  state.recapShownFor = null;
  ui.renderRecap(null);
}

// Roadmap #139: the note, if it's unseen and was saved before this visit
// began (so a grown-up who saves it and taps Home doesn't use it up).
function parentNoteToShow() {
  const note = Storage.getParentNote();
  if (!note || note.seenAt) return null;
  return new Date(note.savedAt).getTime() < state.visitStartedAt ? note : null;
}

function markParentNoteSeen() {
  const note = Storage.getParentNote();
  if (note && !note.seenAt) Storage.setParentNote({ ...note, seenAt: new Date().toISOString() });
  ui.renderParentNote(null);
}

function goToStart() {
  stopTimer();
  state.guest = null;
  loadState();
  // Roadmap #137: the map starts fresh from the first load after the update.
  if (!state.meta.mapStartedAt) updateMeta({ mapStartedAt: new Date().toISOString() });
  const sessions = Storage.getSessions();
  const today = localDateStr();

  const recap = monthlyRecapDue(sessions);
  state.recapShownFor = recap ? recap.month : null;
  const quests = ensureWeekQuests(today);

  // Roadmap #130: sparkle once, the first Home visit after the goal is met.
  const goalCount = questionsOnDay(sessions, today);
  const sparkle = goalCount >= DAILY_GOAL && state.meta.lastGoalCelebratedDate !== today;
  if (sparkle) updateMeta({ lastGoalCelebratedDate: today });

  const fix = mistakesToFix(sessions, today);
  ui.updateHeader(state.plan, state.meta, state.shopState, getEarnedBadgesSorted());
  ui.renderStart(state.plan, state.mastery, state.meta, !!Storage.getInProgress(), {
    personalBests: computePersonalBests(sessions),
    chestAvailable: isChestAvailable(state.meta),
    backupReminderDue: isBackupReminderDue(state.meta, sessions),
    checkup: { due: isCheckupDue(state.meta, today), length: buildCheckupQueue(TOPICS).length },
    goal: { count: goalCount, target: DAILY_GOAL, sparkle },
    parentNote: parentNoteToShow(),
    recap,
    rewardGoal: Storage.getRewardGoal(),
    fix: { count: fix.toFix.length, hadAny: fix.hadAny },
    quests: quests ? {
      state: quests,
      progress: questProgress(quests, sessions),
      firstBadge: !(state.meta.questWeeksCompleted > 0),
    } : null,
    map: { steps: countMapSteps(sessions, state.meta.mapStartedAt) },
    shopState: state.shopState,
  });
  ui.showScreen('start');
  refreshWeather();
}

function goToProgress() {
  const mastery = Storage.getMastery();
  const meta = Storage.getMeta();
  const sessions = Storage.getSessions();
  const today = localDateStr();
  const practice = sessions.filter(countsAsPractice);
  const thisWeek = weekRange(today);
  const earned = Storage.getBadges();
  ui.renderProgress(mastery, meta, sessions, visibleBadges(meta, earned), earned, computeFixedMistakes(sessions), {
    topics: activeTopics(meta), // #148
    // Roadmap #140: a session ticks the local day it finished on — the same
    // day the streak counted it for.
    calendar: {
      today,
      practised: new Set(practice.map(sessionLocalDay)),
      shielded: new Set(practice.map((s) => s.shieldCoveredDate).filter(Boolean)),
      streak: meta.currentStreakDays || 0,
    },
    // Roadmap #131: last week (A) against this week so far (B).
    weekCompare: {
      compare: compareTopicAccuracy(sessions, previousWeekRange(today), thisWeek),
      isMonday: weekdayIndex(today) === 0,
      thisWeekCount: practice.filter((s) => inRange(sessionLocalDay(s), thisWeek)).length,
    },
  });
  ui.showScreen('progress');
}

// Roadmap #134: from the Progress button or the header badges, from any
// screen; Back returns to wherever it was opened from.
function openCabinet() {
  if (ui.currentScreen() !== 'cabinet') state.cabinetReturn = ui.currentScreen();
  const meta = Storage.getMeta();
  const earned = Storage.getBadges();
  ui.renderCabinet(visibleBadges(meta, earned), earned, { meta, mastery: Storage.getMastery(), sessionCount: Storage.getSessions().length });
  ui.showScreen('cabinet');
}

function closeCabinet() {
  const back = state.cabinetReturn;
  if (back === 'start') goToStart();
  else if (back === 'progress') goToProgress();
  else ui.showScreen(back);
}

// Roadmap #137. From the summary, the avatar walks from its old step.
function openMap(fromSummary = false) {
  state.mapReturn = fromSummary ? 'summary' : 'start';
  const meta = Storage.getMeta();
  const steps = countMapSteps(Storage.getSessions(), meta.mapStartedAt);
  ui.renderMap(steps, Storage.getShopState(), fromSummary ? state.mapFromSteps : null);
  if (fromSummary) state.mapFromSteps = null; // the walk plays once
  ui.showScreen('map');
}

function closeMap() {
  if (state.mapReturn === 'summary') ui.showScreen('summary');
  else goToStart();
}

function goToShop() {
  ui.renderShop(Storage.getShopState(), Storage.getMeta());
  ui.showScreen('shop');
}

function goToSettings() {
  const meta = Storage.getMeta();
  ui.renderSettings(meta, Storage.getSyncConfig());
  ui.renderNoteSettings(Storage.getParentNote(), meta.childName);
  ui.renderRewardGoalSettings(Storage.getRewardGoal());
  ui.showRewardGoalStatus('');
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

// Roadmap #142. Tapping On plays the ding straight away, as a preview —
// that tap is also what lets iPad Safari play sound at all.
function onSoundChange(on) {
  updateMeta({ soundOn: on });
  ui.renderSettings(state.meta, Storage.getSyncConfig());
  if (on) playSound('ding');
}

// Roadmap #139: one note at a time; saving replaces it and makes it unseen.
function onNoteSave(text) {
  const note = { text: text.slice(0, 200), savedAt: new Date().toISOString(), seenAt: null };
  Storage.setParentNote(note);
  ui.renderNoteSettings(note, Storage.getMeta().childName);
}

function onNoteEdit() {
  ui.renderNoteSettings(Storage.getParentNote(), Storage.getMeta().childName, true);
}

function onNoteDelete() {
  if (!window.confirm('Delete this note?')) return;
  Storage.clearParentNote();
  ui.renderNoteSettings(null, Storage.getMeta().childName);
}

// Roadmap #138. A new goal starts from 0: progress is lifetime points
// earned since it was saved. Changing an existing goal's name or target
// keeps that starting point, so progress isn't lost.
function onRewardSave({ label, target }) {
  const name = String(label).trim().slice(0, 40);
  const text = String(target).trim();
  if (!name) {
    ui.showRewardGoalStatus('Type the reward first, like \u201cCinema trip\u201d.', 'warn');
    return;
  }
  const points = /^\d+$/.test(text) ? Number(text) : NaN;
  if (!(points >= 100 && points <= 100000)) {
    ui.showRewardGoalStatus('Points needed must be a whole number from 100 to 100,000.', 'warn');
    return;
  }
  const existing = Storage.getRewardGoal();
  const goal = existing
    ? { ...existing, label: name, targetPoints: points }
    : { label: name, targetPoints: points, baselinePoints: Storage.getMeta().totalPoints || 0, setAt: new Date().toISOString() };
  Storage.setRewardGoal(goal);
  ui.renderRewardGoalSettings(goal);
  ui.showRewardGoalStatus('Saved. It shows on Home.');
}

function onRewardRemove() {
  if (!window.confirm('Remove the reward goal? Its progress bar will go from Home.')) return;
  Storage.clearRewardGoal();
  ui.renderRewardGoalSettings(null);
  ui.showRewardGoalStatus('Goal removed.');
}

// Roadmap #148. Switching off never deletes Year 7 progress; it only hides
// the chips, bars and locked badges.
function onYear7Change(on) {
  updateMeta({ year7PackEnabled: on });
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

// mode defaults to today's plan (warm-up quiz or daily practice). A check-up
// (#149), Fix (#128) or retry round (#127) passes its own mode and list.
function beginSession({ lengthType, lengthValue, topicFocus, mode = state.plan.phase, queue = null, checkupQueue = null }) {
  if (ui.isParentNoteShowing()) markParentNoteSeen(); // #139: it's been seen
  state.retryQueue = null;
  state.guest = null;
  state.session = startSession({
    topicWeighting: state.plan.topicWeighting,
    topicFocus,
    lengthType,
    lengthValue,
    mode,
    queue,
    checkupQueue,
  });
  ui.showScreen('question');
  startTimerIfNeeded();
  nextQuestion();
}

function startCheckup() {
  beginSession({ mode: 'checkup', checkupQueue: buildCheckupQueue(TOPICS) });
}

// Roadmap #148: while the Year 7 switch is off, Year 7 mistakes wait (they
// aren't lost, and come back when it's on), so no session serves a Year 7
// question with the switch off.
function mistakesToFix(sessions, today) {
  const found = computeMistakesToFix(sessions, today);
  const topics = activeTopics(Storage.getMeta());
  const toFix = found.toFix.filter((k) => topics.includes(k.topic));
  // Only hidden ones left: hide the card rather than say "all fixed".
  const onlyHiddenLeft = toFix.length === 0 && found.toFix.length > 0;
  return { toFix, hadAny: found.hadAny && !onlyHiddenLeft };
}

// Roadmap #128: new versions of this week's mistakes, the most recent 10.
function startFixSession() {
  const { toFix } = mistakesToFix(Storage.getSessions(), localDateStr());
  const queue = buildRetryQueue(toFix, FIX_CAP);
  if (queue.length === 0) {
    ui.showHomeNotice('Sprint couldn\u2019t make new questions for those just now. Try again later!');
    return;
  }
  beginSession({ mode: 'fix', queue });
}

// Roadmap #127: "Try these again" on the summary.
function startRetryRound() {
  const queue = state.retryQueue;
  state.retryQueue = null;
  ui.hideRetryButton();
  if (!queue || queue.length === 0) return; // a second quick tap
  beginSession({ mode: 'retry', queue });
}

// This session's misses that can be asked again with new numbers, lowest
// tier first (in the order asked within a tier). Word problems (no new
// numbers to give without the answer being on screen) and imported
// questions are listed but not re-asked, and neither is a miss the child
// already put right with "Try one like it".
function retryKinds(entry) {
  const qs = entry.questions;
  const putRight = new Set(qs.filter((q) => q.correct && Number.isInteger(q.followUpOf)).map((q) => q.followUpOf));
  return qs
    .map((q, i) => ({ q, i }))
    .filter(({ q, i }) => !q.correct && q.prompt && !putRight.has(i)
      && q.topic !== 'wordProblems' && !IMPORTED_SUBTOPICS.includes(q.subtopic))
    .map(({ q }) => ({ topic: q.topic, subtopic: q.subtopic, difficulty: q.difficulty, variant: q.variant, prompt: q.prompt }))
    .sort((a, b) => a.difficulty - b.difficulty);
}

// The summary's "Questions I got wrong" rows, in the order asked. Answers
// saved before this list existed have no prompt and are left out.
function wrongList(entry, session) {
  const extras = session.reviewExtras || {};
  return entry.questions
    .map((q, i) => ({ q, x: extras[i] || {} }))
    .filter(({ q }) => !q.correct && q.prompt)
    .map(({ q, x }) => ({
      prompt: q.prompt, correctAnswer: q.correctAnswer, explanation: x.explanation || '', diagramSvg: x.diagramSvg || '',
    }));
}

function resumeSession() {
  if (ui.isParentNoteShowing()) markParentNoteSeen();
  const raw = Storage.getInProgress();
  state.session = { ...raw, usedWordProblemIds: new Set(raw.usedWordProblemIds) };
  // #148 AC6: a Year 7 chip session resumed after the switch was turned off
  // carries on with the ordinary mix instead.
  if (YEAR7_TOPICS.includes(state.session.topicFocus) && !Storage.getMeta().year7PackEnabled) state.session.topicFocus = null;
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

// Roadmap #146: the made-up pupil in Spot the mistake is never the child.
function withWorkerName(question) {
  if (question.format !== 'spotMistake') return question;
  const child = String(state.meta.childName || '').trim().toLowerCase();
  const name = WORKER_NAMES.find((n) => n.toLowerCase() !== child);
  return { ...question, workerName: name };
}

function showQuestion(rawQuestion) {
  const question = rawQuestion.blocked ? rawQuestion : withWorkerName(rawQuestion);
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
  if (state.guest) { onGuestCheck(); return; }
  const answer = ui.getCurrentAnswer(state.currentQuestion.answerType);
  // #146 AC4: Check with no line picked records nothing, and says so.
  if (state.currentQuestion.answerType === 'spot' && !answer) {
    ui.showSpotHint();
    return;
  }
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
  if (correct && state.meta.soundOn) playSound('ding'); // #142: never on a wrong answer
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
//
// Not in a "Try these again" round (#127): it's already a second go. The
// follow-up remembers which answer it followed (followUpOf), so the summary
// knows that miss was put right.
function offerFollowUp(correct) {
  const q = state.currentQuestion;
  state.followUp = null;
  // Never after Spot the mistake (#146 AC11).
  if (!correct && !q.isFollowUp && !q.isBoss && q.format !== 'spotMistake' && state.session.mode !== 'retry' && !hasReachedLength(state.session)) {
    const similar = getSimilarQuestion(q);
    if (similar) state.followUp = { ...similar, isFollowUp: true, followUpOf: state.session.questions.length - 1 };
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
  if (state.guest) { onGuestNext(); return; }
  // Roadmap #94: the moment the regular questions run out, decide whether
  // the boss challenge unlocks; if not, the session simply ends here.
  settleBossGate(state.session);
  if (isSessionComplete(state.session)) {
    stopTimer();
    const session = state.session;
    const sessionsBefore = Storage.getSessions();
    const recordsBefore = computePersonalBests(sessionsBefore);
    const stepsBefore = countMapSteps(sessionsBefore, state.meta.mapStartedAt);
    const { entry, meta, shieldUsed } = finishSession(session, state.meta);
    state.meta = meta;
    const sessions = Storage.getSessions();
    const today = localDateStr();
    const newRecords = findNewRecords(recordsBefore, computePersonalBests(sessions));
    // Before badges, so chest and quest points count towards the points badges.
    const chestReward = openDailyChestIfDue();
    const quests = settleWeekQuests(sessions);
    // #141: a recap left on Home is done with once a session is finished.
    if (state.recapShownFor) {
      state.meta = { ...state.meta, lastRecapMonth: localMonthStr() };
      Storage.setMeta(state.meta);
      state.recapShownFor = null;
    }

    const fixedToday = computeFixedMistakes(sessions).filter((f) => f.sessionId === entry.sessionId);
    const badgeCtx = {
      meta: state.meta, mastery: state.mastery, sessionCount: sessions.length, entry, fixedThisSession: fixedToday,
    };
    const { earnedIds, newlyEarnedIds } = evaluateBadges(BADGE_DEFINITIONS, badgeCtx, Storage.getBadges());
    Storage.setBadges(earnedIds);
    // Both ids are saved, but a session that crosses two medals in one
    // topic shows only the higher one (#129).
    const newlyEarnedBadges = highestTiersOnly(BADGE_DEFINITIONS.filter((b) => newlyEarnedIds.includes(b.id)));

    // #127: a retry round never offers another (no loop, SPEC §6).
    state.retryQueue = entry.mode === 'retry' ? null : buildRetryQueue(retryKinds(entry), RETRY_CAP);
    state.mapFromSteps = stepsBefore;
    let fixResult = null;
    if (entry.mode === 'fix') {
      const slots = entry.questions.filter((q) => !q.boss && !Number.isInteger(q.followUpOf));
      fixResult = {
        fixed: slots.filter((q) => q.correct).length,
        total: slots.length,
        left: mistakesToFix(sessions, today).toFix.length,
      };
    }

    ui.updateHeader(state.plan, state.meta, state.shopState, getEarnedBadgesSorted());
    ui.renderSummary(entry, newlyEarnedBadges, state.meta, state.shopState, {
      newRecords,
      personalBests: computePersonalBests(sessions),
      chestReward,
      fixedToday,
      mastery: state.mastery,
      shieldUsed,
      wrongList: wrongList(entry, session),
      canRetry: Boolean(state.retryQueue && state.retryQueue.length),
      fixResult,
      quests,
      mapStep: { before: stepsBefore, after: countMapSteps(sessions, state.meta.mapStartedAt) },
      goal: { count: questionsOnDay(sessions, today), target: DAILY_GOAL },
      checkupDone: entry.mode === 'checkup',
    });
    ui.showScreen('summary');

    // #142: one sound per summary — the fanfare for a new badge, otherwise
    // the coin if anything was earned.
    if (state.meta.soundOn) {
      const earned = entry.summary.pointsEarned
        + (chestReward && chestReward.type === 'points' ? chestReward.points : 0)
        + (quests ? quests.points : 0);
      if (newlyEarnedBadges.length > 0) playSound('fanfare');
      else if (earned > 0) playSound('coin');
    }
  } else {
    nextQuestion();
  }
}

// ---------- Beat the Grown-Up (Roadmap #147) ----------
//
// Both turns run on the ordinary question screen with the ordinary marking
// (checkAnswer, and classifyAnswer's one "Right number!" retry), but none
// of the practice save path: no recordAnswer, finishSession, mastery,
// streak, points, chest, badges or in-progress save. A paused normal
// session is left exactly as it was. The only write is the tally, once,
// when the result appears.

function startGuestRound() {
  stopTimer();
  const questions = pickGuestQuestions(Storage.getMastery());
  state.guest = {
    questions,
    turn: 'child',
    index: 0,
    child: { correct: 0, timeMs: 0 },
    grownUp: { correct: 0, timeMs: 0 },
    childName: String(Storage.getMeta().childName || '').trim(),
  };
  ui.showScreen('question');
  showGuestQuestion();
}

function guestWho() {
  const g = state.guest;
  if (g.turn === 'grownUp') return 'Grown-up\u2019s turn';
  return g.childName ? `${g.childName}\u2019s turn` : 'Your turn';
}

function showGuestQuestion() {
  const g = state.guest;
  state.followUp = null;
  state.formRetryUsed = false;
  state.currentQuestion = g.questions[g.index];
  state.questionStartTime = Date.now();
  ui.renderGuestHud(guestWho(), g.index + 1, g.questions.length, g[g.turn].correct);
  // The one-time r-key tip would mark itself seen in meta, so it stays
  // out of a guest round.
  ui.renderQuestion(state.currentQuestion, null, { remainderTip: false });
}

function onGuestCheck() {
  const g = state.guest;
  const q = state.currentQuestion;
  const answer = ui.getCurrentAnswer(q.answerType);
  if (!state.formRetryUsed) {
    const { outcome, typed } = classifyAnswer(q, answer);
    if (outcome === 'rightForm') {
      state.formRetryUsed = true;
      ui.showRightFormRetry(rightFormHint(q, typed));
      return;
    }
  }
  const correct = checkAnswer(q, answer);
  g[g.turn].timeMs += Date.now() - state.questionStartTime;
  if (correct) g[g.turn].correct += 1;
  ui.renderGuestHud(guestWho(), g.index + 1, g.questions.length, g[g.turn].correct);
  ui.renderFeedback(correct, q);
  ui.showTryOneLikeIt(false);
  if (correct && Storage.getMeta().soundOn) playSound('ding');
}

function onGuestNext() {
  const g = state.guest;
  g.index += 1;
  if (g.index < g.questions.length) {
    showGuestQuestion();
  } else if (g.turn === 'child') {
    g.turn = 'grownUp';
    g.index = 0;
    ui.showGuestHandover();
  } else {
    finishGuestRound();
  }
}

function finishGuestRound() {
  const g = state.guest;
  state.guest = null;
  const outcome = guestOutcome(g.child, g.grownUp);
  const tally = Storage.getGrownUpTally();
  if (outcome.winner === 'child') tally.childWins += 1;
  else if (outcome.winner === 'grownUp') tally.grownUpWins += 1;
  else tally.draws += 1;
  Storage.setGrownUpTally(tally);
  ui.showGuestResult({ childName: g.childName, child: g.child, grownUp: g.grownUp, outcome, tally });
  if (outcome.winner === 'child' && Storage.getMeta().soundOn) playSound('fanfare');
}

ui.bindGuestHandlers({
  onGrownUpStart: () => {
    if (!state.guest) return;
    ui.showScreen('question');
    showGuestQuestion();
  },
  onRematch: startGuestRound,
  onHome: goToStart,
});

// Leaving a game or the guest round part-way throws it away.
ui.onScreenChange((name) => {
  games.onScreenChange(name);
  if (state.guest && name !== 'question' && name !== 'guest') state.guest = null;
});

games.bindGames({
  showScreen: ui.showScreen,
  goHome: goToStart,
  startGuest: startGuestRound,
  refreshHeader: () => {
    state.meta = Storage.getMeta();
    ui.updateHeader(state.plan, state.meta, Storage.getShopState(), getEarnedBadgesSorted());
  },
});

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
  onStartCheckup: startCheckup,
  onStartFix: startFixSession,
  onNoteThanks: markParentNoteSeen,
  onRecapDismiss: dismissRecap,
  onOpenMap: () => openMap(false),
  onOpenGames: () => games.openGames(),
});

ui.bindCabinetAndMapHandlers({ onOpenCabinet: openCabinet, onCabinetBack: closeCabinet, onMapBack: closeMap });

ui.bindSettingsHandlers({
  onNameChange,
  onCityChange,
  onColourModeChange,
  onClearProgress: handleClearProgress,
  onSyncConfigChange,
  onBackup: handleBackup,
  onRestoreFile: handleRestoreFile,
  onSoundChange,
  onNoteSave,
  onNoteEdit,
  onNoteDelete,
  onRewardSave,
  onRewardRemove,
  onYear7Change,
});

ui.bindQuestionHandlers({ onCheck, onNext, onExit: goToStart, onTryOneLikeIt, onTipSeen: onRemainderTipSeen });

ui.bindSummaryHandlers({ onRestart: goToStart, onTryAgain: startRetryRound, onOpenMap: () => openMap(true) });

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

// Roadmap #139: coming back to the app (the iPad unlocked, or back from
// another app) starts a new visit, so a note saved before then can show.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  state.visitStartedAt = Date.now();
  if (ui.currentScreen() === 'start') ui.renderParentNote(parentNoteToShow());
});

// Keeps the home-screen clock ticking while the app is left open — updating
// even while another screen is active is harmless (the element just sits
// hidden), and saves having to start/stop the interval on navigation.
setInterval(() => ui.renderDateTime(new Date()), 30000);
