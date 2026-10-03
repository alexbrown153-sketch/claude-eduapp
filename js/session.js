// Session engine: builds a session, picks questions one at a time (so the
// anti-frustration rule in mastery.js can react mid-session), scores answers,
// and persists progress incrementally so an interrupted session on a tablet
// doesn't lose data.

import { Storage, TOPICS, YEAR7_TOPICS } from './storage.js';
import { selectDifficultyTier, updateMastery, weightedRandomPick, EXPECTED_TIME_MS, tierFromMastery, snapshotTiers } from './mastery.js';
import { getQuestion, questionVariant, getNewVersion } from './questionBank.js';
import { getSpotQuestion, hasSpotTemplate } from './spotMistake.js';
import { localDateStr, daysBetweenLocalDates, sessionLocalDay, addDays } from './dates.js';

// Two kinds of session with a list fixed at the start (build 2):
//  - `queue`: ready-made questions asked in order — "Try these again"
//    (mode 'retry', #127) and "Fix my mistakes" (mode 'fix', #128);
//  - `checkupQueue`: topics asked in order, each question made when it's
//    reached so its tier can react to the answer before (mode 'checkup',
//    #149).
// Both are saved with the in-progress session, so Resume carries on with
// what's left in the same order. In these sessions a "Try one like it"
// follow-up never uses up a place in the list. Retry and Fix have no boss;
// the check-up does, like any session.
export function startSession({ topicWeighting, topicFocus, lengthType, lengthValue, mode, queue = null, checkupQueue = null, mastery = null, topicFocusList = null }) {
  const listed = queue || checkupQueue;
  return {
    sessionId: `s_${Date.now()}`,
    date: new Date().toISOString(),
    mode,
    lengthType: listed ? 'questions' : lengthType,
    lengthValue: listed ? listed.length : lengthValue,
    topicFocus: listed ? null : (topicFocus || null),
    // #188: "Choose your own mix": 2+ topics ticked. Then topicFocus is null
    // and questions come from these topics, weighted like the daily mix. A
    // session saved before this has no list: read as null.
    topicFocusList: listed || !Array.isArray(topicFocusList) ? null : topicFocusList,
    topicWeighting,
    ...(queue ? { queue } : {}),
    ...(checkupQueue ? { checkupQueue } : {}),
    // #127: the explanation and diagram of each wrong answer, by its index
    // in `questions`, for this session's "Questions I got wrong" list. Kept
    // with the in-progress session only, never in the saved log (diagrams
    // would fill up storage over the months).
    reviewExtras: {},
    questions: [],
    startedAt: Date.now(),
    // Roadmap #178: milliseconds spent with the app hidden (iPad locked, or
    // another app in front). A timed session's clock doesn't run during it.
    pausedMs: 0,
    // #172: every topic's tier at the start, to spot level-ups on the
    // summary. Saved with the in-progress session, never in the log.
    ...(mastery ? { startTiers: snapshotTiers(mastery) } : {}),
    score: 0,
    streak: 0,
    bestStreak: 0,
    // Roadmap #92/#94/#95: a session can end on the boss challenge.
    // bossDone flips once the challenge is over (or was never unlocked);
    // bossLocked records that accuracy wasn't high enough to face it;
    // bossHits counts challenge questions answered correctly, and
    // bossDefeated is true only when all of them were.
    bossDone: mode === 'retry' || mode === 'fix',
    bossLocked: false,
    bossHits: 0,
    bossDefeated: false,
    usedWordProblemIds: new Set(),
  };
}

// #127/#128: the one queue builder for "Try these again" and "Fix my
// mistakes". `kinds` ({ topic, subtopic, difficulty, variant?, prompt? })
// come in priority order; a new version of each (getNewVersion: same
// topic, subtopic and tier, same operators or word-problem template, a
// different prompt) is made until `cap` are ready, skipping any kind that
// can't be remade. Then easiest tier first, so the round opens with a win
// (SPEC §6) — a stable sort, so equal tiers keep their order.
export function buildRetryQueue(kinds, cap) {
  const queue = [];
  for (const kind of kinds) {
    if (queue.length >= cap) break;
    const q = getNewVersion(kind);
    if (q) queue.push(q);
  }
  return queue.sort((a, b) => a.difficulty - b.difficulty);
}

