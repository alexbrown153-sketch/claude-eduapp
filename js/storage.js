// localStorage persistence layer. All keys are namespaced under sprint:v1:default
// so a future second profile (see SPEC.md §3) can be added without migrating data.

const NS = 'sprint:v1:default';

export const TOPICS = ['arithmetic', 'fdp', 'geometry', 'coordinates', 'wordProblems', 'ratio', 'algebra', 'dataHandling'];

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
  TOPICS.forEach((t) => { m[t] = defaultMasteryRecord(); });
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

function writeJSON(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------- Backup and restore (Roadmap #150) ----------

// Keys that belong to this device, not to the child's progress: never put in
// a backup file and never touched by a restore. `sync` holds the relay's app
// key (a secret that mustn't end up in iCloud), `weatherCache` is throwaway,
// `inprogress` is a half-finished session, and `suggestions` are feedback,
// not progress. Everything else under NS is backed up, so keys added later
// are included automatically — add a new key here if it's device-only.
const DEVICE_ONLY_KEYS = ['sync', 'weatherCache', 'inprogress', 'suggestions'];

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
  if (!isObject(d) || !isObject(d.meta) || !isObject(d.mastery) || !Array.isArray(d.sessions)) return damaged;
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

export const Storage = {
  TOPICS,
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
      TOPICS.forEach((t) => {
        if (stored[t]) merged[t] = { ...defaultMasteryRecord(), ...stored[t] };
      });
    }
    return merged;
  },
  setMastery(mastery) {
    writeJSON(`${NS}:mastery`, mastery);
  },

  getSessions() {
    return readJSON(`${NS}:sessions`, []);
  },
  addSession(session) {
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

  getInProgress() {
    return readJSON(`${NS}:inprogress`, null);
  },
  setInProgress(state) {
    writeJSON(`${NS}:inprogress`, state);
  },
  clearInProgress() {
    localStorage.removeItem(`${NS}:inprogress`);
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
    const snapshot = {};
    backedUpKeyNames().forEach((name) => {
      snapshot[name] = localStorage.getItem(`${NS}:${name}`);
    });
    const names = Object.keys(file.data)
      .filter((name) => /^[A-Za-z0-9_]+$/.test(name) && !DEVICE_ONLY_KEYS.includes(name));
    try {
      Object.keys(snapshot).forEach((name) => localStorage.removeItem(`${NS}:${name}`));
      names.forEach((name) => {
        if (file.data[name] !== null && file.data[name] !== undefined) writeJSON(`${NS}:${name}`, file.data[name]);
      });
      writeJSON(`${NS}:meta`, { ...file.data.meta, lastBackupAt: new Date().toISOString(), backupReminderSnoozedUntil: null });
      localStorage.removeItem(`${NS}:inprogress`);
    } catch (e) {
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
      .filter((k) => k.startsWith(`${NS}:`) && k !== `${NS}:suggestions`)
      .forEach((k) => localStorage.removeItem(k));
  },
};
