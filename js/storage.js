// localStorage persistence layer. All keys are namespaced under sprint:v1:default
// so a future second profile (see SPEC.md §3) can be added without migrating data.

const NS = 'sprint:v1:default';

export const TOPICS = ['arithmetic', 'fdp', 'geometry', 'coordinates', 'wordProblems', 'ratio', 'algebra', 'dataHandling'];

// Roadmap #148: the Year 7 pack, behind Settings > "Year 7 topics" (off by
// default). These are NOT in TOPICS on purpose: everything that plans
// practice (the All-topics mix, today's focus, the Next-session widget, the
// boss, the check-up, quests and the map) reads TOPICS, and Alex decided
// Year 7 topics are only asked when their own chip is tapped. Their mastery
// is always stored (so switching the pack off never loses progress); only
// display is filtered, via activeTopics().
export const YEAR7_TOPICS = ['negatives', 'powersRoots', 'primes', 'probability', 'bracketEquations'];
export const ALL_TOPICS = [...TOPICS, ...YEAR7_TOPICS];

// Topics shown on Progress, in the Trophy cabinet and as chips: the core
// eight, plus the Year 7 five while the switch is on.
export function activeTopics(meta) {
  return meta && meta.year7PackEnabled ? ALL_TOPICS : TOPICS;
}

function defaultMasteryRecord() {
  return {
    masteryScore: 0.5,
    difficultyLevel: 3,
    questionsSeen: 0,
    consecutiveWrong: 0,
    lastPracticed: null,
    history: [],
  };
}

function defaultMastery() {
  const m = {};
  ALL_TOPICS.forEach((t) => { m[t] = defaultMasteryRecord(); });
  return m;
}

function defaultMeta() {
  return {
    profileId: 'default',
    schemaVersion: 1,
    diagnosticCompletedAt: null,
    currentStreakDays: 0,
    lastPracticeDate: null,
    totalPoints: 0,
    spentPoints: 0,
    childName: '',
    weatherCity: '',
    colourMode: 'light', // 'light' | 'dark' | 'auto' (follow the device) — Roadmap #87
    lastChestDate: null, // local YYYY-MM-DD the daily mystery chest was last opened — Roadmap #91
    streakShields: 0, // 0 or 1 Streak Shields held, bought in the Shop — Roadmap #112
    // 'local' once saved streak dates have been moved onto the child's local
    // calendar (UTC→local date fix, settleDayClock in session.js). Absent or
    // null on older data, so that one-off fix-up runs exactly once.
    dayClock: null,
    // True once the one-time "r key" tip on remainder questions has been
    // dismissed — Roadmap #133.
    remainderTipSeen: false,
    // ISO time of the last "Back up my progress" (or restore), or null —
    // Roadmap #150. Only means a file was handed to the browser.
    lastBackupAt: null,
    // Local YYYY-MM-DD the Home backup reminder is snoozed until — #151.
    backupReminderSnoozedUntil: null,
    // Local YYYY-MM-DD the daily goal ring last sparkled, so it only
    // sparkles once a day — Roadmap #130.
    lastGoalCelebratedDate: null,
    // ISO time the last check-up quiz was finished, or null — #149.
    lastCheckupCompletedAt: null,
    // Local YYYY-MM of the month the monthly recap was last dealt with
    // (shown and closed, or skipped) — #141. Null until the first Home visit
    // after the update, which sets it without showing anything.
    lastRecapMonth: null,
    // ISO time the adventure map started counting steps — #137. Set on the
    // first load after the update, so the map starts fresh from there.
    mapStartedAt: null,
    // Weeks in which all three weekly quests were finished — #136.
    questWeeksCompleted: 0,
    // Optional sound effects, off unless switched on in Settings — #142.
    soundOn: false,
    // Roadmap #148: the Year 7 topics switch, off until a grown-up turns it on.
    year7PackEnabled: false,
  };
}

function defaultShopState() {
  return {
    ownedItemIds: [],
    equipped: {
      theme: 'theme-default',
      font: 'font-default',
      avatar: 'avatar-default',
      frame: 'frame-none',
      accessory: 'accessory-none',
      mood: 'mood-none',
      avatarColor: 'avatarColor-default',
    },
  };
}

function readJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`Sprint: failed to read ${key}, using default`, e);
    return fallback;
  }
}

