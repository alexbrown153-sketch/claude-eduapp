// Structured parser for Examberry-style 11+ practice papers (e.g. "Tiffin Test
// N: Mathematics"), used to seed the question bank from real past papers
// instead of requiring hand-typed "Q: ... A: ..." sheets (see pdfQuestions.js).
//
// Unlike the generic parser, this one is maths-only by design: it locates the
// "Mathematics" paper specifically (skipping the English paper, the bubble
// answer sheets, and the English answer key entirely) and cross-references
// each question against the real "Mathematics Answers" section, which gives
// both a definitive correct answer AND a genuine worked explanation — far
// better than guessing.
//
// Two things this format cannot reliably survive text extraction:
//  - Fractions are typeset as stacked numerator/denominator graphics, not
//    linear text, so they extract as blank ("fraction = = = "). Any question
//    whose answer or options come through blank/corrupted is skipped, not
//    guessed.
//  - Diagram-dependent questions (pie charts, graphs, number lines, shaded
//    shapes) carry no text of their own at all. When the caller can render
//    PDF pages (see the `pages`/`renderRegion` parameters below), the
//    diagram is captured as an image instead of being skipped; otherwise —
//    or if it can't be pinned down confidently — the question is skipped
//    and reported, not guessed.
// Skips are reported by question number so nothing is silently dropped.
//
// A third thing — inline arithmetic operators (×, ÷, and even −) in a
// question's own stem — LOOKS like a text problem but isn't: inspecting this
// PDF's raw content stream (page.getOperatorList(), not getTextContent())
// shows these symbols are drawn as small filled vector paths, not font
// glyphs, in the stem's typesetting (unlike the answer key's explanations,
// which spell them as words or a plain "x"). There is no character there to
// extract, at any level — so instead of trying to identify the glyph
// visually, `tryRecoverStemOperators` works backwards from the one thing we
// already know for certain: the paper's own answer key. It tries each of
// +, −, ×, ÷ in the gap and keeps the fix only when exactly one combination
// reproduces the known-correct answer — see its comment below.

import { evaluateArithmetic } from './answerSolver.js';

const MATHS_TITLE_RE = /([^\n]{0,80}Mathematics)\s+(\d+)\s*Minutes\s+(\d+)\s*Questions/i;

// Every error/skip is a { message, hint } pair — the message says what went
// wrong (and, for a skipped question, exactly which one), the hint says
// what a reader can actually do about it. Kept together at the source rather
// than reconstructed later from the message text, which would be fragile.
function err(message, hint) {
  return { message, hint };
}

const HINT_DIAGRAM = "This app can capture and show a diagram alongside a question, but couldn't pin down reliably where this one sits on the page (e.g. it may straddle a page break, or the paper wasn't opened with image capture available) — add it by hand with a screenshot if you want it included.";
const HINT_UNEXTRACTABLE = 'Usually means a fraction or symbol was drawn as a graphic in the PDF rather than typeset as text, so it disappears when the text is extracted — this can\'t be recovered automatically.';
const HINT_FORMAT_MISMATCH = "This PDF's layout doesn't match what this importer expects for an Examberry-style practice paper — try a different PDF, or check it wasn't edited or re-saved in a way that changed its text layer.";
const HINT_OPERATOR_UNRECOVERABLE = "This importer normally works out a missing ×/÷/− from the paper's own answer key, but here more than one operator (or none) produces that answer, so it can't be recovered with confidence — worth adding this one back in by hand.";
const HINT_FRACTION_UNCAPTURED = "This question's own expression or answer options likely include a fraction, which this PDF draws as a picture rather than real text — this app can normally show a captured image of it instead, but couldn't pin one down reliably here (e.g. it may straddle a page break).";

function findFrom(text, re, fromIndex) {
  const rest = text.slice(fromIndex);
  const m = rest.match(re);
  if (!m) return null;
  return { index: fromIndex + m.index, length: m[0].length };
}

// Locates the start of each "N." marker (question or answer number) in
// strict sequence 1..total — far more robust against stray numbers inside
// question text (measurements, data lists) than a loose global regex scan,
// since it only ever looks for the exact next expected integer.
function findMarkerPositions(text, total) {
  const positions = [];
  let searchFrom = 0;
  for (let i = 1; i <= total; i += 1) {
    // No trailing-whitespace requirement after the dot — some answer-key
    // entries run straight into the value with no space ("44.0.38"), so
    // requiring it would break the whole sequential search on that entry.
    const re = new RegExp(`(?:^|\\n)([ \\t]*${i}\\.)`);
    const rest = text.slice(searchFrom);
    const m = rest.match(re);
    if (!m) return null;
    const start = searchFrom + m.index + (m[0].length - m[1].length);
    positions.push(start);
    searchFrom = start + m[1].length;
  }
  return positions;
}

function blockAt(text, markers, i, total) {
  const start = markers[i];
  const end = i + 1 < total ? markers[i + 1] : text.length;
  return text.slice(start, end).replace(/^\d+\.\s*/, '');
}

function cleanText(s) {
  return s.replace(/[ \t]+/g, ' ').replace(/\s+([.,?!:;])/g, '$1').trim();
}

function isBlank(s) {
  return !s || s.replace(/[^a-zA-Z0-9]/g, '').length === 0 || /=\s*=/.test(s);
}

