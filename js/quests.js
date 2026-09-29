// Weekly quests (Roadmap #136). Three quests a week, Monday to Sunday on the
// child's own calendar (dates.js). The quests themselves (topic and targets)
// are fixed when the week's set is made; progress is always worked out from
// the session log, so a quit or resumed session can't double-count or lose
// anything. Only "done" and "paid" are stored (see Storage.getQuests).
//
// Pure logic: app.js does the storing and pays the points.

import { weekRange, weekdayIndex, addDays, inRange, sessionLocalDay } from './dates.js';
import { countsAsPractice, isPerfectSession } from './records.js';
import { TOPICS } from './storage.js';

export const QUEST_REWARD = 50;
export const QUEST_BONUS = 100;
export const TOPIC_QUEST_TARGET = 20;
export const DAYS_QUEST_TARGET = 4;

// Word problems are left out of the topic quest: the hand-written bank is
// too small for 20 in a week without heavy repeats (Alex's decision).
const NOT_QUEST_TOPICS = ['wordProblems'];

// The weakest topic, exactly as computeStrengthSummary picks it for
// "Today's focus" (highest-first sort, then the last one), so Home never
// names two different weak topics. Skips word problems and last week's
// quest topic, falling back to the next weakest. Topics never practised come
// after practised ones.
export function pickQuestTopic(mastery, lastTopic) {
  const practised = TOPICS.filter((t) => mastery[t] && mastery[t].questionsSeen > 0);
  const weakestFirst = [...practised]
    .sort((a, b) => mastery[b].masteryScore - mastery[a].masteryScore)
    .reverse();
  const order = [...weakestFirst, ...TOPICS.filter((t) => !practised.includes(t))]
    .filter((t) => !NOT_QUEST_TOPICS.includes(t));
  return order.find((t) => t !== lastTopic) || order[0];
}

// A fresh set for the week containing `today`. Made on a day other than
// Monday, the days quest asks for no more days than are left in the week
// (today included), so every quest can still be finished.
export function createWeekQuests(today, mastery, previous) {
  const lastTopic = previous ? previous.topic || null : null;
  const daysLeft = 7 - weekdayIndex(today);
  const quest = (id, target) => ({ id, target, reward: QUEST_REWARD, completedAt: null });
  return {
    weekStart: weekRange(today).start,
    topic: pickQuestTopic(mastery, lastTopic),
    lastTopic,
    quests: [
      quest('topic', TOPIC_QUEST_TARGET),
      quest('perfect', 1),
      quest('days', Math.min(DAYS_QUEST_TARGET, daysLeft)),
    ],
    bonusPaidAt: null,
  };
}

// How far each quest has got this week: { topic, perfect, days }.
//  - topic: every answer in the quest topic (boss and follow-ups included);
//  - perfect: finished perfect sessions (isPerfectSession, the same rule as
//    the Perfect Ten badge);
//  - days: different local days with a finished session.
export function questProgress(questState, sessions) {
  const week = { start: questState.weekStart, end: addDays(questState.weekStart, 6) };
  const inWeek = sessions.filter((s) => countsAsPractice(s) && inRange(sessionLocalDay(s), week));
  return {
    topic: inWeek.reduce((n, s) => n + (s.questions || []).filter((q) => q.topic === questState.topic).length, 0),
    perfect: inWeek.filter(isPerfectSession).length,
    days: new Set(inWeek.map(sessionLocalDay)).size,
  };
}

// Marks newly finished quests (and the all-three bonus) as done. Returns
// { state, completed: [quest], bonus, points } — `state` is a new object to
// store, and `points` is what to add to the child's total. Each quest pays
// once; the bonus pays once a week.
export function settleQuests(questState, sessions, nowIso = new Date().toISOString()) {
  const progress = questProgress(questState, sessions);
  const state = { ...questState, quests: questState.quests.map((q) => ({ ...q })) };
  const completed = [];
  state.quests.forEach((q) => {
    if (!q.completedAt && (progress[q.id] || 0) >= q.target) {
      q.completedAt = nowIso;
      completed.push(q);
    }
  });
  let bonus = false;
  if (!state.bonusPaidAt && state.quests.every((q) => q.completedAt)) {
    state.bonusPaidAt = nowIso;
    bonus = true;
  }
  const points = completed.reduce((n, q) => n + (q.reward || 0), 0) + (bonus ? QUEST_BONUS : 0);
  return { state, completed, bonus, points };
}
