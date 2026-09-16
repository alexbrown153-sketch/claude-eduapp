// Extracts text from an uploaded PDF (via pdf.js, loaded from a CDN in
// index.html — an explicit, deliberate exception to this project's usual
// offline-only rule, made because a real PDF parser can't be hand-rolled)
// and parses simple "Q: ... A: ..." style question blocks out of it. PDF
// layouts vary enormously, so this is a best-effort parser: it works well
// for a consistently-formatted study sheet, poorly for scanned or free-form
// documents — anything it can't confidently parse is reported, not guessed.
//
// The "A: ..." part is optional — if a block has no answer line,
// answerSolver.js tries to determine one from the question text (see its
// header comment for how confident that is).

import { determineAnswer } from './answerSolver.js';
import { parseExamberryMaths } from './examberryPdfParser.js';

const FALLBACK_TOPIC = 'wordProblems';

// Every error/skip is a { message, hint } pair — see examberryPdfParser.js
// for why these are kept together at the source rather than the message
// text alone.
function err(message, hint) {
  return { message, hint };
}

// getTextContent() items carry position but no inherent line breaks — join
// them into lines by watching the Y coordinate (item.transform[5]) instead
// of just space-joining everything into one run-on string. Also records,
// alongside the text, the Y each line started at (`lines`) — needed later
// to find where a diagram sits on the page (see extractPdfDocument and
// examberryPdfParser.js's diagram-capture code): a diagram takes up real
// vertical space between two lines of text but produces no text of its own,
// so the only way to find it is by the gap between two KNOWN Y positions.
//
// Some PDFs in this family (e.g. later Tiffin practice papers, not the
// original two) fragment a single word or number into several text items at
// ordinary kerning-pair boundaries, with essentially no horizontal gap
// between them (observed: 0.00-0.08pt) — e.g. "How much" as two items "How
// m" + "uch". A real space between words in these same PDFs always comes
// through as its own explicit item (str: " ") with real width, never as a
// bare gap with nothing there — so unlike the naive "always join same-line
// items with a space" this used to do, a space is only synthesized when the
// horizontal gap to the previous item exceeds a small kerning-level
// threshold; below that, the two items are just two pieces of one word or
// number and get joined directly ("How m" + "uch" -> "How much").
//
// The same PDFs also raise/lower the baseline for superscripts (an ordinal
// suffix like the "st" in "1st", or an exponent like the "2" in "132m2") by
// a few points without starting a real new line (observed: a consistent
// ~4pt shift) — a genuine new line, by contrast, always resets the X
// position back toward the page's left margin AND is a much bigger Y jump
// (observed: never less than ~12pt in this document family, vs. real
// multi-line paragraph gaps that are typically 15pt+). So a Y jump is only
// treated as a superscript, not a new line, when BOTH signals agree: it's
// small (within SUPERSCRIPT_MAX_Y_SHIFT_PT) AND the X position keeps moving
// forward rather than resetting. Requiring both avoids misreading an
// unrelated, much-lower fragment on the same page (e.g. a page-number
// footer, which can be a huge Y jump but occasionally an X position that
// happens to still be "forward") as a same-line continuation — X alone
// isn't a safe enough signal by itself, only combined with a small Y jump.
// A small Y jump that passes both checks joins the line normally (subject
// to the same gap-based spacing rule above) rather than being force-split
// onto its own line, which the later whitespace handling would otherwise
// turn into a spurious space (e.g. "1st" -> "1 st").
const SPURIOUS_GAP_THRESHOLD_PT = 1;
const BACKWARD_X_TOLERANCE_PT = 2;
const SUPERSCRIPT_MAX_Y_SHIFT_PT = 6;

