// Session engine: builds a session, picks questions one at a time (so the
// anti-frustration rule in mastery.js can react mid-session), scores answers,
// and persists progress incrementally so an interrupted session on a tablet
// doesn't lose data.

import { Storage } from './storage.js';
import { selectDifficultyTier, updateMastery, weightedRandomPick, EXPECTED_TIME_MS } from './mastery.js';
import { getQuestion } from './questionBank.js';

export function startSession({ topicWeighting, topicFocus, lengthType, lengthValue, mode }) {
  return {
    sessionId: `s_${Date.now()}`,
    date: new Date().toISOString(),
    mode,
    lengthType,
    lengthValue,
    topicFocus: topicFocus || null,
    topicWeighting,
    questions: [],
    startedAt: Date.now(),
    score: 0,
    streak: 0,
    bestStreak: 0,
    // Roadmap #92/#94/#95: a session can end on the boss challenge.
    // bossDone flips once the challenge is over (or was never unlocked);
    // bossLocked records that accuracy wasn't high enough to face it;
    // bossHits counts challenge questions answered correctly, and
    // bossDefeated is true only when all of them were.
    bossDone: false,
    bossLocked: false,
    bossHits: 0,
    bossDefeated: false,
    usedWordProblemIds: new Set(),
  };
}

// Roadmap #88: the combo meter. The run of correct answers in a row
// (session.streak) multiplies each answer's points — x2 from the 3rd in a
// row, x3 from the 6th. A wrong answer just resets the run; points already
// banked are never taken away (SPEC §8: non-punitive).
export function comboMultiplier(streak) {
  if (streak >= 6) return 3;
  if (streak >= 3) return 2;
  return 1;
}

export const BOSS_POINTS_MULTIPLIER = 3;

// Roadmap #95: the boss challenge is three questions, and destroying the
// boss completely (all three right) adds a flat bonus on top of the triple
// points each hit already earns.
export const BOSS_QUESTION_COUNT = 3;
export const BOSS_DEFEAT_BONUS = 100;

// Roadmap #94: the challenge only unlocks for MORE than 80% of the session's
// own questions right — 80% exactly doesn't count, so 8/10 misses out and
// 9/10 gets in.
export const BOSS_UNLOCK_ACCURACY = 0.8;

// Roadmap #92: the boss comes from the strongest topic — the highest mastery
// score among topics actually practised, so it isn't just whichever topic
// happens to sit first at the untouched 50% default. No practice data yet
// (a first session) falls back to this session's own topic mix.
function strongestTopic(session, mastery) {
  const practised = Object.entries(mastery).filter(([, rec]) => rec.questionsSeen > 0);
  if (practised.length === 0) return session.topicFocus || weightedRandomPick(session.topicWeighting);
  return practised.sort((a, b) => b[1].masteryScore - a[1].masteryScore)[0][0];
}

// One tier above the child's current level in that topic, capped at 5 — it
// should feel like a boss, and it's drawn from the topic they're best at.
function pickBossQuestion(session, mastery) {
  const topic = strongestTopic(session, mastery);
  const record = mastery[topic];
  const tier = Math.min(5, (record.difficultyLevel || selectDifficultyTier(record)) + 1);
  const q = getQuestion(topic, tier, session.usedWordProblemIds);
  if (!q) return null;
  if (q.source === 'authored' && q.id) session.usedWordProblemIds.add(q.id);
  return { ...q, isBoss: true };
}

function bossQuestionsAsked(session) {
  return session.questions.filter((q) => q.boss).length;
}

// The session's own length (question count or minutes) is used up, so the
// only thing left before the summary is the boss challenge.
export function isBossDue(session) {
  return session.bossDone === false && hasReachedLength(session);
}

