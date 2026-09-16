// Determines an answer for an uploaded custom question that didn't supply
// one (roadmap: custom uploads shouldn't require answers). Two tiers:
//
//  1. Expression evaluation — exact. Used when the prompt (once the
//     question wording is stripped away) is a pure maths expression, e.g.
//     "144 / 12", "15% of 60", "3/4 + 1/2". Confidence: 'computed'.
//  2. Word-problem heuristic — best-effort only. Extracts the numbers in
//     the prompt and guesses an operation from keywords. This is a guess,
//     not comprehension, and can get word problems wrong — callers should
//     surface its results as unverified. Confidence: 'guessed'.
//
// Returns { answer: string, confidence: 'computed'|'guessed' } or null if
// nothing could be determined at all.

function round2(n) {
  return Math.round(n * 100) / 100;
}

// A small recursive-descent parser for +, -, *, /, and parentheses — no
// eval()/Function(), so there's no risk of running arbitrary uploaded text.
// Exported for reuse by examberryPdfParser.js, which needs the identical
// safe-evaluation primitive to test candidate operators against a known
// target value (see its header comment on operator recovery).
export function evaluateArithmetic(expr) {
  let i = 0;

  function fail() { throw new Error('parse error'); }

  function parseNumber() {
    const start = i;
    while (/[\d.]/.test(expr[i] || '')) i += 1;
    if (i === start) fail();
    return parseFloat(expr.slice(start, i));
  }

  function parseFactor() {
    if (expr[i] === '(') {
      i += 1;
      const v = parseExpr();
      if (expr[i] !== ')') fail();
      i += 1;
      return v;
    }
    if (expr[i] === '-') {
      i += 1;
      return -parseFactor();
    }
    return parseNumber();
  }

  function parseTerm() {
    let v = parseFactor();
    while (expr[i] === '*' || expr[i] === '/') {
      const op = expr[i];
      i += 1;
      const rhs = parseFactor();
      v = op === '*' ? v * rhs : v / rhs;
    }
    return v;
  }

  function parseExpr() {
    let v = parseTerm();
    while (expr[i] === '+' || expr[i] === '-') {
      const op = expr[i];
      i += 1;
      const rhs = parseTerm();
      v = op === '+' ? v + rhs : v - rhs;
    }
    return v;
  }

  const result = parseExpr();
  if (i !== expr.length) fail();
  return result;
}

function tryComputeExpression(promptRaw) {
  let s = promptRaw.trim().replace(/\?+\s*$/, '').replace(/\.+\s*$/, '').trim();

  // Strip common question-phrasing so e.g. "What is 144 / 12?" still
  // resolves to the exact expression "144 / 12" instead of falling through
  // to the far-less-reliable word-problem guesser below.
  s = s.replace(/^(what\s+is|what's|calculate|work\s+out|find|solve)\s*:?\s*/i, '').trim();
  s = s.replace(/\?+\s*$/, '').trim();

  // "15% of 60" style phrasing — handled explicitly since '%' otherwise
  // has no safe generic meaning in a bare arithmetic parser.
  const ofMatch = s.match(/^([\d.]+)\s*%\s*of\s*([\d.]+)\s*=?\s*$/i);
  if (ofMatch) {
    return round2((parseFloat(ofMatch[1]) / 100) * parseFloat(ofMatch[2]));
  }
  if (s.includes('%')) return null;

  s = s.replace(/=\s*$/, '').trim();
  s = s
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/(?<=[\d)])\s*x\s*(?=[\d(])/gi, '*');

  // Only a bare expression (digits/operators/parens) counts — any other
  // wording means this is a word problem, not a computable expression.
  if (!/^[\d\s+\-*/.()]+$/.test(s)) return null;
  if (!/[+\-*/]/.test(s)) return null;

  try {
    const value = evaluateArithmetic(s.replace(/\s+/g, ''));
    return Number.isFinite(value) ? round2(value) : null;
  } catch (e) {
    return null;
  }
}

const NUMBER_RE = /-?\d+(?:\.\d+)?/g;

const OP_KEYWORDS = [
  { op: 'add', words: ['altogether', 'in total', 'total of', 'combined', 'sum of', ' add ', 'in all'] },
  { op: 'subtract', words: ['left', 'remain', 'fewer', 'difference', 'take away', 'gave away', 'spent', 'used up', 'ate'] },
  { op: 'multiply', words: ['each costs', 'each cost', 'times', 'product of', 'multiplied by'] },
  { op: 'divide', words: ['shared equally', 'split equally', 'divided by', 'divided among', 'divide', 'shared between', 'shared among', 'split between', 'average of', 'each get', 'each receive'] },
];

function guessOperation(text) {
  const lower = ` ${text.toLowerCase()} `;
  for (const { op, words } of OP_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) return op;
  }
  return null;
}

// Best-effort only — reads the numbers and a rough keyword-guessed
// operation, not the actual meaning of the problem.
function tryGuessWordProblem(promptRaw) {
  const numbers = (promptRaw.match(NUMBER_RE) || []).map(Number);
  if (numbers.length < 2) return null;

  const op = guessOperation(promptRaw) || (/left|remain|fewer/i.test(promptRaw) ? 'subtract' : 'add');
  const [a, b] = numbers;

  let result;
  if (op === 'add') result = numbers.reduce((sum, n) => sum + n, 0);
  else if (op === 'subtract') result = a - b;
  else if (op === 'multiply') result = a * b;
  else if (op === 'divide') result = b !== 0 ? a / b : null;

  return Number.isFinite(result) ? round2(result) : null;
}

export function determineAnswer(prompt) {
  if (!prompt || typeof prompt !== 'string') return null;

  const computed = tryComputeExpression(prompt);
  if (computed !== null) return { answer: String(computed), confidence: 'computed' };

  const guessed = tryGuessWordProblem(prompt);
  if (guessed !== null) return { answer: String(guessed), confidence: 'guessed' };

  return null;
}
