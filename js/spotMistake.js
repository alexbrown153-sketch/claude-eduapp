// Roadmap #146: "Spot the mistake" questions. A short worked answer by a
// made-up pupil in which exactly one line goes wrong; the child taps that
// line. The mistake is the FIRST line that goes wrong (Alex's decision):
// every line before it is exactly the correct working, and every line
// after it carries the wrong value forward with arithmetic that is
// otherwise right, so only one line is at fault.
//
// Hand-written templates with random numbers, like wordProblems.js: each
// one builds the correct working and the working with the slip side by
// side, from the same numbers, so they can be compared line by line (the
// sampling check in the build notes does exactly that for thousands of
// instances). Numbers follow the matching regular generator's rules.
//
// Each template names the misconception in its wrong line. `tier` is the
// tier of the matching regular generator; a template is only used when the
// tier picked for the question is at least this.

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
const MINUS = '−';

function frac(num, den) {
  const g = gcd(num, den);
  return den / g === 1 ? String(num / g) : `${num / g}/${den / g}`;
}

// The made-up pupil. app.js swaps the name if it's the child's own.
export const WORKER_NAMES = ['Sam', 'Jo'];

const TEMPLATES = [
  {
    // Works a + b × c from left to right.
    id: 'sm-order-of-operations', topic: 'arithmetic', subtopic: 'order-of-operations', tier: 4,
    make() {
      let a; let b; let c;
      do {
        a = randInt(2, 12); b = randInt(2, 12); c = randInt(2, 12);
      } while (a + b === b * c);
      const right = a + b * c;
      const wrong = (a + b) * c;
      return {
        prompt: `Work out ${a} + ${b} × ${c}`,
        correct: [`${b} × ${c} = ${b * c}`, `${a} + ${b * c} = ${right}`, `Answer: ${right}`],
        shown: [`${a} + ${b} = ${a + b}`, `${a + b} × ${c} = ${wrong}`, `Answer: ${wrong}`],
        wrongLine: 1,
        correction: `${b} × ${c} = ${b * c} first, because multiplying comes before adding`,
      };
    },
  },
  {
    // A times-table slip while partitioning: adds instead of multiplying.
    id: 'sm-multiply-partition', topic: 'arithmetic', subtopic: 'multiplication', tier: 3,
    make() {
      const t = randInt(2, 9);
      const u = randInt(3, 9);
      const n = randInt(3, 9); // u, n >= 3, so u + n never equals u × n
      const big = 10 * t;
      const right = (big + u) * n;
      const slip = u + n;
      return {
        prompt: `Work out ${big + u} × ${n}`,
        correct: [`${big} × ${n} = ${big * n}`, `${u} × ${n} = ${u * n}`, `${big * n} + ${u * n} = ${right}`, `Answer: ${right}`],
        shown: [`${big} × ${n} = ${big * n}`, `${u} × ${n} = ${slip}`, `${big * n} + ${slip} = ${big * n + slip}`, `Answer: ${big * n + slip}`],
        wrongLine: 2,
        correction: `${u} × ${n} = ${u * n}`,
      };
    },
  },
  {
    // Adds the denominators once they're already the same.
    id: 'sm-fraction-add-denominators', topic: 'fdp', subtopic: 'fractions', tier: 3,
    make() {
      const [d1, d2] = pick([[2, 3], [3, 4], [2, 5], [4, 5], [3, 5], [2, 7]]);
      const a = randInt(1, d1 - 1);
      const b = randInt(1, d2 - 1);
      const l = (d1 * d2) / gcd(d1, d2);
      const A = a * (l / d1);
      const B = b * (l / d2);
      return {
        prompt: `Work out ${a}/${d1} + ${b}/${d2}`,
        correct: [`${a}/${d1} = ${A}/${l}`, `${b}/${d2} = ${B}/${l}`, `${A}/${l} + ${B}/${l} = ${A + B}/${l}`, `Answer: ${frac(A + B, l)}`],
        shown: [`${a}/${d1} = ${A}/${l}`, `${b}/${d2} = ${B}/${l}`, `${A}/${l} + ${B}/${l} = ${A + B}/${2 * l}`, `Answer: ${frac(A + B, 2 * l)}`],
        wrongLine: 3,
        correction: `${A}/${l} + ${B}/${l} = ${A + B}/${l}: add the tops and keep the bottom the same`,
      };
    },
  },
  {
    // Doubles 10% to get 5% instead of halving it.
    id: 'sm-percent-five', topic: 'fdp', subtopic: 'percentages', tier: 3,
    make() {
      const n = 20 * randInt(2, 20); // 5% is always a whole number
      const p = pick([15, 25, 35, 45]);
      const ten = n / 10;
      const tens = (p - 5) / 10;
      const build = (five) => {
        const lines = [`10% of ${n} = ${ten}`];
        if (tens > 1) lines.push(`${p - 5}% of ${n} = ${ten * tens}`);
        lines.push(`5% of ${n} = ${five}`);
        lines.push(`${ten * tens} + ${five} = ${ten * tens + five}`);
        lines.push(`Answer: ${ten * tens + five}`);
        return lines;
      };
      const correct = build(n / 20);
      return {
        prompt: `What is ${p}% of ${n}?`,
        correct,
        shown: build(n / 5),
        wrongLine: tens > 1 ? 3 : 2,
        correction: `5% of ${n} = ${n / 20}, because 5% is half of 10%`,
      };
    },
  },
  {
    // Divides the total by one part of the ratio, not the total parts.
    id: 'sm-ratio-one-part', topic: 'ratio', subtopic: 'sharing', tier: 3,
    make() {
      let p; let q; let u; let total;
      do {
        p = randInt(2, 5); q = randInt(p + 1, 8); u = randInt(2, 9);
        total = (p + q) * u;
      } while (total % p !== 0 || gcd(p, q) !== 1); // a ratio in simplest form
      const each = total / p;
      return {
        prompt: `Share ${total} sweets in the ratio ${p}:${q}. How many sweets are in the larger share?`,
        correct: [`${p} + ${q} = ${p + q} parts`, `${total} ÷ ${p + q} = ${u} sweets in each part`, `${q} × ${u} = ${q * u}`, `Answer: ${q * u}`],
        shown: [`${p} + ${q} = ${p + q} parts`, `${total} ÷ ${p} = ${each} sweets in each part`, `${q} × ${each} = ${q * each}`, `Answer: ${q * each}`],
        wrongLine: 2,
        correction: `${total} ÷ ${p + q} = ${u}: divide by all ${p + q} parts`,
      };
    },
  },
  {
    // 3x + 5 = 20 becomes 3x = 25: adds instead of taking away.
    id: 'sm-equation-add', topic: 'algebra', subtopic: 'equations', tier: 2,
    make() {
      const a = randInt(2, 9);
      const x = randInt(2, 12);
      const b = a * randInt(1, 3); // so the wrong working still divides exactly
      const c = a * x + b;
      const wx = (c + b) / a;
      return {
        prompt: `${a}x + ${b} = ${c}. What is x?`,
        correct: [`${a}x = ${c} ${MINUS} ${b} = ${c - b}`, `x = ${c - b} ÷ ${a} = ${x}`, `Answer: x = ${x}`],
        shown: [`${a}x = ${c} + ${b} = ${c + b}`, `x = ${c + b} ÷ ${a} = ${wx}`, `Answer: x = ${wx}`],
        wrongLine: 1,
        correction: `${a}x = ${c} ${MINUS} ${b} = ${c - b}: take ${b} away from both sides`,
      };
    },
  },
  {
    // Forgets to halve for the area of a triangle.
    id: 'sm-triangle-half', topic: 'geometry', subtopic: 'triangle-area', tier: 3,
    make() {
      let base; let height;
      do {
        base = randInt(4, 20); height = randInt(4, 20);
      } while ((base * height) % 2 !== 0);
      const p = base * height;
      return {
        prompt: `A triangle has a base of ${base}cm and a height of ${height}cm. What is its area (in cm²)?`,
        correct: ['Area of a triangle = base × height ÷ 2', `${base} × ${height} = ${p}`, `${p} ÷ 2 = ${p / 2}`, `Answer: ${p / 2}cm²`],
        shown: ['Area of a triangle = base × height', `${base} × ${height} = ${p}`, `Answer: ${p}cm²`],
        wrongLine: 1,
        correction: 'Area of a triangle = base × height ÷ 2',
      };
    },
  },
  {
    // Divides by the wrong count for the mean.
    id: 'sm-mean-count', topic: 'dataHandling', subtopic: 'mean', tier: 2,
    make() {
      let nums; let mean;
      do {
        mean = 3 * randInt(2, 6); // the total is then a multiple of 12
        nums = [0, 1, 2].map(() => mean + randInt(-4, 4));
        nums.push(4 * mean - nums[0] - nums[1] - nums[2]);
      } while (nums.some((v) => v < 1));
      const total = 4 * mean;
      return {
        prompt: `Find the mean of these numbers: ${nums.join(', ')}`,
        correct: [`${nums.join(' + ')} = ${total}`, `There are 4 numbers, so ${total} ÷ 4 = ${mean}`, `Answer: ${mean}`],
        shown: [`${nums.join(' + ')} = ${total}`, `There are 3 numbers, so ${total} ÷ 3 = ${total / 3}`, `Answer: ${total / 3}`],
        wrongLine: 2,
        correction: `There are 4 numbers, so ${total} ÷ 4 = ${mean}`,
      };
    },
  },
];