function itemsToText(items) {
  let text = '';
  let lastY = null;
  let lastEndX = null;
  const lines = [];
  items.forEach((item) => {
    const y = Array.isArray(item.transform) ? item.transform[5] : null;
    const x = Array.isArray(item.transform) ? item.transform[4] : null;
    const yDelta = lastY !== null && y !== null ? Math.abs(y - lastY) : null;
    const continuesForward = x !== null && lastEndX !== null && x >= lastEndX - BACKWARD_X_TOLERANCE_PT;
    const looksLikeSuperscriptShift = yDelta !== null && yDelta <= SUPERSCRIPT_MAX_Y_SHIFT_PT && continuesForward;
    if (yDelta !== null && yDelta > 1 && !looksLikeSuperscriptShift) {
      text += '\n';
      lines.push({ offset: text.length, y });
      lastEndX = null;
    } else if (text && !text.endsWith('\n')) {
      const gap = lastEndX !== null && x !== null ? x - lastEndX : null;
      if (gap === null || gap > SPURIOUS_GAP_THRESHOLD_PT) text += ' ';
    } else if (text.length === 0 && y !== null) {
      lines.push({ offset: 0, y });
    }
    text += item.str;
    if (y !== null) lastY = y;
    lastEndX = x !== null ? x + (item.width || 0) : null;
  });
  return { text, lines };
}

// Renders a horizontal band of one PDF page (in PDF point coordinates, Y
// increasing upward — the same space item.transform[5] values live in) to a
// cropped PNG data URL, for showing a diagram/chart/graph the question text
// itself can't carry. `yTop`/`yBottom` are typically "end of the previous
// question's text" and "start of the next question's marker", i.e. the
// visual gap where the diagram sits. Returns null if the region is
// degenerate (no real gap) rather than producing a blank/garbage image.
async function renderPageRegion(pdf, pageNum, pageHeight, yTop, yBottom) {
  const PADDING_PT = 8; // a little breathing room so axis labels aren't clipped
  const SCALE = 2; // resolution multiplier — plenty for an on-screen diagram
  const top = Math.min(pageHeight, yTop + PADDING_PT);
  const bottom = Math.max(0, yBottom - PADDING_PT);
  if (top - bottom < 20) return null; // too thin to be a real diagram

  const page = await pdf.getPage(pageNum);
  const viewport = page.getViewport({ scale: SCALE });
  const fullCanvas = document.createElement('canvas');
  fullCanvas.width = viewport.width;
  fullCanvas.height = viewport.height;
  await page.render({ canvasContext: fullCanvas.getContext('2d'), viewport }).promise;

  // PDF space has Y=0 at the bottom; canvas pixel space has Y=0 at the top.
  const cropTopPx = Math.max(0, (pageHeight - top) * SCALE);
  const cropBottomPx = Math.min(fullCanvas.height, (pageHeight - bottom) * SCALE);
  const cropHeightPx = Math.round(cropBottomPx - cropTopPx);
  if (cropHeightPx < 10) return null;

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = fullCanvas.width;
  cropCanvas.height = cropHeightPx;
  cropCanvas.getContext('2d').drawImage(
    fullCanvas, 0, cropTopPx, fullCanvas.width, cropHeightPx, 0, 0, fullCanvas.width, cropHeightPx,
  );
  return cropCanvas.toDataURL('image/png');
}

// Returns { fullText, pages, renderRegion } — pages carries enough of each
// page's own text layout (line Y-positions, starting offset within
// fullText) for examberryPdfParser.js to work out which page and which
// vertical band on it correspond to a diagram it can't extract as text, and
// renderRegion is how it actually gets rendered once located (see above).
async function extractPdfDocument(arrayBuffer) {
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  const pageTexts = [];
  let cumulativeOffset = 0;
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const { text, lines } = itemsToText(content.items);
    const viewport = page.getViewport({ scale: 1 });
    pages.push({ pageNum: i, startInFull: cumulativeOffset, lines, pageHeight: viewport.height });
    pageTexts.push(text);
    cumulativeOffset += text.length + 2; // +2 for the '\n\n' page separator joined in below
  }
  const fullText = pageTexts.join('\n\n');
  const renderRegion = (pageNum, yTop, yBottom) => {
    const page = pages.find((p) => p.pageNum === pageNum);
    return page ? renderPageRegion(pdf, pageNum, page.pageHeight, yTop, yBottom) : Promise.resolve(null);
  };
  return { fullText, pages, renderRegion };
}

