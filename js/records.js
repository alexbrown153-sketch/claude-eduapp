// Personal-best board (Roadmap #89). Records are worked out from the session
// log every time rather than stored separately, so they can never drift out
// of step with it (and Clear all progress resets them for free). A single
// profile means the child is only ever competing with themselves.

// Below this many questions a session's accuracy doesn't count: 2 out of 2
// is 100%, but it isn't a record worth beating.
export const MIN_QUESTIONS_FOR_ACCURACY = 5;

// Sessions store an ISO (UTC) timestamp; "a day" should be the child's own
// calendar day, so group on the local date.
function localDay(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

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
      const day = localDay(s.date);
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
