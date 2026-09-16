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
  };
}

// Returns either a real question, or { blocked: true, topic, tier } when
// there's no imported question for the exact topic+tier picked — per
// Roadmap ideas.md #77, that's a hard stop, not a cue to quietly fall back
// to a different topic or tier (see app.js's nextQuestion for how the UI
// surfaces this).
export function pickNextQuestion(session, mastery) {
  const topic = session.topicFocus || weightedRandomPick(session.topicWeighting);
  const record = mastery[topic];
  const tier = selectDifficultyTier(record);
  const customQuestions = Storage.getCustomQuestions();
  const q = getQuestion(topic, tier, customQuestions);
  if (!q) return { blocked: true, topic, tier };
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
  const pointsEarned = correct ? 10 + speedBonus + streakBonus : 0;

  session.streak = correct ? session.streak + 1 : 0;
  session.bestStreak = Math.max(session.bestStreak, session.streak);
  session.score += pointsEarned;

  session.questions.push({
    topic: question.topic,
    subtopic: question.subtopic,
    difficulty: tier,
    correct,
    timeMs,
    pointsEarned,
  });

  Storage.setMastery(mastery);
  Storage.setInProgress(session);

  return { correct, pointsEarned, streak: session.streak };
}

export function isSessionComplete(session) {
  if (session.lengthType === 'questions') {
    return session.questions.length >= session.lengthValue;
  }
  const elapsedMs = Date.now() - session.startedAt;
  return elapsedMs >= session.lengthValue * 60 * 1000;
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
