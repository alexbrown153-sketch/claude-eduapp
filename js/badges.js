// Lightweight gamification layer (SPEC.md §8): badges are evaluated fresh
// against current state each time, but once earned they're kept forever
// (e.g. a streak badge doesn't un-earn itself if the streak later breaks) —
// the caller is responsible for merging into the persisted earned-id set.

// `difficulty` is only used to order earned badges (hardest first) in the
// header strip — higher means harder to earn. Arbitrary scale, just needs
// to rank consistently relative to the other badges.
//
// `shelf` groups badges ('start', 'streaks', 'points', 'topics') for a
// later trophy cabinet (#134). Definitions may also carry `hidden: true`
// (secret badges, #135); none do yet.
const STATIC_BADGES = [
  { id: 'first-session', shelf: 'start', label: 'First Steps', description: 'Complete your first practice session', icon: '🎯', difficulty: 5, check: (ctx) => ctx.sessionCount >= 1 },
  { id: 'diagnostic-done', shelf: 'start', label: 'Warm-Up Complete', description: 'Finish your warm-up quiz', icon: '🧭', difficulty: 10, check: (ctx) => !!ctx.meta.diagnosticCompletedAt },
  { id: 'streak-3', shelf: 'streaks', label: 'On a Roll', description: '3-day practice streak', icon: '🔥', difficulty: 20, check: (ctx) => ctx.meta.currentStreakDays >= 3 },
  { id: 'points-100', shelf: 'points', label: 'Century', description: 'Earn 100 points', icon: '⭐', difficulty: 30, check: (ctx) => ctx.meta.totalPoints >= 100 },
  { id: 'streak-7', shelf: 'streaks', label: 'Week Warrior', description: '7-day practice streak', icon: '🔥', difficulty: 55, check: (ctx) => ctx.meta.currentStreakDays >= 7 },
  { id: 'points-500', shelf: 'points', label: 'High Scorer', description: 'Earn 500 points', icon: '⭐', difficulty: 60, check: (ctx) => ctx.meta.totalPoints >= 500 },
  { id: 'streak-14', shelf: 'streaks', label: 'Unstoppable', description: '14-day practice streak', icon: '🔥', difficulty: 95, check: (ctx) => ctx.meta.currentStreakDays >= 14 },
  { id: 'points-1000', shelf: 'points', label: 'Sprint Champion', description: 'Earn 1000 points', icon: '🏆', difficulty: 100, check: (ctx) => ctx.meta.totalPoints >= 1000 },
];

function topicMasteryBadge(topic, topicLabel) {
  return {
    id: `mastery-${topic}`,
    shelf: 'topics',
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

// ctx: { meta, mastery, sessionCount }. previouslyEarnedIds: string[] already persisted.
// Returns the full current earned-id list (union with previous) and which ids are new this call.
export function evaluateBadges(definitions, ctx, previouslyEarnedIds) {
  const currentlyTrue = definitions.filter((b) => b.check(ctx)).map((b) => b.id);
  const earnedIds = [...new Set([...previouslyEarnedIds, ...currentlyTrue])];
  const newlyEarnedIds = currentlyTrue.filter((id) => !previouslyEarnedIds.includes(id));
  return { earnedIds, newlyEarnedIds };
}
