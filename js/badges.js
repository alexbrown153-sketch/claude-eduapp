// Lightweight gamification layer (SPEC.md §8): badges are evaluated fresh
// against current state each time, but once earned they're kept forever
// (e.g. a streak badge doesn't un-earn itself if the streak later breaks) —
// the caller is responsible for merging into the persisted earned-id set.

const STATIC_BADGES = [
  { id: 'first-session', label: 'First Steps', description: 'Complete your first practice session', icon: '🎯', check: (ctx) => ctx.sessionCount >= 1 },
  { id: 'diagnostic-done', label: 'Warm-Up Complete', description: 'Finish the diagnostic session', icon: '🧭', check: (ctx) => !!ctx.meta.diagnosticCompletedAt },
  { id: 'streak-3', label: 'On a Roll', description: '3-day practice streak', icon: '🔥', check: (ctx) => ctx.meta.currentStreakDays >= 3 },
  { id: 'streak-7', label: 'Week Warrior', description: '7-day practice streak', icon: '🔥', check: (ctx) => ctx.meta.currentStreakDays >= 7 },
  { id: 'streak-14', label: 'Unstoppable', description: '14-day practice streak', icon: '🔥', check: (ctx) => ctx.meta.currentStreakDays >= 14 },
  { id: 'points-100', label: 'Century', description: 'Earn 100 points', icon: '⭐', check: (ctx) => ctx.meta.totalPoints >= 100 },
  { id: 'points-500', label: 'High Scorer', description: 'Earn 500 points', icon: '⭐', check: (ctx) => ctx.meta.totalPoints >= 500 },
  { id: 'points-1000', label: 'Sprint Champion', description: 'Earn 1000 points', icon: '🏆', check: (ctx) => ctx.meta.totalPoints >= 1000 },
];

function topicMasteryBadge(topic, topicLabel) {
  return {
    id: `mastery-${topic}`,
    label: `${topicLabel} Master`,
    description: `Reach 80% mastery in ${topicLabel}`,
    icon: '🏅',
    check: (ctx) => ctx.mastery[topic].masteryScore >= 0.8,
  };
}

// topicLabels: { topicKey: displayLabel } — passed in (rather than imported)
// so this module stays a pure logic module with no UI dependency.
export function getBadgeDefinitions(topics, topicLabels) {
  return [...STATIC_BADGES, ...topics.map((t) => topicMasteryBadge(t, topicLabels[t] || t))];
}

// ctx: { meta, mastery, sessionCount }. previouslyEarnedIds: string[] already persisted.
// Returns the full current earned-id list (union with previous) and which ids are new this call.
export function evaluateBadges(definitions, ctx, previouslyEarnedIds) {
  const currentlyTrue = definitions.filter((b) => b.check(ctx)).map((b) => b.id);
  const earnedIds = [...new Set([...previouslyEarnedIds, ...currentlyTrue])];
  const newlyEarnedIds = currentlyTrue.filter((id) => !previouslyEarnedIds.includes(id));
  return { earnedIds, newlyEarnedIds };
}
