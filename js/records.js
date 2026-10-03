// Personal-best board (Roadmap #89). Records are worked out from the session
// log every time rather than stored separately, so they can never drift out
// of step with it (and Clear all progress resets them for free). A single
// profile means the child is only ever competing with themselves.

import { sessionLocalDay, addDays, inRange, monthRange, previousMonthStr } from './dates.js';
import { TOPICS } from './storage.js';

// Below this many questions a session's accuracy doesn't count: 2 out of 2
// is 100%, but it isn't a record worth beating. Also the minimum per topic
// per period for a "went up" comparison (#131, #141).
export const MIN_QUESTIONS_FOR_ACCURACY = 5;

// ---------- Session modes ----------
//
// Every logged session has a `mode`: 'bulk' (daily practice), 'diagnostic'
// (the warm-up quiz), 'checkup' (#149), 'fix' ("Fix my mistakes", #128) or
// 'retry' ("Try these again", #127), plus old phase names on early sessions.
//
// OFF_RECORD_MODES is for rounds that aren't the child's own practice: the
// games (#143 Blitz, #144 Numbers Target, #145 Close Enough) and the #147
// guest round. Sessions in these modes are left out of everything worked
// out from the log here and on Home: goal ring, quests, calendar, map,
// records, fixes, arrows and recaps. In practice none are ever logged (the
// games keep their own keys and never call finishSession); listing them here
// is the safety net if that ever changes.
export const OFF_RECORD_MODES = ['blitz', 'numbers', 'estimation', 'guest'];
export function countsAsPractice(s) {
  return Boolean(s) && !OFF_RECORD_MODES.includes(s.mode);
}

// Only these sessions can win a skill badge (#135) or the perfect-session
// quest (#136). A "Try these again" round is left out on purpose: it's a
// short replay of the child's own misses, so a quick 3 out of 3 there
// shouldn't count as a perfect session or a comeback (Alex's decision).
// Future game modes are left out by not being listed.
export const SKILL_MODES = ['bulk', 'diagnostic', 'fix', 'checkup'];

// A retry round's right answers don't count towards records or fixes.
const isRetry = (s) => s.mode === 'retry';

// Sessions store ISO (UTC) timestamps; "a day" is the child's own calendar
// day that the session finished on (sessionLocalDay in dates.js), the same
// day the streak and chest credit.

// Returns each record's value, or null while there's nothing to measure.
// A combo of 0, 0% accuracy or a day of 0 questions is "no record yet", not
// a record — a Personal bests board showing "Best accuracy: 0%" is no fun.
export function computePersonalBests(sessions) {
  let bestAccuracy = null;
  let longestCombo = null;
  let fastestCorrectMs = null;
  const perDay = {};

  sessions.filter(countsAsPractice).forEach((s) => {
    const qs = s.questions || [];
    // A retry round (#127) is only the child's own misses again, so its
    // accuracy, combo and speed aren't records. Its questions still count
    // towards "most questions in a day", like the daily goal ring.
    if (!isRetry(s)) {
      if (qs.length >= MIN_QUESTIONS_FOR_ACCURACY && s.summary && s.summary.accuracy > 0) {
        bestAccuracy = Math.max(bestAccuracy ?? 0, s.summary.accuracy);
      }
      const combo = s.summary ? s.summary.bestStreak || 0 : 0;
      if (combo > 0) longestCombo = Math.max(longestCombo ?? 0, combo);
      qs.forEach((q) => {
        if (q.correct && q.timeMs > 0) {
          fastestCorrectMs = fastestCorrectMs === null ? q.timeMs : Math.min(fastestCorrectMs, q.timeMs);
        }
      });
    }
    if (qs.length > 0) {
      const day = sessionLocalDay(s);
      perDay[day] = (perDay[day] || 0) + qs.length;
    }
  });

  const dayCounts = Object.values(perDay);
  return {
    bestAccuracy,
    longestCombo,
    fastestCorrectMs,
    mostQuestionsInDay: dayCounts.length ? Math.max(...dayCounts) : null,
  };
}

