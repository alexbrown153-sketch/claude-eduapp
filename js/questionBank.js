// Procedural question generators for arithmetic, fractions/decimals/percentages,
// geometry, ratio, algebra, and data handling, tiered 1-5 per SPEC.md §12. Word
// problems are hand-authored and live in wordProblems.js; getQuestion() dispatches
// to whichever the topic needs.
//
// Roadmap ideas.md #80: this is the app's sole question source again — every
// topic auto-populates on its own, with difficulty rising as the child's
// mastery of that topic improves (selectDifficultyTier in mastery.js), and
// nothing here depends on PDF import (see pdfQuestions.js/
// examberryPdfParser.js, whose Import screen nav entry is now hidden rather
// than deleted — see index.html's #nav-import-btn). This is a reversal of a
// same-day PDF-import-only experiment (#77) and its later generation-as-
// filler hybrid — see project_imported_only_questions in memory for the
// full history if this area needs revisiting again.

import { getWordProblem } from './wordProblems.js';
import { genCoordinates } from './coordinates.js';
import { rectangleSvg, lShapeSvg, twoCornersSvg, barModelSvg } from './diagrams.js';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function gcd(a, b) {
  return b === 0 ? a : gcd(b, a % b);
}
function simplifyFrac(num, den) {
  const g = gcd(Math.abs(num), Math.abs(den)) || 1;
  return { num: num / g, den: den / g };
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
// A fraction whose denominator is 1 is a whole number, so it's stored and
// shown as one ("1", not "1/1"): the child types the whole number and is
// marked right, and the answer they're shown matches what they'd write.
function formatFrac(num, den) {
  if (num === 0) return '0';
  if (den === 1) return String(num);
  return `${num}/${den}`;
}
// The tail of a worked explanation: the unsimplified result, then its
// simplest form — but only when simplifying actually changes it, so an
// answer already in simplest form isn't repeated ("3/10 = 3/10").
function fracWorking(num, den) {
  const raw = `${num}/${den}`;
  const s = simplifyFrac(num, den);
  const simplest = formatFrac(s.num, s.den);
  return simplest === raw ? raw : `${raw} = ${simplest}`;
}
// Mixed numbers ("1 5/12") aren't accepted as answers (Alex's decision), so
// when the answer is an improper fraction the prompt says so up front. A
// whole-number answer isn't a fraction at all, so it keeps the plain wording.
function isImproper(s) {
  return s.den > 1 && s.num > s.den;
}
function simplestFormHint(s) {
  return isImproper(s) ? '(simplest form, as an improper fraction)' : '(simplest form)';
}
// Extra fields for a question whose answer is the simplified fraction `s`,
// spread into the question:
//  - answerForm (#97): the form wanted and the exact value, so an answer
//    with the right value in the wrong form (0.3 for 3/10) can get one more
//    try instead of "Not quite".
//  - answerHint (#123): the "Type it like this: 7/5" line under the prompt,
//    for improper-fraction answers only. It's its own field, not part of the
//    prompt, so the prompt that "Try one like it" and later lists reuse
//    stays as it is.
function fractionAnswerFields(s) {
  let form = 'fraction';
  if (s.den === 1 || s.num === 0) form = 'whole';
  else if (isImproper(s)) form = 'improper-fraction';
  const fields = { answerForm: { form, num: s.num, den: s.den } };
  if (form === 'improper-fraction') fields.answerHint = typeItLike('improper-fraction', formatFrac(s.num, s.den));
  return fields;
}

// ---------- Answer shapes (Roadmaps #123 and #133; #97 will share these) ----------

// What kind of typed answer a correct answer is, so every "how do I type
// this?" hint agrees: 'remainder' ("12 r 3"), 'improper-fraction' ("7/5"),
// 'fraction' ("3/4"), or null for anything else.
export function answerShape(correctAnswer) {
  const s = String(correctAnswer).replace(/\s+/g, '').toLowerCase();
  if (/^\d+r\d+$/.test(s)) return 'remainder';
  const m = s.match(/^(\d+)\/(\d+)$/);
  if (m) return Number(m[1]) > Number(m[2]) ? 'improper-fraction' : 'fraction';
  return null;
}

// The example answer shown for a shape, and a fallback for when the example
// would be this question's own answer: an example must never give the
// answer away. Compared ignoring spaces, as marking does.
const SHAPE_EXAMPLES = {
  fraction: ['3/4', '2/3'],
  'improper-fraction': ['7/5', '9/4'],
  remainder: ['9 r 1', '7 r 2'],
};
export function answerShapeExample(shape, correctAnswer) {
  const [example, fallback] = SHAPE_EXAMPLES[shape];
  const bare = (x) => String(x).replace(/\s+/g, '').toLowerCase();
  return bare(example) === bare(correctAnswer) ? fallback : example;
}

// "Type it like this: 7/5" — the one wording for every example (#123, #97).
export function typeItLike(shape, correctAnswer) {
  return `Type it like this: ${answerShapeExample(shape, correctAnswer)}`;
}

// Roadmap #97: the line under "Right number!" when the value typed was right
// but its form wasn't. `typed` is what was typed: 'decimal' or 'fraction'
// (see classifyAnswer in session.js). Every example comes from the shared
// list above, so it matches #123's caption and #133's tip.
export function rightFormHint(question, typed) {
  const { form } = question.answerForm;
  const answer = question.correctAnswer;
  if (form === 'whole') return 'Write it as a whole number.';
  if (form === 'remainder') return `This one needs a remainder. ${typeItLike('remainder', answer)}`;
  // A fraction was wanted and a fraction was typed, with the right value:
  // the only thing wrong is that it isn't simplified.
  if (typed === 'fraction') return 'Now write it in its simplest form.';
  if (form === 'improper-fraction') return `This one needs a top-heavy fraction. ${typeItLike('improper-fraction', answer)}`;
  return `This one needs a fraction. ${typeItLike('fraction', answer)}`;
}

// ---------- Explanations as steps (Roadmap #124) ----------

// Splits a worked explanation into steps at each sentence boundary (a full
// stop followed by a space) and at line breaks; the separating ". " itself
// is dropped. A decimal point never has a space after it, so 3.14 or £12.50
// is never split. Reusable for a later "Hint" (first step only).
export function splitExplanationSteps(text) {
  return String(text || '')
    .split(/\.\s+|\n+/)
    .map((step) => step.trim())
    .filter(Boolean);
}

// ---------- Arithmetic ----------

function makeArith(promptExpr, answer, tier, explanation, subtopic = 'mixed') {
  return {
    topic: 'arithmetic', subtopic, difficulty: tier, source: 'generated',
    prompt: `${promptExpr} = ?`, answerType: 'numeric',
    correctAnswer: String(answer), choices: null, explanation,
  };
}

function arithT1() {
  const op = pick(['+', '-']);
  let a = randInt(1, 9);
  let b = randInt(1, 9);
  if (op === '-' && b > a) [a, b] = [b, a];
  const answer = op === '+' ? a + b : a - b;
  return makeArith(`${a} ${op} ${b}`, answer, 1, `${a} ${op} ${b} = ${answer}`);
}

function arithT2() {
  const op = pick(['+', '-', '×']);
  if (op === '×') {
    const a = randInt(2, 12);
    const b = randInt(2, 9);
    return makeArith(`${a} × ${b}`, a * b, 2, `${a} × ${b} = ${a * b}`);
  }
  let a = randInt(10, 99);
  let b = randInt(10, 99);
  if (op === '-' && b > a) [a, b] = [b, a];
  const answer = op === '+' ? a + b : a - b;
  return makeArith(`${a} ${op} ${b}`, answer, 2, `${a} ${op} ${b} = ${answer}`);
}

function arithT3() {
  const op = pick(['+', '-', '÷']);
  if (op === '÷') {
    const divisor = randInt(2, 12);
    const quotient = randInt(2, 20);
    const dividend = divisor * quotient;
    return makeArith(`${dividend} ÷ ${divisor}`, quotient, 3,
      `${dividend} ÷ ${divisor} = ${quotient} (${divisor} × ${quotient} = ${dividend})`, 'division');
  }
  let a = randInt(100, 999);
  let b = randInt(100, 999);
  if (op === '-' && b > a) [a, b] = [b, a];
  const answer = op === '+' ? a + b : a - b;
  return makeArith(`${a} ${op} ${b}`, answer, 3, `${a} ${op} ${b} = ${answer}`);
}

function arithT4() {
  const a = randInt(2, 12);
  const b = randInt(2, 12);
  const c = randInt(2, 12);
  const variant = pick(['mulAdd', 'addMul', 'bracket']);
  let prompt;
  let answer;
  let explanation;
  if (variant === 'mulAdd') {
    answer = a * b + c;
    prompt = `${a} × ${b} + ${c}`;
    explanation = `Multiply first: ${a} × ${b} = ${a * b}, then add ${c} = ${answer}`;
  } else if (variant === 'addMul') {
    answer = a + b * c;
    prompt = `${a} + ${b} × ${c}`;
    explanation = `Multiply first: ${b} × ${c} = ${b * c}, then add ${a} = ${answer}`;
  } else {
    answer = (a + b) * c;
    prompt = `(${a} + ${b}) × ${c}`;
    explanation = `Brackets first: ${a} + ${b} = ${a + b}, then × ${c} = ${answer}`;
  }
  return makeArith(prompt, answer, 4, explanation, 'order-of-operations');
}

function arithT5() {
  const divisor = randInt(3, 12);
  const quotient = randInt(5, 20);
  const remainder = randInt(1, divisor - 1);
  const dividend = divisor * quotient + remainder;
  const answer = `${quotient} r ${remainder}`;
  // The same example as the r-key tip (#133), and never this question's own
  // answer (a fixed "e.g. 12 r 3" used to give 51 ÷ 4 away).
  const example = answerShapeExample('remainder', answer);
  return {
    topic: 'arithmetic', subtopic: 'division', difficulty: 5, source: 'generated',
    prompt: `${dividend} ÷ ${divisor} = ? (give as "quotient r remainder", e.g. "${example}")`,
    answerType: 'text', correctAnswer: answer, choices: null,
    // #97: the exact value, so 16.625 or 133/8 for 16 r 5 can be recognised
    // as the right number (the answer alone doesn't say what the divisor was).
    answerForm: { form: 'remainder', num: dividend, den: divisor },
    explanation: `${divisor} × ${quotient} = ${dividend - remainder}. Remainder = ${dividend} - ${dividend - remainder} = ${remainder}. Answer: ${quotient} r ${remainder}`,
  };
}

function genArithmetic(tier) {
  return { 1: arithT1, 2: arithT2, 3: arithT3, 4: arithT4, 5: arithT5 }[tier]();
}

// ---------- Fractions / Decimals / Percentages ----------

const COMMON_FRACTIONS = [
  { num: 1, den: 2 }, { num: 1, den: 4 }, { num: 3, den: 4 }, { num: 1, den: 5 },
  { num: 2, den: 5 }, { num: 3, den: 5 }, { num: 4, den: 5 }, { num: 1, den: 10 },
  { num: 3, den: 10 }, { num: 7, den: 10 }, { num: 1, den: 20 }, { num: 1, den: 8 },
  { num: 3, den: 8 },
];

function fdpT1() {
  const f = pick(COMMON_FRACTIONS);
  // Exact, never rounded: every denominator in COMMON_FRACTIONS divides 1000,
  // so 1/8 is 0.125 = 12.5% (not 13%). Multiplying before dividing keeps
  // floating point out of it (1/20 × 100 would give 5.000000000000001).
  const percent = (f.num * 100) / f.den;
  const decimal = f.num / f.den;
  const decoys = new Set([percent]);
  let attempts = 0;
  while (decoys.size < 4 && attempts < 30) {
    attempts += 1;
    const delta = pick([-25, -20, -10, -5, 5, 10, 20, 25]);
    const d = percent + delta;
    if (d > 0 && d < 100) decoys.add(d);
  }
  const choices = shuffle([...decoys]).map(String);
  return {
    topic: 'fdp', subtopic: 'equivalence', difficulty: 1, source: 'generated',
    prompt: `What is ${f.num}/${f.den} as a percentage?`,
    answerType: 'mcq', correctAnswer: String(percent), choices,
    explanation: `${f.num}/${f.den} = ${decimal} = ${percent}%`,
  };
}

function fdpT2() {
  if (Math.random() < 0.5) {
    const den = pick([4, 5, 6, 8, 10]);
    const op = pick(['+', '-']);
    let a;
    let b;
    // Roadmap #125: a subtraction of equal numerators comes out as 0 ("take
    // away everything"), so pick again.
    do {
      a = randInt(1, den - 1);
      b = randInt(1, den - 1);
    } while (op === '-' && a === b);
    if (op === '-' && b > a) [a, b] = [b, a];
    const resultNum = op === '+' ? a + b : a - b;
    const simplified = simplifyFrac(resultNum, den);
    return {
      topic: 'fdp', subtopic: 'fractions', difficulty: 2, source: 'generated',
      prompt: `${a}/${den} ${op} ${b}/${den} = ? ${simplestFormHint(simplified)}`,
      answerType: 'text', correctAnswer: formatFrac(simplified.num, simplified.den), choices: null,
      ...fractionAnswerFields(simplified),
      explanation: `${a}/${den} ${op} ${b}/${den} = ${fracWorking(resultNum, den)}`,
    };
  }
  const percent = pick([10, 20, 25, 50, 75]);
  const base = pick([20, 40, 60, 80, 100, 200, 400]);
  const answer = (percent / 100) * base;
  return {
    topic: 'fdp', subtopic: 'percentages', difficulty: 2, source: 'generated',
    prompt: `What is ${percent}% of ${base}?`,
    answerType: 'numeric', correctAnswer: String(answer), choices: null,
    explanation: `${percent}% of ${base} = (${percent}/100) × ${base} = ${answer}`,
  };
}

function fdpT3Frac() {
  const denPairs = [[2, 3], [3, 4], [2, 5], [4, 5], [3, 5], [2, 7]];
  let [d1, d2] = pick(denPairs);
  let a = randInt(1, d1 - 1);
  let b = randInt(1, d2 - 1);
  const lcm = (d1 * d2) / gcd(d1, d2);
  let an = a * (lcm / d1);
  let bn = b * (lcm / d2);
  const op = pick(['+', '-']);
  if (op === '-' && bn > an) {
    [a, d1, an, b, d2, bn] = [b, d2, bn, a, d1, an];
  }
  const resultNum = op === '+' ? an + bn : an - bn;
  const simplified = simplifyFrac(resultNum, lcm);
  return {
    topic: 'fdp', subtopic: 'fractions', difficulty: 3, source: 'generated',
    prompt: `${a}/${d1} ${op} ${b}/${d2} = ? ${simplestFormHint(simplified)}`,
    answerType: 'text', correctAnswer: formatFrac(simplified.num, simplified.den), choices: null,
    ...fractionAnswerFields(simplified),
    explanation: `Common denominator ${lcm}: ${an}/${lcm} ${op} ${bn}/${lcm} = ${fracWorking(resultNum, lcm)}`,
  };
}

function fdpT3Percent() {
  const percent = pick([15, 35, 45, 65, 85, 12, 18]);
  const base = pick([40, 60, 80, 120, 150, 200]);
  const answer = round2((percent / 100) * base);
  return {
    topic: 'fdp', subtopic: 'percentages', difficulty: 3, source: 'generated',
    prompt: `What is ${percent}% of ${base}?`,
    answerType: 'numeric', correctAnswer: String(answer), choices: null,
    explanation: `${percent}% of ${base} = (${percent}/100) × ${base} = ${answer}`,
  };
}

function fdpT3() {
  return Math.random() < 0.5 ? fdpT3Frac() : fdpT3Percent();
}

// Roadmap #125: a tier-4 operand is never a whole number in disguise (2/2,
// 5/5, or 4/2, which is just "× 2"), so the question is never "× 1". Improper
// and unsimplified operands (5/2, 2/4) are kept on purpose (Alex's call).
function fracOperand() {
  let f;
  do {
    f = { num: randInt(1, 5), den: randInt(2, 8) };
  } while (f.num % f.den === 0);
  return f;
}

function fdpT4() {
  if (Math.random() < 0.5) {
    const op = pick(['×', '÷']);
    const f1 = fracOperand();
    let f2 = fracOperand();
    // Dividing a fraction by the very same fraction is always 1.
    while (op === '÷' && f2.num === f1.num && f2.den === f1.den) f2 = fracOperand();
    let resultNum;
    let resultDen;
    if (op === '×') {
      resultNum = f1.num * f2.num;
      resultDen = f1.den * f2.den;
    } else {
      resultNum = f1.num * f2.den;
      resultDen = f1.den * f2.num;
    }
    const simplified = simplifyFrac(resultNum, resultDen);
    return {
      topic: 'fdp', subtopic: 'fractions', difficulty: 4, source: 'generated',
      prompt: `${f1.num}/${f1.den} ${op} ${f2.num}/${f2.den} = ? ${simplestFormHint(simplified)}`,
      answerType: 'text', correctAnswer: formatFrac(simplified.num, simplified.den), choices: null,
      ...fractionAnswerFields(simplified),
      explanation: op === '×'
        ? `Multiply numerators and denominators: (${f1.num}×${f2.num})/(${f1.den}×${f2.den}) = ${fracWorking(resultNum, resultDen)}`
        : `Flip and multiply: ${f1.num}/${f1.den} × ${f2.den}/${f2.num} = ${fracWorking(resultNum, resultDen)}`,
    };
  }
  const base = pick([40, 50, 60, 80, 120, 150, 200]);
  const percent = pick([10, 15, 20, 25, 30]);
  const isIncrease = Math.random() < 0.5;
  const delta = (percent / 100) * base;
  const answer = isIncrease ? base + delta : base - delta;
  return {
    topic: 'fdp', subtopic: 'percentages', difficulty: 4, source: 'generated',
    prompt: `${base} is ${isIncrease ? 'increased' : 'decreased'} by ${percent}%. What is the new value?`,
    answerType: 'numeric', correctAnswer: String(answer), choices: null,
    explanation: `${percent}% of ${base} = ${delta}. ${base} ${isIncrease ? '+' : '-'} ${delta} = ${answer}`,
  };
}

function fdpT5() {
  let base;
  let p1;
  let p2;
  // A price has to come out in whole pennies. One combination doesn't
  // (£150, 25% then 15% gives £95.625), so pick again rather than round it.
  do {
    base = pick([80, 100, 120, 150, 200, 240]);
    p1 = pick([10, 20, 25]);
    p2 = pick([10, 15, 20]);
  } while ((base * (100 - p1) * (100 - p2)) % 100 !== 0);
  const afterFirst = base * (1 - p1 / 100);
  const afterSecond = afterFirst * (1 - p2 / 100);
  const answer = round2(afterSecond);
  return {
    topic: 'fdp', subtopic: 'percentages', difficulty: 5, source: 'generated',
    prompt: `A £${base} item is reduced by ${p1}%, then by a further ${p2}%. What is the final price?`,
    answerType: 'numeric', correctAnswer: String(answer), choices: null,
    explanation: `After ${p1}% off: £${base} × ${1 - p1 / 100} = £${round2(afterFirst)}. After a further ${p2}% off: × ${1 - p2 / 100} = £${answer}`,
  };
}

function genFdp(tier) {
  return { 1: fdpT1, 2: fdpT2, 3: fdpT3, 4: fdpT4, 5: fdpT5 }[tier]();
}

// ---------- Geometry ----------

function geoT1() {
  const w = randInt(3, 20);
  const h = randInt(3, 20);
  const answer = 2 * (w + h);
  return {
    topic: 'geometry', subtopic: 'perimeter', difficulty: 1, source: 'generated',
    prompt: `A rectangle is ${w}cm by ${h}cm. What is its perimeter (in cm)?`,
    answerType: 'numeric', correctAnswer: String(answer), choices: null,
    diagramSvg: rectangleSvg(w, h), // Roadmap #121
    explanation: `Perimeter = 2 × (${w} + ${h}) = ${answer}cm`,
  };
}

function geoT2() {
  const w = randInt(3, 20);
  const h = randInt(3, 20);
  const answer = w * h;
  return {
    topic: 'geometry', subtopic: 'area', difficulty: 2, source: 'generated',
    prompt: `A rectangle is ${w}cm by ${h}cm. What is its area (in cm²)?`,
    answerType: 'numeric', correctAnswer: String(answer), choices: null,
    diagramSvg: rectangleSvg(w, h), // Roadmap #121
    explanation: `Area = ${w} × ${h} = ${answer}cm²`,
  };
}

function geoT3() {
  const variant = pick(['lshape', 'triangle', 'angles']);
  if (variant === 'lshape') {
    const w = randInt(6, 14);
    const h = randInt(6, 14);
    const cutW = randInt(2, w - 2);
    const cutH = randInt(2, h - 2);
    const area = w * h - cutW * cutH;
    return {
      topic: 'geometry', subtopic: 'composite-area', difficulty: 3, source: 'generated',
      prompt: `An L-shape is a ${w}cm × ${h}cm rectangle with a ${cutW}cm × ${cutH}cm rectangle removed from one corner. What is the remaining area (in cm²)?`,
      answerType: 'numeric', correctAnswer: String(area), choices: null,
      // Roadmap #121: the prompt says "one corner", so the picture picks one.
      diagramSvg: lShapeSvg(w, h, cutW, cutH, pick(['tl', 'tr', 'bl', 'br'])),
      explanation: `Full rectangle: ${w}×${h} = ${w * h}. Remove ${cutW}×${cutH} = ${cutW * cutH}. ${w * h} - ${cutW * cutH} = ${area}cm²`,
    };
  }
  if (variant === 'triangle') {
    const base = randInt(4, 20);
    const height = randInt(4, 20);
    const area = (base * height) / 2;
    return {
      topic: 'geometry', subtopic: 'triangle-area', difficulty: 3, source: 'generated',
      prompt: `A triangle has a base of ${base}cm and a height of ${height}cm. What is its area (in cm²)?`,
      answerType: 'numeric', correctAnswer: String(area), choices: null,
      explanation: `Area = (base × height) ÷ 2 = (${base} × ${height}) ÷ 2 = ${area}cm²`,
    };
  }
  const angA = randInt(20, 110);
  const angB = randInt(20, Math.max(20, 160 - angA));
  const angC = 180 - angA - angB;
  return {
    topic: 'geometry', subtopic: 'angles', difficulty: 3, source: 'generated',
    prompt: `A triangle has angles of ${angA}° and ${angB}°. What is the third angle (in degrees)?`,
    answerType: 'numeric', correctAnswer: String(angC), choices: null,
    explanation: `Angles in a triangle sum to 180°. 180 - ${angA} - ${angB} = ${angC}°`,
  };
}

function geoT4() {
  if (Math.random() < 0.5) {
    const lCm = pick([150, 200, 250, 320, 450]);
    const wCm = pick([80, 100, 120, 150]);
    const perimCm = 2 * (lCm + wCm);
    const perimM = round2(perimCm / 100);
    return {
      topic: 'geometry', subtopic: 'unit-conversion', difficulty: 4, source: 'generated',
      // A real-size object: "on a scale drawing" with no scale given was
      // misleading (Roadmap #121, Alex's rewording).
      prompt: `A rectangular rug is ${lCm}cm by ${wCm}cm. What is its perimeter in metres?`,
      answerType: 'numeric', correctAnswer: String(perimM), choices: null,
      explanation: `Perimeter = 2 × (${lCm} + ${wCm}) = ${perimCm}cm. Convert to metres: ${perimCm} ÷ 100 = ${perimM}m`,
    };
  }
  const r = randInt(2, 15);
  if (Math.random() < 0.5) {
    const area = round2(3.14 * r * r);
    return {
      topic: 'geometry', subtopic: 'circle-area', difficulty: 4, source: 'generated',
      prompt: `A circle has a radius of ${r}cm. What is its area (in cm², using π ≈ 3.14)?`,
      answerType: 'numeric', correctAnswer: String(area), choices: null,
      explanation: `Area = π × r² = 3.14 × ${r * r} = ${area}cm²`,
    };
  }
  const circumference = round2(3.14 * 2 * r);
  return {
    topic: 'geometry', subtopic: 'circle-circumference', difficulty: 4, source: 'generated',
    prompt: `A circle has a radius of ${r}cm. What is its circumference (in cm, using π ≈ 3.14)?`,
    answerType: 'numeric', correctAnswer: String(circumference), choices: null,
    explanation: `Circumference = 2 × π × r = 2 × 3.14 × ${r} = ${circumference}cm`,
  };
}

function geoT5() {
  if (Math.random() < 0.5) {
    const w = randInt(10, 25);
    const h = randInt(10, 25);
    // Roadmap #121: each cut is strictly less than half of each side, so the
    // two opposite corners can never meet (at exactly half they'd touch at
    // the centre and leave two pieces joined at a point).
    const cutW = randInt(2, Math.floor((w - 1) / 2));
    const cutH = randInt(2, Math.floor((h - 1) / 2));
    const area = w * h - 2 * cutW * cutH;
    return {
      topic: 'geometry', subtopic: 'composite-area', difficulty: 5, source: 'generated',
      prompt: `A ${w}cm × ${h}cm rectangle has two ${cutW}cm × ${cutH}cm rectangles cut from opposite corners. What is the remaining area (in cm²)?`,
      answerType: 'numeric', correctAnswer: String(area), choices: null,
      diagramSvg: twoCornersSvg(w, h, cutW, cutH, pick(['tl-br', 'tr-bl'])),
      explanation: `Full rectangle: ${w}×${h} = ${w * h}. Two cut corners: 2 × (${cutW}×${cutH}) = ${2 * cutW * cutH}. ${w * h} - ${2 * cutW * cutH} = ${area}cm²`,
    };
  }
  const l = randInt(3, 12);
  const w = randInt(3, 12);
  const h = randInt(3, 12);
  const volume = l * w * h;
  return {
    topic: 'geometry', subtopic: 'volume', difficulty: 5, source: 'generated',
    prompt: `A cuboid is ${l}cm × ${w}cm × ${h}cm. What is its volume (in cm³)?`,
    answerType: 'numeric', correctAnswer: String(volume), choices: null,
    explanation: `Volume = length × width × height = ${l} × ${w} × ${h} = ${volume}cm³`,
  };
}

function genGeometry(tier) {
  return { 1: geoT1, 2: geoT2, 3: geoT3, 4: geoT4, 5: geoT5 }[tier]();
}

// ---------- Ratio & Proportion ----------

function ratioT1() {
  const factor = randInt(2, 6);
  let p = randInt(1, 6);
  let q = randInt(1, 6);
  const a = p * factor;
  const b = q * factor;
  const pqGcd = gcd(p, q);
  p /= pqGcd;
  q /= pqGcd;
  const divisor = gcd(a, b);
  return {
    topic: 'ratio', subtopic: 'simplify', difficulty: 1, source: 'generated',
    prompt: `Simplify the ratio ${a}:${b} to its simplest form.`,
    answerType: 'text', correctAnswer: `${p}:${q}`, choices: null,
    explanation: `Divide both parts by ${divisor}: ${a}:${b} = ${a / divisor}:${b / divisor}`,
  };
}

function ratioT2() {
  const rA = randInt(2, 9);
  const rB = randInt(2, 9);
  const scale = randInt(2, 8);
  const givenA = rA * scale;
  const answer = rB * scale;
  const itemA = pick(['flour', 'red paint', 'sand', 'juice concentrate']);
  const itemB = pick(['sugar', 'white paint', 'cement', 'water']);
  return {
    topic: 'ratio', subtopic: 'proportion', difficulty: 2, source: 'generated',
    prompt: `A mixture uses ${itemA} and ${itemB} in the ratio ${rA}:${rB}. If you use ${givenA} units of ${itemA}, how many units of ${itemB} do you need?`,
    answerType: 'numeric', correctAnswer: String(answer), choices: null,
    explanation: `${givenA} ÷ ${rA} = ${scale} (scale factor). ${rB} × ${scale} = ${answer}`,
  };
}

function ratioT3() {
  const p1 = randInt(1, 6);
  // The two parts must differ, or there's no "smaller" or "larger" share.
  let p2 = randInt(1, 6);
  while (p2 === p1) p2 = randInt(1, 6);
  const unit = randInt(2, 9);
  const total = (p1 + p2) * unit;
  const askSmaller = Math.random() < 0.5;
  const smaller = Math.min(p1, p2) * unit;
  const larger = Math.max(p1, p2) * unit;
  return {
    topic: 'ratio', subtopic: 'sharing', difficulty: 3, source: 'generated',
    prompt: `Share ${total} sweets in the ratio ${p1}:${p2}. How many sweets are in the ${askSmaller ? 'smaller' : 'larger'} share?`,
    answerType: 'numeric', correctAnswer: String(askSmaller ? smaller : larger), choices: null,
    // Roadmap #122: shown with the explanation, never before answering.
    explanationSvg: barModelSvg({
      rows: [{ label: '1st share', parts: p1 }, { label: '2nd share', parts: p2 }],
      perPart: unit,
      highlight: (p1 < p2) === askSmaller ? 0 : 1,
      totalNoun: 'sweets',
    }),
    explanation: `${p1} + ${p2} = ${p1 + p2} parts. ${total} ÷ ${p1 + p2} = ${unit} per part. Smaller share: ${Math.min(p1, p2)} × ${unit} = ${smaller}. Larger share: ${Math.max(p1, p2)} × ${unit} = ${larger}`,
  };
}

function ratioT4() {
  const perUnit = pick([0.5, 1, 1.5, 2, 2.5, 3, 4]);
  const n1 = randInt(2, 6);
  const n2 = randInt(3, 12);
  const cost1 = round2(perUnit * n1);
  const answer = round2(perUnit * n2);
  const item = pick(['pens', 'notebooks', 'stickers', 'chocolate bars']);
  return {
    topic: 'ratio', subtopic: 'proportion', difficulty: 4, source: 'generated',
    prompt: `If ${n1} ${item} cost £${cost1}, how much do ${n2} ${item} cost?`,
    answerType: 'numeric', correctAnswer: String(answer), choices: null,
    explanation: `£${cost1} ÷ ${n1} = £${round2(perUnit)} per item. £${round2(perUnit)} × ${n2} = £${answer}`,
  };
}

function ratioT5() {
  const p1 = randInt(2, 5);
  const p2 = p1 + randInt(2, 5);
  const unit = randInt(2, 8);
  const total = (p1 + p2) * unit;
  const girls = p2 * unit;
  return {
    topic: 'ratio', subtopic: 'ratio-totals', difficulty: 5, source: 'generated',
    prompt: `The ratio of boys to girls in a class is ${p1}:${p2}. There are ${total} pupils in total. How many girls are there?`,
    answerType: 'numeric', correctAnswer: String(girls), choices: null,
    explanationSvg: barModelSvg({ // Roadmap #122
      rows: [{ label: 'Boys', parts: p1 }, { label: 'Girls', parts: p2 }],
      perPart: unit,
      highlight: 1,
      totalNoun: 'pupils',
    }),
    explanation: `${p1} + ${p2} = ${p1 + p2} parts. ${total} ÷ ${p1 + p2} = ${unit} per part. Girls: ${p2} × ${unit} = ${girls}`,
  };
}

function genRatio(tier) {
  return { 1: ratioT1, 2: ratioT2, 3: ratioT3, 4: ratioT4, 5: ratioT5 }[tier]();
}

// ---------- Algebra basics ----------

function mkAlgebra(prompt, answer, tier, explanation, subtopic = 'equations') {
  return {
    topic: 'algebra', subtopic, difficulty: tier, source: 'generated',
    prompt, answerType: 'numeric', correctAnswer: String(answer), choices: null, explanation,
  };
}

function algebraT1() {
  const variant = pick(['add', 'sub', 'mul']);
  const x = randInt(2, 15);
  if (variant === 'add') {
    const a = randInt(2, 15);
    const b = x + a;
    return mkAlgebra(`x + ${a} = ${b}. What is x?`, x, 1, `x = ${b} - ${a} = ${x}`);
  }
  if (variant === 'sub') {
    const a = randInt(2, 15);
    const b = x - a;
    return mkAlgebra(`x - ${a} = ${b}. What is x?`, x, 1, `x = ${b} + ${a} = ${x}`);
  }
  const a = randInt(2, 9);
  const b = x * a;
  return mkAlgebra(`${a}x = ${b}. What is x?`, x, 1, `x = ${b} ÷ ${a} = ${x}`);
}

function algebraT2() {
  const x = randInt(2, 12);
  const a = randInt(2, 9);
  const b = randInt(1, 20);
  const c = a * x + b;
  return mkAlgebra(`${a}x + ${b} = ${c}. What is x?`, x, 2,
    `${a}x = ${c} - ${b} = ${a * x}. x = ${a * x} ÷ ${a} = ${x}`);
}

function algebraT3() {
  const a = randInt(2, 9);
  const b = randInt(2, 9);
  const variant = pick(['2a+b', '3a-b', 'a2']);
  if (variant === '2a+b') {
    const answer = 2 * a + b;
    return {
      topic: 'algebra', subtopic: 'substitution', difficulty: 3, source: 'generated',
      prompt: `If a = ${a} and b = ${b}, what is 2a + b?`,
      answerType: 'numeric', correctAnswer: String(answer), choices: null,
      explanation: `2 × ${a} + ${b} = ${2 * a} + ${b} = ${answer}`,
    };
  }
  if (variant === '3a-b') {
    const aa = Math.max(a, b + 1);
    const answer = 3 * aa - b;
    return {
      topic: 'algebra', subtopic: 'substitution', difficulty: 3, source: 'generated',
      prompt: `If a = ${aa} and b = ${b}, what is 3a - b?`,
      answerType: 'numeric', correctAnswer: String(answer), choices: null,
      explanation: `3 × ${aa} - ${b} = ${3 * aa} - ${b} = ${answer}`,
    };
  }
  const answer = a * a + b;
  return {
    topic: 'algebra', subtopic: 'substitution', difficulty: 3, source: 'generated',
    prompt: `If a = ${a} and b = ${b}, what is a² + b?`,
    answerType: 'numeric', correctAnswer: String(answer), choices: null,
    explanation: `${a}² + ${b} = ${a * a} + ${b} = ${answer}`,
  };
}

function algebraT4() {
  const start = randInt(1, 10);
  const step = randInt(2, 8);
  const terms = [start, start + step, start + 2 * step, start + 3 * step];
  const next = start + 4 * step;
  return {
    topic: 'algebra', subtopic: 'sequences', difficulty: 4, source: 'generated',
    prompt: `What is the next number in the sequence: ${terms.join(', ')}, ?`,
    answerType: 'numeric', correctAnswer: String(next), choices: null,
    explanation: `Each term increases by ${step}. ${terms[3]} + ${step} = ${next}`,
  };
}

function algebraT5() {
  if (Math.random() < 0.5) {
    const a = randInt(2, 6);
    const b = randInt(1, 10);
    const n = randInt(5, 20);
    const answer = a * n + b;
    return {
      topic: 'algebra', subtopic: 'sequences', difficulty: 5, source: 'generated',
      prompt: `The nth term of a sequence is ${a}n + ${b}. What is the ${n}th term?`,
      answerType: 'numeric', correctAnswer: String(answer), choices: null,
      explanation: `${a} × ${n} + ${b} = ${a * n} + ${b} = ${answer}`,
    };
  }
  const x = randInt(2, 10);
  const c = randInt(1, 4);
  const a = c + randInt(1, 4);
  const b = randInt(1, 10);
  const d = (a - c) * x + b;
  return {
    topic: 'algebra', subtopic: 'equations', difficulty: 5, source: 'generated',
    prompt: `${a}x + ${b} = ${c}x + ${d}. What is x?`,
    answerType: 'numeric', correctAnswer: String(x), choices: null,
    explanation: `Subtract ${c}x from both sides: ${a - c}x + ${b} = ${d}. Subtract ${b}: ${a - c}x = ${d - b}. Divide by ${a - c}: x = ${x}`,
  };
}

function genAlgebra(tier) {
  return { 1: algebraT1, 2: algebraT2, 3: algebraT3, 4: algebraT4, 5: algebraT5 }[tier]();
}

// ---------- Data handling & statistics ----------

const FRUITS = ['Apples', 'Bananas', 'Oranges', 'Grapes', 'Pears'];

function dataT1() {
  const mean = randInt(5, 15);
  const a = mean + randInt(-2, 2);
  const b = mean + randInt(-2, 2);
  const c = 3 * mean - a - b;
  const nums = [a, b, c];
  return {
    topic: 'dataHandling', subtopic: 'mean', difficulty: 1, source: 'generated',
    prompt: `Find the mean of these numbers: ${nums.join(', ')}`,
    answerType: 'numeric', correctAnswer: String(mean), choices: null,
    explanation: `(${nums.join(' + ')}) ÷ 3 = ${nums.reduce((s, n) => s + n, 0)} ÷ 3 = ${mean}`,
  };
}

function dataT2() {
  const nums = Array.from({ length: 5 }, () => randInt(1, 50));
  const sorted = [...nums].sort((a, b) => a - b);
  const median = sorted[2];
  return {
    topic: 'dataHandling', subtopic: 'median', difficulty: 2, source: 'generated',
    prompt: `Find the median of these numbers: ${nums.join(', ')}`,
    answerType: 'numeric', correctAnswer: String(median), choices: null,
    explanation: `Sorted: ${sorted.join(', ')}. The middle value is ${median}`,
  };
}

function dataT3() {
  const chosen = shuffle(FRUITS).slice(0, 4);
  const counts = chosen.map(() => randInt(2, 15));
  const total = counts.reduce((s, n) => s + n, 0);
  const pairs = chosen.map((f, i) => `${f} ${counts[i]}`).join(', ');
  if (Math.random() < 0.5) {
    return {
      topic: 'dataHandling', subtopic: 'tables', difficulty: 3, source: 'generated',
      prompt: `A survey of favourite fruits gave these results: ${pairs}. How many people were surveyed in total?`,
      answerType: 'numeric', correctAnswer: String(total), choices: null,
      explanation: `${counts.join(' + ')} = ${total}`,
    };
  }
  const maxCount = Math.max(...counts);
  const winner = chosen[counts.indexOf(maxCount)];
  return {
    topic: 'dataHandling', subtopic: 'tables', difficulty: 3, source: 'generated',
    prompt: `A survey of favourite fruits gave these results: ${pairs}. Which fruit was the most popular?`,
    answerType: 'text', correctAnswer: winner, choices: null,
    explanation: `${winner} had the highest count: ${maxCount}`,
  };
}

function dataT4() {
  const nums = Array.from({ length: 5 }, () => randInt(1, 100));
  const range = Math.max(...nums) - Math.min(...nums);
  return {
    topic: 'dataHandling', subtopic: 'range', difficulty: 4, source: 'generated',
    prompt: `Find the range of these numbers: ${nums.join(', ')}`,
    answerType: 'numeric', correctAnswer: String(range), choices: null,
    explanation: `Range = highest - lowest = ${Math.max(...nums)} - ${Math.min(...nums)} = ${range}`,
  };
}

function dataT5() {
  const mean = randInt(5, 20);
  const n = 5;
  const known = Array.from({ length: n - 1 }, () => randInt(1, mean));
  const total = mean * n;
  const missing = total - known.reduce((s, x) => s + x, 0);
  return {
    topic: 'dataHandling', subtopic: 'mean', difficulty: 5, source: 'generated',
    prompt: `The mean of five numbers is ${mean}. Four of the numbers are ${known.join(', ')}. What is the fifth number?`,
    answerType: 'numeric', correctAnswer: String(missing), choices: null,
    explanation: `Total = ${mean} × 5 = ${total}. ${total} - (${known.join(' + ')}) = ${total} - ${known.reduce((s, x) => s + x, 0)} = ${missing}`,
  };
}

function genDataHandling(tier) {
  return { 1: dataT1, 2: dataT2, 3: dataT3, 4: dataT4, 5: dataT5 }[tier]();
}

// ---------- Dispatch ----------

const GENERATORS = {
  arithmetic: genArithmetic,
  fdp: genFdp,
  geometry: genGeometry,
  ratio: genRatio,
  algebra: genAlgebra,
  dataHandling: genDataHandling,
  coordinates: genCoordinates,
};

export function getQuestion(topic, tier, usedWordProblemIds) {
  if (topic === 'wordProblems') {
    return getWordProblem(tier, usedWordProblemIds);
  }
  const gen = GENERATORS[topic];
  if (!gen) throw new Error(`Unknown topic: ${topic}`);
  return gen(tier);
}

// Roadmap #101: "Try one like it" after a wrong answer — another question of
// the same kind with new numbers. Same kind means the same topic, tier and
// subtopic, and for arithmetic the same operation(s) as well: tiers 1-3 all
// share the subtopic 'mixed', so without that a missed 47 + 38 could come
// back as 7 × 8. Each generator picks its variant at random, so this just
// retries until one matches with a different prompt, and gives up after a
// fixed number of tries (null: no button is shown). Hand-written word
// problems and imported questions have no "new numbers" to give, so they
// never get one.
const SIMILAR_ATTEMPTS = 40;
function arithmeticOps(prompt) {
  return (prompt.match(/[+\-×÷]/g) || []).join('');
}
export function getSimilarQuestion(question) {
  if (question.source !== 'generated') return null;
  const gen = GENERATORS[question.topic];
  if (!gen) return null;
  for (let i = 0; i < SIMILAR_ATTEMPTS; i += 1) {
    const q = gen(question.difficulty);
    if (q.subtopic !== question.subtopic || q.prompt === question.prompt) continue;
    if (question.topic === 'arithmetic' && arithmeticOps(q.prompt) !== arithmeticOps(question.prompt)) continue;
    return q;
  }
  return null;
}