// Roadmap #94: decides, once the regular questions are finished, whether the
// boss challenge unlocks. Called before every "is the session over?" check
// (onNext in app.js) rather than from recordAnswer, because a timed session
// can run out between answers. Only the first time matters: once a boss
// question has been asked the challenge is under way and runs to the end.
export function settleBossGate(session) {
  if (!isBossDue(session) || bossQuestionsAsked(session) > 0) return;
  const regular = session.questions.filter((q) => !q.boss);
  const correct = regular.filter((q) => q.correct).length;
  const accuracy = regular.length ? correct / regular.length : 0;
  if (accuracy <= BOSS_UNLOCK_ACCURACY) {
    session.bossDone = true;
    session.bossLocked = true;
  }
}

// Where the challenge stands, for the UI: how many of the three questions
// have been answered, how many hits the boss has taken, and right/wrong for
// each answered one (so a resumed challenge still shows the right pips).
export function bossProgress(session) {
  const results = session.questions.filter((q) => q.boss).map((q) => q.correct);
  return {
    asked: results.length,
    hits: session.bossHits || 0,
    total: BOSS_QUESTION_COUNT,
    results,
  };
}

// Roadmap ideas.md #80: question sourcing is back to pure auto-generation
// (arithmetic/fdp/geometry/ratio/algebra/dataHandling procedurally, word
// problems from the hand-authored bank) — no PDF import involved, so this
// never returns null in practice. The { blocked, topic } shape is kept as a
// defensive fallback rather than removed outright, since this exact
// question-sourcing subsystem has changed direction more than once in one
// day — cheap insurance against another reversal, not active behavior
// right now.
export function pickNextQuestion(session, mastery) {
  if (isBossDue(session)) {
    const boss = pickBossQuestion(session, mastery);
    if (boss) return boss;
    session.bossDone = true; // nothing to fight; skip straight to the end
  }
  const topic = session.topicFocus || weightedRandomPick(session.topicWeighting);
  const record = mastery[topic];
  const tier = selectDifficultyTier(record);
  const q = getQuestion(topic, tier, session.usedWordProblemIds);
  if (!q) return { blocked: true, topic };
  if (q.source === 'authored' && q.id) session.usedWordProblemIds.add(q.id);
  return q;
}

