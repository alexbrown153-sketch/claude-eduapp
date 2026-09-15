// Countdown & pacing plan (SPEC.md §6a). Pure functions of "today" + stored
// state — no fixed day-by-day table — so a skipped day just shifts
// daysRemaining and the plan re-adjusts gracefully on the next visit.

const EXAM_DATE = new Date('2026-10-02T00:00:00');

function daysBetween(a, b) {
  const msPerDay = 24 * 60 * 60 * 1000;
  const d1 = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const d2 = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((d2 - d1) / msPerDay);
}

function normalize(raw) {
  const total = Object.values(raw).reduce((a, b) => a + b, 0);
  const w = {};
  Object.keys(raw).forEach((k) => { w[k] = raw[k] / total; });
  return w;
}

function equalWeights(topics) {
  const w = {};
  topics.forEach((t) => { w[t] = 1 / topics.length; });
  return w;
}

// Weight toward weaker topics, boosted further for topics not practiced
// recently, so every topic keeps cycling through instead of being neglected.
function weakAndStaleWeights(topics, mastery, today) {
  const raw = {};
  topics.forEach((t) => {
    const rec = mastery[t];
    const weaknessScore = 1 - rec.masteryScore;
    const daysSince = rec.lastPracticed
      ? daysBetween(new Date(`${rec.lastPracticed}T00:00:00`), today)
      : 99;
    const stalenessBoost = Math.min(daysSince / 7, 1);
    raw[t] = 0.4 + weaknessScore * 0.4 + stalenessBoost * 0.2;
  });
  return normalize(raw);
}

// Favor topics already at high mastery, for calm pre-exam review.
function strongTopicWeights(topics, mastery) {
  const raw = {};
  topics.forEach((t) => {
    raw[t] = 0.2 + mastery[t].masteryScore;
  });
  return normalize(raw);
}

export function computeTodaysPlan(today, meta, mastery, topics) {
  const daysRemaining = daysBetween(today, EXAM_DATE);

  if (daysRemaining <= 1) {
    return {
      phase: 'final-review',
      daysRemaining,
      sessionLengthSuggestion: { type: 'questions', value: 10 },
      topicWeighting: strongTopicWeights(topics, mastery),
      timerVisible: false,
      framingTone: "You're ready — let's keep today light and calm.",
    };
  }

  if (!meta.diagnosticCompletedAt) {
    return {
      phase: 'diagnostic',
      daysRemaining,
      sessionLengthSuggestion: { type: 'questions', value: 12 },
      topicWeighting: equalWeights(topics),
      timerVisible: false,
      framingTone: "Let's find out where you're strongest to start with.",
    };
  }

  if (daysRemaining <= 3) {
    return {
      phase: 'late-stage',
      daysRemaining,
      sessionLengthSuggestion: { type: 'minutes', value: 5 },
      topicWeighting: equalWeights(topics),
      timerVisible: true,
      framingTone: 'Nearly there — a longer, exam-style practice today.',
    };
  }

  return {
    phase: 'bulk',
    daysRemaining,
    sessionLengthSuggestion: { type: 'questions', value: 15 },
    topicWeighting: weakAndStaleWeights(topics, mastery, today),
    timerVisible: false,
    framingTone: "Great work practicing — let's target your weaker spots today.",
  };
}

export const PHASE_LABELS = {
  diagnostic: 'Diagnostic',
  bulk: 'Daily practice',
  'late-stage': 'Exam-condition practice',
  'final-review': 'Final review',
};
