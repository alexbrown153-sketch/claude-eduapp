// Extracts text from an uploaded PDF (via pdf.js, loaded from a CDN in
// index.html — an explicit, deliberate exception to this project's usual
// offline-only rule, made because a real PDF parser can't be hand-rolled)
// and parses simple "Q: ... A: ..." style question blocks out of it. PDF
// layouts vary enormously, so this is a best-effort parser: it works well
// for a consistently-formatted study sheet, poorly for scanned or free-form
// documents — anything it can't confidently parse is reported, not guessed.

const FALLBACK_TOPIC = 'wordProblems';

// getTextContent() items carry position but no inherent line breaks — join
// them into lines by watching the Y coordinate (item.transform[5]) instead
// of just space-joining everything into one run-on string.
function itemsToText(items) {
  let text = '';
  let lastY = null;
  items.forEach((item) => {
    const y = Array.isArray(item.transform) ? item.transform[5] : null;
    if (lastY !== null && y !== null && Math.abs(y - lastY) > 1) {
      text += '\n';
    } else if (text && !text.endsWith('\n')) {
      text += ' ';
    }
    text += item.str;
    if (y !== null) lastY = y;
  });
  return text;
}

async function extractPdfText(arrayBuffer) {
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pageTexts = [];
  for (let i = 1; i <= pdf.numPages; i += 1) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    pageTexts.push(itemsToText(content.items));
  }
  return pageTexts.join('\n\n');
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
    errors.push('No "Q: ... A: ..." style question blocks were found in this PDF’s text.');
    return { valid, errors };
  }

  blocks.forEach((blockText, i) => {
    const qMatch = blockText.match(/^(?:Q\d*[:.)]|Question\s*\d*[:.)]|\d+[.)])\s*([\s\S]*?)(?=\s*(?:A\d*[:.)]|Answer[:.)])|$)/i);
    const aMatch = blockText.match(/(?:A\d*[:.)]|Answer[:.)])\s*([\s\S]*?)(?=\s*(?:Explanation[:.)]|Topic[:.)]|Difficulty[:.)])|$)/i);
    const explMatch = blockText.match(/Explanation[:.)]\s*([\s\S]*?)(?=\s*(?:Topic[:.)]|Difficulty[:.)])|$)/i);
    const topicMatch = blockText.match(/Topic[:.)]\s*(\w+)/i);
    const diffMatch = blockText.match(/Difficulty[:.)]\s*(\d)/i);

    const prompt = qMatch ? qMatch[1].trim() : '';
    const answer = aMatch ? aMatch[1].trim() : '';

    if (!prompt || !answer) {
      errors.push(`Block ${i + 1}: couldn’t find both a question and an "Answer:" — "${blockText.slice(0, 60)}${blockText.length > 60 ? '…' : ''}"`);
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
    });
  });

  return { valid, errors };
}

export async function parsePdfQuestions(arrayBuffer, validTopics) {
  if (!window.pdfjsLib) {
    return { valid: [], errors: ['PDF support didn’t load (needs an internet connection the first time). Try again when online, or use the JSON upload instead.'] };
  }
  let text;
  try {
    text = await extractPdfText(arrayBuffer);
  } catch (e) {
    return { valid: [], errors: [`Could not read that PDF: ${e.message}`] };
  }
  if (!text.trim()) {
    return { valid: [], errors: ['No text could be extracted from that PDF — it may be a scanned image rather than real text.'] };
  }
  return parseQuestionBlocks(text, validTopics);
}