// Which records the latest session broke. Only a record that already
// existed can be "beaten" — the very first session sets every record at
// once, and a wall of NEW RECORD banners for that would mean nothing.
// Strictly better only: equalling a record isn't beating it.
export function findNewRecords(before, after) {
  const beaten = [];
  if (before.bestAccuracy !== null && after.bestAccuracy > before.bestAccuracy) beaten.push('bestAccuracy');
  if (before.longestCombo !== null && after.longestCombo > before.longestCombo) beaten.push('longestCombo');
  if (before.fastestCorrectMs !== null && after.fastestCorrectMs < before.fastestCorrectMs) beaten.push('fastestCorrectMs');
  if (before.mostQuestionsInDay !== null && after.mostQuestionsInDay > before.mostQuestionsInDay) beaten.push('mostQuestionsInDay');
  return beaten;
}

// Roadmap #105: "Mistakes I fixed". Only topic and subtopic are saved with
// each answer (not the question itself), and generated questions get new
// numbers every time, so the honest unit is the *kind* of question. A kind is
// fixed when it was answered wrong in one session and then right in a LATER
// session — right again in the same session could be a lucky guess, so it
// doesn't count. Once fixed it stays fixed: a later wrong answer never takes
// it off the list (SPEC §8, nothing is taken away). Worked out from the
// session log every time, like the records above, so it stores nothing.
//
// Subtopics that don't name a kind (missing on old sessions, arithmetic's
// catch-all 'mixed', imported questions) fall back to the topic alone.
const TOPIC_ONLY_SUBTOPICS = ['mixed', 'examberry', 'custom-pdf'];

function kindOf(q) {
  const sub = q.subtopic && !TOPIC_ONLY_SUBTOPICS.includes(q.subtopic) ? q.subtopic : null;
  return { key: `${q.topic}|${sub || ''}`, topic: q.topic, subtopic: sub };
}

// Returns every fix, newest first:
// [{ topic, subtopic (or null), wrongDate, fixedDate, sessionId }], where the
// dates are the ISO timestamps of the session with the first wrong answer and
// the later session that first got it right.
export function computeFixedMistakes(sessions) {
  const firstWrong = {}; // kind key -> { index, date } while still unfixed
  const fixed = {}; // kind key -> fix record
  const order = [];
  sessions.forEach((s, index) => {
    if (!countsAsPractice(s)) return;
    (s.questions || []).forEach((q) => {
      if (!q || !q.topic) return;
      const kind = kindOf(q);
      if (fixed[kind.key]) return;
      const wrong = firstWrong[kind.key];
      // A right answer in a "Try these again" round (#127), minutes after
      // the miss, doesn't make it fixed: that needs a later ordinary session.
      if (q.correct && isRetry(s)) return;
      if (!q.correct) {
        if (!wrong) firstWrong[kind.key] = { index, date: s.date };
      } else if (wrong && wrong.index < index) {
        fixed[kind.key] = {
          topic: kind.topic,
          subtopic: kind.subtopic,
          wrongDate: wrong.date,
          fixedDate: s.date,
          sessionId: s.sessionId,
        };
        order.push(kind.key);
      }
    });
  });
  return order.reverse().map((k) => fixed[k]);
}

// ---------- "Fix my mistakes" (Roadmap #128) ----------
//
// Worked out from the log, like the fixes above; nothing extra is stored.
// A kind of question here is topic + subtopic + tier, plus `variant` (the
// operators for arithmetic, the template id for a word problem) on answers
// saved since #127/#128. A kind is still to fix when it was answered wrong in
// a finished session in the last 7 local days (today and the 6 before) and
// no LATER session has a right answer of that kind — the same later-session
// rule as "Mistakes I fixed", so a right "Try one like it" in the same
// session, or a right answer in a "Try these again" round, doesn't clear it.
// Left out: boss questions (stretch questions), imported questions, answers
// with no subtopic, and arithmetic 'mixed' answers from before `variant`
// was saved (the operation is unknown, so a new version could practise the
// wrong skill).
export const FIX_WINDOW_DAYS = 7;
const IMPORTED_SUBTOPICS = ['examberry', 'custom-pdf'];

function fixable(q) {
  if (!q || !q.topic || !q.subtopic || q.boss) return false;
  if (IMPORTED_SUBTOPICS.includes(q.subtopic)) return false;
  if (q.topic === 'arithmetic' && q.subtopic === 'mixed' && !q.variant) return false;
  return true;
}

// Does right answer `c` clear pending kind `p`? A kind saved without a
// variant (older answers) is cleared by any right answer of that
// subtopic and tier.
function sameKind(p, c) {
  return p.topic === c.topic && p.subtopic === c.subtopic && p.difficulty === c.difficulty
    && (!p.variant || p.variant === c.variant);
}

