// Roadmap #148: the Year 7 topic pack. Five generated topics, tiers 1-5,
// in the same question shape as questionBank.js. Only asked when the
// child taps a Year 7 chip (Settings > Year 7 topics must be on); see
// YEAR7_TOPICS in storage.js for why they're kept out of everything else.
//
// Notation rules (Alex's decisions):
//  - a true minus sign (−) in prompts and explanations, and a negative
//    number straight after an operator is always in brackets: 5 − (−3).
//    A negative at the very start needs none: −4 − 7. Never "−3²".
//  - powers as superscripts, with "to the power of" words as well at
//    tiers 1-2; √ means the positive root only, and only ever of a perfect
//    square (or ∛ of a perfect cube).
//  - probabilities are fractions in simplest form, and the prompt says so.
//  - bracket equations have positive whole-number solutions only; the
//    explanation divides by the number outside first when it divides
//    exactly, and mentions expanding as another way.
// Answers that can be negative are stored with a true minus sign;
// checkAnswer reads it the same as a typed "-".

import { factorTreeSvg } from './diagrams.js';

const MINUS = '−';
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// A number as written anywhere: −5 with a true minus.
export const signed = (n) => (n < 0 ? `${MINUS}${-n}` : String(n));
// A number straight after an operator: bracketed if negative.
export const after = (n) => (n < 0 ? `(${MINUS}${-n})` : String(n));

function q(topic, subtopic, tier, prompt, answer, explanation, extra = {}) {
  return {
    topic, subtopic, difficulty: tier, source: 'generated',
    prompt, answerType: 'numeric', correctAnswer: signed(answer), choices: null,
    explanation, ...extra,
  };
}
function mcq(topic, subtopic, tier, prompt, answer, choices, explanation) {
  return {
    topic, subtopic, difficulty: tier, source: 'generated',
    prompt, answerType: 'mcq', correctAnswer: answer, choices, explanation,
  };
}

// ======================================================================
// Negative numbers
// ======================================================================

function distinctInts(count, min, max, ok = () => true) {
  let out;
  do {
    const set = new Set();
    while (set.size < count) set.add(randInt(min, max));
    out = [...set];
  } while (!ok(out));
  return out;
}

function negT1() {
  const kind = pick(['coldest', 'warmest', 'smallest', 'largest']);
  const temps = kind === 'coldest' || kind === 'warmest';
  const vals = distinctInts(4, -15, 12, (v) => v.filter((n) => n < 0).length >= 2);
  const low = kind === 'coldest' || kind === 'smallest';
  const answer = low ? Math.min(...vals) : Math.max(...vals);
  const show = (n) => (temps ? `${signed(n)}°C` : signed(n));
  const ordered = [...vals].sort((a, b) => a - b).map(show).join(', ');
  const prompt = temps ? `Which temperature is the ${kind}?` : `Which number is the ${kind}?`;
  return mcq('negatives', 'compare', 1, prompt, show(answer), shuffle(vals).map(show),
    `On a number line, numbers get smaller to the left. In order, smallest first: ${ordered}. So the ${kind} is ${show(answer)}`);
}

function negT2() {
  if (Math.random() < 0.5) {
    const start = -randInt(1, 12);
    const rise = randInt(-start + 1, -start + 12);
    const end = start + rise;
    return q('negatives', 'temperature', 2,
      `The temperature is ${signed(start)}°C. It rises by ${rise} degrees. What is the temperature now (in °C)?`, end,
      `${signed(start)} + ${rise} = ${signed(end)}. Count up ${-start} to reach 0, then ${end} more. The temperature is ${signed(end)}°C`);
  }
  const start = randInt(1, 12);
  const fall = randInt(start + 1, start + 12);
  const end = start - fall;
  return q('negatives', 'temperature', 2,
    `The temperature is ${start}°C. It falls by ${fall} degrees. What is the temperature now (in °C)?`, end,
    `${start} ${MINUS} ${fall} = ${signed(end)}. Count down ${start} to reach 0, then ${-end} more. The temperature is ${signed(end)}°C`);
}

