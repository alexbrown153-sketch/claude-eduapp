// Daily focus (SPEC.md §6a). There's no exam date or countdown any more
// (Roadmap #96): the plan depends only on saved progress, plus how long since
// each topic was last practised, so it's the same whatever the device clock
// says apart from that staleness.

import { localDateStr, daysBetweenLocalDates } from './dates.js';

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
  const todayStr = localDateStr(today);
  topics.forEach((t) => {
    const rec = mastery[t];
    const weaknessScore = 1 - rec.masteryScore;
    // Never practised (or an unreadable date) counts as very stale; a date
    // later than today (clock set back) counts as today.
    const gap = daysBetweenLocalDates(rec.lastPracticed, todayStr);
    const daysSince = Number.isFinite(gap) ? Math.max(gap, 0) : 99;
    const stalenessBoost = Math.min(daysSince / 7, 1);
    raw[t] = 0.4 + weaknessScore * 0.4 + stalenessBoost * 0.2;
  });
  return normalize(raw);
}

// Two phases: a one-off diagnostic until the first one is finished, then
// daily practice for good. 'bulk' is the old internal id for daily practice,
// kept so the `mode` stored on sessions doesn't change. Old sessions logged
// as 'late-stage' or 'final-review' stay in history untouched; nothing reads
// them except the diagnostic check.
export function computeTodaysPlan(today, meta, mastery, topics) {
  if (!meta.diagnosticCompletedAt) {
    return {
      phase: 'diagnostic',
      sessionLengthSuggestion: { type: 'questions', value: 12 },
      topicWeighting: equalWeights(topics),
      // Roadmap #118: a friendly warm-up, not a test.
      framingTone: "It's not a test. Just try your best, and Sprint will know what to practise with you next.",
    };
  }

  return {
    phase: 'bulk',
    sessionLengthSuggestion: { type: 'questions', value: 15 },
    topicWeighting: weakAndStaleWeights(topics, mastery, today),
    framingTone: "Great work practising — let's target your weaker spots today.",
  };
}

export const PHASE_LABELS = {
  diagnostic: "Warm-up quiz: let's see what you know", // Roadmap #118
  bulk: 'Daily practice',
};