// Roadmap #187: while the saved progress can't be read (corrupt, or gone), the
// app is in "safe mode" and NOTHING is written under this profile's keys: the
// next ordinary save would overwrite recoverable data with fresh defaults.
// Only a deliberate restore or "Start fresh" (below) lifts it. `unavailable`
// is the separate case where the browser won't store anything at all (private
// mode, quota): practice carries on, saves are skipped quietly.
let writesBlocked = false;
let storageUnavailable = false;

function writeJSON(key, value) {
  if (writesBlocked || storageUnavailable) return;
  localStorage.setItem(key, JSON.stringify(value));
}

function removeKey(key) {
  if (writesBlocked || storageUnavailable) return;
  localStorage.removeItem(key);
}

// ---------- Backup and restore (Roadmap #150) ----------

// Keys that belong to this device, not to the child's progress: never put in
// a backup file and never touched by a restore. `sync` holds the relay's app
// key (a secret that mustn't end up in iCloud), `weatherCache` is throwaway,
// `inprogress` is a half-finished session, and `suggestions` are feedback,
// not progress. Everything else under NS is backed up, so keys added later
// are included automatically — add a new key here if it's device-only.
//
// #187 adds two: `initialised` (a marker that this device has held progress
// before, so a later vanishing `meta` isn't mistaken for a first run) and
// `corruptSalvage` (the raw text of unreadable progress, kept by "Start
// fresh" in case a grown-up wants to recover it by hand).
const DEVICE_ONLY_KEYS = ['sync', 'weatherCache', 'inprogress', 'suggestions', 'initialised', 'corruptSalvage'];

export const BACKUP_FORMAT_VERSION = 1;
const CURRENT_SCHEMA_VERSION = 1; // defaultMeta().schemaVersion

// This profile's keys that a backup carries (short names, e.g. 'meta').
function backedUpKeyNames() {
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(`${NS}:`))
    .map((k) => k.slice(NS.length + 1))
    .filter((name) => !DEVICE_ONLY_KEYS.includes(name));
}

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isCount = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

// The shape rule shared by backup files and the startup check (#187): meta
// and mastery are objects, sessions is a list. Only this top-level shape is
// checked live, not every field: a stray null score in mastery still runs
// today, and shouldn't lock the child out of the app.
const hasCoreShape = (meta, mastery, sessions) => isObject(meta) && isObject(mastery) && Array.isArray(sessions);

// Checks a parsed backup file before anything is written. Returns null if
// it's fine, or a friendly message saying why not.
export function backupProblem(file) {
  const notOurs = 'That file isn\u2019t a Sprint backup, so nothing was changed.';
  const damaged = 'That backup file looks damaged, so nothing was changed.';
  if (!isObject(file) || file.app !== 'sprint' || file.profileId !== 'default') return notOurs;
  if (typeof file.formatVersion !== 'number' || typeof file.schemaVersion !== 'number') return damaged;
  if (file.formatVersion > BACKUP_FORMAT_VERSION || file.schemaVersion > CURRENT_SCHEMA_VERSION) {
    return 'That backup was made by a newer version of Sprint, so it can\u2019t be loaded here. Nothing was changed.';
  }
  const d = file.data;
  if (!isObject(d) || !hasCoreShape(d.meta, d.mastery, d.sessions)) return damaged;
  if (d.badges !== undefined && !Array.isArray(d.badges)) return damaged;
  if (d.customQuestions !== undefined && !Array.isArray(d.customQuestions)) return damaged;
  if (d.shop !== undefined && (!isObject(d.shop) || (d.shop.ownedItemIds !== undefined && !Array.isArray(d.shop.ownedItemIds)))) return damaged;
  if (d.meta.totalPoints !== undefined && !isCount(d.meta.totalPoints)) return damaged;
  if (d.meta.spentPoints !== undefined && !isCount(d.meta.spentPoints)) return damaged;
  const badRecord = Object.values(d.mastery).some((rec) => !isObject(rec)
    || typeof rec.masteryScore !== 'number' || !(rec.masteryScore >= 0 && rec.masteryScore <= 1)
    || !Number.isInteger(rec.difficultyLevel) || rec.difficultyLevel < 1 || rec.difficultyLevel > 5);
  if (badRecord) return damaged;
  return null;
}

