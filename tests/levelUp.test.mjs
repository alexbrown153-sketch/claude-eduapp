// Level-up detection (Roadmap #172). Run: node --test tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findLevelUps, snapshotTiers } from '../js/mastery.js';

const rec = (difficultyLevel, questionsSeen = 20, masteryScore = 0.5) => ({ difficultyLevel, questionsSeen, masteryScore });
const mastery = (o) => ({ arithmetic: rec(3), fdp: rec(3), geometry: rec(3), ...o });

test('one tier up is listed with the new level', () => {
  const start = snapshotTiers(mastery({}));
  assert.deepEqual(findLevelUps(start, mastery({ fdp: rec(4) })), [{ topic: 'fdp', from: 3, to: 4 }]);
});

test('same, lower, and up-then-back-down show nothing', () => {
  const start = snapshotTiers(mastery({}));
  assert.deepEqual(findLevelUps(start, mastery({ fdp: rec(3), geometry: rec(2) })), []);
});

test('a two-tier jump is one entry with the final tier', () => {
  const start = snapshotTiers(mastery({}));
  assert.deepEqual(findLevelUps(start, mastery({ arithmetic: rec(5) })), [{ topic: 'arithmetic', from: 3, to: 5 }]);
});

test('under 10 questions in total never levels up', () => {
  const start = snapshotTiers(mastery({}));
  assert.deepEqual(findLevelUps(start, mastery({ fdp: rec(4, 9) })), []);
  assert.equal(findLevelUps(start, mastery({ fdp: rec(4, 10) })).length, 1);
});

test('a topic already at tier 5 cannot level up', () => {
  const start = snapshotTiers(mastery({ fdp: rec(5) }));
  assert.deepEqual(findLevelUps(start, mastery({ fdp: rec(5) })), []);
});

test('no snapshot (a session saved before this change) or odd input: nothing, no error', () => {
  assert.deepEqual(findLevelUps(undefined, mastery({})), []);
  assert.deepEqual(findLevelUps(null, mastery({})), []);
  assert.deepEqual(findLevelUps({}, mastery({})), []);
});