// #149: the check-up's topic list — every topic twice (once each if that
// would be more than CHECKUP_MAX questions), shuffled so no topic comes
// twice in a row. With two of each of 8 topics that's always possible; a
// few random shuffles find one almost at once, and the fallback just
// accepts the last shuffle.
export const CHECKUP_MAX = 20;
export function buildCheckupQueue(topics) {
  const perTopic = topics.length * 2 <= CHECKUP_MAX ? 2 : 1;
  const list = topics.flatMap((t) => Array(perTopic).fill(t));
  let best = list;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const shuffled = [...list];
    for (let i = shuffled.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    best = shuffled;
    if (shuffled.every((t, i) => i === 0 || t !== shuffled[i - 1])) break;
  }
  return best;
}

// Roadmap #88: the combo meter. The run of correct answers in a row
// (session.streak) multiplies each answer's points — x2 from the 3rd in a
// row, x3 from the 6th. A wrong answer just resets the run; points already
// banked are never taken away (SPEC §8: non-punitive).
export function comboMultiplier(streak) {
  if (streak >= 6) return 3;
  if (streak >= 3) return 2;
  return 1;
}

export const BOSS_POINTS_MULTIPLIER = 3;

// Roadmap #95: the boss challenge is three questions, and destroying the
// boss completely (all three right) adds a flat bonus on top of the triple
// points each hit already earns.
export const BOSS_QUESTION_COUNT = 3;
export const BOSS_DEFEAT_BONUS = 100;

// Roadmap #94: the challenge only unlocks for MORE than 80% of the session's
// own questions right — 80% exactly doesn't count, so 8/10 misses out and
// 9/10 gets in.
export const BOSS_UNLOCK_ACCURACY = 0.8;

// Roadmap #92: the boss comes from the strongest topic — the highest mastery
// score among topics actually practised, so it isn't just whichever topic
// happens to sit first at the untouched 50% default. No practice data yet
// (a first session) falls back to this session's own topic mix.
//
// Only the core topics: Year 7 topics (#148) are never the boss's topic.
function strongestTopic(session, mastery) {
  const practised = Object.entries(mastery).filter(([t, rec]) => TOPICS.includes(t) && rec.questionsSeen > 0);
  if (practised.length === 0) return session.topicFocus || pickMixTopic(session, true) || weightedRandomPick(session.topicWeighting);
  return practised.sort((a, b) => b[1].masteryScore - a[1].masteryScore)[0][0];
}

// One tier above the child's current level in that topic, capped at 5 — it
// should feel like a boss, and it's drawn from the topic they're best at.
function pickBossQuestion(session, mastery) {
  const topic = strongestTopic(session, mastery);
  const record = mastery[topic];
  const tier = Math.min(5, (record.difficultyLevel || selectDifficultyTier(record)) + 1);
  const q = getQuestion(topic, tier, session.usedWordProblemIds);
  if (!q) return null;
  if (q.source === 'authored' && q.id) session.usedWordProblemIds.add(q.id);
  return { ...q, isBoss: true };
}

function bossQuestionsAsked(session) {
  return session.questions.filter((q) => q.boss).length;
}

export function isListedSession(session) {
  return Array.isArray(session.queue) || Array.isArray(session.checkupQueue);
}

// The answers that use up the session's length: everything but the boss —
// and, in a listed session, but "Try one like it" follow-ups too, so the
// next place in the list is always questions[regularCount].
export function regularCount(session) {
  const listed = isListedSession(session);
  return session.questions.filter((q) => !q.boss && !(listed && Number.isInteger(q.followUpOf))).length;
}

// Roadmap #149: the check-up's next question. The first question in a
// topic is at the topic's current tier exactly (no stretch or easier roll),
// so it measures where the child is now. The second is at the same tier if
// the first was right, or one tier lower (never below 1) if it was wrong —
// SPEC §6's anti-frustration rule.
function pickCheckupQuestion(session, mastery, topic) {
  const first = session.questions.find((q) => q.topic === topic && !q.boss && !Number.isInteger(q.followUpOf));
  const record = mastery[topic];
  let tier;
  if (first) tier = first.correct ? first.difficulty : Math.max(1, first.difficulty - 1);
  else tier = record.difficultyLevel || tierFromMastery(record.masteryScore);
  const q = getQuestion(topic, tier, session.usedWordProblemIds);
  if (q && q.source === 'authored' && q.id) session.usedWordProblemIds.add(q.id);
  return q;
}