let localIdCounter = 0;
// Stable local id for records that need to be found again later (imported
// questions, suggestions awaiting sync). Not a GUID — it only has to be
// unique within one browser's stored data.
function nextLocalId(prefix) {
  localIdCounter += 1;
  return `${prefix}_${Date.now()}_${localIdCounter}`;
}

// ---------- Startup safety check (Roadmap #187) ----------

const CORE_KEYS = ['meta', 'mastery', 'sessions'];
const SALVAGE_KEY = `${NS}:corruptSalvage`;
const MARKER_KEY = `${NS}:initialised`;

// Reads the three core keys strictly, without writing anything. Returns
//  { state: 'ok' }                       healthy, or a genuine first run;
//  { state: 'corrupt', keys: [...] }     present but unreadable / wrong type;
//  { state: 'missing' }                  `meta` is gone though progress existed;
//  { state: 'unavailable' }              the browser won't give us storage.
// "Progress existed" = the `initialised` marker, or a mastery/sessions key
// still there. An absent marker alone never means "missing": a brand new
// profile has none.
export function inspectStorage() {
  try {
    const raw = {};
    CORE_KEYS.forEach((name) => { raw[name] = localStorage.getItem(`${NS}:${name}`); });
    const marker = localStorage.getItem(MARKER_KEY) !== null;
    const keys = CORE_KEYS.filter((name) => {
      if (raw[name] === null) return false;
      try {
        const v = JSON.parse(raw[name]);
        return name === 'sessions' ? !Array.isArray(v) : !isObject(v);
      } catch (e) {
        return true;
      }
    });
    if (keys.length > 0) return { state: 'corrupt', keys };
    if (raw.meta === null && (marker || raw.mastery !== null || raw.sessions !== null)) return { state: 'missing' };
    return { state: 'ok' };
  } catch (e) {
    return { state: 'unavailable' };
  }
}

// Runs once, as soon as this module loads, i.e. before any other module has
// had the chance to save anything.
let startupStatus = inspectStorage();
writesBlocked = startupStatus.state === 'corrupt' || startupStatus.state === 'missing';
storageUnavailable = startupStatus.state === 'unavailable';