function negT3() {
  const kind = pick(['small-minus-big', 'neg-minus', 'neg-plus']);
  if (kind === 'small-minus-big') {
    const a = randInt(0, 12);
    const b = randInt(a + 1, 20);
    return q('negatives', 'answer-negative', 3, `${a} ${MINUS} ${b} = ?`, a - b,
      `Start at ${a} and count down ${b}. ${a === 0 ? '' : `Count down ${a} to reach 0, then ${b - a} more. `}${a} ${MINUS} ${b} = ${signed(a - b)}`);
  }
  if (kind === 'neg-minus') {
    const a = randInt(1, 12);
    const b = randInt(1, 12);
    return q('negatives', 'answer-negative', 3, `${signed(-a)} ${MINUS} ${b} = ?`, -a - b,
      `Start at ${signed(-a)} and count down ${b} more. ${signed(-a)} ${MINUS} ${b} = ${signed(-a - b)}`);
  }
  const a = randInt(2, 15);
  const b = randInt(1, a - 1);
  return q('negatives', 'answer-negative', 3, `${signed(-a)} + ${b} = ?`, -a + b,
    `Start at ${signed(-a)} and count up ${b}. You don’t reach 0, so the answer is still negative. ${signed(-a)} + ${b} = ${signed(b - a)}`);
}

function negT4() {
  const a = randInt(-10, 12);
  const b = randInt(1, 12);
  if (Math.random() < 0.5) {
    return q('negatives', 'add-subtract-negative', 4, `${signed(a)} ${MINUS} ${after(-b)} = ?`, a + b,
      `Taking away a negative is the same as adding. ${signed(a)} ${MINUS} ${after(-b)} = ${signed(a)} + ${b} = ${signed(a + b)}`);
  }
  return q('negatives', 'add-subtract-negative', 4, `${signed(a)} + ${after(-b)} = ?`, a - b,
    `Adding a negative is the same as taking away. ${signed(a)} + ${after(-b)} = ${signed(a)} ${MINUS} ${b} = ${signed(a - b)}`);
}

function negT5() {
  let a;
  let b;
  do {
    a = randInt(-12, 12);
    b = randInt(-12, 12);
  } while (a === 0 || b === 0 || (a > 0 && b > 0) || Math.abs(a) === 1 || Math.abs(b) === 1);
  const signRule = (x, y) => ((x < 0) === (y < 0)
    ? 'The signs are the same, so the answer is positive'
    : 'The signs are different, so the answer is negative');
  if (Math.random() < 0.5) {
    const p = a * b;
    return q('negatives', 'multiply-divide-negative', 5, `${signed(a)} × ${after(b)} = ?`, p,
      `${Math.abs(a)} × ${Math.abs(b)} = ${Math.abs(p)}. ${signRule(a, b)}: ${signed(p)}`);
  }
  // Division, built from the answer so it's always exact.
  const dividend = a * b;
  return q('negatives', 'multiply-divide-negative', 5, `${signed(dividend)} ÷ ${after(b)} = ?`, a,
    `${Math.abs(dividend)} ÷ ${Math.abs(b)} = ${Math.abs(a)}. ${signRule(dividend, b)}: ${signed(a)}`);
}

// ======================================================================
// Powers and roots
// ======================================================================