export const SPOT_TEMPLATE_IDS = TEMPLATES.map((t) => t.id);

// Is there a template for this topic at or below this tier?
export function hasSpotTemplate(topic, tier) {
  return TEMPLATES.some((t) => t.topic === topic && t.tier <= tier);
}

function build(template) {
  const w = template.make();
  return {
    topic: template.topic,
    subtopic: template.subtopic,
    difficulty: template.tier,
    source: 'generated',
    format: 'spotMistake',
    templateId: template.id,
    answerType: 'spot',
    prompt: w.prompt,
    lines: w.shown,
    correctLines: w.correct,
    wrongLine: w.wrongLine,
    correction: w.correction,
    workerName: WORKER_NAMES[0],
    correctAnswer: String(w.wrongLine),
    choices: null,
    // The correct working, for "Questions I got wrong" (#127).
    explanation: w.correct.join('\n'),
  };
}

// A question for this topic, from a template at or below `tier`, or null.
export function getSpotQuestion(topic, tier) {
  const options = TEMPLATES.filter((t) => t.topic === topic && t.tier <= tier);
  return options.length ? build(pick(options)) : null;
}

// A new instance of a template (#127 "Try these again", #128 Fix), never
// with the same prompt as `notPrompt`. Null for an unknown id.
export function getSpotVersion(templateId, notPrompt) {
  const template = TEMPLATES.find((t) => t.id === templateId);
  if (!template) return null;
  for (let i = 0; i < 40; i += 1) {
    const q = build(template);
    if (q.prompt !== notPrompt) return q;
  }
  return null;
}
