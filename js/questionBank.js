// Question sourcing for a session. Per Roadmap ideas.md #77, every question
// shown during a session comes exclusively from the user's own PDF imports
// (see pdfQuestions.js/examberryPdfParser.js) — the procedurally-generated
// arithmetic/fdp/geometry/ratio/algebra/dataHandling questions and the
// hand-authored word-problems bank that used to be mixed in have both been
// retired from active use (wordProblems.js itself is left in the repo,
// just no longer wired up, in case that policy changes later).

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}

// A question the child most recently got wrong (Storage.markQuestionResult,
// Roadmap ideas.md #78) is this many times more likely to be picked than one
// answered correctly (or never seen) — until it's answered correctly once,
// at which point it drops straight back to standard frequency alongside
// everything else, rather than tapering off gradually.
const RETRY_WEIGHT = 4;

// Returns null when no imported question matches this exact topic+tier —
// callers must treat that as "blocked" and tell the user, not silently
// substitute a different topic or tier (see session.js's pickNextQuestion).
export function getQuestion(topic, tier, customQuestions = []) {
  const matching = customQuestions.filter((q) => q.topic === topic && q.difficulty === tier);
  if (matching.length === 0) return null;
  const weighted = [];
  matching.forEach((q) => {
    const copies = q.needsRetry ? RETRY_WEIGHT : 1;
    for (let i = 0; i < copies; i += 1) weighted.push(q);
  });
  return { ...pick(weighted), source: 'custom' };
}