// Shared preamble text (e.g. "Use the graph below to answer questions
// 35-37...") sits before the first question's own "N." marker, so it ends
// up glued onto the END of the *previous* question's block. Strip it back
// off rather than leaving it as confusing trailing content.
// Page-footer numbers ("...\n19") land inside whatever question's block
// happens to end at a page boundary. Only strip from the very end of a
// block — a real answer value always appears at the *start* (as the first
// line, or within the earliest Step line), so this can't clip real content.
function stripTrailingPageNumber(s) {
  return s.replace(/\n\s*\d{1,3}\s*$/, '').trim();
}

// Every page of a purchased Examberry PDF carries the buyer's own personal
// licensing watermark ("This product is licensed solely for the private and
// personal use of <name>, <email>, Order: <id>. Copyright © Examberry
// Papers.") — since every future paper this family imports will carry this
// same watermark on every page, any question whose block happens to span a
// page break gets it (and the page's own bare footer number) glued into its
// text. Stripped globally, not just from the block's tail, since a long
// question can straddle more than one page break — and it's safe to do
// globally because this fixed phrase never appears as real question content.
function stripBoilerplate(s) {
  // Matched through to "Order: <digits>." rather than just the next ".",
  // since the buyer's own email address in the middle of this sentence
  // (e.g. "...ksmansfield@hotmail.com...") has a "." of its own that would
  // otherwise end the match early and leave the rest as visible junk.
  return s
    .replace(/\s*This product is licensed solely for the private and personal use of[\s\S]*?Order:\s*\d+\.\s*/gi, ' ')
    .replace(/\s*Copyright\s*©\s*Examberry Papers\.\s*/gi, ' ');
}

function stripTrailingDiagramPreamble(stem) {
  return stem
    .replace(/\s*Use the (?:following )?(?:graph|chart|table|pie chart|diagram|picture|image)[^.]*\.(?:\s*This (?:graph|chart|table)[^.]*\.)?\s*$/i, '')
    .trim();
}

// A diagram's own caption text (e.g. a number line's axis labels) can land
// in reading order before the "N." marker of the *next* question, gluing a
// bare run of numbers onto the end of the current block — e.g. "...how many
// days...? -37.15 -11.4 14.35" (that question's answer is unaffected; the
// numbers just don't belong to it). Two or more space-separated numbers
// sitting at the very end, with no surrounding sentence, only ever occurs as
// this kind of bleed — a real question always ends in a word, unit or "?".
function stripTrailingAxisLabels(s) {
  // The gap between numbers must be real whitespace ("\s+", not "\s*") —
  // otherwise a single lone number (e.g. an MCQ option's "429") can satisfy
  // "2 or more" by having its own digits split across zero-width repetitions.
  return s.replace(/(?:^|\s)-?\d+(?:\.\d+)?(?:\s+-?\d+(?:\.\d+)?){1,}\s*$/, '').trim();
}

const DIAGRAM_KEYWORDS = [
  'pie chart', 'following graph', 'graph below', 'graph shows', 'chart below',
  'chart represents', 'number line', 'diagram below', 'shape below',
  'figure below', 'use the graph', 'following parallelogram', 'following pie chart',
  'following circle', 'shaded portion', 'bar chart', 'shown below', 'pictured below',
  'made up of equilateral triangles', 'spinner', 'following diagram',
];

function needsDiagram(stem) {
  const lower = stem.toLowerCase();
  return DIAGRAM_KEYWORDS.some((k) => lower.includes(k));
}

// Some diagrams are shared across a run of questions ("...to answer
// questions 35-37") rather than flagged in each question's own text. Kept
// as {from, to} ranges (not a flat set of question numbers) so a diagram
// only ever needs rendering once per range and every question in it can
// share that one image — see getSharedDiagramImage below.
function findDiagramRanges(mathsText) {
  const ranges = [];
  const re = /use the (?:following )?(?:graph|chart|table|pie chart|diagram|picture|image)[^.]*?(?:to answer questions?)\s*(\d+)\s*(?:[-–—]|to)\s*(\d+)/gi;
  let m;
  while ((m = re.exec(mathsText))) {
    const from = parseInt(m[1], 10);
    const to = parseInt(m[2], 10);
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from && to - from < 20) {
      ranges.push({ from, to });
    }
  }
  return ranges;
}

function rangeContaining(ranges, qNum) {
  return ranges.find((r) => qNum >= r.from && qNum <= r.to) || null;
}

// ---------- Locating a diagram on the page (for rendering as an image) ----------
//
// A diagram carries no text of its own, but it DOES occupy real vertical
// space between two things we can locate precisely: the text line just
// before it and the text line just after it. `pages` (from
// pdfQuestions.js's extractPdfDocument) gives each page's own line-start
// offsets and Y positions; these two helpers translate an absolute offset
// in the combined `fullText` into "which page, and what Y on it".

function pageForOffset(pages, offset) {
  let found = pages[0] || null;
  for (const page of pages) {
    if (page.startInFull <= offset) found = page;
    else break;
  }
  return found;
}

function yAtOffset(page, offset) {
  if (!page || page.lines.length === 0) return page ? page.pageHeight : 0;
  const localOffset = offset - page.startInFull;
  let y = page.lines[0].y;
  for (const line of page.lines) {
    if (line.offset <= localOffset) y = line.y;
    else break;
  }
  return y;
}

