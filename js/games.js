// Game logic for the Games screen (Roadmap #143-#147). Pure functions only,
// no DOM and no storage, so every rule here can be checked in Node. The
// screens live in gameScreens.js (and the guest round in app.js).
//
// Shared rule for every game (Alex's decision): a game never touches
// mastery, the streak, the session log, records, the chest, quests, the map,
// the goal ring, the Fix list or skill badges. Numbers Target and Close
// Enough add Shop points; Blitz and the guest round add none.

import { blitzArithmetic, getQuestion } from './questionBank.js';
import { tierFromMastery } from './mastery.js';
import { TOPICS } from './storage.js';

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ======================================================================
// #143 60-second Blitz
// ======================================================================

export const BLITZ_SECONDS = 60;
// The question mix, versioned: if it ever changes, this tag changes too and
// the old top-5 table is set aside (Storage.getBlitz), so scores from
// different mixes are never compared. Fixed forever otherwise (Alex).
export const BLITZ_MIX = 't2-t3';
export const BLITZ_TOP = 5;

// Half tier 2, half tier 3. Every answer is a whole number of 0 or more
// (the generators never subtract the bigger number, and only divide
// exactly), so the pad needs no ".", "r", "/" or "−".
export function blitzQuestion() {
  const q = blitzArithmetic(Math.random() < 0.5 ? 2 : 3);
  return { prompt: q.prompt, answer: Number(q.correctAnswer) };
}

