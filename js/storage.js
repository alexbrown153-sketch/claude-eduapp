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