export const Storage = {
  TOPICS,

  // 'ok' | 'corrupt' | 'missing' | 'unavailable' — see inspectStorage.
  startupState() {
    return startupStatus.state;
  },
  // Notes that this device holds progress (see inspectStorage). Returns false
  // if the browser refused the write, i.e. progress can't be saved here.
  markInitialised() {
    if (writesBlocked || storageUnavailable) return !storageUnavailable;
    try {
      localStorage.setItem(MARKER_KEY, '1');
      return true;
    } catch (e) {
      storageUnavailable = true;
      return false;
    }
  },
  // "Start fresh" after an unreadable-progress notice. The raw text of the
  // three core keys goes to corruptSalvage FIRST; if that can't be saved the
  // error is thrown and nothing has been erased. Then everything of this
  // profile (except suggestions and the salvage) is cleared and a fresh
  // profile with its marker is written.
  startFresh() {
    const raw = {};
    CORE_KEYS.forEach((name) => {
      const v = localStorage.getItem(`${NS}:${name}`);
      if (v !== null) raw[name] = v;
    });
    localStorage.setItem(SALVAGE_KEY, JSON.stringify({ savedAt: new Date().toISOString(), raw }));
    Object.keys(localStorage)
      .filter((k) => k.startsWith(`${NS}:`) && k !== SALVAGE_KEY && k !== `${NS}:suggestions`)
      .forEach((k) => localStorage.removeItem(k));
    writesBlocked = false;
    startupStatus = { state: 'ok' };
    writeJSON(`${NS}:meta`, defaultMeta());
    Storage.markInitialised();
  },
  newId: nextLocalId,

  getMeta() {
    return { ...defaultMeta(), ...readJSON(`${NS}:meta`, {}) };
  },
  setMeta(meta) {
    writeJSON(`${NS}:meta`, meta);
  },

  getMastery() {
    const stored = readJSON(`${NS}:mastery`, null);
    const merged = defaultMastery();
    if (stored) {
      ALL_TOPICS.forEach((t) => {
        if (stored[t]) merged[t] = { ...defaultMasteryRecord(), ...stored[t] };
      });
    }
    return merged;
  },
  setMastery(mastery) {
    writeJSON(`${NS}:mastery`, mastery);
  },

  getSessions() {
    const list = readJSON(`${NS}:sessions`, []);
    return Array.isArray(list) ? list : []; // a wrong-shaped value is #187's job to catch
  },
  addSession(session) {
    if (writesBlocked || storageUnavailable) return;
    const sessions = Storage.getSessions();
    sessions.push(session);
    writeJSON(`${NS}:sessions`, sessions);
  },

  getBadges() {
    return readJSON(`${NS}:badges`, []);
  },
  setBadges(ids) {
    writeJSON(`${NS}:badges`, ids);
  },

  getCustomQuestions() {
    return readJSON(`${NS}:customQuestions`, []);
  },
  setCustomQuestions(list) {
    writeJSON(`${NS}:customQuestions`, list);
  },
  // Every imported question needs a stable id so a wrong answer can be
  // traced back to that exact question later (see markQuestionResult,
  // Roadmap ideas.md #78) — assigned once, here, rather than by whichever
  // parser produced the question, so every import path gets one for free.
  addCustomQuestions(newItems) {
    const existing = Storage.getCustomQuestions();
    const withIds = newItems.map((q) => (q.id ? q : { ...q, id: nextLocalId('q') }));
    writeJSON(`${NS}:customQuestions`, [...existing, ...withIds]);
  },
  // Records whether the child got a specific imported question right or
  // wrong, so questionBank.js can show wrong ones more often until they're
  // answered correctly once (Roadmap ideas.md #78: "present those questions
  // more frequently... when the correct answer is used then use them at a
  // standard frequency"). A no-op if the id isn't found (e.g. the question
  // was cleared/re-imported since) or the flag wouldn't actually change.
  markQuestionResult(questionId, correct) {
    if (!questionId) return;
    const all = Storage.getCustomQuestions();
    const idx = all.findIndex((q) => q.id === questionId);
    if (idx === -1) return;
    const shouldNeedRetry = !correct;
    if (Boolean(all[idx].needsRetry) === shouldNeedRetry) return;
    const updated = [...all];
    updated[idx] = { ...updated[idx], needsRetry: shouldNeedRetry };
    writeJSON(`${NS}:customQuestions`, updated);
  },

  // Suggestions the child has written on the Suggestions screen (Roadmap
  // #82). Each is { id, number, text, submittedAt, syncedAt }. `number` is
  // provisional until the suggestion reaches GitHub — the relay numbers it
  // from the roadmap file itself and that number replaces this one. An
  // unsynced suggestion is one with no syncedAt.
  getSuggestions() {
    return readJSON(`${NS}:suggestions`, []);
  },
  addSuggestion(suggestion) {
    const all = Storage.getSuggestions();
    writeJSON(`${NS}:suggestions`, [...all, suggestion]);
  },
  setSuggestions(list) {
    writeJSON(`${NS}:suggestions`, list);
  },
  // Replaces one suggestion in place, matched by id. Re-reads first so a
  // sync that lands while another is in flight can't clobber it.
  updateSuggestion(id, changes) {
    const all = Storage.getSuggestions();
    const idx = all.findIndex((sg) => sg.id === id);
    if (idx === -1) return;
    const updated = [...all];
    updated[idx] = { ...updated[idx], ...changes };
    writeJSON(`${NS}:suggestions`, updated);
  },

  // Address and app key for the suggestion relay (see worker/README.md).
  // The key can only append a line to the roadmap file — it is not a GitHub
  // credential, and the GitHub token itself never comes near the browser.
  getSyncConfig() {
    return { workerUrl: '', appKey: '', ...readJSON(`${NS}:sync`, {}) };
  },
  setSyncConfig(config) {
    writeJSON(`${NS}:sync`, config);
  },

  getShopState() {
    const stored = readJSON(`${NS}:shop`, null);
    const merged = defaultShopState();
    if (stored) {
      merged.ownedItemIds = stored.ownedItemIds || [];
      merged.equipped = { ...merged.equipped, ...(stored.equipped || {}) };
    }
    return merged;
  },
  setShopState(shopState) {
    writeJSON(`${NS}:shop`, shopState);
  },

  getWeatherCache() {
    return readJSON(`${NS}:weatherCache`, null);
  },
  setWeatherCache(cache) {
    writeJSON(`${NS}:weatherCache`, cache);
  },

  // Roadmap #136: this week's quests, or null. The shape is checked here so
  // an odd value (an old or hand-edited backup) just means "no quests yet".
  getQuests() {
    const q = readJSON(`${NS}:quests`, null);
    if (!isObject(q) || typeof q.weekStart !== 'string' || !Array.isArray(q.quests)) return null;
    return q;
  },
  setQuests(quests) {
    writeJSON(`${NS}:quests`, quests);
  },

  // Roadmap #138: the grown-up's reward goal, or null. Its own key, not
  // meta: several Settings handlers write the whole of meta back from a
  // copy held in memory, and a stale copy could quietly undo a goal saved
  // or removed in between.
  getRewardGoal() {
    const g = readJSON(`${NS}:rewardGoal`, null);
    if (!isObject(g) || typeof g.label !== 'string' || !isCount(g.targetPoints) || !isCount(g.baselinePoints)) return null;
    return g;
  },
  setRewardGoal(goal) {
    writeJSON(`${NS}:rewardGoal`, goal);
  },
  clearRewardGoal() {
    removeKey(`${NS}:rewardGoal`);
  },

  // Roadmap #139: the note from a grown-up, { text, savedAt, seenAt }, or
  // null. Its own key for the same reason as the reward goal.
  getParentNote() {
    const n = readJSON(`${NS}:parentNote`, null);
    if (!isObject(n) || typeof n.text !== 'string' || !n.text.trim()) return null;
    return n;
  },
  setParentNote(note) {
    writeJSON(`${NS}:parentNote`, note);
  },
  clearParentNote() {
    removeKey(`${NS}:parentNote`);
  },

  // ---------- Games (Roadmap #143-#147) ----------
  // Each game keeps one small key of its own, read with defaults so a
  // missing or odd value just means "nothing yet". Games never touch
  // sessions, mastery, badges or inprogress; the only shared thing they may
  // change is meta.totalPoints (Numbers Target and Close Enough).

  // #143 Blitz: the top-5 table for one fixed question mix. A table made
  // for a different mix is kept aside (archived), never compared.
  getBlitz(currentMix) {
    const empty = { version: 1, mix: currentMix, totalRuns: 0, top: [] };
    const b = readJSON(`${NS}:blitz`, null);
    if (!isObject(b) || !Array.isArray(b.top)) return empty;
    if (b.mix !== currentMix) return { ...empty, archived: b };
    const top = b.top.filter((r) => isObject(r) && isCount(r.correct) && isCount(r.wrong) && typeof r.date === 'string');
    return { ...empty, ...b, totalRuns: isCount(b.totalRuns) ? b.totalRuns : top.length, top };
  },
  setBlitz(blitz) {
    writeJSON(`${NS}:blitz`, blitz);
  },

  // #144 Numbers Target.
  getNumbersGame() {
    const d = { targetsHit: 0, roundsPlayed: 0, currentHitRun: 0, bestHitRun: 0, recent: [] };
    const g = readJSON(`${NS}:numbersGame`, null);
    if (!isObject(g)) return d;
    const out = { ...d };
    ['targetsHit', 'roundsPlayed', 'currentHitRun', 'bestHitRun'].forEach((k) => { if (isCount(g[k])) out[k] = g[k]; });
    if (Array.isArray(g.recent)) out.recent = g.recent.filter(isObject).slice(-20);
    return out;
  },
  setNumbersGame(game) {
    writeJSON(`${NS}:numbersGame`, game);
  },

  // #145 Close Enough.
  getEstimation() {
    const e = readJSON(`${NS}:estimation`, null);
    return {
      bestRoundScore: isObject(e) && isCount(e.bestRoundScore) ? e.bestRoundScore : null,
      roundsPlayed: isObject(e) && isCount(e.roundsPlayed) ? e.roundsPlayed : 0,
    };
  },
  setEstimation(est) {
    writeJSON(`${NS}:estimation`, est);
  },

  // #147 Beat the Grown-Up: the only thing a guest round ever saves.
  getGrownUpTally() {
    const t = readJSON(`${NS}:grownUpTally`, null);
    const n = (k) => (isObject(t) && isCount(t[k]) ? t[k] : 0);
    return { childWins: n('childWins'), grownUpWins: n('grownUpWins'), draws: n('draws') };
  },
  setGrownUpTally(tally) {
    writeJSON(`${NS}:grownUpTally`, tally);
  },

  // Adds game points to the lifetime total, reading meta fresh so a copy
  // held in memory elsewhere can't be clobbered. Returns the new meta.
  addPoints(points) {
    const meta = Storage.getMeta();
    if (points > 0) {
      meta.totalPoints = (meta.totalPoints || 0) + points;
      writeJSON(`${NS}:meta`, meta);
    }
    return meta;
  },

  getInProgress() {
    return readJSON(`${NS}:inprogress`, null);
  },
  setInProgress(state) {
    writeJSON(`${NS}:inprogress`, state);
  },
  clearInProgress() {
    removeKey(`${NS}:inprogress`);
  },

  // The backup file for "Back up my progress" (#150): every non-device key
  // of this profile, parsed, under `data`. "app": "sprint" is a fixed format
  // marker, whatever the app's display name.
  buildBackup() {
    const data = {};
    backedUpKeyNames().forEach((name) => {
      data[name] = readJSON(`${NS}:${name}`, null);
    });
    // The three a restore requires are always written, with their defaults
    // filled in, even on a profile that has never saved one of them yet.
    data.meta = Storage.getMeta();
    data.mastery = Storage.getMastery();
    data.sessions = Storage.getSessions();
    return {
      app: 'sprint',
      formatVersion: BACKUP_FORMAT_VERSION,
      profileId: 'default',
      exportedAt: new Date().toISOString(),
      schemaVersion: Storage.getMeta().schemaVersion,
      data,
    };
  },

  // Replaces this profile's progress with a backup that has already passed
  // backupProblem(). Device-only keys (relay settings, weather, suggestions)
  // are left alone, and any half-finished session is dropped. If any write
  // fails (e.g. storage is full), everything is put back exactly as it was
  // and the error is re-thrown, so a failed restore never loses progress.
  //
  // Per #151, lastBackupAt becomes the time of the restore (the device now
  // matches a file exactly) and any reminder snooze is cleared.
  restoreBackup(file) {
    if (storageUnavailable) throw new Error('Sprint: storage is unavailable'); // writeJSON would skip silently
    const snapshot = {};
    backedUpKeyNames().forEach((name) => {
      snapshot[name] = localStorage.getItem(`${NS}:${name}`);
    });
    const names = Object.keys(file.data)
      .filter((name) => /^[A-Za-z0-9_]+$/.test(name) && !DEVICE_ONLY_KEYS.includes(name));
    // A restore is one of the two ways out of safe mode (#187); if it fails,
    // safe mode is back on and the unreadable data is exactly as it was.
    const wasBlocked = writesBlocked;
    writesBlocked = false;
    try {
      Object.keys(snapshot).forEach((name) => localStorage.removeItem(`${NS}:${name}`));
      names.forEach((name) => {
        if (file.data[name] !== null && file.data[name] !== undefined) writeJSON(`${NS}:${name}`, file.data[name]);
      });
      writeJSON(`${NS}:meta`, { ...file.data.meta, lastBackupAt: new Date().toISOString(), backupReminderSnoozedUntil: null });
      localStorage.removeItem(`${NS}:inprogress`);
      localStorage.setItem(MARKER_KEY, '1');
      startupStatus = { state: 'ok' };
    } catch (e) {
      writesBlocked = wasBlocked;
      backedUpKeyNames().forEach((name) => localStorage.removeItem(`${NS}:${name}`));
      Object.entries(snapshot).forEach(([name, raw]) => {
        if (raw !== null) localStorage.setItem(`${NS}:${name}`, raw);
      });
      throw e;
    }
  },

  // Permanently erases every piece of this app's data (Settings > Clear all
  // progress) — mastery, sessions, badges, shop purchases, custom questions,
  // everything — so the app starts completely fresh.
  //
  // Submitted suggestions are the one exception: they're feedback waiting to
  // be copied into the roadmap file, not progress, points, badges, purchases
  // or settings (which is all the confirmation prompt warns about), and once
  // wiped they can't be recovered. They're cleared from the Suggestions
  // screen instead, where it's clear what's being thrown away.
  resetAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(`${NS}:`) && k !== `${NS}:suggestions` && k !== SALVAGE_KEY)
      .forEach((k) => localStorage.removeItem(k));
    // Fresh defaults and the marker go straight back, so a reset profile is
    // never mistaken for lost progress by the startup check (#187).
    if (!writesBlocked && !storageUnavailable) {
      writeJSON(`${NS}:meta`, defaultMeta());
      Storage.markInitialised();
    }
  },
};
