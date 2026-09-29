// Adaptive difficulty engine (SPEC.md §6). Mastery is a simple exponential
// moving average of a per-question score that rewards correctness first,
// speed second — no full ELO system needed at this scale.

export const EXPECTED_TIME_MS = { 1: 8000, 2: 12000, 3: 18000, 4: 25000, 5: 35000 };

const ALPHA = 0.15; // ~last 6-7 questions dominate the running average

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function computeQuestionScore(correct, tier, actualTimeMs) {
  if (!correct) return 0;
  const speedScore = clamp(EXPECTED_TIME_MS[tier] / Math.max(actualTimeMs, 1), 0, 1);
  return 0.7 + 0.3 * speedScore;
}

export function tierFromMastery(score) {
  if (score < 0.2) return 1;
  if (score < 0.4) return 2;
  if (score < 0.6) return 3;
  if (score < 0.8) return 4;
  return 5;
}

// Mutates and returns masteryRecord after one answered question.
export function updateMastery(masteryRecord, correct, tier, actualTimeMs, todayStr) {
  const score = computeQuestionScore(correct, tier, actualTimeMs);
  const newScore = masteryRecord.masteryScore * (1 - ALPHA) + score * ALPHA;

  masteryRecord.masteryScore = newScore;
  masteryRecord.questionsSeen += 1;
  masteryRecord.consecutiveWrong = correct ? 0 : masteryRecord.consecutiveWrong + 1;
  masteryRecord.lastPracticed = todayStr;
  masteryRecord.difficultyLevel = tierFromMastery(newScore);
  masteryRecord.history.push({ date: todayStr, masteryScore: newScore });
  if (masteryRecord.history.length > 50) masteryRecord.history.shift();

  return masteryRecord;
}

// Picks the difficulty tier for the next question in a topic: mostly the
// child's current tier, with some harder "stretch" and easier "reinforcement"
// questions mixed in (spaced-repetition-like, per SPEC.md §6). After two
// wrong answers in a row on a topic, force an easier question and suppress
// the stretch bucket until a correct answer lands again, to avoid frustration.
export function selectDifficultyTier(masteryRecord) {
  const baseTier = masteryRecord.difficultyLevel || tierFromMastery(masteryRecord.masteryScore);

  if (masteryRecord.consecutiveWrong >= 2) {
    return Math.max(1, baseTier - 1);
  }

  const roll = Math.random();
  if (roll < 0.6) return baseTier;
  if (roll < 0.8) return Math.min(5, baseTier + 1);
  return Math.max(1, baseTier - 1);
}

export function weightedRandomPick(weights) {
  const entries = Object.entries(weights);
  const total = entries.reduce((sum, [, w]) => sum + w, 0);
  let r = Math.random() * total;
  for (const [key, w] of entries) {
    if (r < w) return key;
    r -= w;
  }
  return entries[entries.length - 1][0];
}

// ---------- Strongest and weakest topic (moved from ui.js for #136) ----------

// Only shown once there's enough real practice data to be meaningful —
// before that, every topic sits at the same default mastery score and
// "strongest/weakest" would just be noise.
//
// Roadmap #120: every topic starts at 50%, so after a mostly-wrong first
// quiz the "strongest" topic was just the one with the fewest wrong answers
// (e.g. 43% after 0 out of 1). A topic is only called strongest once the
// child's answers have pushed it above that 50% start; until then
// `strongest` is null and Home says "We'll find out as you practise".
// `weakest`, which the focus card, Next session widget, summary and weekly
// quests (#136) all use, is unchanged.
const STARTING_SCORE = 0.5;
export function computeStrengthSummary(mastery) {
  const entries = Object.entries(mastery).filter(([, rec]) => rec.questionsSeen > 0);
  const totalSeen = entries.reduce((sum, [, rec]) => sum + rec.questionsSeen, 0);
  if (totalSeen < 5) return null;
  const sorted = [...entries].sort((a, b) => b[1].masteryScore - a[1].masteryScore);
  const top = sorted[0];
  const weakest = sorted[sorted.length - 1];
  if (top[0] === weakest[0]) return null;
  const strongest = top[1].masteryScore > STARTING_SCORE ? top : null;
  return { strongest, weakest };
}
