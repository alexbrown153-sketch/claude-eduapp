// Clock maths for timed sessions (Roadmap #178 / #170). Run: node --test tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sessionEndAt, rebaseTimedSession } from '../js/session.js';

const MIN = 60 * 1000;
const base = { lengthType: 'minutes', lengthValue: 5, startedAt: 1_000_000, questions: [] };

test('end time is start + length when nothing was paused (old saves too)', () => {
  assert.equal(sessionEndAt(base), 1_000_000 + 5 * MIN);
});

test('time spent hidden pushes the end time out by exactly that much', () => {
  assert.equal(sessionEndAt({ ...base, pausedMs: 2 * MIN }), 1_000_000 + 7 * MIN);
});

test('rebase: an hour later, the clock shows what was left at the last save', () => {
  const later = 1_000_000 + 60 * MIN;
  const s = rebaseTimedSession({ ...base, remainingMs: 4 * MIN, pausedMs: 30000 }, later);
  assert.equal(sessionEndAt(s) - later, 4 * MIN);
  assert.equal(s.pausedMs, 0);
});

test('rebase: a pre-change timed save (no remainingMs) gets a full clock', () => {
  const later = 5_000_000;
  assert.equal(sessionEndAt(rebaseTimedSession(base, later)) - later, 5 * MIN);
});

test('rebase: odd remainingMs values are clamped, questions-mode untouched', () => {
  const now = 9_000_000;
  assert.equal(sessionEndAt(rebaseTimedSession({ ...base, remainingMs: -5 }, now)) - now, 0);
  assert.equal(sessionEndAt(rebaseTimedSession({ ...base, remainingMs: 99 * MIN }, now)) - now, 5 * MIN);
  const q = { lengthType: 'questions', lengthValue: 10, startedAt: 1, questions: [] };
  assert.equal(rebaseTimedSession(q, now), q);
});