// Returns { toFix, hadAny }: toFix is the kinds still to fix, the most
// recently missed first, each { topic, subtopic, difficulty, variant,
// prompt, correctAnswer } from its latest wrong answer. hadAny says whether
// there was any fixable mistake in the window at all (for the "All fixed"
// state).
export function computeMistakesToFix(sessions, today) {
  const since = addDays(today, -(FIX_WINDOW_DAYS - 1));
  const pending = new Map(); // kind key -> { item, index, order }
  let hadAny = false;
  let order = 0;
  sessions.forEach((s, index) => {
    if (!countsAsPractice(s)) return;
    const recent = sessionLocalDay(s) >= since;
    (s.questions || []).forEach((q) => {
      if (!q || !q.topic) return;
      if (q.correct) {
        if (isRetry(s)) return;
        pending.forEach((p, key) => {
          if (p.index < index && sameKind(p.item, q)) pending.delete(key);
        });
        return;
      }
      if (!recent || !fixable(q)) return;
      hadAny = true;
      order += 1;
      const key = `${q.topic}|${q.subtopic}|${q.difficulty}|${q.variant || ''}`;
      pending.delete(key); // re-inserted so the latest miss sets the order
      pending.set(key, {
        index,
        order,
        item: {
          topic: q.topic,
          subtopic: q.subtopic,
          difficulty: q.difficulty,
          variant: q.variant || null,
          prompt: q.prompt || null,
          correctAnswer: q.correctAnswer ?? null,
        },
      });
    });
  });
  const toFix = [...pending.values()].sort((a, b) => b.order - a.order).map((p) => p.item);
  return { toFix, hadAny };
}

// ---------- Questions on a day (Roadmap #130) ----------

// Every answer logged in sessions that finished on local day `day`: boss
// questions, "Try one like it" follow-ups, retry rounds, all of it.
export function questionsOnDay(sessions, day) {
  return sessions
    .filter((s) => countsAsPractice(s) && sessionLocalDay(s) === day)
    .reduce((n, s) => n + (s.questions || []).length, 0);
}

// ---------- Perfect session and skill runs (Roadmap #135, #136) ----------

// The one definition of "a perfect session", shared by the Perfect Ten
// badge and the weekly quest: at least 10 regular (non-boss) questions,
// every one right. Boss answers are ignored either way, so a missed stretch
// question can't spoil it.
export const PERFECT_SESSION_MIN = 10;
export function isPerfectSession(entry) {
  if (!entry || !SKILL_MODES.includes(entry.mode)) return false;
  const regular = (entry.questions || []).filter((q) => !q.boss);
  return regular.length >= PERFECT_SESSION_MIN && regular.every((q) => q.correct);
}

// Speed Demon: `run` right answers in a row, each in under `underMs`
// (9.9 s counts, 10.0 s doesn't). A wrong or slow answer starts the count
// again.
export function hasFastRun(entry, run = 5, underMs = 10000) {
  let count = 0;
  for (const q of (entry && entry.questions) || []) {
    count = q.correct && q.timeMs < underMs ? count + 1 : 0;
    if (count >= run) return true;
  }
  return false;
}

// ---------- This week vs last week (Roadmap #131, reused by #141) ----------

// Sessions whose accuracy isn't compared: the warm-up quiz (a first
// measurement, not practice) and retry rounds (only the child's own misses).
// Boss questions are left out too: they come a tier up from the strongest
// topic, so they'd skew it.
export const COMPARE_EXCLUDED_MODES = ['diagnostic', 'retry'];

