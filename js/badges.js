import { isPerfectSession, hasFastRun, SKILL_MODES } from './records.js';

// Lightweight gamification layer (SPEC.md §8): badges are evaluated fresh
// against current state each time, but once earned they're kept forever
// (e.g. a streak badge doesn't un-earn itself if the streak later breaks) —
// the caller is responsible for merging into the persisted earned-id set.

// `difficulty` is only used to order earned badges (hardest first) in the
// header strip — higher means harder to earn. Arbitrary scale, just needs
// to rank consistently relative to the other badges.
//
// `shelf` groups badges in the Trophy cabinet (#134): 'start', 'streaks',
// 'points', 'topics', 'challenges' or 'secret'. `hidden: true` marks a
// secret badge (#135): "???" in the cabinet until it's earned.
// `progressHint(ctx)` optionally adds a short "how far" note to a locked
// badge's hint in the cabinet.
const pointsSoFar = (ctx) => `(${ctx.meta.totalPoints || 0} so far)`;
const currentStreak = (ctx) => {
  const n = ctx.meta.currentStreakDays || 0;
  return `(current streak: ${n} day${n === 1 ? '' : 's'})`;
};

// Roadmap #135: skill badges are judged on the session that has just
// finished (ctx.entry), and only for ordinary practice, the warm-up quiz,
// Fix my mistakes and check-ups (SKILL_MODES) — never a "Try these again"
// round or a future game mode. With no finished session in ctx (anything
// that evaluates badges outside the end of a session) they're false.
const judged = (ctx) => Boolean(ctx.entry) && SKILL_MODES.includes(ctx.entry.mode);

const STATIC_BADGES = [
  { id: 'first-session', shelf: 'start', label: 'First Steps', description: 'Complete your first practice session', icon: '🎯', difficulty: 5, check: (ctx) => ctx.sessionCount >= 1 },
  { id: 'diagnostic-done', shelf: 'start', label: 'Warm-Up Complete', description: 'Finish your warm-up quiz', icon: '🧭', difficulty: 10, check: (ctx) => !!ctx.meta.diagnosticCompletedAt },
  { id: 'streak-3', shelf: 'streaks', label: 'On a Roll', description: '3-day practice streak', icon: '🔥', difficulty: 20, progressHint: currentStreak, check: (ctx) => ctx.meta.currentStreakDays >= 3 },
  { id: 'points-100', shelf: 'points', label: 'Century', description: 'Earn 100 points', icon: '⭐', difficulty: 30, progressHint: pointsSoFar, check: (ctx) => ctx.meta.totalPoints >= 100 },
  { id: 'streak-7', shelf: 'streaks', label: 'Week Warrior', description: '7-day practice streak', icon: '🔥', difficulty: 55, progressHint: currentStreak, check: (ctx) => ctx.meta.currentStreakDays >= 7 },
  { id: 'points-500', shelf: 'points', label: 'High Scorer', description: 'Earn 500 points', icon: '⭐', difficulty: 60, progressHint: pointsSoFar, check: (ctx) => ctx.meta.totalPoints >= 500 },
  { id: 'streak-14', shelf: 'streaks', label: 'Unstoppable', description: '14-day practice streak', icon: '🔥', difficulty: 95, progressHint: currentStreak, check: (ctx) => ctx.meta.currentStreakDays >= 14 },
  { id: 'points-1000', shelf: 'points', label: 'Sprint Champion', description: 'Earn 1000 points', icon: '🏆', difficulty: 100, progressHint: pointsSoFar, check: (ctx) => ctx.meta.totalPoints >= 1000 },
  // Roadmap #149 and #136.
  { id: 'checkup-done', shelf: 'challenges', label: 'Check-up Champ', description: 'Finish a check-up quiz', icon: '🩺', difficulty: 50, check: (ctx) => !!ctx.meta.lastCheckupCompletedAt },
  { id: 'quest-champion', shelf: 'challenges', label: 'Quest Champion', description: 'Finish all three weekly quests in one week', icon: '🗺️', difficulty: 65, check: (ctx) => (ctx.meta.questWeeksCompleted || 0) >= 1 },
  // Roadmap #135: secret skill badges.
  { id: 'skill-comeback-kid', shelf: 'secret', hidden: true, label: 'Comeback Kid', description: 'Fix a mistake from an earlier session', icon: '💪', difficulty: 45, check: (ctx) => judged(ctx) && (ctx.fixedThisSession || []).length > 0 },
  { id: 'skill-speed-demon', shelf: 'secret', hidden: true, label: 'Speed Demon', description: 'Get 5 right in a row, each in under 10 seconds', icon: '⚡', difficulty: 65, check: (ctx) => judged(ctx) && hasFastRun(ctx.entry) },
  { id: 'skill-hot-hand', shelf: 'secret', hidden: true, label: 'Hot Hand', description: 'Get 10 right in a row', icon: '🌶️', difficulty: 70, check: (ctx) => judged(ctx) && ((ctx.entry.summary && ctx.entry.summary.bestStreak) || 0) >= 10 },
  { id: 'skill-perfect-ten', shelf: 'secret', hidden: true, label: 'Perfect Ten', description: 'Get every question right in a session of 10 or more', icon: '💯', difficulty: 75, check: (ctx) => judged(ctx) && isPerfectSession(ctx.entry) },
];

