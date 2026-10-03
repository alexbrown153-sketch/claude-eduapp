// "Choose your own mix" (Roadmap #188). Run: node --test tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startSession, pickNextQuestion, restrictWeighting, weightingPercents, focusFromTopics } from '../js/session.js';
import { Storage, TOPICS } from '../js/storage.js';

const daily = { arithmetic: 0.1, fdp: 0.3, geometry: 0.2, coordinates: 0.1, wordProblems: 0.1, ratio: 0.1, algebra: 0.05, dataHandling: 0.05 };

test('restricted weights only name the ticked topics and add up to 1', () => {
  const w = restrictWeighting(daily, ['fdp', 'geometry']);
  assert.deepEqual(Object.keys(w).sort(), ['fdp', 'geometry']);
  assert.ok(Math.abs(w.fdp + w.geometry - 1) < 1e-9);
  assert.ok(Math.abs(w.fdp - 0.6) < 1e-9);
});

test('a Year 7 topic (not in the daily weighting) gets an average share', () => {
  const w = restrictWeighting(daily, ['fdp', 'geometry', 'negatives']);
  assert.ok(Math.abs(w.negatives - 0.25 / 0.75) < 1e-9); // the average of 0.3 and 0.2
  assert.ok(Math.abs(Object.values(w).reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('preview percentages always add up to exactly 100', () => {
  for (const topics of [['fdp', 'geometry', 'ratio'], ['arithmetic', 'algebra', 'dataHandling'], TOPICS]) {
    const p = weightingPercents(restrictWeighting(daily, topics));
    assert.equal(Object.values(p).reduce((a, b) => a + b, 0), 100);
  }
  assert.equal(Object.values(weightingPercents({ a: 1 / 3, b: 1 / 3, c: 1 / 3 })).reduce((a, b) => a + b, 0), 100);
});

test('focusFromTopics: none, one (old string focus), many; Year 7 off drops those', () => {
  assert.deepEqual(focusFromTopics([], true), { topicFocus: null, topicFocusList: null });
  assert.deepEqual(focusFromTopics(['fdp'], false), { topicFocus: 'fdp', topicFocusList: null });
  assert.deepEqual(focusFromTopics(['fdp', 'geometry'], false), { topicFocus: null, topicFocusList: ['fdp', 'geometry'] });
  assert.deepEqual(focusFromTopics(['fdp', 'primes'], false), { topicFocus: 'fdp', topicFocusList: null });
  assert.deepEqual(focusFromTopics(['primes'], false), { topicFocus: null, topicFocusList: null });
  assert.deepEqual(focusFromTopics(['fdp', 'primes'], true), { topicFocus: null, topicFocusList: ['fdp', 'primes'] });
});

test('a mixed session only asks its topics, and both appear', () => {
  const mastery = Storage.getMastery();
  const session = startSession({
    topicWeighting: daily, ...focusFromTopics(['fdp', 'geometry'], false), lengthType: 'questions', lengthValue: 10, mode: 'bulk', mastery,
  });
  assert.equal(session.topicFocus, null);
  const seen = new Set();
  for (let i = 0; i < 200; i += 1) {
    const q = pickNextQuestion(session, mastery);
    assert.ok(!q.blocked);
    seen.add(q.topic);
  }
  assert.deepEqual([...seen].sort(), ['fdp', 'geometry']);
});

test('old sessions: a string focus still works and a missing list reads as null', () => {
  const mastery = Storage.getMastery();
  const s = startSession({ topicWeighting: daily, topicFocus: 'ratio', lengthType: 'questions', lengthValue: 10, mode: 'bulk' });
  assert.equal(s.topicFocusList, null);
  for (let i = 0; i < 20; i += 1) assert.equal(pickNextQuestion(s, mastery).topic, 'ratio');
  const old = { ...s, topicFocus: null };
  delete old.topicFocusList;
  old.topicWeighting = { arithmetic: 1 };
  assert.equal(pickNextQuestion(old, mastery).topic, 'arithmetic');
});

test('default preview: 8 equal topics (12.5% each) and an uneven mix both add up to 100', () => {
  const eq = Object.fromEntries(TOPICS.map((t) => [t, 1 / 8]));
  const p = weightingPercents(eq);
  assert.equal(Object.values(p).reduce((a, b) => a + b, 0), 100);
  assert.ok(Object.values(p).every((v) => v === 12 || v === 13));
  const uneven = weightingPercents({ a: 0.126, b: 0.126, c: 0.126, d: 0.126, e: 0.126, f: 0.126, g: 0.126, h: 0.124 });
  assert.equal(Object.values(uneven).reduce((a, b) => a + b, 0), 100);
});