// Per-topic accuracy in two local-date ranges (A = earlier, B = later), by
// the day each session finished. Returns { [topic]: { a, b, comparable,
// direction, rise } } for every topic with a counted answer in either
// range, where a and b are { right, total }. A topic is comparable with at
// least MIN_QUESTIONS_FOR_ACCURACY counted answers in both; direction is
// then 'up' or 'down' for a change of at least 10 percentage points, else
// 'steady' (null when not comparable). The test is done in whole numbers,
// because 0.7 - 0.6 in floating point is just under 0.1.
export const ARROW_POINTS = 10;
export function compareTopicAccuracy(sessions, rangeA, rangeB) {
  const out = {};
  sessions.forEach((s) => {
    if (!countsAsPractice(s) || COMPARE_EXCLUDED_MODES.includes(s.mode)) return;
    const day = sessionLocalDay(s);
    const side = inRange(day, rangeA) ? 'a' : (inRange(day, rangeB) ? 'b' : null);
    if (!side) return;
    (s.questions || []).forEach((q) => {
      if (!q || !q.topic || q.boss) return;
      const t = out[q.topic] || (out[q.topic] = { a: { right: 0, total: 0 }, b: { right: 0, total: 0 } });
      t[side].total += 1;
      if (q.correct) t[side].right += 1;
    });
  });
  Object.values(out).forEach((t) => {
    const { a, b } = t;
    t.comparable = a.total >= MIN_QUESTIONS_FOR_ACCURACY && b.total >= MIN_QUESTIONS_FOR_ACCURACY;
    t.direction = null;
    t.rise = null;
    if (!t.comparable) return;
    // (b.right/b.total - a.right/a.total) >= 10/100, times 100·a.total·b.total.
    const diff = 100 * (b.right * a.total - a.right * b.total);
    const step = ARROW_POINTS * a.total * b.total;
    if (diff >= step) t.direction = 'up';
    else if (diff <= -step) t.direction = 'down';
    else t.direction = 'steady';
    t.rise = b.right / b.total - a.right / a.total;
  });
  return out;
}

// ---------- Beat last time (Roadmap #173) ----------

// The questions that count when comparing two sessions: not the boss (a tier
// up) and not "Try one like it" follow-ups. Same set for accuracy and speed.
function comparableQuestions(s) {
  return (s.questions || []).filter((q) => q && !q.boss && !Number.isInteger(q.followUpOf));
}

// { pct, avgMs } for a session, or null if it can't be compared (a mode left
// out, or fewer than MIN_QUESTIONS_FOR_ACCURACY counted questions). avgMs is
// null on an old session that never saved its timings. pct is a whole number.
function comparisonStats(s) {
  if (!countsAsPractice(s) || COMPARE_EXCLUDED_MODES.includes(s.mode)) return null;
  const qs = comparableQuestions(s);
  if (qs.length < MIN_QUESTIONS_FOR_ACCURACY) return null;
  const right = qs.filter((q) => q.correct).length;
  const timed = s.summary && Number.isFinite(s.summary.avgTimeMs) && qs.every((q) => Number.isFinite(q.timeMs));
  return {
    pct: Math.round((100 * right) / qs.length),
    avgMs: timed ? qs.reduce((sum, q) => sum + q.timeMs, 0) / qs.length : null,
  };
}

// Speed only counts as different when the gap is a whole second or more.
const SPEED_GAP_MS = 1000;

// One encouraging line comparing a just-finished session (`entry`) with the
// latest earlier session that qualifies, or null for nothing to say: no
// earlier one, or this one is a warm-up / retry / too short. `sessionsBefore`
// is the log without `entry`, oldest first. Display-only: nothing is stored.
// The wording is always positive or neutral (SPEC §8): never "worse".
export function compareWithLastSession(entry, sessionsBefore) {
  const now = comparisonStats(entry);
  if (!now) return null;
  let last = null;
  for (let i = sessionsBefore.length - 1; i >= 0 && !last; i -= 1) {
    if (comparisonStats(sessionsBefore[i])) last = sessionsBefore[i];
  }
  if (!last) return null;
  const before = comparisonStats(last);

  const accGain = now.pct - before.pct;
  const bothTimed = now.avgMs !== null && before.avgMs !== null;
  const gapMs = bothTimed ? before.avgMs - now.avgMs : 0; // positive = quicker now
  const quicker = bothTimed && gapMs >= SPEED_GAP_MS;
  // "yesterday" only when that session really finished on the day before.
  const yesterday = sessionLocalDay(last) === addDays(sessionLocalDay(entry), -1);
  const ref = yesterday ? 'yesterday' : 'last time';

  if (accGain > 0 && quicker) {
    return { better: true, text: `${yesterday ? 'Beat yesterday' : 'Beat your last session'}: more right and quicker!` };
  }
  if (accGain > 0) return { better: true, text: `More right than ${ref} (+${accGain}%).` };
  if (quicker) {
    return { better: true, text: `Quicker than ${ref} (${Math.round(gapMs / 1000)}s faster per question).` };
  }
  const secs = before.avgMs !== null ? Math.round(before.avgMs / 1000) : null;
  const each = secs === null ? '' : (secs < 1 ? ', under 1s each' : `, ${secs}s each`);
  const lead = yesterday ? 'Yesterday' : 'Last time';
  return { better: false, text: `${lead}: ${before.pct}%${each}. Have another go to beat it!` };
}

