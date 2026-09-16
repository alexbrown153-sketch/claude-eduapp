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
//    shapes) can't be shown to the child at all in a text-only app, so
//    they're detected by keyword and skipped too.
// Both kinds of skips are reported by question number so nothing is silently
// dropped.

const MATHS_TITLE_RE = /([^\n]{0,80}Mathematics)\s+(\d+)\s*Minutes\s+(\d+)\s*Questions/i;

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

function stripTrailingDiagramPreamble(stem) {
  return stem
    .replace(/\s*Use the (?:following )?(?:graph|chart|table|pie chart|diagram|picture|image)[^.]*\.(?:\s*This (?:graph|chart|table)[^.]*\.)?\s*$/i, '')
    .trim();
}

const DIAGRAM_KEYWORDS = [
  'pie chart', 'following graph', 'graph below', 'graph shows', 'chart below',
  'chart represents', 'number line below', 'diagram below', 'shape below',
  'figure below', 'use the graph', 'following parallelogram', 'following pie chart',
  'bar chart', 'graph below', 'shown below', 'pictured below', 'made up of equilateral triangles',
];

function needsDiagram(stem) {
  const lower = stem.toLowerCase();
  return DIAGRAM_KEYWORDS.some((k) => lower.includes(k));
}

// Some diagrams are shared across a run of questions ("...to answer
// questions 35-37") rather than flagged in each question's own text.
function findDiagramRanges(mathsText) {
  const ranges = new Set();
  const re = /use the (?:following )?(?:graph|chart|table|pie chart|diagram|picture|image)[^.]*?(?:to answer questions?)\s*(\d+)\s*(?:[-–—]|to)\s*(\d+)/gi;
  let m;
  while ((m = re.exec(mathsText))) {
    const from = parseInt(m[1], 10);
    const to = parseInt(m[2], 10);
    if (Number.isFinite(from) && Number.isFinite(to) && to >= from && to - from < 20) {
      for (let n = from; n <= to; n += 1) ranges.add(n);
    }
  }
  return ranges;
}

// Splits a question block into its stem and (if present) a run of 2+
// consecutive "A. ... B. ... " option lines with strictly increasing letters.
// A "bare" letter line ("X." with nothing after it) means that option's text
// was dropped entirely (typically a fraction) — mid-sequence, that's treated
// as the whole options block being untrustworthy rather than just missing
// one option, since a partial fraction that keeps its whole-number part
// (e.g. "3 37/50" extracting as bare "3") would otherwise look like a
// perfectly valid — but wrong — short numeric option.
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
  let truncated = false;
  for (let i = firstOptIdx; i < lines.length; i += 1) {
    const bare = lines[i].match(bareLetterRe);
    if (bare) {
      if (expectedCode === null || bare[1].charCodeAt(0) === expectedCode) truncated = true;
      break;
    }
    const m = lines[i].match(optionRe);
    if (!m) break;
    const code = m[1].charCodeAt(0);
    if (expectedCode !== null && code !== expectedCode) break;
    choices.push({ letter: m[1], text: m[2].trim() });
    expectedCode = code + 1;
  }
  if (choices.length < 2 || truncated) {
    return { stem: cleanText(lines.slice(0, firstOptIdx).join(' ')), choices: null };
  }
  return { stem: cleanText(lines.slice(0, firstOptIdx).join(' ')), choices };
}

function choicesCorrupted(choices) {
  if (choices.some((c) => isBlank(c.text))) return true;
  const texts = choices.map((c) => c.text.trim().toLowerCase());
  return new Set(texts).size < texts.length;
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
// per-question reason) for being unextractable or diagram-dependent.
export function parseExamberryMaths(fullText) {
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
      return { valid: [], errors: ['Found a Mathematics test paper but could not find where it ends ("END OF TEST").'] };
    }
    const mathsText = fullText.slice(searchFrom, Math.min(...candidateEnds));

    if (!answersHeading) {
      return { valid: [], errors: ['Found a Mathematics test paper but could not find its "Mathematics Answers" section, so questions cannot be graded.'] };
    }
    const answersStart = answersHeading.index + answersHeading.length;
    const answersEndMatch = findFrom(fullText, /END OF MATHEMATICS ANSWERS/i, answersStart);
    const answersText = fullText.slice(answersStart, answersEndMatch ? answersEndMatch.index : fullText.length);

    const qMarkers = findMarkerPositions(mathsText, total);
    const aMarkers = findMarkerPositions(answersText, total);
    if (!qMarkers || !aMarkers) {
      return { valid: [], errors: ['Found a Mathematics test paper, but could not reliably number its questions against its answer key — this PDF’s layout may not match what this importer expects.'] };
    }

    const diagramRanges = findDiagramRanges(mathsText);
    const valid = [];
    const errors = [];

    for (let i = 0; i < total; i += 1) {
      const qNum = i + 1;
      const qRaw = stripTrailingPageNumber(stripTrailingDiagramPreamble(blockAt(mathsText, qMarkers, i, total)));
      const aRaw = stripTrailingPageNumber(blockAt(answersText, aMarkers, i, total));

      const { stem, choices } = splitStemAndChoices(qRaw);

      if (isBlank(stem)) {
        errors.push(`Q${qNum}: skipped — question text could not be extracted cleanly.`);
        continue;
      }
      if (diagramRanges.has(qNum) || needsDiagram(stem)) {
        errors.push(`Q${qNum}: skipped — depends on a chart/graph/diagram that can't be shown in this app.`);
        continue;
      }

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
        if (!choices || choicesCorrupted(choices)) {
          errors.push(`Q${qNum}: skipped — its multiple-choice options could not be extracted cleanly (likely contained a fraction).`);
          continue;
        }
        const choice = choices.find((c) => c.letter === mcqLetter);
        if (!choice) {
          errors.push(`Q${qNum}: skipped — its answer-key letter didn't match any of its extracted options.`);
          continue;
        }
        valid.push({
          topic: guessTopic(stem),
          subtopic: 'examberry',
          difficulty: guessDifficulty(i, total),
          prompt: stem,
          answerType: 'mcq',
          correctAnswer: choice.text,
          choices: choices.map((c) => c.text),
          explanation,
          answerSource: 'given',
        });
      } else {
        const normalized = normalizeExtractedAnswer(freeResponseValue);
        if (!normalized) {
          errors.push(`Q${qNum}: skipped — its answer appears to involve a fraction or symbol that didn't extract cleanly from the PDF.`);
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
        });
      }
    }

    if (valid.length === 0 && errors.length === 0) {
      errors.push('Found a Mathematics test paper but could not extract any usable questions from it.');
    }
    return { valid, errors };
  } catch (e) {
    return { valid: [], errors: [`Unexpected error while parsing this Mathematics paper: ${e.message}`] };
  }
}
