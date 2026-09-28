// Daily focus (SPEC.md §6a). There's no exam date or countdown any more
// (Roadmap #96): the plan depends only on saved progress, plus how long since
// each topic was last practised, so it's the same whatever the device clock
// says apart from that staleness.

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
      framingTone: "Let's find out where you're strongest to start with.",
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
  diagnostic: 'Diagnostic',
  bulk: 'Daily practice',
};
