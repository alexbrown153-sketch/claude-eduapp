// localStorage persistence layer. All keys are namespaced under sprint:v1:default
// so a future second profile (see SPEC.md §3) can be added without migrating data.

const NS = 'sprint:v1:default';

export const TOPICS = ['arithmetic', 'fdp', 'geometry', 'wordProblems'];

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
