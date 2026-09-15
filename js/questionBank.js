// Procedural question generators for arithmetic, fractions/decimals/percentages,
// and geometry, tiered 1-5 per SPEC.md §12. Word problems are hand-authored and
// live in wordProblems.js; getQuestion() dispatches to whichever the topic needs.

import { getWordProblem } from './wordProblems.js';

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
function formatFrac(num, den) {
  return num === 0 ? '0' : `${num}/${den}`;
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
  return {
    topic: 'arithmetic', subtopic: 'division', difficulty: 5, source: 'generated',
    prompt: `${dividend} ÷ ${divisor} = ? (give as "quotient r remainder", e.g. "12 r 3")`,
    answerType: 'text', correctAnswer: `${quotient} r ${remainder}`, choices: null,
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
  const percent = Math.round((f.num / f.den) * 100);
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
    explanation: `${f.num}/${f.den} = ${(f.num / f.den).toFixed(2)} = ${percent}%`,
  };
}

function fdpT2() {
  if (Math.random() < 0.5) {
    const den = pick([4, 5, 6, 8, 10]);
    let a = randInt(1, den - 1);
    let b = randInt(1, den - 1);
    const op = pick(['+', '-']);
    if (op === '-' && b > a) [a, b] = [b, a];
    const resultNum = op === '+' ? a + b : a - b;
    const simplified = simplifyFrac(resultNum, den);
    return {
      topic: 'fdp', subtopic: 'fractions', difficulty: 2, source: 'generated',
      prompt: `${a}/${den} ${op} ${b}/${den} = ? (simplest form)`,
      answerType: 'text', correctAnswer: formatFrac(simplified.num, simplified.den), choices: null,
      explanation: `${a}/${den} ${op} ${b}/${den} = ${resultNum}/${den} = ${formatFrac(simplified.num, simplified.den)}`,
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
    prompt: `${a}/${d1} ${op} ${b}/${d2} = ? (simplest form)`,
    answerType: 'text', correctAnswer: formatFrac(simplified.num, simplified.den), choices: null,
    explanation: `Common denominator ${lcm}: ${an}/${lcm} ${op} ${bn}/${lcm} = ${resultNum}/${lcm} = ${formatFrac(simplified.num, simplified.den)}`,
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

function fdpT4() {
  if (Math.random() < 0.5) {
    const f1 = { num: randInt(1, 5), den: randInt(2, 8) };
    const f2 = { num: randInt(1, 5), den: randInt(2, 8) };
    const op = pick(['×', '÷']);
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
      prompt: `${f1.num}/${f1.den} ${op} ${f2.num}/${f2.den} = ? (simplest form)`,
      answerType: 'text', correctAnswer: `${simplified.num}/${simplified.den}`, choices: null,
      explanation: op === '×'
        ? `Multiply numerators and denominators: (${f1.num}×${f2.num})/(${f1.den}×${f2.den}) = ${resultNum}/${resultDen} = ${simplified.num}/${simplified.den}`
        : `Flip and multiply: ${f1.num}/${f1.den} × ${f2.den}/${f2.num} = ${resultNum}/${resultDen} = ${simplified.num}/${simplified.den}`,
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
  const base = pick([80, 100, 120, 150, 200, 240]);
  const p1 = pick([10, 20, 25]);
  const p2 = pick([10, 15, 20]);
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
      prompt: `A rectangular field is ${lCm}cm by ${wCm}cm on a scale drawing. What is its perimeter in metres?`,
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
    const cutW = randInt(2, Math.floor(w / 2));
    const cutH = randInt(2, Math.floor(h / 2));
    const area = w * h - 2 * cutW * cutH;
    return {
      topic: 'geometry', subtopic: 'composite-area', difficulty: 5, source: 'generated',
      prompt: `A ${w}cm × ${h}cm rectangle has two ${cutW}cm × ${cutH}cm square corners cut off. What is the remaining area (in cm²)?`,
      answerType: 'numeric', correctAnswer: String(area), choices: null,
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
  const p2 = randInt(1, 6);
  const unit = randInt(2, 9);
  const total = (p1 + p2) * unit;
  const askSmaller = Math.random() < 0.5;
  const smaller = Math.min(p1, p2) * unit;
  const larger = Math.max(p1, p2) * unit;
  return {
    topic: 'ratio', subtopic: 'sharing', difficulty: 3, source: 'generated',
    prompt: `Share ${total} sweets in the ratio ${p1}:${p2}. How many sweets are in the ${askSmaller ? 'smaller' : 'larger'} share?`,
    answerType: 'numeric', correctAnswer: String(askSmaller ? smaller : larger), choices: null,
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
};

export function getQuestion(topic, tier, usedWordProblemIds) {
  if (topic === 'wordProblems') {
    return getWordProblem(tier, usedWordProblemIds);
  }
  const gen = GENERATORS[topic];
  if (!gen) throw new Error(`Unknown topic: ${topic}`);
  return gen(tier);
}