// The session's own length (question count or minutes) is used up, so the
// only thing left before the summary is the boss challenge.
export function isBossDue(session) {
  return session.bossDone === false && hasReachedLength(session);
}

// Roadmap #94: decides, once the regular questions are finished, whether the
// boss challenge unlocks. Called before every "is the session over?" check
// (onNext in app.js) rather than from recordAnswer, because a timed session
// can run out between answers. Only the first time matters: once a boss
// question has been asked the challenge is under way and runs to the end.
export function settleBossGate(session) {
  if (!isBossDue(session) || bossQuestionsAsked(session) > 0) return;
  const regular = session.questions.filter((q) => !q.boss);
  const correct = regular.filter((q) => q.correct).length;
  const accuracy = regular.length ? correct / regular.length : 0;
  if (accuracy <= BOSS_UNLOCK_ACCURACY) {
    session.bossDone = true;
    session.bossLocked = true;
  }
}

// Where the challenge stands, for the UI: how many of the three questions
// have been answered, how many hits the boss has taken, and right/wrong for
// each answered one (so a resumed challenge still shows the right pips).
export function bossProgress(session) {
  const results = session.questions.filter((q) => q.boss).map((q) => q.correct);
  return {
    asked: results.length,
    hits: session.bossHits || 0,
    total: BOSS_QUESTION_COUNT,
    results,
  };
}

// ---------- Choose your own mix (Roadmap #188) ----------

// The daily weighting cut down to the ticked topics and scaled to add up to
// 1. Year 7 topics aren't in the daily weighting (it only covers TOPICS), so
// a ticked one gets the average of the others' weights: an equal share.
export function restrictWeighting(weighting, topics) {
  const known = topics.map((t) => weighting[t]).filter((w) => w > 0);
  const fallback = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 1;
  const raw = topics.map((t) => (weighting[t] > 0 ? weighting[t] : fallback));
  const total = raw.reduce((a, b) => a + b, 0);
  const out = {};
  topics.forEach((t, i) => { out[t] = raw[i] / total; });
  return out;
}

// Whole-number percentages of a weighting that add up to exactly 100
// (largest-remainder rounding), for the "Your mix today" preview.
export function weightingPercents(weights) {
  const entries = Object.entries(weights);
  const exact = entries.map(([, w]) => w * 100);
  const out = exact.map(Math.floor);
  let spare = 100 - out.reduce((a, b) => a + b, 0);
  exact
    .map((x, i) => [x - Math.floor(x), i])
    .sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => { if (spare > 0) { out[i] += 1; spare -= 1; } });
  return Object.fromEntries(entries.map(([t], i) => [t, out[i]]));
}

// A topic for the next question from the session's mix, or null when it has
// none. coreOnly: the boss never comes from a Year 7 topic (#148).
function pickMixTopic(session, coreOnly = false) {
  const list = Array.isArray(session.topicFocusList)
    ? session.topicFocusList.filter((t) => !coreOnly || TOPICS.includes(t))
    : [];
  return list.length ? weightedRandomPick(restrictWeighting(session.topicWeighting, list)) : null;
}

// Turns the ticked topics into the session's focus fields: none = no focus,
// one = exactly the old single-topic focus, 2+ = a mix. Year 7 topics are
// dropped while that pack is off (#148), so none can be asked then.
export function focusFromTopics(topics, year7On) {
  const list = (topics || []).filter((t) => year7On || !YEAR7_TOPICS.includes(t));
  if (list.length === 0) return { topicFocus: null, topicFocusList: null };
  if (list.length === 1) return { topicFocus: list[0], topicFocusList: null };
  return { topicFocus: null, topicFocusList: list };
}