const SUP = { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const pow = (base, exp) => `${base}${SUP[exp]}`;
const timesItself = (base, exp) => Array(exp).fill(base).join(' × ');
const WORDS = { 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six' };

function powT1() {
  const n = randInt(1, 12);
  return q('powersRoots', 'squares', 1, `What is ${pow(n, 2)} (${n} to the power of 2)?`, n * n,
    `${pow(n, 2)} means ${n} × ${n}. ${n} × ${n} = ${n * n}`);
}

function powT2() {
  if (Math.random() < 0.5) {
    const n = randInt(1, 12);
    return q('powersRoots', 'square-roots', 2, `What is √${n * n}?`, n,
      `√${n * n} asks: what number times itself makes ${n * n}? ${n} × ${n} = ${n * n}, so √${n * n} = ${n}`);
  }
  const n = randInt(1, 5);
  return q('powersRoots', 'cubes', 2, `What is ${pow(n, 3)} (${n} to the power of 3)?`, n ** 3,
    `${pow(n, 3)} means ${timesItself(n, 3)}. ${timesItself(n, 3)} = ${n ** 3}`);
}

function powT3() {
  if (Math.random() < 0.5) {
    const n = randInt(1, 10);
    return q('powersRoots', 'cube-roots', 3, `What is ∛${n ** 3}?`, n,
      `∛${n ** 3} asks: what number times itself three times makes ${n ** 3}? ${timesItself(n, 3)} = ${n ** 3}, so ∛${n ** 3} = ${n}`);
  }
  const [base, exp] = pick([[2, 4], [2, 5], [2, 6], [3, 3], [3, 4], [4, 3], [5, 3], [10, 3], [2, 3], [10, 4]]);
  return q('powersRoots', 'index-form', 3, `What is ${pow(base, exp)}?`, base ** exp,
    `${pow(base, exp)} means ${WORDS[exp]} ${base}s multiplied together: ${timesItself(base, exp)} = ${base ** exp}`);
}

function powT4() {
  const kind = pick(['sum-squares', 'times-root', 'square-minus-root', 'cube-plus-square']);
  if (kind === 'sum-squares') {
    const a = randInt(2, 9);
    const b = randInt(2, 9);
    return q('powersRoots', 'combine', 4, `What is ${pow(a, 2)} + ${pow(b, 2)}?`, a * a + b * b,
      `${pow(a, 2)} = ${a * a}. ${pow(b, 2)} = ${b * b}. ${a * a} + ${b * b} = ${a * a + b * b}`);
  }
  if (kind === 'times-root') {
    const k = randInt(2, 5);
    const n = randInt(2, 12);
    return q('powersRoots', 'combine', 4, `What is ${k} × √${n * n}?`, k * n,
      `√${n * n} = ${n}, because ${n} × ${n} = ${n * n}. ${k} × ${n} = ${k * n}`);
  }
  if (kind === 'square-minus-root') {
    const a = randInt(4, 12);
    const n = randInt(2, Math.min(12, a * a - 1));
    return q('powersRoots', 'combine', 4, `What is ${pow(a, 2)} ${MINUS} √${n * n}?`, a * a - n,
      `${pow(a, 2)} = ${a * a}. √${n * n} = ${n}. ${a * a} ${MINUS} ${n} = ${a * a - n}`);
  }
  const a = randInt(2, 5);
  const b = randInt(2, 9);
  return q('powersRoots', 'combine', 4, `What is ${pow(a, 3)} + ${pow(b, 2)}?`, a ** 3 + b * b,
    `${pow(a, 3)} = ${timesItself(a, 3)} = ${a ** 3}. ${pow(b, 2)} = ${b * b}. ${a ** 3} + ${b * b} = ${a ** 3 + b * b}`);
}

function powT5() {
  const kind = pick(['k-times-square', 'bracket-square', 'square-minus-product', 'between']);
  if (kind === 'k-times-square') {
    const k = randInt(2, 6);
    const a = randInt(2, 9);
    return q('powersRoots', 'order-of-operations', 5, `What is ${k} × ${pow(a, 2)}?`, k * a * a,
      `Powers come before multiplying. ${pow(a, 2)} = ${a * a}. Then ${k} × ${a * a} = ${k * a * a}`);
  }
  if (kind === 'bracket-square') {
    const a = randInt(1, 7);
    const b = randInt(1, 7);
    return q('powersRoots', 'order-of-operations', 5, `What is (${a} + ${b})${SUP[2]}?`, (a + b) ** 2,
      `Brackets first: ${a} + ${b} = ${a + b}. Then ${pow(a + b, 2)} = ${a + b} × ${a + b} = ${(a + b) ** 2}`);
  }
  if (kind === 'square-minus-product') {
    let a; let k; let b;
    do {
      a = randInt(4, 12); k = randInt(2, 5); b = randInt(2, 9);
    } while (a * a - k * b <= 0);
    return q('powersRoots', 'order-of-operations', 5, `What is ${pow(a, 2)} ${MINUS} ${k} × ${b}?`, a * a - k * b,
      `Powers first: ${pow(a, 2)} = ${a * a}. Then multiply: ${k} × ${b} = ${k * b}. Then take away: ${a * a} ${MINUS} ${k * b} = ${a * a - k * b}`);
  }
  // √N between two whole numbers, N not a perfect square (Alex: yes, at T5).
  let n;
  do { n = randInt(2, 150); } while (Number.isInteger(Math.sqrt(n)));
  const lo = Math.floor(Math.sqrt(n));
  const opt = (x) => `${x} and ${x + 1}`;
  const others = [lo - 1, lo + 1, lo + 2, lo - 2, lo + 3].filter((x) => x >= 1).slice(0, 3);
  return mcq('powersRoots', 'root-between', 5, `√${n} is between which two whole numbers?`, opt(lo),
    shuffle([opt(lo), ...others.map(opt)]),
    `${pow(lo, 2)} = ${lo * lo} and ${pow(lo + 1, 2)} = ${(lo + 1) ** 2}. ${n} is between ${lo * lo} and ${(lo + 1) ** 2}, so √${n} is between ${lo} and ${lo + 1}`);
}

// ======================================================================
// Primes and factors
// ======================================================================

export function isPrime(n) {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d += 1) if (n % d === 0) return false;
  return true;
}
function smallestFactor(n) {
  for (let d = 2; d * d <= n; d += 1) if (n % d === 0) return d;
  return n;
}
export function primeFactors(n) {
  const out = [];
  let m = n;
  for (let d = 2; m > 1; d += 1) {
    while (m % d === 0) { out.push(d); m /= d; }
  }
  return out;
}
const PRIMES_TO_50 = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
const NOT_PRIMES = [4, 6, 8, 9, 10, 12, 14, 15, 16, 18, 20, 21, 22, 24, 25, 26, 27, 28, 32, 33, 34, 35, 38, 39, 45, 49, 51];
const whyNotPrime = (n) => (n === 1
  ? '1 is not prime: a prime has exactly two factors'
  : `${n} = ${smallestFactor(n)} × ${n / smallestFactor(n)}, so ${n} is not prime`);

function primeT1() {
  const p = pick(PRIMES_TO_50);
  // 1 turns up as a trick distractor about a third of the time (Alex).
  const pool = shuffle(NOT_PRIMES);
  const distractors = Math.random() < 1 / 3 ? [1, ...pool.slice(0, 2)] : pool.slice(0, 3);
  const why = distractors.map(whyNotPrime).join('. ');
  const primeWhy = p === 2
    ? '2 is prime: its only factors are 1 and 2. It’s the only even prime'
    : `${p} is prime: its only factors are 1 and ${p}`;
  // The numbers are in the prompt too, so every question reads differently
  // (and "Try one like it" can tell two apart).
  const choices = shuffle([p, ...distractors]).map(String);
  return mcq('primes', 'is-it-prime', 1, `Which of these numbers is prime: ${choices.slice(0, 3).join(', ')} or ${choices[3]}?`, String(p),
    choices, `${why}. ${primeWhy}. So the prime is ${p}`);
}

function primeT2() {
  const n = randInt(2, 96);
  let next = n + 1;
  while (!isPrime(next)) next += 1;
  const checks = [];
  for (let m = n + 1; m < next; m += 1) checks.push(`${m} = ${smallestFactor(m)} × ${m / smallestFactor(m)}`);
  const lead = checks.length ? `${checks.join('. ')}. ` : '';
  return q('primes', 'next-prime', 2, `What is the next prime number after ${n}?`, next,
    `${lead}${next} has no factors except 1 and ${next}, so the next prime after ${n} is ${next}`);
}

// Factor-tree children: a prime, or a product of two primes.
const TREE_PARTS = [2, 3, 5, 7, 4, 6, 9, 10, 14, 15, 21, 25];
function treeOf(n) {
  if (isPrime(n)) return { value: n };
  const f = smallestFactor(n);
  return { value: n, children: [{ value: f }, { value: n / f }] };
}

function primeT3() {
  let a; let b;
  do {
    a = pick(TREE_PARTS); b = pick(TREE_PARTS);
  } while (a * b > 200 || (isPrime(a) && isPrime(b)));
  const tree = { value: a * b, children: [treeOf(a), treeOf(b)] };
  const paths = [''];
  tree.children.forEach((c, i) => {
    paths.push(String(i));
    (c.children || []).forEach((_, j) => paths.push(`${i}${j}`));
  });
  const missing = pick(paths);
  const at = (path) => path.split('').reduce((node, i) => node.children[Number(i)], tree);
  const node = at(missing);
  let explanation;
  if (missing === '') {
    explanation = `The top number is the two numbers under it multiplied: ${a} × ${b} = ${a * b}`;
  } else if (node.children) {
    const [x, y] = node.children.map((c) => c.value);
    explanation = `The missing number splits into ${x} and ${y}, so it is ${x} × ${y} = ${node.value}`;
  } else {
    const parent = at(missing.slice(0, -1));
    const sibling = parent.children[1 - Number(missing.slice(-1))];
    explanation = `${parent.value} splits into ${sibling.value} and the missing number. ${parent.value} ÷ ${sibling.value} = ${node.value}`;
  }
  // Named in the prompt so each tree reads differently in the lists of
  // mistakes (#127, #128), where the picture isn't shown.
  const prompt = missing === ''
    ? `What is the number at the top of this factor tree? It splits into ${a} and ${b}.`
    : `This is a factor tree for ${a * b}. What number is missing?`;
  return q('primes', 'factor-tree', 3, prompt, node.value, explanation,
    { diagramSvg: factorTreeSvg(tree, missing, isPrime) });
}

const FACTORISE = [];
for (let n = 12; n <= 200; n += 1) if (primeFactors(n).length >= 3) FACTORISE.push(n);
const product = (arr) => arr.reduce((p, x) => p * x, 1);
const asProduct = (arr) => arr.join(' × ');

function primeT4() {
  const n = pick(FACTORISE);
  const fs = primeFactors(n); // ascending
  const answer = asProduct(fs);
  const wrong = new Set();
  // Right value but not all prime: a two-number split, or the primes with
  // two of them multiplied together.
  const splits = [];
  for (let d = 2; d * d <= n; d += 1) if (n % d === 0 && !(isPrime(d) && isPrime(n / d))) splits.push([d, n / d]);
  splits.forEach((s) => wrong.add(asProduct(s)));
  wrong.add(asProduct([fs[0], ...[product(fs.slice(1, 3)), ...fs.slice(3)].sort((x, y) => x - y)]));
  // All prime but the wrong value: one prime left out, or the biggest one
  // swapped for the next prime up.
  wrong.add(asProduct(fs.slice(0, -1)));
  let up = fs[fs.length - 1] + 1;
  while (!isPrime(up)) up += 1;
  wrong.add(asProduct([...fs.slice(0, -1), up]));
  wrong.delete(answer);
  // A choice is only a distractor if it isn't a true prime factorisation of
  // n in any order (so exactly one choice is correct).
  const isCorrect = (text) => {
    const parts = text.split(' × ').map(Number);
    return parts.every(isPrime) && product(parts) === n;
  };
  const distractors = shuffle([...wrong].filter((w) => !isCorrect(w))).slice(0, 3);
  const steps = [];
  let m = n;
  fs.forEach((f) => { if (m > f) { steps.push(`${m} ÷ ${f} = ${m / f}`); m /= f; } });
  return mcq('primes', 'prime-factorisation', 4, `Which is ${n} written as a product of prime factors?`, answer,
    shuffle([answer, ...distractors]),
    `Keep dividing by primes: ${steps.join(', ')}, and ${fs[fs.length - 1]} is prime. So ${n} = ${answer}`);
}

// Primes shared by both lists, with repeats (the HCF's primes).
function sharedFactors(fa, fb) {
  const rest = [...fb];
  const out = [];
  fa.forEach((f) => {
    const i = rest.indexOf(f);
    if (i !== -1) { out.push(f); rest.splice(i, 1); }
  });
  return out;
}

// One number's line in an HCF/LCM explanation: its prime factors, or just
// "11 is prime" (never the empty-looking "11 = 11").
const factorLine = (n) => {
  const fs = primeFactors(n);
  return fs.length === 1 ? `${n} is prime` : `${n} = ${asProduct(fs)}`;
};

function primeT5() {
  if (Math.random() < 0.5) {
    let a; let b;
    do {
      a = randInt(12, 99); b = randInt(12, 99);
    } while (a === b || gcd(a, b) < 2 || a % b === 0 || b % a === 0);
    const h = gcd(a, b);
    const shared = sharedFactors(primeFactors(a), primeFactors(b));
    return q('primes', 'hcf', 5, `What is the highest common factor (HCF) of ${a} and ${b}?`, h,
      `${factorLine(a)}. ${factorLine(b)}. They share ${asProduct(shared)}${shared.length > 1 ? ` = ${h}` : ''}. So the HCF is ${h}`);
  }
  let a; let b;
  do {
    a = randInt(4, 20); b = randInt(4, 20);
  } while (a === b || a % b === 0 || b % a === 0 || gcd(a, b) === 1 && a * b > 120);
  const l = (a * b) / gcd(a, b);
  const fa = primeFactors(a);
  const fb = primeFactors(b);
  // Each prime as many times as it appears in whichever number has most.
  const primes = [...new Set([...fa, ...fb])].sort((x, y) => x - y);
  const lcmFactors = primes.flatMap((p) => Array(Math.max(fa.filter((f) => f === p).length, fb.filter((f) => f === p).length)).fill(p));
  return q('primes', 'lcm', 5, `What is the lowest common multiple (LCM) of ${a} and ${b}?`, l,
    `${factorLine(a)}. ${factorLine(b)}. Use each prime the most times it appears in either number: ${asProduct(lcmFactors)} = ${l}. So the LCM is ${l}`);
}

// ======================================================================
// Probability
// ======================================================================

export const PROB_WORDS = ['impossible', 'unlikely', 'even chance', 'likely', 'certain'];
const SIMPLEST = '(as a fraction in its simplest form)';
function fracText(num, den) {
  const g = gcd(num, den);
  return `${num / g}/${den / g}`;
}
function fracQ(subtopic, tier, prompt, num, den, explanation) {
  const g = gcd(num, den);
  return {
    topic: 'probability', subtopic, difficulty: tier, source: 'generated',
    prompt, answerType: 'text', correctAnswer: `${num / g}/${den / g}`, choices: null,
    // #97: the exact value, so 6/16 or 0.375 for 3/8 gets "Right number!".
    answerForm: { form: 'fraction', num: num / g, den: den / g },
    explanation,
  };
}

// "1 blue counter", "3 blue counters".
const counters = (n, colour) => `${n} ${colour} counter${n === 1 ? '' : 's'}`;

function probT1() {
  const word = pick(PROB_WORDS);
  let prompt;
  let why;
  if (Math.random() < 0.5) {
    // A bag of counters: red against blue.
    let red; let blue;
    if (word === 'impossible') { red = 0; blue = randInt(3, 12); }
    else if (word === 'certain') { red = randInt(3, 12); blue = 0; }
    else if (word === 'even chance') { red = randInt(2, 8); blue = red; }
    else if (word === 'likely') { blue = randInt(1, 4); red = randInt(2 * blue, 12); }
    else { red = randInt(1, 4); blue = randInt(2 * red, 12); }
    const contents = [red ? counters(red, 'red') : '', blue ? counters(blue, 'blue') : ''].filter(Boolean).join(' and ');
    prompt = `A bag has ${contents}. You pick one without looking. How likely is it to be red?`;
    const total = red + blue;
    if (word === 'impossible') why = 'There are no red counters, so it can’t happen: impossible';
    else if (word === 'certain') why = 'Every counter is red, so it will definitely happen: certain';
    else if (word === 'even chance') why = `Half the counters are red (${red} out of ${total}): even chance`;
    else if (word === 'likely') why = `${red} out of ${total} are red, which is more than half: likely`;
    else why = `Only ${red} out of ${total} ${red === 1 ? 'is' : 'are'} red, which is less than half: unlikely`;
  } else {
    const events = {
      impossible: ['a 7', 'There is no 7 on a dice, so it can’t happen: impossible'],
      unlikely: ['a 6', 'Only 1 of the 6 numbers is a 6, which is less than half: unlikely'],
      'even chance': ['an even number', '3 of the 6 numbers (2, 4, 6) are even, which is exactly half: even chance'],
      likely: ['a number less than 6', '5 of the 6 numbers are less than 6, which is more than half: likely'],
      certain: ['a number from 1 to 6', 'Every roll is a number from 1 to 6: certain'],
    };
    prompt = `You roll a normal dice. How likely is it to land on ${events[word][0]}?`;
    why = events[word][1];
  }
  return mcq('probability', 'probability-words', 1, prompt, word, [...PROB_WORDS], why);
}

function probT2() {
  const red = randInt(1, 9);
  const blue = randInt(1, 9);
  const askRed = Math.random() < 0.5;
  const want = askRed ? red : blue;
  const total = red + blue;
  const colour = askRed ? 'red' : 'blue';
  const simplified = fracText(want, total);
  const tail = simplified === `${want}/${total}` ? '' : `, which simplifies to ${simplified}`;
  return fracQ('single-event', 2,
    `A bag has ${counters(red, 'red')} and ${counters(blue, 'blue')}. You pick one without looking. What is the probability it is ${colour}? ${SIMPLEST}`,
    want, total,
    `There ${want === 1 ? 'is' : 'are'} ${counters(want, colour)} out of ${red} + ${blue} = ${total}. The probability is ${want}/${total}${tail}. Answer: ${simplified}`);
}

function probT3() {
  const options = [];
  const diceEvents = [
    ['an even number', (n) => n % 2 === 0], ['an odd number', (n) => n % 2 === 1],
    ['a number greater than 4', (n) => n > 4], ['a number less than 3', (n) => n < 3],
    ['a multiple of 3', (n) => n % 3 === 0], ['a factor of 6', (n) => 6 % n === 0],
    ['a prime number', isPrime], ['a number greater than 2', (n) => n > 2],
  ];
  diceEvents.forEach(([label, test]) => options.push({ where: 'You roll a normal dice.', thing: 'it lands on', label, n: 6, test }));
  [8, 10, 12].forEach((n) => {
    [['an even number', (x) => x % 2 === 0], ['a multiple of 3', (x) => x % 3 === 0], ['a multiple of 4', (x) => x % 4 === 0],
      ['a number greater than 6', (x) => x > 6], ['a prime number', isPrime]].forEach(([label, test]) => {
      options.push({ where: `A spinner has ${n} equal sections numbered 1 to ${n}. You spin it once.`, thing: 'it lands on', label, n, test });
    });
  });
  // Only events whose fraction needs simplifying, as the tier says.
  const usable = options.map((o) => {
    const hits = [];
    for (let x = 1; x <= o.n; x += 1) if (o.test(x)) hits.push(x);
    return { ...o, hits };
  }).filter((o) => o.hits.length > 0 && o.hits.length < o.n && gcd(o.hits.length, o.n) > 1);
  const o = pick(usable);
  const k = o.hits.length;
  return fracQ('dice-and-spinners', 3,
    `${o.where} What is the probability ${o.thing} ${o.label}? ${SIMPLEST}`, k, o.n,
    `The numbers that work are ${o.hits.join(', ')}: that’s ${k} out of ${o.n}. ${k}/${o.n} simplifies to ${fracText(k, o.n)}. Answer: ${fracText(k, o.n)}`);
}

function probT4() {
  let a; let d;
  do { d = randInt(5, 12); a = randInt(1, d - 1); } while (gcd(a, d) !== 1);
  const scene = pick([
    ['it rains tomorrow', 'it does not rain tomorrow'],
    ['a train is late', 'the train is not late'],
    ['you pick a red sweet', 'you do not pick a red sweet'],
    ['the spinner lands on blue', 'the spinner does not land on blue'],
  ]);
  return fracQ('not-happening', 4,
    `The probability that ${scene[0]} is ${a}/${d}. What is the probability that ${scene[1]}? ${SIMPLEST}`, d - a, d,
    `Something either happens or it doesn’t, so the two probabilities add up to 1. 1 ${MINUS} ${a}/${d} = ${d}/${d} ${MINUS} ${a}/${d} = ${fracText(d - a, d)}. Answer: ${fracText(d - a, d)}`);
}

function probT5() {
  const kind = pick(['dice-one', 'dice-even', 'dice-big', 'coin', 'spinner']);
  let prompt; let p; let trials; let what;
  if (kind === 'coin') {
    trials = 2 * randInt(10, 50);
    p = [1, 2];
    prompt = `You flip a fair coin ${trials} times. How many heads would you expect?`;
    what = 'heads';
  } else if (kind === 'spinner') {
    const k = pick([4, 5, 8, 10]);
    trials = k * randInt(4, 12);
    p = [1, k];
    prompt = `A spinner has ${k} equal sections and one of them is blue. You spin it ${trials} times. How many times would you expect it to land on blue?`;
    what = 'blue';
  } else {
    trials = 6 * randInt(5, 20);
    const face = randInt(1, 6);
    if (kind === 'dice-one') { p = [1, 6]; what = `a ${face}`; }
    else if (kind === 'dice-even') { p = [1, 2]; what = 'an even number'; }
    else { p = [1, 3]; what = 'a number greater than 4'; }
    prompt = `You roll a fair dice ${trials} times. How many times would you expect to roll ${what}?`;
  }
  const expected = (trials * p[0]) / p[1];
  return q('probability', 'expected-frequency', 5, prompt, expected,
    `The probability of ${what} is ${p[0]}/${p[1]}. ${trials} × ${p[0]}/${p[1]} = ${trials} ÷ ${p[1]} = ${expected}. You’d expect ${expected}, though in real life the count can be a few more or a few less. Answer: ${expected}`);
}

// ======================================================================
// Equations with brackets
// ======================================================================

const xTerm = (coef) => (coef === 1 ? 'x' : `${coef}x`);

function brT1() {
  const a = randInt(2, 9);
  const b = randInt(1, 12);
  if (Math.random() < 0.5) {
    const x = randInt(1, 12);
    return q('bracketEquations', 'substitute', 1, `Work out ${a}(x + ${b}) when x = ${x}.`, a * (x + b),
      `${a}(x + ${b}) means ${a} × (x + ${b}). First the bracket: ${x} + ${b} = ${x + b}. Then ${a} × ${x + b} = ${a * (x + b)}`);
  }
  const x = randInt(b + 1, b + 12);
  return q('bracketEquations', 'substitute', 1, `Work out ${a}(x ${MINUS} ${b}) when x = ${x}.`, a * (x - b),
    `${a}(x ${MINUS} ${b}) means ${a} × (x ${MINUS} ${b}). First the bracket: ${x} ${MINUS} ${b} = ${x - b}. Then ${a} × ${x - b} = ${a * (x - b)}`);
}

function brT2() {
  const a = randInt(2, 9);
  const b = randInt(1, 12);
  const x = randInt(1, 12);
  const c = a * (x + b);
  return q('bracketEquations', 'bracket-plus', 2, `${a}(x + ${b}) = ${c}. What is x?`, x,
    `Divide both sides by ${a}: x + ${b} = ${c} ÷ ${a} = ${x + b}. Take ${b} from both sides: x = ${x + b} ${MINUS} ${b} = ${x}. Another way is to multiply out the bracket first: ${a}x + ${a * b} = ${c}. Take ${a * b} from both sides: ${a}x = ${c - a * b}. Divide by ${a}: x = ${x}`);
}

function brT3() {
  const a = randInt(2, 9);
  const b = randInt(1, 12);
  const x = randInt(b + 1, b + 12); // x − b is at least 1, so everything stays positive
  const c = a * (x - b);
  return q('bracketEquations', 'bracket-minus', 3, `${a}(x ${MINUS} ${b}) = ${c}. What is x?`, x,
    `Divide both sides by ${a}: x ${MINUS} ${b} = ${c} ÷ ${a} = ${x - b}. Add ${b} to both sides: x = ${x - b} + ${b} = ${x}. Another way is to multiply out the bracket first: ${a}x ${MINUS} ${a * b} = ${c}. Add ${a * b} to both sides: ${a}x = ${c + a * b}. Divide by ${a}: x = ${x}`);
}

function brT4() {
  const a = randInt(2, 9);
  const b = randInt(1, 10);
  const d = randInt(1, 20);
  const x = randInt(1, 12);
  const e = a * (x + b) + d;
  return q('bracketEquations', 'bracket-plus-number', 4, `${a}(x + ${b}) + ${d} = ${e}. What is x?`, x,
    `Take ${d} from both sides: ${a}(x + ${b}) = ${e} ${MINUS} ${d} = ${e - d}. Divide both sides by ${a}: x + ${b} = ${(e - d) / a}. Take ${b} from both sides: x = ${(e - d) / a} ${MINUS} ${b} = ${x}`);
}

function brT5() {
  let a; let b; let c; let d; let x;
  do {
    c = randInt(2, 5);
    a = randInt(c + 1, c + 4);
    x = randInt(1, 12);
    b = randInt(1, 8);
    d = ((a - c) * x + a * b) / c; // from a(x + b) = c(x + d)
  } while (!Number.isInteger(d) || d < 1 || d === b);
  const k = a - c;
  const rhs = c * d - a * b;
  // With 1x left there's nothing to divide by: the line before is the answer.
  const last = k === 1 ? '' : ` Divide both sides by ${k}: x = ${rhs} ÷ ${k} = ${x}`;
  return q('bracketEquations', 'brackets-both-sides', 5, `${a}(x + ${b}) = ${c}(x + ${d}). What is x?`, x,
    `Multiply out both brackets: ${a}x + ${a * b} = ${c}x + ${c * d}. Take ${c}x from both sides: ${xTerm(k)} + ${a * b} = ${c * d}. Take ${a * b} from both sides: ${xTerm(k)} = ${rhs}.${last}`);
}

// ======================================================================

const byTier = (fns) => (tier) => fns[tier - 1]();
export const YEAR7_GENERATORS = {
  negatives: byTier([negT1, negT2, negT3, negT4, negT5]),
  powersRoots: byTier([powT1, powT2, powT3, powT4, powT5]),
  primes: byTier([primeT1, primeT2, primeT3, primeT4, primeT5]),
  probability: byTier([probT1, probT2, probT3, probT4, probT5]),
  bracketEquations: byTier([brT1, brT2, brT3, brT4, brT5]),
};