// Splits a question block into its stem and (if present) a run of 2+
// consecutive "A. ... B. ... " option lines with strictly increasing
// letters. A "bare" letter line ("X." with nothing after it) means that
// option's text was dropped entirely (typically a fraction, which this
// font draws as vector shapes with no recoverable text at all — see the
// fraction-image-fallback code below) — kept as a choice with empty text
// rather than discarded, since the caller can still capture and show an
// image of the real choices even though none of their text survived.
function splitStemAndChoices(block) {
  const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
  const optionRe = /^([A-Z])\.\s+(.+)$/;
  const bareLetterRe = /^([A-Z])\.\s*$/;
  const firstOptIdx = lines.findIndex((l) => optionRe.test(l) || bareLetterRe.test(l));
  if (firstOptIdx === -1) {
    return { stem: cleanText(lines.join(' ')), choices: null };
  }
  const choices = [];
  let expectedCode = null;
  for (let i = firstOptIdx; i < lines.length; i += 1) {
    const bare = lines[i].match(bareLetterRe);
    const m = bare ? null : lines[i].match(optionRe);
    const letter = bare ? bare[1] : m ? m[1] : null;
    if (!letter) break;
    const code = letter.charCodeAt(0);
    if (expectedCode !== null && code !== expectedCode) break;
    choices.push({ letter, text: bare ? '' : m[2].trim() });
    expectedCode = code + 1;
  }
  if (choices.length < 2) {
    return { stem: cleanText(lines.slice(0, firstOptIdx).join(' ')), choices: null };
  }
  return { stem: cleanText(lines.slice(0, firstOptIdx).join(' ')), choices };
}

// This paper's question text sometimes renders inline arithmetic operators
// (×, ÷) as a symbol-font glyph with no ToUnicode mapping, so pdf.js's text
// layer drops the character entirely — unlike the answer key, which spells
// operators as words or a plain "x" (see fraction comment above). That
// leaves two numbers (or a closing paren and a number) sitting next to each
// other with nothing but whitespace between, e.g. "What is 41 12?" instead
// of "What is 41 × 12?" — unanswerable as shown. `allowLetters` widens this
// to also catch a dropped operator next to a single-letter algebra variable
// ("3(x 4)" instead of "3(x − 4)") for equation-solving questions.
function hasBareAdjacentTokens(s, allowLetters) {
  const token = allowLetters ? '\\d|\\)|[A-Za-z]' : '\\d|\\)';
  const next = allowLetters ? '\\d|\\(|[A-Za-z]' : '\\d|\\(';
  return new RegExp(`(?:${token})\\s+(?:${next})`).test(s);
}

// Only a string that's ALREADY nothing but a bare expression (digits,
// operators, parens, decimal points — plus letters when checking an
// equation) is a safe candidate: prose mentioning two nearby numbers (e.g. a
// list of page counts) is not evidence of a dropped operator.
function isPureExpression(s, allowLetters) {
  // Includes the real "−" (U+2212) alongside the ASCII hyphen, not just for
  // detecting a dropped operator in freshly-extracted text (which would
  // never contain it) but because stemLooksMismatched() also runs this
  // check on an ALREADY-recovered stem, which legitimately can.
  const charClass = allowLetters ? /^[\d\s.,()×÷−+\-*/%=A-Za-z]*$/ : /^[\d\s.,()×÷−+\-*/%]*$/;
  return charClass.test(s) && /\d/.test(s);
}

function looksLikeCorruptedExpression(s, allowLetters = false) {
  const body = (s || '').trim();
  if (!body) return false;
  if (!isPureExpression(body, allowLetters)) return false;
  return hasBareAdjacentTokens(body, allowLetters);
}

// Catches the two phrasings this paper format uses for a bare computable
// expression — "What is <expr>?" and "Solve ... equation ... <expr with a
// variable>" — since those are the only cases where two adjacent numbers
// reliably mean a lost operator rather than ordinary prose.
function stemHasCorruptedExpression(stem) {
  const whatIs = stem.match(/^what\s+is\b([\s\S]*?)\??$/i);
  if (whatIs && looksLikeCorruptedExpression(whatIs[1])) return true;

  if (/solve\b[\s\S]*\bequation\b/i.test(stem)) {
    const afterEquation = stem.replace(/^[\s\S]*?\bequation\b[^.]*\.\s*/i, '');
    if (looksLikeCorruptedExpression(afterEquation, true)) return true;
  }
  return false;
}

function choicesCorrupted(choices) {
  if (choices.some((c) => isBlank(c.text) || looksLikeCorruptedExpression(c.text))) return true;
  const texts = choices.map((c) => c.text.trim().toLowerCase());
  return new Set(texts).size < texts.length;
}

// ---------- Recovering a missing operator from the known answer ----------
//
// We can't identify WHICH symbol was drawn (see the file header — it isn't
// text at all), but a "What is <expr>?" or "Solve the equation" stem has
// exactly one thing we can trust completely: the paper's own answer key
// already tells us what the expression must evaluate to. So instead of
// reading the operator, we solve for it — try +, −, ×, ÷ in each gap and
// keep the fix only if EXACTLY one combination reproduces that answer.
// Zero matches (nothing fits) or 2+ matches (genuinely ambiguous, e.g. very
// small numbers where several operators land on the same result) are both
// left alone, matching the file's existing "don't guess" philosophy — this
// is a targeted algebraic solve, not a heuristic guess.

