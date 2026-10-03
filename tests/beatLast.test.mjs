// "Beat last time" line on the summary (Roadmap #173). Run: node --test tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareWithLastSession } from '../js/records.js';

// A session of `n` questions, `right` of them correct, each taking `ms`.
function session({ n = 10, right = 8, ms = 9000, mode = 'bulk', day = '2026-10-01', timed = true, extra = [] }) {
  const questions = Array.from({ length: n }, (_, i) => ({ topic: 'arithmetic', correct: i < right, timeMs: ms })).concat(extra);
  return {
    mode, finishedAt: `${day}T12:00:00`, date: `${day}T11:55:00`, questions,
    summary: { avgTimeMs: timed ? ms : undefined },
  };
}
const today = (o = {}) => session({ day: '2026-10-02', ...o });

test('no earlier session: nothing', () => {
  assert.equal(compareWithLastSession(today({}), []), null);
});

test('better on both', () => {
  const r = compareWithLastSession(today({ right: 9, ms: 7000 }), [session({ day: '2026-09-20' })]);
  assert.equal(r.text, 'Beat your last session: more right and quicker!');
  assert.equal(r.better, true);
});

test('yesterday only when the earlier session really was yesterday', () => {
  const r = compareWithLastSession(today({ right: 9, ms: 7000 }), [session({})]);
  assert.match(r.text, /yesterday/);
});

test('accuracy only, and faster only', () => {
  const prev = [session({ day: '2026-09-20' })];
  assert.equal(compareWithLastSession(today({ right: 10, ms: 9500 }), prev).text, 'More right than last time (+20%).');
  assert.equal(compareWithLastSession(today({ right: 8, ms: 6400 }), prev).text, 'Quicker than last time (3s faster per question).');
});

test('a speed gap under a second is ignored', () => {
  const prev = [session({ day: '2026-09-20' })];
  const r = compareWithLastSession(today({ right: 9, ms: 8200 }), prev);
  assert.equal(r.text, 'More right than last time (+10%).');
});

test('same or lower: neutral line, never negative wording', () => {
  const prev = [session({ day: '2026-09-20' })];
  for (const mine of [today({ right: 8, ms: 9000 }), today({ right: 5, ms: 12000 })]) {
    const r = compareWithLastSession(mine, prev);
    assert.equal(r.text, 'Last time: 80%, 9s each. Have another go to beat it!');
    assert.equal(r.better, false);
    assert.doesNotMatch(r.text, /worse|bad|lower/i);
  }
});

test('old data without timings: accuracy only', () => {
  const prev = [session({ day: '2026-09-20', timed: false })];
  assert.equal(compareWithLastSession(today({ right: 9, ms: 1000 }), prev).text, 'More right than last time (+10%).');
  assert.equal(compareWithLastSession(today({ right: 7 }), prev).text, 'Last time: 80%. Have another go to beat it!');
});

test('skips ineligible earlier sessions and ineligible current ones', () => {
  const good = session({ day: '2026-09-15', right: 6 });
  const prev = [good, session({ mode: 'diagnostic' }), session({ mode: 'retry' }), session({ mode: 'guest' }), session({ n: 4, right: 4 })];
  assert.match(compareWithLastSession(today({ right: 9 }), prev).text, /\+30%/);
  assert.equal(compareWithLastSession(today({ mode: 'diagnostic' }), prev), null);
  assert.equal(compareWithLastSession(today({ mode: 'retry' }), prev), null);
  assert.equal(compareWithLastSession(today({ n: 4, right: 4 }), prev), null);
});

test('boss and follow-up questions are left out', () => {
  const boss = [{ topic: 'arithmetic', correct: false, timeMs: 60000, boss: true }, { topic: 'arithmetic', correct: false, timeMs: 60000, followUpOf: 2 }];
  const prev = [session({ day: '2026-09-20' })];
  assert.equal(compareWithLastSession(today({ extra: boss }), prev).text, 'Last time: 80%, 9s each. Have another go to beat it!');
});

test('a previous average under half a second says "under 1s each"', () => {
  const prev = [session({ day: '2026-09-20', ms: 400 })];
  assert.equal(compareWithLastSession(today({ right: 8, ms: 400 }), prev).text, 'Last time: 80%, under 1s each. Have another go to beat it!');
});