// Table order: more right first; the same score ranks the run with fewer
// wrong answers higher; still equal, the earlier run stays higher (#143
// AC11). Dates are ISO strings, which sort as text.
export function compareBlitzRuns(a, b) {
  return (b.correct - a.correct) || (a.wrong - b.wrong) || (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
}

// Adds a finished run to the table. Returns the new top 5, the run's place
// in it (0-based, or -1 if it didn't make it) and whether it's a new best:
// strictly more right than the old #1, never on the very first run and
// never on a tie (AC10, the same rule as findNewRecords in records.js).
export function addBlitzRun(top, run) {
  const previousBest = top.length ? top[0].correct : null;
  const sorted = [...top, run].sort(compareBlitzRuns).slice(0, BLITZ_TOP);
  const place = sorted.indexOf(run);
  return {
    top: sorted,
    place,
    newBest: previousBest !== null && run.correct > previousBest,
  };
}

// ======================================================================
// #144 Numbers Target
// ======================================================================

export const SMALL_POOL = [1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10];
export const BIG_POOL = [25, 50, 75, 100];
export const NUMBER_LEVELS = {
  starter: { min: 10, max: 99 },
  classic: { min: 101, max: 999 },
};
export const OPS = ['+', '−', '×', '÷'];

// One step, by the game's rules: every result a whole number above zero.
// Returns { ok: true, value } or { ok: false, reason }. The reasons are the
// friendly lines the board shows (#144 proposal step 3).
export function applyStep(a, op, b) {
  if (op === '+') return { ok: true, value: a + b };
  if (op === '×') return { ok: true, value: a * b };
  if (op === '−') {
    if (a - b <= 0) return { ok: false, reason: 'That would go to zero or below. Try the bigger number first.' };
    return { ok: true, value: a - b };
  }
  if (op === '÷') {
    if (b === 0 || a % b !== 0) return { ok: false, reason: 'That doesn’t divide exactly.' };
    return { ok: true, value: a / b };
  }
  return { ok: false, reason: 'Pick +, −, × or ÷.' };
}

// Six numbers for a round. Small numbers come from 1-10, two of each;
// big ones from 25, 50, 75, 100, one of each. Starter has no big numbers.
export function dealNumbers(level, bigCount = 0) {
  const big = level === 'classic' ? Math.max(0, Math.min(4, bigCount)) : 0;
  const bigs = shuffle(BIG_POOL).slice(0, big);
  const smalls = shuffle(SMALL_POOL).slice(0, 6 - big);
  return [...bigs, ...smalls];
}

// The steps worth trying on a pair, bigger number first. ×1 and ÷1 are
// skipped: they never shorten a solution, and the solver wants the fewest
// steps. Subtraction and division only go the way that gives a whole number
// above zero.
function pairMoves(x, y) {
  const [a, b] = x >= y ? [x, y] : [y, x];
  const moves = [{ a, op: '+', b, value: a + b }];
  if (b > 1) moves.push({ a, op: '×', b, value: a * b });
  if (a > b) moves.push({ a, op: '−', b, value: a - b });
  if (b > 1 && a % b === 0) moves.push({ a, op: '÷', b, value: a / b });
  return moves;
}

// Every value the numbers can make, each with its "show me a way": the
// fewest steps, and among those the way whose biggest number along the way
// is smallest (Alex: avoid very large intermediates when steps tie).
//
// One pass, level by level. Each step turns two tiles into one, so a board
// (the tiles left, in any order) is always k steps from the start when it
// has k fewer tiles. Every way onto a level-k board comes from level k-1,
// so once level k-1 is finished, keeping only the best way onto each
// level-k board (smallest biggest-number-so-far) is exact. A value's
// fewest steps is the first level where any board holds it; every way
// onto such a board makes that value on its last step, so the board's
// best way is the value's best way.
//
// One pass covers every target at once (about 50,000 boards at most for
// six numbers), so a round never has to search again and again for a
// target that can't be made. Returns a Map: value -> steps
// [{ a, op, b, value }], the dealt numbers themselves left out.
export function solveAll(numbers) {
  const start = [...numbers].sort((p, q) => p - q);
  const dealt = new Set(start);
  let level = new Map([[start.join(','), { tiles: start, max: 0, from: null, step: null }]]);
  const found = new Map(); // value -> the board it was first made on
  for (let k = 1; k < start.length; k += 1) {
    const next = new Map();
    level.forEach((board) => {
      const t = board.tiles;
      const tried = new Set();
      for (let i = 0; i < t.length; i += 1) {
        for (let j = i + 1; j < t.length; j += 1) {
          const pair = `${t[i]},${t[j]}`; // the same pair twice gives the same boards
          if (tried.has(pair)) continue;
          tried.add(pair);
          const rest = t.filter((_, n) => n !== i && n !== j);
          pairMoves(t[i], t[j]).forEach((m) => {
            const tiles = [...rest, m.value].sort((p, q) => p - q);
            const key = tiles.join(',');
            const max = Math.max(board.max, m.value);
            const prev = next.get(key);
            if (!prev || max < prev.max) next.set(key, { tiles, max, from: board, step: m });
          });
        }
      }
    });
    const madeHere = new Map();
    next.forEach((board) => {
      const v = board.step.value;
      if (found.has(v) || dealt.has(v)) return;
      const prev = madeHere.get(v);
      if (!prev || board.max < prev.max) madeHere.set(v, board);
    });
    madeHere.forEach((board, v) => found.set(v, board));
    level = next;
  }
  const ways = new Map();
  found.forEach((board, v) => {
    const steps = [];
    for (let b = board; b.step; b = b.from) steps.unshift(b.step);
    ways.set(v, steps);
  });
  return ways;
}

// The way to one target (fewest steps, then smallest biggest number), or
// [] if the target is already dealt, or null if it can't be made.
export function solveNumbers(numbers, target) {
  if (numbers.includes(target)) return [];
  return solveAll(numbers).get(target) || null;
}

// The self-check (#144 step 6): replays a solution with whole-number
// arithmetic. Every step must use tiles that are on the board at that
// moment (each dealt number at most once), follow the rules, and write down
// the right result; the last result must be the target. Returns
// { ok: true } or { ok: false, reason }.
export function replaySolution(numbers, steps, target) {
  if (!Array.isArray(steps) || steps.length === 0) return { ok: false, reason: 'no steps' };
  const pool = [...numbers];
  const take = (n) => {
    const i = pool.indexOf(n);
    if (i === -1) return false;
    pool.splice(i, 1);
    return true;
  };
  for (const s of steps) {
    if (!Number.isInteger(s.a) || !Number.isInteger(s.b) || !Number.isInteger(s.value)) return { ok: false, reason: 'not whole numbers' };
    if (!take(s.a)) return { ok: false, reason: `${s.a} is not on the board` };
    if (!take(s.b)) return { ok: false, reason: `${s.b} is not on the board` };
    const r = applyStep(s.a, s.op, s.b);
    if (!r.ok) return { ok: false, reason: r.reason };
    if (r.value !== s.value || s.value <= 0) return { ok: false, reason: `${s.a} ${s.op} ${s.b} is not ${s.value}` };
    pool.push(s.value);
  }
  if (steps[steps.length - 1].value !== target) return { ok: false, reason: 'does not reach the target' };
  return { ok: true };
}

// A new round: six numbers and a target in the level's range that the
// solver can reach AND whose way passes the replay check. The target is
// picked at random from every reachable one in range, so no round is ever
// unsolvable. A dealt number is never the target (it would be won with no
// steps). Redeals quietly if nothing in range can be made; after many
// failures (which shouldn't happen) returns null so the screen can say so.
export function newNumbersRound(level, bigCount = 0) {
  const range = NUMBER_LEVELS[level];
  for (let deal = 0; deal < 20; deal += 1) {
    const numbers = dealNumbers(level, bigCount);
    const ways = solveAll(numbers);
    const targets = [...ways.keys()].filter((v) => v >= range.min && v <= range.max);
    while (targets.length) {
      const target = targets.splice(randInt(0, targets.length - 1), 1)[0];
      const solution = ways.get(target);
      if (replaySolution(numbers, solution, target).ok) {
        return { level, bigCount: level === 'classic' ? bigCount : 0, numbers, target, solution };
      }
    }
  }
  return null;
}

// Points for the closest tile (#144 step 7): exact 10, within 5 is 7,
// within 10 is 5, further 0.
export function numbersPoints(distance) {
  if (distance === 0) return 10;
  if (distance <= 5) return 7;
  if (distance <= 10) return 5;
  return 0;
}

// The tile nearest the target (the first one, if two are equally near).
export function closestTile(values, target) {
  return values.reduce((best, v) => (Math.abs(v - target) < Math.abs(best - target) ? v : best), values[0]);
}

export function formatStep(s) {
  return `${s.a} ${s.op} ${s.b} = ${s.value}`;
}

// ======================================================================
// #145 Close Enough (estimation)
// ======================================================================

export const ESTIMATE_ROUND = 5;
export const ESTIMATE_TYPES = ['2x2', '3x1', 'div', 'sum3'];

// One calculation with a whole-number answer. Division is always exact:
// the dividend is built as divisor × quotient.
export function estimateQuestion(type = pick(ESTIMATE_TYPES)) {
  if (type === '2x2') {
    const a = randInt(11, 99);
    const b = randInt(11, 99);
    return { type, text: `${a} × ${b}`, answer: a * b, parts: [a, b] };
  }
  if (type === '3x1') {
    const a = randInt(100, 999);
    const b = randInt(2, 9);
    return { type, text: `${a} × ${b}`, answer: a * b, parts: [a, b] };
  }
  if (type === 'div') {
    const d = randInt(2, 9);
    const q = randInt(Math.ceil(1000 / d), Math.floor(9999 / d));
    return { type, text: `${fmt(d * q)} ÷ ${d}`, answer: q, parts: [d * q, d] };
  }
  const nums = [randInt(100, 999), randInt(100, 999), randInt(100, 999)];
  return { type: 'sum3', text: nums.join(' + '), answer: nums[0] + nums[1] + nums[2], parts: nums };
}

export const fmt = (n) => Number(n).toLocaleString('en-GB');

// Slider steps are "nice": 1, 2 or 5 × a power of ten.
function niceSteps(upTo) {
  const out = [];
  for (let p = 1; p <= upTo * 10; p *= 10) [1, 2, 5].forEach((m) => out.push(m * p));
  return out;
}

// The slider's top end and step for an answer (#145 step 4, AC 5 and 7).
// The raw top is the answer × a random factor from 1.5 to 3, so the answer
// isn't always in the same place. The step is a nice number giving about
// 100-200 positions, and the top is rounded UP to a whole number of steps
// that is also a multiple of 4, so the ¼, ½ and ¾ ticks fall on the grid.
// Rounding up keeps the top at least 1.5 × the answer.
export function sliderScale(answer, factor = 1.5 + Math.random() * 1.5) {
  const raw = answer * factor;
  let best = null;
  niceSteps(raw).forEach((step) => {
    const positions = Math.ceil(Math.ceil(raw / step) / 4) * 4;
    const score = positions >= 100 && positions <= 200 ? 0 : Math.abs(positions - 150);
    if (!best || score < best.score || (score === best.score && step > best.step)) best = { step, positions, score };
  });
  return { step: best.step, max: best.step * best.positions, positions: best.positions };
}

// Closeness bands by percentage error |guess - answer| ÷ answer, with the
// boundaries included (#145 AC9): within 5% is a bullseye. Compared in
// whole numbers (100 × distance against 5 × answer), so 5% exactly never
// falls the wrong side through rounding.
export function scoreEstimate(guess, answer) {
  const off = Math.abs(guess - answer);
  if (off * 100 <= answer * 5) return { stars: 3, points: 10, off };
  if (off * 100 <= answer * 10) return { stars: 2, points: 6, off };
  if (off * 100 <= answer * 25) return { stars: 1, points: 3, off };
  return { stars: 0, points: 0, off };
}

// "within 3%": the error rounded UP to a whole percent, so the claim is
// always true (2.1% off is "within 3%").
export function withinPercent(guess, answer) {
  return Math.ceil((Math.abs(guess - answer) * 100) / answer);
}

// ======================================================================
// #147 Beat the Grown-Up
// ======================================================================

export const GUEST_ROUND = 10;

// Ten questions: every core topic once, plus two different topics again,
// shuffled (a balanced mix; Year 7 topics only appear via their chips, so
// never here). Each at the child's current tier for that topic, read from
// mastery and never written. Word problems draw from a set local to the
// round, so the child's own session isn't affected. Both players get these
// exact objects, in this order.
export function pickGuestQuestions(mastery) {
  const extra = shuffle(TOPICS).slice(0, GUEST_ROUND - TOPICS.length);
  const topics = shuffle([...TOPICS, ...extra]);
  const used = new Set();
  return topics.map((topic) => {
    const rec = mastery[topic];
    const tier = rec.difficultyLevel || tierFromMastery(rec.masteryScore);
    const q = getQuestion(topic, tier, used);
    if (q && q.source === 'authored' && q.id) used.add(q.id);
    return q;
  }).filter(Boolean);
}

// Who won: more right wins; equal scores go to the faster total time; the
// same time too is a draw. Returns 'child', 'grownUp' or 'draw', and how.
export function guestOutcome(child, grownUp) {
  if (child.correct !== grownUp.correct) {
    return { winner: child.correct > grownUp.correct ? 'child' : 'grownUp', byTime: false };
  }
  if (child.timeMs !== grownUp.timeMs) {
    return { winner: child.timeMs < grownUp.timeMs ? 'child' : 'grownUp', byTime: true };
  }
  return { winner: 'draw', byTime: false };
}

// Test hook for #144's self-check AC: from the browser console,
// (await import('./js/games.js')).testHooks.breakReveal = true
// makes the next reveal fail its replay check on purpose.
export const testHooks = { breakReveal: false };