export function checkAnswer(question, userInput) {
  const trimmed = String(userInput).trim();
  if (trimmed === '') return false;

  if (question.answerType === 'numeric') {
    const userNum = parseFloat(trimmed.replace(/,/g, ''));
    const correctNum = parseFloat(question.correctAnswer);
    if (Number.isNaN(userNum)) return false;
    return Math.abs(userNum - correctNum) < 0.01;
  }
  if (question.answerType === 'mcq') {
    return trimmed === question.correctAnswer;
  }
  const normalize = (s) => s.toLowerCase().replace(/\s+/g, '').replace('remainder', 'r');
  return normalize(trimmed) === normalize(question.correctAnswer);
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// Scores one answered question, updates the topic's mastery record, appends
// to the session log, and writes mastery + in-progress state to storage
// immediately (not just at session end).
export function recordAnswer(session, mastery, question, userInput, timeMs) {
  const correct = checkAnswer(question, userInput);
  const tier = question.difficulty;

  updateMastery(mastery[question.topic], correct, tier, timeMs, todayStr());
  Storage.markQuestionResult(question.id, correct);

  const speedBonus = correct && timeMs < EXPECTED_TIME_MS[tier] ? 5 : 0;
  const streakBonus = correct ? Math.min(session.streak + 1, 5) : 0;

  session.streak = correct ? session.streak + 1 : 0;
  session.bestStreak = Math.max(session.bestStreak, session.streak);

  // The multiplier uses the run *including* this answer, so the 3rd correct
  // in a row is the first one worth double.
  const multiplier = correct ? comboMultiplier(session.streak) : 1;
  const bossMultiplier = question.isBoss ? BOSS_POINTS_MULTIPLIER : 1;
  const pointsEarned = correct ? (10 + speedBonus + streakBonus) * multiplier * bossMultiplier : 0;
  session.score += pointsEarned;

  let bossBonus = 0;
  if (question.isBoss) {
    if (correct) session.bossHits = (session.bossHits || 0) + 1;
    // +1 for the question being pushed just below.
    if (bossQuestionsAsked(session) + 1 >= BOSS_QUESTION_COUNT) {
      session.bossDone = true;
      session.bossDefeated = session.bossHits >= BOSS_QUESTION_COUNT;
      if (session.bossDefeated) bossBonus = BOSS_DEFEAT_BONUS;
    }
  }
  session.score += bossBonus;

  session.questions.push({
    topic: question.topic,
    subtopic: question.subtopic,
    difficulty: tier,
    correct,
    timeMs,
    pointsEarned,
    ...(question.isBoss ? { boss: true } : {}),
  });
  session.bossBonus = (session.bossBonus || 0) + bossBonus;

  Storage.setMastery(mastery);
  Storage.setInProgress({ ...session, usedWordProblemIds: [...session.usedWordProblemIds] });

  return { correct, pointsEarned, streak: session.streak, multiplier, bossBonus };
}

// The chosen length only — the boss challenge comes on top of it, so a
// 10-question session is 10 questions and then the boss's three.
function hasReachedLength(session) {
  const regular = session.questions.filter((q) => !q.boss).length;
  if (session.lengthType === 'questions') {
    return regular >= session.lengthValue;
  }
  const elapsedMs = Date.now() - session.startedAt;
  return elapsedMs >= session.lengthValue * 60 * 1000;
}

// A session saved before the boss existed has no bossDone flag; treat it as
// already done so resuming it doesn't spring a boss on an old session. One
// saved mid-way through the old single boss question (#92) just carries on
// as a three-question challenge.
export function isSessionComplete(session) {
  return hasReachedLength(session) && session.bossDone !== false;
}

function isYesterday(lastDateStr, todayDateStr) {
  if (!lastDateStr) return false;
  const last = new Date(`${lastDateStr}T00:00:00`);
  const today = new Date(`${todayDateStr}T00:00:00`);
  const diffDays = Math.round((today - last) / 86400000);
  return diffDays === 1;
}

// Writes the full session log entry and updates streak/points meta. Returns
// the finalized entry + meta so the UI can render the summary screen.
export function finishSession(session, meta) {
  const totalQuestions = session.questions.length;
  const correctCount = session.questions.filter((q) => q.correct).length;
  const totalTimeMs = session.questions.reduce((sum, q) => sum + q.timeMs, 0);

  const summary = {
    totalQuestions,
    correctCount,
    accuracy: totalQuestions ? correctCount / totalQuestions : 0,
    avgTimeMs: totalQuestions ? Math.round(totalTimeMs / totalQuestions) : 0,
    totalTimeMs,
    pointsEarned: session.score,
    bestStreak: session.bestStreak,
    bossDefeated: Boolean(session.bossDefeated),
    bossLocked: Boolean(session.bossLocked),
    bossHits: session.bossHits || 0,
    bossBonus: session.bossBonus || 0,
  };

  const entry = {
    profileId: 'default',
    sessionId: session.sessionId,
    date: session.date,
    mode: session.mode,
    lengthType: session.lengthType,
    lengthValue: session.lengthValue,
    topicFocus: session.topicFocus,
    questions: session.questions,
    summary,
  };
  Storage.addSession(entry);

  const today = todayStr();
  const newMeta = { ...meta };
  if (meta.lastPracticeDate === today) {
    // already practiced today; streak unchanged
  } else if (isYesterday(meta.lastPracticeDate, today)) {
    newMeta.currentStreakDays = (meta.currentStreakDays || 0) + 1;
  } else {
    newMeta.currentStreakDays = 1;
  }
  newMeta.lastPracticeDate = today;
  newMeta.totalPoints = (meta.totalPoints || 0) + session.score;
  if (session.mode === 'diagnostic' && !meta.diagnosticCompletedAt) {
    newMeta.diagnosticCompletedAt = new Date().toISOString();
  }
  Storage.setMeta(newMeta);
  Storage.clearInProgress();

  return { entry, meta: newMeta };
}