// Roadmap ideas.md #80: question sourcing is back to pure auto-generation
// (arithmetic/fdp/geometry/ratio/algebra/dataHandling procedurally, word
// problems from the hand-authored bank) — no PDF import involved, so this
// never returns null in practice. The { blocked, topic } shape is kept as a
// defensive fallback rather than removed outright, since this exact
// question-sourcing subsystem has changed direction more than once in one
// day — cheap insurance against another reversal, not active behavior
// right now.
export function pickNextQuestion(session, mastery) {
  if (isBossDue(session)) {
    const boss = pickBossQuestion(session, mastery);
    if (boss) return boss;
    session.bossDone = true; // nothing to fight; skip straight to the end
  }
  const next = regularCount(session);
  if (Array.isArray(session.queue) && session.queue[next]) return { ...session.queue[next] };
  if (Array.isArray(session.checkupQueue) && session.checkupQueue[next]) {
    const q = pickCheckupQuestion(session, mastery, session.checkupQueue[next]);
    if (q) return q;
  }
  const topic = session.topicFocus || pickMixTopic(session) || weightedRandomPick(session.topicWeighting);
  const record = mastery[topic];
  const tier = selectDifficultyTier(record);
  const spot = maybeSpotQuestion(session, topic, tier);
  if (spot) return spot;
  const q = getQuestion(topic, tier, session.usedWordProblemIds);
  if (!q) return { blocked: true, topic };
  if (q.source === 'authored' && q.id) session.usedWordProblemIds.add(q.id);
  return q;
}

// ---------- Spot the mistake (Roadmap #146) ----------

// Only in regular Home practice ('bulk'): never the warm-up quiz, a
// check-up, Fix my mistakes or a retry round, never the boss, and never the
// first question. When the topic has a template at or below the tier just
// picked, each such slot has a 1 in 8 chance. At most 1 in a session of up
// to 10 questions, at most 2 in anything longer or timed.
export const SPOT_CHANCE = 1 / 8;
export function spotAllowance(session) {
  return session.lengthType === 'questions' && session.lengthValue <= 10 ? 1 : 2;
}
function maybeSpotQuestion(session, topic, tier) {
  if (session.mode !== 'bulk' || session.questions.length === 0) return null;
  const asked = session.questions.filter((q) => q.format === 'spotMistake').length;
  if (asked >= spotAllowance(session) || !hasSpotTemplate(topic, tier)) return null;
  if (Math.random() >= SPOT_CHANCE) return null;
  return getSpotQuestion(topic, tier);
}

export function checkAnswer(question, userInput) {
  const trimmed = String(userInput).trim();
  if (trimmed === '') return false;

  // #146: the line number picked.
  if (question.answerType === 'spot') return trimmed === String(question.correctAnswer);

  if (question.answerType === 'numeric') {
    // #148: a true minus sign (−) reads the same as a typed "-".
    const toNum = (v) => parseFloat(String(v).replace(/\u2212/g, '-').replace(/,/g, ''));
    const userNum = toNum(trimmed);
    const correctNum = toNum(question.correctAnswer);
    if (Number.isNaN(userNum)) return false;
    return Math.abs(userNum - correctNum) < 0.01;
  }
  if (question.answerType === 'mcq') {
    return trimmed === question.correctAnswer;
  }
  return normalizeText(trimmed) === normalizeText(question.correctAnswer);
}

function normalizeText(s) {
  return String(s).toLowerCase().replace(/\s+/g, '').replace('remainder', 'r');
}

// ---------- Right value, wrong form (Roadmap #97) ----------

// Is the decimal typed (digits, at most one point) the exact value
// num/den? Done in whole numbers (BigInt), so no floating-point slips.
//  - A value that terminates as a decimal (3/10, 133/8) must be typed
//    exactly: 0.3, 16.625.
//  - A recurring one (5/6, 17/3) must be correctly rounded to 2 or more
//    decimal places: 0.83 or 0.833, 5.67. Rounded to 1 place (5.7) or cut
//    short (5.66) doesn't count (Alex's decision).
function decimalMatches(typed, num, den) {
  const [whole, frac = ''] = typed.split('.');
  const places = frac.length;
  const scaled = BigInt(`${whole || '0'}${frac}`); // the typed value × 10^places
  const n = BigInt(num);
  const d = BigInt(den);
  const pow = 10n ** BigInt(places);
  if ((n * pow) % d === 0n) return scaled * d === n * pow;
  let reduced = d / gcdBig(n, d);
  while (reduced % 2n === 0n) reduced /= 2n;
  while (reduced % 5n === 0n) reduced /= 5n;
  if (reduced === 1n) return false; // terminates, but needs more places than typed
  if (places < 2) return false;
  // Rounded to `places` decimal places, half up. A recurring decimal is
  // never exactly on a half, so the direction of a tie doesn't matter.
  const rounded = (2n * n * pow + d) / (2n * d);
  return scaled === rounded;
}
function gcdBig(a, b) {
  return b === 0n ? a : gcdBig(b, a % b);
}