const GAP_OPERATORS = ['+', '-', '*', '/'];
const GAP_OPERATOR_DISPLAY = { '+': '+', '-': '−', '*': '×', '/': '÷' };
const MAX_RECOVERABLE_GAPS = 3; // 4^3 = 64 combinations — cheap; higher gets both slow and more likely ambiguous

function safeEvaluate(expr) {
  try {
    // evaluateArithmetic() only understands ASCII +-*/ — real ×/÷/− (either
    // already present pre-recovery, or just spliced in by
    // fillOperatorGaps(..., true) for display) need converting first, and
    // it has no notion of implicit multiplication either, but an equation
    // like "5(x + 1)" relies on it: insert the "*" a number or closing paren
    // immediately followed by "(" implies. That insertion never fires on an
    // expression that didn't already rely on it (that adjacency is
    // otherwise a syntax error), so it's safe for the plain-expression path
    // too.
    const normalized = expr
      .replace(/\s+/g, '')
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/([\d)])\(/g, '$1*(');
    const value = evaluateArithmetic(normalized);
    return Number.isFinite(value) ? value : null;
  } catch (e) {
    return null;
  }
}

// Finds each whitespace run that sits between a left token (digit, closing
// paren, or — for equations — a variable letter) and a right token (digit,
// opening paren, or variable letter), i.e. exactly the gaps
// hasBareAdjacentTokens() detects. Returns {start, end} offsets of the
// whitespace itself, so a candidate operator can be spliced in in its place.
function findOperatorGaps(expr, allowLetters) {
  const left = allowLetters ? '\\d|\\)|[A-Za-z]' : '\\d|\\)';
  const right = allowLetters ? '\\d|\\(|[A-Za-z]' : '\\d|\\(';
  const re = new RegExp(`(?:${left})(\\s+)(?=${right})`, 'g');
  const gaps = [];
  let m;
  while ((m = re.exec(expr))) {
    gaps.push({ start: m.index + (m[0].length - m[1].length), end: m.index + m[0].length });
  }
  return gaps;
}

// Splices `ops` (one per gap, ASCII '+','-','*','/') into `expr`'s gaps,
// right-to-left so earlier offsets stay valid. `display` swaps in the real
// −/×/÷ glyphs for showing to the child instead of the ASCII forms used for
// evaluation.
function fillOperatorGaps(expr, gaps, ops, display) {
  let result = expr;
  for (let i = gaps.length - 1; i >= 0; i -= 1) {
    const symbol = display ? GAP_OPERATOR_DISPLAY[ops[i]] : ops[i];
    result = `${result.slice(0, gaps[i].start)} ${symbol} ${result.slice(gaps[i].end)}`;
  }
  return result;
}

function* operatorCombinations(count) {
  if (count === 0) { yield []; return; }
  for (const op of GAP_OPERATORS) {
    for (const rest of operatorCombinations(count - 1)) yield [op, ...rest];
  }
}

// Tries every operator combination in `expr`'s gaps and keeps the filled
// (ASCII) candidate only when exactly one satisfies `isMatch`.
function solveOperatorGaps(expr, gaps, isMatch) {
  if (gaps.length === 0 || gaps.length > MAX_RECOVERABLE_GAPS) return null;
  let found = null;
  for (const ops of operatorCombinations(gaps.length)) {
    if (isMatch(fillOperatorGaps(expr, gaps, ops, false))) {
      if (found) return null; // second match found — ambiguous, bail
      found = ops;
    }
  }
  return found;
}

// exprBody: the part of "What is <exprBody>?" with the dropped symbol(s).
// targetRaw: the paper's own answer-key value for this question (a plain
// number, or an MCQ choice's text if it's numeric). Returns the recovered
// body with real ×/−/÷ glyphs, or null if it couldn't be solved uniquely.
function tryRecoverExpressionOperators(exprBody, targetRaw) {
  const target = parseFloat(String(targetRaw).replace(/,/g, ''));
  if (!Number.isFinite(target)) return null;
  const gaps = findOperatorGaps(exprBody, false);
  const ops = solveOperatorGaps(exprBody, gaps, (candidate) => {
    const value = safeEvaluate(candidate);
    return value !== null && Math.abs(value - target) < 0.005;
  });
  return ops ? fillOperatorGaps(exprBody, gaps, ops, true) : null;
}

// equationBody: the "5(x + 1) = 3(x 4) + 19" part of a "solve the equation"
// stem, variable still symbolic. targetRaw: the answer key's solved value
// for that variable. Substitutes the known value in, tries each operator
// combination, and keeps the fix only if it makes both sides equal.
function tryRecoverEquationOperators(equationBody, targetRaw) {
  const variableMatch = equationBody.match(/[A-Za-z]/);
  if (!variableMatch) return null;
  const variable = variableMatch[0];
  const target = parseFloat(String(targetRaw).replace(/,/g, ''));
  if (!Number.isFinite(target)) return null;

  const gaps = findOperatorGaps(equationBody, true);
  const ops = solveOperatorGaps(equationBody, gaps, (candidate) => {
    // `candidate` here is already the fully gap-filled equation string (see
    // solveOperatorGaps) — only the variable substitution is still needed.
    const substituted = candidate.replace(new RegExp(variable, 'g'), `(${target})`);
    const sides = substituted.split('=');
    if (sides.length !== 2) return false;
    const lhs = safeEvaluate(sides[0]);
    const rhs = safeEvaluate(sides[1]);
    return lhs !== null && rhs !== null && Math.abs(lhs - rhs) < 0.005;
  });
  return ops ? fillOperatorGaps(equationBody, gaps, ops, true) : null;
}

