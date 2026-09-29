// Personal-best board (Roadmap #89). Records are worked out from the session
// log every time rather than stored separately, so they can never drift out
// of step with it (and Clear all progress resets them for free). A single
// profile means the child is only ever competing with themselves.

import { sessionLocalDay } from './dates.js';

// Below this many questions a session's accuracy doesn't count: 2 out of 2
// is 100%, but it isn't a record worth beating.
export const MIN_QUESTIONS_FOR_ACCURACY = 5;

// Sessions store ISO (UTC) timestamps; "a day" is the child's own calendar
// day that the session finished on (sessionLocalDay in dates.js), the same
// day the streak and chest credit.

// Returns each record's value, or null while there's nothing to measure.
// A combo of 0, 0% accuracy or a day of 0 questions is "no record yet", not
// a record — a Personal bests board showing "Best accuracy: 0%" is no fun.
export function computePersonalBests(sessions) {
  let bestAccuracy = null;
  let longestCombo = null;
  let fastestCorrectMs = null;
  const perDay = {};

  sessions.forEach((s) => {
    const qs = s.questions || [];
    if (qs.length >= MIN_QUESTIONS_FOR_ACCURACY && s.summary && s.summary.accuracy > 0) {
      bestAccuracy = Math.max(bestAccuracy ?? 0, s.summary.accuracy);
    }
    const combo = s.summary ? s.summary.bestStreak || 0 : 0;
    if (combo > 0) longestCombo = Math.max(longestCombo ?? 0, combo);
    qs.forEach((q) => {
      if (q.correct && q.timeMs > 0) {
        fastestCorrectMs = fastestCorrectMs === null ? q.timeMs : Math.min(fastestCorrectMs, q.timeMs);
      }
    });
    if (qs.length > 0) {
      const day = sessionLocalDay(s);
      perDay[day] = (perDay[day] || 0) + qs.length;
    }
  });

  const dayCounts = Object.values(perDay);
  return {
    bestAccuracy,
    longestCombo,
    fastestCorrectMs,
    mostQuestionsInDay: dayCounts.length ? Math.max(...dayCounts) : null,
  };
}

// Which records the latest session broke. Only a record that already
// existed can be "beaten" — the very first session sets every record at
// once, and a wall of NEW RECORD banners for that would mean nothing.
// Strictly better only: equalling a record isn't beating it.
export function findNewRecords(before, after) {
  const beaten = [];
  if (before.bestAccuracy !== null && after.bestAccuracy > before.bestAccuracy) beaten.push('bestAccuracy');
  if (before.longestCombo !== null && after.longestCombo > before.longestCombo) beaten.push('longestCombo');
  if (before.fastestCorrectMs !== null && after.fastestCorrectMs < before.fastestCorrectMs) beaten.push('fastestCorrectMs');
  if (before.mostQuestionsInDay !== null && after.mostQuestionsInDay > before.mostQuestionsInDay) beaten.push('mostQuestionsInDay');
  return beaten;
}

// Roadmap #105: "Mistakes I fixed". Only topic and subtopic are saved with
// each answer (not the question itself), and generated questions get new
// numbers every time, so the honest unit is the *kind* of question. A kind is
// fixed when it was answered wrong in one session and then right in a LATER
// session — right again in the same session could be a lucky guess, so it
// doesn't count. Once fixed it stays fixed: a later wrong answer never takes
// it off the list (SPEC §8, nothing is taken away). Worked out from the
// session log every time, like the records above, so it stores nothing.
//
// Subtopics that don't name a kind (missing on old sessions, arithmetic's
// catch-all 'mixed', imported questions) fall back to the topic alone.
const TOPIC_ONLY_SUBTOPICS = ['mixed', 'examberry', 'custom-pdf'];

function kindOf(q) {
  const sub = q.subtopic && !TOPIC_ONLY_SUBTOPICS.includes(q.subtopic) ? q.subtopic : null;
  return { key: `${q.topic}|${sub || ''}`, topic: q.topic, subtopic: sub };
}

// Returns every fix, newest first:
// [{ topic, subtopic (or null), wrongDate, fixedDate, sessionId }], where the
// dates are the ISO timestamps of the session with the first wrong answer and
// the later session that first got it right.
export function computeFixedMistakes(sessions) {
  const firstWrong = {}; // kind key -> { index, date } while still unfixed
  const fixed = {}; // kind key -> fix record
  const order = [];
  sessions.forEach((s, index) => {
    (s.questions || []).forEach((q) => {
      if (!q || !q.topic) return;
      const kind = kindOf(q);
      if (fixed[kind.key]) return;
      const wrong = firstWrong[kind.key];
      if (!q.correct) {
        if (!wrong) firstWrong[kind.key] = { index, date: s.date };
      } else if (wrong && wrong.index < index) {
        fixed[kind.key] = {
          topic: kind.topic,
          subtopic: kind.subtopic,
          wrongDate: wrong.date,
          fixedDate: s.date,
          sessionId: s.sessionId,
        };
        order.push(kind.key);
      }
    });
  });
  return order.reverse().map((k) => fixed[k]);
}
