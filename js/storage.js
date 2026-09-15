// localStorage persistence layer. All keys are namespaced under sprint:v1:default
// so a future second profile (see SPEC.md §3) can be added without migrating data.

const NS = 'sprint:v1:default';

export const TOPICS = ['arithmetic', 'fdp', 'geometry', 'wordProblems', 'ratio', 'algebra', 'dataHandling'];

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

export const Storage = {
  TOPICS,

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
  addCustomQuestions(newItems) {
    const existing = Storage.getCustomQuestions();
    writeJSON(`${NS}:customQuestions`, [...existing, ...newItems]);
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
};