// Marks an answer three ways: 'correct' (exactly as checkAnswer), 'wrong',
// or 'rightForm': the right value in the wrong form, which earns one more
// try instead of "Not quite". Only questions that carry `answerForm` (the
// generated fraction and remainder questions) can be 'rightForm'; every
// other question is correct or wrong exactly as before. `typed` says what
// kind of answer it was, for the message.
//
// Counted as the right value (Alex's decisions): an equal decimal (see
// decimalMatches), an equivalent fraction (6/10 for 3/5, 133/8 for 16 r 5,
// 4/4 for 1), or a whole number written with a point (1.0 for 1). Not
// counted, so still wrong: anything with an r on a fraction question
// (1 r 2/5), any other r answer on a remainder question (15 r 13 for
// 16 r 5), and a mixed number with its digits run together (12/5 meant as
// 1 2/5, which is simply a different value).
export function classifyAnswer(question, userInput) {
  if (checkAnswer(question, userInput)) return { outcome: 'correct' };
  const wrong = { outcome: 'wrong' };
  const af = question.answerForm;
  if (!af) return wrong;
  const typed = normalizeText(userInput);
  if (typed.includes('r')) return wrong;

  const frac = typed.match(/^(\d+)\/(\d+)$/);
  if (frac) {
    const n = Number(frac[1]);
    const d = Number(frac[2]);
    if (d === 0 || n * af.den !== af.num * d) return wrong;
    // Equal to the answer and already in lowest terms can only mean it was
    // typed with a leading zero (07/5): not a form mistake, so leave it.
    const lowest = gcdNum(n, d) === 1;
    if ((af.form === 'fraction' || af.form === 'improper-fraction') && lowest) return wrong;
    return { outcome: 'rightForm', typed: 'fraction' };
  }
  if (/^(\d+(\.\d+)?|\.\d+)$/.test(typed)) {
    // A plain whole number can only equal a whole answer, and that's
    // already correct, so this is the decimal case (1.0, 0.3, 16.625).
    if (!typed.includes('.')) return wrong;
    return decimalMatches(typed, af.num, af.den) ? { outcome: 'rightForm', typed: 'decimal' } : wrong;
  }
  return wrong;
}
function gcdNum(a, b) {
  return b === 0 ? a : gcdNum(b, a % b);
}