// Top-level entry point: given a stem already flagged by
// stemHasCorruptedExpression() and the question's own known-correct answer,
// returns the full recovered stem text, or null if it couldn't be solved
// with confidence (caller falls back to skipping, as before).
function tryRecoverStemOperators(stem, targetRaw) {
  const whatIs = /^what\s+is\b([\s\S]*?)\??$/id.exec(stem);
  if (whatIs && looksLikeCorruptedExpression(whatIs[1])) {
    const recoveredBody = tryRecoverExpressionOperators(whatIs[1], targetRaw);
    if (!recoveredBody) return null;
    const [start, end] = whatIs.indices[1];
    return stem.slice(0, start) + recoveredBody + stem.slice(end);
  }

  if (/solve\b[\s\S]*\bequation\b/i.test(stem)) {
    const prefixMatch = /^[\s\S]*?\bequation\b[^.]*\.\s*/i.exec(stem);
    if (prefixMatch) {
      const body = stem.slice(prefixMatch[0].length);
      if (looksLikeCorruptedExpression(body, true)) {
        const recoveredBody = tryRecoverEquationOperators(body, targetRaw);
        if (recoveredBody) return prefixMatch[0] + recoveredBody;
      }
    }
  }
  return null;
}

// ---------- Fractions: no text to recover at all, only an image ----------
//
// A fraction is typeset the same way as ×/÷ (see the file header) — vector
// paths, not font glyphs — but unlike an operator, its digits carry real
// information a "try every possibility" solve can't stand in for (there's
// no small fixed set of candidates). Unlike the ×/÷ case, this can also
// vanish WITHOUT leaving the tell-tale bare adjacency behind: "3 + 1⅕"
// loses its whole "⅕" including the space before it, leaving "3 + 1" —
// perfectly valid-looking arithmetic, just for the wrong sum. The only way
// to catch that is to actually check the apparent expression against the
// paper's own answer; a mismatch means something (almost always a fraction)
// went missing that a text-only fix can't restore, so it falls back to
// showing a captured image of the real line instead of wrong-looking text.
function stemLooksMismatched(stem, targetRaw) {
  const whatIs = /^what\s+is\b([\s\S]*?)\??$/i.exec(stem);
  if (!whatIs) return false;
  const body = whatIs[1].trim();
  if (!isPureExpression(body, false)) return false; // only a bare expression is checkable this way
  const target = parseFloat(String(targetRaw).replace(/,/g, ''));
  if (!Number.isFinite(target)) return false;
  const value = safeEvaluate(body);
  return value === null || Math.abs(value - target) > 0.005;
}

// Swaps the unreadable expression/equation for a plain phrase pointing at
// the image that replaces it, keeping the sentence grammatical rather than
// leaving behind whatever partial (and now known-wrong) text extraction
// produced.
function replaceStemWithImagePlaceholder(stem) {
  const whatIs = /^(what\s+is\b)[\s\S]*?\??$/i.exec(stem);
  if (whatIs) return `${whatIs[1]} the value shown in the picture below?`;
  const eqPrefix = /^([\s\S]*?\bequation\b[^.]*\.)\s*/i.exec(stem);
  if (eqPrefix) return `${eqPrefix[1]} (shown in the picture below)`;
  return stem;
}

// Turns a raw answer-key value ("80m", "8,394", "252 degrees", "£5.50",
// "22:30", "9 : 10") into a {value, type} pair matching this app's answer
// types. Where a plain number carries a trailing unit label the app's
// numeric keypad can't type anyway (units, £, commas), the unit is dropped
// and the bare number kept — the question's own wording already states the
// expected unit. Returns null for blank/corrupted (e.g. a blanked fraction).
function normalizeExtractedAnswer(raw) {
  const s = (raw || '').trim();
  if (isBlank(s)) return null;
  const stripped = s.replace(/^£\s*/, '');
  const m = stripped.match(/^(-?[\d,]+(?:\.\d+)?)\s*([a-zA-Z%°]*\d?)?\s*$/);
  if (m) {
    const numPart = m[1].replace(/,/g, '');
    if (/^-?\d+(?:\.\d+)?$/.test(numPart)) {
      return { value: numPart, type: 'numeric' };
    }
  }
  return { value: s.replace(/\s+/g, ''), type: 'text' };
}

const TOPIC_KEYWORDS = [
  { topic: 'fdp', words: ['%', 'percent', 'fraction', 'decimal'] },
  // Ahead of geometry: a question about translating or plotting a shape on
  // a grid is a coordinates question, even though it names a shape too.
  { topic: 'coordinates', words: ['coordinate', 'quadrant', 'x-axis', 'y-axis', 'midpoint', 'translated', 'translation', 'plot the point', 'grid'] },
  { topic: 'geometry', words: ['triangle', 'parallelogram', 'rectangle', 'square', 'circle', 'angle', 'perimeter', 'area', 'cube', 'volume', 'degrees', 'symmetry', 'isosceles'] },
  { topic: 'ratio', words: ['ratio', 'proportion', 'scale'] },
  { topic: 'algebra', words: ['solve', 'equation', '(x', 'x)', ' x ', 'value of x'] },
  { topic: 'dataHandling', words: ['mean', 'median', 'mode', 'probability', 'chart', 'graph', 'average', 'data'] },
  { topic: 'wordProblems', words: ['bought', 'spent', 'shared', 'cost', 'each', 'total', 'how many', 'how much'] },
];