// ---------- Monthly recap (Roadmap #141) ----------

const topicOrder = (t) => {
  const i = TOPICS.indexOf(t);
  return i === -1 ? TOPICS.length : i;
};

// The recap for local month "YYYY-MM", or null if no session finished in
// it. { month, questions, improved: { topic, fromPct, toPct } | null,
// mostPractised: { topic, count } | null, records: [key], recordValues,
// bestCombo }.
export function computeMonthlyRecap(sessions, month) {
  const practice = sessions.filter(countsAsPractice);
  const inMonth = (s) => sessionLocalDay(s).slice(0, 7) === month;
  const monthSessions = practice.filter(inMonth);
  if (monthSessions.length === 0) return null;

  // 1. Every answer counts here, diagnostic and boss included.
  const questions = monthSessions.reduce((n, s) => n + (s.questions || []).length, 0);

  // 2. Biggest rise that counts as "up" on the weekly arrows, month on
  // month. Ties: more questions this month, then TOPICS order.
  const cmp = compareTopicAccuracy(practice, monthRange(previousMonthStr(month)), monthRange(month));
  const rows = Object.entries(cmp);
  const ups = rows.filter(([, t]) => t.direction === 'up')
    .sort((x, y) => (Math.abs(y[1].rise - x[1].rise) > 1e-9 ? y[1].rise - x[1].rise : 0)
      || (y[1].b.total - x[1].b.total)
      || (topicOrder(x[0]) - topicOrder(y[0])));
  let improved = null;
  let mostPractised = null;
  if (ups.length) {
    const [topic, t] = ups[0];
    improved = {
      topic,
      fromPct: Math.round((t.a.right / t.a.total) * 100),
      toPct: Math.round((t.b.right / t.b.total) * 100),
    };
  } else {
    const busiest = rows.filter(([, t]) => t.b.total > 0)
      .sort((x, y) => (y[1].b.total - x[1].b.total) || (topicOrder(x[0]) - topicOrder(y[0])))[0];
    if (busiest) mostPractised = { topic: busiest[0], count: busiest[1].b.total };
  }

  // 3. Replay the log: every record beaten by a session of this month (the
  // same rules as the NEW RECORD banner), with its value at the month's end.
  const beaten = new Set();
  let lastIndex = -1;
  let before = computePersonalBests([]);
  practice.forEach((s, i) => {
    const after = computePersonalBests(practice.slice(0, i + 1));
    if (inMonth(s)) {
      findNewRecords(before, after).forEach((k) => beaten.add(k));
      lastIndex = i;
    }
    before = after;
  });
  const recordValues = computePersonalBests(practice.slice(0, lastIndex + 1));
  const bestCombo = monthSessions.filter((s) => !isRetry(s))
    .reduce((m, s) => Math.max(m, (s.summary && s.summary.bestStreak) || 0), 0);

  return { month, questions, improved, mostPractised, records: [...beaten], recordValues, bestCombo };
}

// ---------- Adventure map (Roadmap #137) ----------

// One step per finished session of at least MAP_MIN_QUESTIONS answers that
// started on or after mapStartedAt (the map starts fresh from the update).
// Worked out from the log, so it can never go backwards.
export const MAP_MIN_QUESTIONS = 5;
export function countMapSteps(sessions, mapStartedAt) {
  const from = mapStartedAt ? new Date(mapStartedAt).getTime() : NaN;
  if (Number.isNaN(from)) return 0;
  return sessions.filter((s) => countsAsPractice(s)
    && (s.questions || []).length >= MAP_MIN_QUESTIONS
    && new Date(s.date).getTime() >= from).length;
}

// Where `steps` puts the avatar: 5 steps per area, one area per topic in
// TOPICS order, then round again as the next lap. step 0 is an area's
// first step (where the child arrives). All counts from 0 except lap.
export const MAP_STEPS_PER_AREA = 5;
export function mapPosition(steps) {
  const lapSize = MAP_STEPS_PER_AREA * TOPICS.length;
  const inLap = steps % lapSize;
  return {
    lap: Math.floor(steps / lapSize) + 1,
    area: Math.floor(inLap / MAP_STEPS_PER_AREA),
    step: inLap % MAP_STEPS_PER_AREA,
  };
}