// Scores one answered question, updates the topic's mastery record, appends
// to the session log, and writes mastery + in-progress state to storage
// immediately (not just at session end).
//
// formRetry (#97): this is the second try after a "Right number!". It's
// marked like any answer (right counts fully, for mastery, streak, combo and
// the boss), timeMs is the total over both tries, there's no speed bonus,
// and the log entry says formRetry: true.
export function recordAnswer(session, mastery, question, userInput, timeMs, { formRetry = false } = {}) {
  const correct = checkAnswer(question, userInput);
  const tier = question.difficulty;
  // #146: reading working takes longer than answering, so a Spot the
  // mistake question expects twice the tier's usual time, for both the
  // speed bonus and mastery's speed part.
  const spot = question.format === 'spotMistake';
  const expectedMs = EXPECTED_TIME_MS[tier] * (spot ? 2 : 1);

  updateMastery(mastery[question.topic], correct, tier, timeMs, localDateStr(), expectedMs);
  Storage.markQuestionResult(question.id, correct);

  const speedBonus = correct && !formRetry && timeMs < expectedMs ? 5 : 0;
  const streakBonus = correct ? Math.min(session.streak + 1, 5) : 0;

  session.streak = correct ? session.streak + 1 : 0;
  session.bestStreak = Math.max(session.bestStreak, session.streak);

  // The multiplier uses the run *including* this answer, so the 3rd correct
  // in a row is the first one worth double.
  const multiplier = correct ? comboMultiplier(session.streak) : 1;
  const bossMultiplier = question.isBoss ? BOSS_POINTS_MULTIPLIER : 1;
  const pointsEarned = correct ? (10 + speedBonus + streakBonus) * multiplier * bossMultiplier : 0;
  session.score += pointsEarned;

  let bossBonus = 0;
  if (question.isBoss) {
    if (correct) session.bossHits = (session.bossHits || 0) + 1;
    // +1 for the question being pushed just below.
    if (bossQuestionsAsked(session) + 1 >= BOSS_QUESTION_COUNT) {
      session.bossDone = true;
      session.bossDefeated = session.bossHits >= BOSS_QUESTION_COUNT;
      if (session.bossDefeated) bossBonus = BOSS_DEFEAT_BONUS;
    }
  }
  session.score += bossBonus;

  // #127/#128: `variant` says exactly which kind of question this was (see
  // questionVariant), and a wrong answer also keeps its prompt and right
  // answer (text only, never a diagram) so "Questions I got wrong" and
  // "Fix my mistakes" can show it and make a new version of it later.
  // followUpOf links a "Try one like it" answer to the miss it followed.
  const variant = questionVariant(question);
  session.questions.push({
    topic: question.topic,
    subtopic: question.subtopic,
    difficulty: tier,
    correct,
    timeMs,
    pointsEarned,
    ...(question.isBoss ? { boss: true } : {}),
    ...(formRetry ? { formRetry: true } : {}),
    ...(variant ? { variant } : {}),
    ...(Number.isInteger(question.followUpOf) ? { followUpOf: question.followUpOf } : {}),
    ...(spot ? { format: 'spotMistake', templateId: question.templateId } : {}),
    ...(correct ? {} : {
      prompt: question.prompt,
      // #127: for Spot the mistake, "the right answer" is which line and
      // what it should have said.
      correctAnswer: spot ? `The mistake was in line ${question.wrongLine}: ${question.correction}` : question.correctAnswer,
    }),
  });
  if (!correct) {
    session.reviewExtras = session.reviewExtras || {};
    session.reviewExtras[session.questions.length - 1] = {
      explanation: question.explanation || '',
      diagramSvg: question.diagramSvg || '',
    };
  }
  session.bossBonus = (session.bossBonus || 0) + bossBonus;

  Storage.setMastery(mastery);
  Storage.setInProgress({
    ...session,
    usedWordProblemIds: [...session.usedWordProblemIds],
    // #170: a timed session saves how much clock was left, so Resume (even
    // an hour later) carries on from there. See rebaseTimedSession.
    ...(session.lengthType === 'minutes' ? { remainingMs: Math.max(0, sessionEndAt(session) - Date.now()) } : {}),
  });

  return { correct, pointsEarned, streak: session.streak, multiplier, bossBonus };
}

// The chosen length only — the boss challenge comes on top of it, so a
// 10-question session is 10 questions and then the boss's three.
export function hasReachedLength(session) {
  const regular = regularCount(session);
  if (session.lengthType === 'questions') {
    return regular >= session.lengthValue;
  }
  return Date.now() >= sessionEndAt(session);
}

// Roadmap #178: when a timed (minutes) session's clock runs out. Time spent
// with the app hidden (pausedMs) is added on, so locking the iPad doesn't
// burn the sprint. A save from before this change has no pausedMs: 0.
export function sessionEndAt(session) {
  return session.startedAt + (session.pausedMs || 0) + session.lengthValue * 60 * 1000;
}

// Roadmap #170: makes a session read back from storage carry on with the
// clock it had at its last save, however long ago that was. Timed sessions
// only. remainingMs was written at the last answer; startedAt is moved so
// that "now + remaining" is the new end. A save from before this change has
// no remainingMs, so it gets a full clock rather than an arbitrary one.
export function rebaseTimedSession(session, now = Date.now()) {
  if (session.lengthType !== 'minutes') return session;
  const total = session.lengthValue * 60 * 1000;
  const remaining = Number.isFinite(session.remainingMs) ? Math.min(total, Math.max(0, session.remainingMs)) : total;
  return { ...session, startedAt: now + remaining - total, pausedMs: 0 };
}

// A session saved before the boss existed has no bossDone flag; treat it as
// already done so resuming it doesn't spring a boss on an old session. One
// saved mid-way through the old single boss question (#92) just carries on
// as a three-question challenge.
export function isSessionComplete(session) {
  return hasReachedLength(session) && session.bossDone !== false;
}