function parseQuestionBlocks(text, validTopics) {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const startsNewBlock = (line) => /^(Q\d*[:.)]|Question\s*\d*[:.)]|\d+[.)]\s)/i.test(line);

  const blocks = [];
  let current = null;
  lines.forEach((line) => {
    if (startsNewBlock(line)) {
      if (current) blocks.push(current.join(' '));
      current = [line];
    } else if (current) {
      current.push(line);
    }
  });
  if (current) blocks.push(current.join(' '));

  const valid = [];
  const errors = [];

  if (blocks.length === 0) {
    errors.push(err(
      'No "Q: ... A: ..." style question blocks were found in this PDF’s text.',
      'This importer expects either an Examberry-style practice paper (with a "Mathematics" section and its own answer key), or a plain sheet with each question formatted like "Q: ... A: ...".',
    ));
    return { valid, errors };
  }

  blocks.forEach((blockText, i) => {
    const qMatch = blockText.match(/^(?:Q\d*[:.)]|Question\s*\d*[:.)]|\d+[.)])\s*([\s\S]*?)(?=\s*(?:A\d*[:.)]|Answer[:.)])|$)/i);
    const aMatch = blockText.match(/(?:A\d*[:.)]|Answer[:.)])\s*([\s\S]*?)(?=\s*(?:Explanation[:.)]|Topic[:.)]|Difficulty[:.)])|$)/i);
    const explMatch = blockText.match(/Explanation[:.)]\s*([\s\S]*?)(?=\s*(?:Topic[:.)]|Difficulty[:.)])|$)/i);
    const topicMatch = blockText.match(/Topic[:.)]\s*(\w+)/i);
    const diffMatch = blockText.match(/Difficulty[:.)]\s*(\d)/i);

    const prompt = qMatch ? qMatch[1].trim() : '';
    let answer = aMatch ? aMatch[1].trim() : '';
    let answerSource = answer ? 'given' : null;

    if (!prompt) {
      errors.push(err(
        `Block ${i + 1}: couldn’t find a question — "${blockText.slice(0, 60)}${blockText.length > 60 ? '…' : ''}"`,
        'Check this block starts with "Q:" (or a number like "1.") immediately followed by the question text.',
      ));
      return;
    }
    if (!answer) {
      const determined = determineAnswer(prompt);
      if (determined) {
        answer = determined.answer;
        answerSource = determined.confidence;
      }
    }
    if (!answer) {
      errors.push(err(
        `Block ${i + 1}: no "Answer:" given and none could be automatically determined — "${blockText.slice(0, 60)}${blockText.length > 60 ? '…' : ''}"`,
        'Add an "A: ..." line with the answer, or rephrase the question as a plain calculation (e.g. "What is 12 × 4?") so it can be worked out automatically.',
      ));
      return;
    }

    const topic = topicMatch && validTopics.includes(topicMatch[1]) ? topicMatch[1] : FALLBACK_TOPIC;
    const difficulty = diffMatch ? Math.min(5, Math.max(1, Number(diffMatch[1]))) : 3;

    valid.push({
      topic,
      subtopic: 'custom-pdf',
      difficulty,
      prompt,
      answerType: 'text',
      correctAnswer: answer,
      choices: null,
      explanation: explMatch ? explMatch[1].trim() : '',
      answerSource,
    });
  });

  return { valid, errors };
}

export async function parsePdfQuestions(arrayBuffer, validTopics) {
  if (!window.pdfjsLib) {
    return { valid: [], errors: [err(
      'PDF support didn’t load.',
      'This needs an internet connection the first time (the PDF reader loads from the web) — check your connection and try again.',
    )] };
  }
  let fullText;
  let pages;
  let renderRegion;
  try {
    ({ fullText, pages, renderRegion } = await extractPdfDocument(arrayBuffer));
  } catch (e) {
    return { valid: [], errors: [err(`Could not read that PDF: ${e.message}`, 'Make sure the file is a valid, non-corrupted PDF, then try again.')] };
  }
  if (!fullText.trim()) {
    return { valid: [], errors: [err(
      'No text could be extracted from that PDF.',
      'This usually means it’s a scanned image rather than real text — this importer needs a text-based PDF, not a photo or scan of a paper.',
    )] };
  }

  // Structured exam papers (e.g. "Tiffin Test N: Mathematics") are handled
  // by a dedicated maths-only parser that cross-references the real answer
  // key — see examberryPdfParser.js. Only fall back to the generic "Q: ...
  // A: ..." block parser if this doesn't look like that format at all.
  const structured = await parseExamberryMaths(fullText, pages, renderRegion);
  if (structured) return structured;

  return parseQuestionBlocks(fullText, validTopics);
}