function topicMasteryBadge(topic, topicLabel) {
  return {
    id: `mastery-${topic}`,
    shelf: 'topics',
    topic,
    label: `${topicLabel} Master`,
    description: `Get to 80% in ${topicLabel}`,
    icon: '🏅',
    difficulty: 80,
    check: (ctx) => ctx.mastery[topic].masteryScore >= 0.8,
  };
}

// ---------- Topic medals (Roadmap #129) ----------

// Bronze, silver and gold per topic at 50/70/90%. The % is the mastery
// score exactly as Progress shows it (rounded), so the child never sees
// "90%" without gold. Every topic starts at 50%, so no medal counts until
// the child has answered at least MIN_TIER_QUESTIONS in that topic —
// otherwise every untouched topic would get bronze for free. Medals are
// kept once earned, like every badge. The 80% Master badge stays too.
export const MIN_TIER_QUESTIONS = 10;
export const TOPIC_TIERS = [
  { tier: 'bronze', name: 'Bronze', pct: 50, icon: '🥉', difficulty: 40 },
  { tier: 'silver', name: 'Silver', pct: 70, icon: '🥈', difficulty: 70 },
  { tier: 'gold', name: 'Gold', pct: 90, icon: '🥇', difficulty: 90 },
];

export function displayedPct(rec) {
  return Math.round(rec.masteryScore * 100);
}

function topicTierBadge(topic, topicLabel, t) {
  return {
    id: `topic-${topic}-${t.tier}`,
    shelf: 'topics',
    topic,
    topicTier: t.tier,
    label: `${topicLabel} ${t.name}`,
    description: `Get to ${t.pct}% in ${topicLabel}`,
    icon: t.icon,
    difficulty: t.difficulty,
    check: (ctx) => {
      const rec = ctx.mastery[topic];
      return rec.questionsSeen >= MIN_TIER_QUESTIONS && displayedPct(rec) >= t.pct;
    },
  };
}

// Where a list shows one badge per topic medal (the header strip, the
// summary's "New badge" row), keep only the highest tier for each topic:
// gold replaces silver and bronze. Other badges pass through untouched.
export function highestTiersOnly(badges) {
  const rank = (b) => TOPIC_TIERS.findIndex((t) => t.tier === b.topicTier);
  return badges.filter((b) => !b.topicTier
    || !badges.some((o) => o.topicTier && o.topic === b.topic && rank(o) > rank(b)));
}

// topicLabels: { topicKey: displayLabel } — passed in (rather than imported)
// so this module stays a pure logic module with no UI dependency.
export function getBadgeDefinitions(topics, topicLabels) {
  return [
    ...STATIC_BADGES,
    ...topics.map((t) => topicMasteryBadge(t, topicLabels[t] || t)),
    ...topics.flatMap((t) => TOPIC_TIERS.map((tier) => topicTierBadge(t, topicLabels[t] || t, tier))),
  ];
}

// ctx: { meta, mastery, sessionCount, entry?, fixedThisSession? } — entry
// is the session that has just finished (for skill badges). previouslyEarnedIds: string[] already persisted.
// Returns the full current earned-id list (union with previous) and which ids are new this call.
export function evaluateBadges(definitions, ctx, previouslyEarnedIds) {
  const currentlyTrue = definitions.filter((b) => b.check(ctx)).map((b) => b.id);
  const earnedIds = [...new Set([...previouslyEarnedIds, ...currentlyTrue])];
  const newlyEarnedIds = currentlyTrue.filter((id) => !previouslyEarnedIds.includes(id));
  return { earnedIds, newlyEarnedIds };
}