// One-off changeover to local days (UTC→local date fix). Before it,
// lastPracticeDate was the UTC date, which in the UK is the local date or
// one day behind it (a session finished between 00:00 and 00:59 BST). So if
// the latest logged session's local day is later, raise lastPracticeDate to
// it — never lower it — or a second session that same day would count as
// "yesterday" and add a day twice. Raising can only turn a gap into "same
// day" or "yesterday", so it can never reset a streak or spend a shield.
// Runs once: meta.dayClock records that it's done. Returns the new meta, or
// null if nothing needs saving.
export function settleDayClock(meta, sessions) {
  if (meta.dayClock === 'local') return null;
  const next = { ...meta, dayClock: 'local' };
  const latest = sessions.length ? sessions[sessions.length - 1] : null;
  if (latest && meta.lastPracticeDate) {
    const latestDay = sessionLocalDay(latest);
    // Zero-padded YYYY-MM-DD strings compare correctly as text.
    if (latestDay > meta.lastPracticeDate) next.lastPracticeDate = latestDay;
  }
  return next;
}

// Writes the full session log entry and updates streak/points meta. Returns
// the finalized entry + meta so the UI can render the summary screen.
export function finishSession(session, meta) {
  const totalQuestions = session.questions.length;
  const correctCount = session.questions.filter((q) => q.correct).length;
  const totalTimeMs = session.questions.reduce((sum, q) => sum + q.timeMs, 0);

  const summary = {
    totalQuestions,
    correctCount,
    accuracy: totalQuestions ? correctCount / totalQuestions : 0,
    avgTimeMs: totalQuestions ? Math.round(totalTimeMs / totalQuestions) : 0,
    totalTimeMs,
    pointsEarned: session.score,
    bestStreak: session.bestStreak,
    bossDefeated: Boolean(session.bossDefeated),
    bossLocked: Boolean(session.bossLocked),
    bossHits: session.bossHits || 0,
    bossBonus: session.bossBonus || 0,
  };

  const today = localDateStr();
  const gap = daysBetweenLocalDates(meta.lastPracticeDate, today);
  const shieldCovers = gap === 2 && (meta.streakShields || 0) > 0;

  const entry = {
    profileId: 'default',
    sessionId: session.sessionId,
    date: session.date,
    // The session counts for the local day it finished on (the streak and
    // chest use that day too), so log-based features can agree with them.
    finishedAt: new Date().toISOString(),
    mode: session.mode,
    lengthType: session.lengthType,
    lengthValue: session.lengthValue,
    topicFocus: session.topicFocus,
    questions: session.questions,
    summary,
    // #140: the missed day a Streak Shield bridged, for the calendar.
    ...(shieldCovers ? { shieldCoveredDate: addDays(today, -1) } : {}),
  };
  Storage.addSession(entry);

  const newMeta = { ...meta };
  let shieldUsed = false;
  if (gap <= 0) {
    // Already practised today; streak unchanged. A negative gap means the
    // last practice day is later than today (clock set back, or travel
    // west): treat that as today too, rather than resetting the streak.
  } else if (gap === 1) {
    newMeta.currentStreakDays = (meta.currentStreakDays || 0) + 1;
  } else if (shieldCovers) {
    // Roadmap #112: exactly one missed day, and a Streak Shield to cover it.
    // The missed day is bridged, not counted (6 on Thu, nothing on Fri,
    // practice on Sat makes 7), and the shield is used up. A longer gap
    // falls through to the reset below and the shield is kept.
    newMeta.currentStreakDays = (meta.currentStreakDays || 0) + 1;
    newMeta.streakShields = (meta.streakShields || 0) - 1;
    shieldUsed = true;
  } else {
    newMeta.currentStreakDays = 1;
  }
  newMeta.lastPracticeDate = today;
  newMeta.totalPoints = (meta.totalPoints || 0) + session.score;
  if (session.mode === 'diagnostic' && !meta.diagnosticCompletedAt) {
    newMeta.diagnosticCompletedAt = new Date().toISOString();
  }
  // #149: only a finished check-up counts; an abandoned one stays offered.
  if (session.mode === 'checkup') newMeta.lastCheckupCompletedAt = new Date().toISOString();
  Storage.setMeta(newMeta);
  Storage.clearInProgress();

  // shieldUsed is only for the summary screen; it isn't saved anywhere.
  return { entry, meta: newMeta, shieldUsed };
}