// Rough, unverified topic guess — this document format carries no topic
// tags, so this is a heuristic starting point, not ground truth.
function guessTopic(stem) {
  const lower = stem.toLowerCase();
  for (const { topic, words } of TOPIC_KEYWORDS) {
    if (words.some((w) => lower.includes(w))) return topic;
  }
  return 'arithmetic';
}

// Rough difficulty banding by position in the paper (exam papers generally
// get harder as they go) — likewise a starting estimate, not measured.
function guessDifficulty(index, total) {
  const frac = index / total;
  if (frac < 0.2) return 1;
  if (frac < 0.4) return 2;
  if (frac < 0.65) return 3;
  if (frac < 0.85) return 4;
  return 5;
}

// Returns null if this text doesn't look like an Examberry-style structured
// paper at all (caller should fall back to the generic Q/A block parser).
// Otherwise returns { valid, errors } like the other parsers, where errors
// includes both real problems and questions deliberately skipped (with a
// per-question reason) for being unextractable or (when no diagram could be
// captured) diagram-dependent.
//
// `pages` and `renderRegion` (from pdfQuestions.js's extractPdfDocument) are
// optional — when provided, a diagram-dependent question is no longer
// automatically skipped: its page and the vertical gap where the diagram
// sits are located from the surrounding text's own Y positions (see
// pageForOffset/yAtOffset above) and rendered to an image via renderRegion,
// so the question can be shown with that image alongside its text instead
// of being dropped. Falls back to skipping, as before, if the image can't
// be confidently located or fails to render.
export async function parseExamberryMaths(fullText, pages, renderRegion) {
  try {
    const titleMatch = fullText.match(MATHS_TITLE_RE);
    if (!titleMatch) return null;

    const total = parseInt(titleMatch[3], 10);
    if (!Number.isFinite(total) || total < 1 || total > 200) return null;

    const searchFrom = titleMatch.index + titleMatch[0].length;
    const endOfTest = findFrom(fullText, /END OF TEST/i, searchFrom);
    const answersHeading = findFrom(fullText, /Mathematics Answers/i, searchFrom);

    const candidateEnds = [endOfTest, answersHeading].filter(Boolean).map((f) => f.index);
    if (candidateEnds.length === 0) {
      return { valid: [], errors: [err('Found a Mathematics test paper but could not find where it ends ("END OF TEST").', HINT_FORMAT_MISMATCH)] };
    }
    const mathsText = fullText.slice(searchFrom, Math.min(...candidateEnds));

    if (!answersHeading) {
      return { valid: [], errors: [err('Found a Mathematics test paper but could not find its "Mathematics Answers" section, so questions cannot be graded.', 'Make sure the PDF includes the full answer-key section, usually titled "Mathematics Answers" — without it, answers can\'t be verified.')] };
    }
    const answersStart = answersHeading.index + answersHeading.length;
    const answersEndMatch = findFrom(fullText, /END OF MATHEMATICS ANSWERS/i, answersStart);
    const answersText = fullText.slice(answersStart, answersEndMatch ? answersEndMatch.index : fullText.length);

    const qMarkers = findMarkerPositions(mathsText, total);
    const aMarkers = findMarkerPositions(answersText, total);
    if (!qMarkers || !aMarkers) {
      return { valid: [], errors: [err('Found a Mathematics test paper, but could not reliably number its questions against its answer key.', HINT_FORMAT_MISMATCH)] };
    }

    const diagramRanges = findDiagramRanges(mathsText);
    const valid = [];
    const errors = [];

    const toAbsolute = (offset) => searchFrom + offset;
    const canRenderDiagrams = Boolean(pages && renderRegion);
    const diagramImageCache = new Map(); // shared-range "from" qNum, or single qNum -> Promise<dataUrl|null>

    // A shared diagram ("use the graph below to answer questions 35-37") is
    // rendered once and reused for every question in the range: the image
    // sits in the gap between whatever precedes the range's first question
    // (the preamble sentence, or the previous question) and that first
    // question's own marker.
    function getSharedDiagramImage(range) {
      if (diagramImageCache.has(range.from)) return diagramImageCache.get(range.from);
      const startAbs = toAbsolute(qMarkers[range.from - 1]);
      const page = pageForOffset(pages, startAbs);
      const yBottom = yAtOffset(page, startAbs);
      const yTop = yAtOffset(page, startAbs - 1);
      const promise = (page && yTop > yBottom) ? renderRegion(page.pageNum, yTop, yBottom) : Promise.resolve(null);
      diagramImageCache.set(range.from, promise);
      return promise;
    }

    // A per-question diagram (e.g. "look at the number line below") occupies
    // some part of that question's own block — captured as the block's
    // whole vertical extent (its own marker's line down to just before the
    // next marker) rather than trying to isolate a tighter gap, since a
    // diagram can sit either below the stem or beside its answer choices
    // (see file header). That's a coarser crop — it can include some of the
    // question's own text/choices alongside the diagram — but it can't miss
    // the diagram itself, which a tighter guess could.
    function getPerQuestionDiagramImage(qNum) {
      if (diagramImageCache.has(qNum)) return diagramImageCache.get(qNum);
      const startAbs = toAbsolute(qMarkers[qNum - 1]);
      const endAbs = (qNum < total ? toAbsolute(qMarkers[qNum]) : toAbsolute(mathsText.length)) - 1;
      const startPage = pageForOffset(pages, startAbs);
      const endPage = pageForOffset(pages, endAbs);
      let promise;
      if (!startPage || !endPage || startPage.pageNum !== endPage.pageNum) {
        promise = Promise.resolve(null); // spans a page break — safer to fall back than guess
      } else {
        const yTop = yAtOffset(startPage, startAbs);
        const yBottom = yAtOffset(endPage, endAbs);
        promise = yTop > yBottom ? renderRegion(startPage.pageNum, yTop, yBottom) : Promise.resolve(null);
      }
      diagramImageCache.set(qNum, promise);
      return promise;
    }

    for (let i = 0; i < total; i += 1) {
      const qNum = i + 1;
      const qRaw = stripTrailingAxisLabels(stripTrailingPageNumber(stripBoilerplate(stripTrailingDiagramPreamble(blockAt(mathsText, qMarkers, i, total)))));
      const aRaw = stripTrailingPageNumber(stripBoilerplate(blockAt(answersText, aMarkers, i, total)));

      let { stem, choices } = splitStemAndChoices(qRaw);

      if (isBlank(stem)) {
        errors.push(err(`Q${qNum}: skipped — question text could not be extracted cleanly.`, HINT_UNEXTRACTABLE));
        continue;
      }
      const sharedRange = rangeContaining(diagramRanges, qNum);
      let diagramImage = null;
      if (sharedRange || needsDiagram(stem)) {
        if (canRenderDiagrams) {
          diagramImage = sharedRange ? await getSharedDiagramImage(sharedRange) : await getPerQuestionDiagramImage(qNum);
        }
        if (!diagramImage) {
          errors.push(err(`Q${qNum}: skipped — depends on a chart/graph/diagram that couldn't be captured as an image from this PDF.`, HINT_DIAGRAM));
          continue;
        }
      }
      // A missing-operator stem can only be repaired once we know the
      // question's own correct answer (see the recovery functions above),
      // so the actual fix-or-skip decision happens further down, once that
      // answer has been read from the key — this just remembers that it's
      // needed.
      const stemNeedsOperatorRecovery = stemHasCorruptedExpression(stem);

      const aLines = aRaw.split('\n').map((l) => l.trim()).filter(Boolean);
      const firstLine = aLines[0] || '';
      let explanationLines = aLines.slice(1);

      // A short MCQ answer is sometimes typeset on the same source line as
      // its "Step 1: ..." explanation ("A Step 1: 41 x 12 = 492"), rather
      // than on its own line — match a leading letter either way, and fold
      // any same-line remainder back into the explanation.
      const mcqMatch = firstLine.match(/^([A-Z])(?:\s+([\s\S]*))?$/);
      let mcqLetter = null;
      let freeResponseValue = firstLine;

      if (mcqMatch) {
        mcqLetter = mcqMatch[1];
        if (mcqMatch[2]) explanationLines = [mcqMatch[2], ...explanationLines];
      } else if (/^Step\s*\d*[:.]/i.test(firstLine)) {
        // A free-response answer whose boxed value was itself unextractable
        // (a blanked fraction) leaves "Step 1: ..." as the first non-empty
        // line — treat that as no answer at all, not as the answer text.
        freeResponseValue = '';
        explanationLines = aLines;
      }
      const explanation = explanationLines.join('\n').trim();
      const isMcqAnswer = mcqLetter !== null;

      if (isMcqAnswer) {
        if (!choices) {
          errors.push(err(`Q${qNum}: skipped — its multiple-choice options could not be found at all.`, HINT_FORMAT_MISMATCH));
          continue;
        }
        const choice = choices.find((c) => c.letter === mcqLetter);
        if (!choice) {
          errors.push(err(`Q${qNum}: skipped — its answer-key letter didn't match any of its extracted options.`, HINT_FORMAT_MISMATCH));
          continue;
        }
        let symbolsRecovered = false;
        if (stemNeedsOperatorRecovery) {
          const recovered = tryRecoverStemOperators(stem, choice.text);
          if (recovered) {
            stem = recovered;
            symbolsRecovered = true;
          } else {
            if (canRenderDiagrams) diagramImage = diagramImage || await getPerQuestionDiagramImage(qNum);
            if (!diagramImage) {
              errors.push(err(`Q${qNum}: skipped — its expression is missing a symbol (such as × or ÷) that didn't survive text extraction, and it couldn't be worked out uniquely from the answer key or shown as an image.`, HINT_OPERATOR_UNRECOVERABLE));
              continue;
            }
            stem = replaceStemWithImagePlaceholder(stem);
          }
        }
        // choicesCorrupted() is almost always fraction fallout (a bare or
        // duplicated option — see splitStemAndChoices) — the image we'd
        // capture shows the page exactly as printed regardless of what the
        // text layer managed to keep, so it's a safe fallback for ANY choice
        // corruption, not just fractions specifically. Only the interactive
        // buttons need to change: they show plain letters instead of
        // (unrecoverable) text, matched against the image above them.
        let useLetterChoices = false;
        if (choicesCorrupted(choices)) {
          if (canRenderDiagrams) diagramImage = diagramImage || await getPerQuestionDiagramImage(qNum);
          if (!diagramImage) {
            errors.push(err(`Q${qNum}: skipped — its multiple-choice options could not be extracted cleanly (likely contained a fraction or a missing × / ÷), and no image could be captured to show them instead.`, HINT_FRACTION_UNCAPTURED));
            continue;
          }
          useLetterChoices = true;
          // choice.text is exactly what's corrupted here, so it can't be
          // trusted as a "known value" to verify the stem's own expression
          // against below (a mixed-number fraction's text, e.g. "4 1/5",
          // would parseFloat down to a misleadingly-matching "4"). Since
          // this pattern is overwhelmingly a fraction, and the image already
          // shows the real stem regardless, swap it for the placeholder
          // unconditionally rather than risk leaving misleading leftover
          // text (a no-op on a stem that doesn't match the "what is"/
          // equation shape anyway).
          stem = replaceStemWithImagePlaceholder(stem);
        }
        if (!useLetterChoices && stemLooksMismatched(stem, choice.text)) {
          // Even if an image was already captured above for an unrelated
          // reason (e.g. a needed diagram), the stem's own wrong-looking
          // text still needs swapping for the placeholder — the image
          // being available doesn't make the leftover text any less wrong.
          if (canRenderDiagrams) diagramImage = diagramImage || await getPerQuestionDiagramImage(qNum);
          if (!diagramImage) {
            errors.push(err(`Q${qNum}: skipped — its expression doesn't evaluate to its own answer-key value (likely a fraction lost in extraction), and no image could be captured to show it instead.`, HINT_FRACTION_UNCAPTURED));
            continue;
          }
          stem = replaceStemWithImagePlaceholder(stem);
        }
        // Last-resort net: a stem can read as normal prose with every check
        // above satisfied yet still be missing the one number that made it a
        // maths question, if that number was itself lost to extraction — a
        // wordy stem with no digit of its own (e.g. "...first nine prime
        // numbers?") is fine as long as its own options still carry numbers,
        // and a diagram/fraction-image question's numbers legitimately live
        // in the image.
        if (!diagramImage && !/\d/.test(stem) && !choices.some((c) => /\d/.test(c.text))) {
          errors.push(err(`Q${qNum}: skipped — no numbers survived extraction from this question.`, HINT_UNEXTRACTABLE));
          continue;
        }
        valid.push({
          topic: guessTopic(stem),
          subtopic: 'examberry',
          difficulty: guessDifficulty(i, total),
          prompt: stem,
          answerType: 'mcq',
          correctAnswer: useLetterChoices ? choice.letter : choice.text,
          choices: useLetterChoices ? choices.map((c) => c.letter) : choices.map((c) => c.text),
          explanation,
          answerSource: 'given',
          symbolsRecovered,
          diagramImage,
        });
      } else {
        const normalized = normalizeExtractedAnswer(freeResponseValue);
        if (!normalized) {
          errors.push(err(`Q${qNum}: skipped — its answer appears to involve a fraction or symbol that didn't extract cleanly from the PDF.`, HINT_UNEXTRACTABLE));
          continue;
        }
        let symbolsRecovered = false;
        if (stemNeedsOperatorRecovery) {
          const recovered = tryRecoverStemOperators(stem, normalized.value);
          if (recovered) {
            stem = recovered;
            symbolsRecovered = true;
          } else {
            if (canRenderDiagrams) diagramImage = diagramImage || await getPerQuestionDiagramImage(qNum);
            if (!diagramImage) {
              errors.push(err(`Q${qNum}: skipped — its expression is missing a symbol (such as × or ÷) that didn't survive text extraction, and it couldn't be worked out uniquely from the answer key or shown as an image.`, HINT_OPERATOR_UNRECOVERABLE));
              continue;
            }
            stem = replaceStemWithImagePlaceholder(stem);
          }
        }
        // Same fraction-shaped blind spot as the MCQ branch above: a
        // fraction can vanish without leaving a bare adjacency behind (e.g.
        // "3 + 1⅕" -> "3 + 1"), which reads as valid but wrong arithmetic —
        // only catchable by checking it against the paper's own answer.
        if (stemLooksMismatched(stem, normalized.value)) {
          if (canRenderDiagrams) diagramImage = diagramImage || await getPerQuestionDiagramImage(qNum);
          if (!diagramImage) {
            errors.push(err(`Q${qNum}: skipped — its expression doesn't evaluate to its own answer-key value (likely a fraction lost in extraction), and no image could be captured to show it instead.`, HINT_FRACTION_UNCAPTURED));
            continue;
          }
          stem = replaceStemWithImagePlaceholder(stem);
        }
        if (!diagramImage && !/\d/.test(stem)) {
          errors.push(err(`Q${qNum}: skipped — no numbers survived extraction from this question.`, HINT_UNEXTRACTABLE));
          continue;
        }
        valid.push({
          topic: guessTopic(stem),
          subtopic: 'examberry',
          difficulty: guessDifficulty(i, total),
          prompt: stem,
          answerType: normalized.type,
          correctAnswer: normalized.value,
          choices: null,
          explanation,
          answerSource: 'given',
          symbolsRecovered,
          diagramImage,
        });
      }
    }

    if (valid.length === 0 && errors.length === 0) {
      errors.push(err('Found a Mathematics test paper but could not extract any usable questions from it.', HINT_FORMAT_MISMATCH));
    }
    return { valid, errors };
  } catch (e) {
    return { valid: [], errors: [err(`Unexpected error while parsing this Mathematics paper: ${e.message}`, 'This is likely a bug in the importer rather than a problem with the PDF — try a different file, or report this issue.')] };
  }
}
