# Sprint — 11+ Maths Trainer: Implementation Plan

## Context

Alex is building "Sprint," a self-contained, client-side browser app to help his Year 6 child practice
for the 11+ entrance exam on **Friday 2 October 2026** — about 17 days out from the spec date. SPEC.md
is fully settled (§11 decisions log has no open questions), and CLAUDE.md sets the working conventions:
plain HTML/CSS/vanilla JS, no backend, localStorage persistence, small file count, touch-first for iPad.
The spec's own framing is urgent: get something a child can actually use end-to-end within the first
day or two, then iterate daily rather than polishing up front. This plan turns SPEC.md §12's five-bullet
build sequence into a concrete, buildable MVP plan, plus a separate extended roadmap for everything
explicitly deferred past MVP (broader topic coverage, deeper gamification, richer progress views).

---

## Part A — MVP Plan

Goal: per SPEC.md's own urgency note, get something the child can use **end-to-end by end of Day 1**,
then layer in adaptive difficulty, remaining MVP topics, pacing, and progress/gamification over Days 2–3.

### A1. File / module structure

Flat structure, no build step, one `js/` directory:

```
index.html
styles.css
js/
  app.js          — entry point, screen router, top-level state
  storage.js      — localStorage schema + get/set for profile/mastery/sessions
  pacing.js       — computeTodaysPlan() + date math (pure functions)
  mastery.js      — mastery EMA update, difficulty selection, anti-frustration rule
  session.js      — session engine: next-question loop, scoring, streaks
  questionBank.js — dispatch + procedural generators (arithmetic / fdp / geometry)
  wordProblems.js — hand-authored word-problem template bank + dedupe picker
  ui.js           — DOM rendering + event handlers for the 4 screens
```

`pacing.js` and `mastery.js` are isolated because they're the two non-obvious algorithms CLAUDE.md
asks to be well-commented — kept out of DOM code so they stay independently readable. The three
procedural generators share one file since each is small; if one grows past ~150-200 lines it can be
split out later without affecting callers. `wordProblems.js` is separated because it's mostly a data
literal, not logic. `app.js`/`ui.js` split keeps state/flow control mechanically separate from
rendering. Ten files is small enough for one maintainer and each has one clear job.

### A2. Data schemas (localStorage, namespaced `sprint:v1:default:*`)

**Question object** (transient, returned by `questionBank.getQuestion`):
```js
{
  topic: "arithmetic", subtopic: "addition", difficulty: 3,
  source: "generated",        // "generated" | "authored"
  prompt: "247 + 186 = ?",
  answerType: "numeric",       // "numeric" | "mcq"
  correctAnswer: "433", choices: null,
  explanation: "Add the ones: 7+6=13, carry 1... = 433",
  id: "wp-money-0007"          // authored bank only, used for dedupe
}
```

**Session log entry** (`sprint:v1:default:sessions`):
```js
{
  profileId: "default", sessionId: "s_20260915_1", date: "2026-09-15T16:42:00.000Z",
  mode: "diagnostic",           // "diagnostic" | "bulk" | "late-stage" | "final-review"
  lengthType: "questions", lengthValue: 12, topicFocus: null,
  questions: [ { topic, subtopic, difficulty, correct, timeMs, pointsEarned }, ... ],
  summary: { totalQuestions, correctCount, accuracy, avgTimeMs, totalTimeMs, pointsEarned, bestStreak }
}
```

**Per-topic mastery record** (`sprint:v1:default:mastery`):
```js
{
  arithmetic: {
    masteryScore: 0.62, difficultyLevel: 3, questionsSeen: 84,
    consecutiveWrong: 0, lastPracticed: "2026-09-15",
    history: [ { date, masteryScore } ]   // capped trend log
  },
  fdp: { ... }, geometry: { ... }, wordProblems: { ... }
}
```

**Profile meta** (`sprint:v1:default:meta`):
```js
{ profileId: "default", schemaVersion: 1, diagnosticCompletedAt: null,
  currentStreakDays: 3, lastPracticeDate: "2026-09-14", totalPoints: 1240 }
```

### A3. Question generation

**Arithmetic (procedural, tiers 1-5):** T1 single-digit +/-; T2 2-digit +/- with carrying, single-digit
×; T3 2-3 digit +/-, clean division (generate divisor+quotient first so answers are exact by
construction); T4 order-of-operations with brackets, 3 terms; T5 multi-step, division with remainder.

**Fractions/Decimals/Percentages (procedural, tiers 1-5):** T1 equivalence (1/2 = 0.5 = 50%); T2
same-denominator add/subtract, % of round numbers; T3 different-denominator (small LCM), % of
awkward numbers; T4 multiply/divide fractions, % increase/decrease; T5 multi-step chained problems
(e.g. successive discounts). Represent fractions as `{num, den}`, simplify via gcd, canonicalize
answers (simplified fraction or 2dp decimal) for exact-match checking.

**Geometry basics (procedural, tiers 1-5):** T1 rectangle/square perimeter; T2 area; T3 composite
L-shapes, triangle area, angle sums; T4 unit conversion mid-problem, circle circumference/area
(π≈3.14); T5 composite-shape area by subtraction, cuboid volume. Generate whole-number dimensions,
template the explanation with the formula substituted in.

**Word problems (hand-authored, tiers 1-5):** templates with 1-3 numeric/name slots and explicit
generation constraints (e.g. "payment > price×n"), so a modest template count yields real per-session
variety while the maths is human-verified once per template. Target **~40 templates** for MVP,
weighted toward tiers a Year 6 diagnostic will actually land on (roughly T1:5, T2:10, T3:10, T4:10,
T5:5) — enough that a single session's 3-6 word problems won't repeat.
Example: T3 — `"A train ticket costs £{price}. {name} buys tickets for {n} people. Change from £{payment}?"`

### A4. Adaptive difficulty algorithm

Per-question score (correctness dominates; speed only counts if correct):
```
speedScore = clamp(expectedTimeMs[tier] / actualTimeMs, 0, 1)
questionScore = correct ? (0.7 + 0.3 * speedScore) : 0
```
`expectedTimeMs` by tier (shared across topics): T1=8000, T2=12000, T3=18000, T4=25000, T5=35000 ms.

Mastery update — EMA, `alpha = 0.15` (roughly last 6-7 questions dominate):
`newMastery = oldMastery * 0.85 + questionScore * 0.15`. Seed at 0.5 pre-diagnostic.

Tier from mastery: <0.2→T1, 0.2-0.4→T2, 0.4-0.6→T3, 0.6-0.8→T4, ≥0.8→T5.

Session mix per draw: 60% current tier, 20% stretch (tier+1, capped at 5), 20% reinforcement
(tier-1, capped at 1) — spaced-repetition-like per spec §6.

**Anti-frustration rule:** track `consecutiveWrong` per topic, reset on correct. If ≥2, force next
question to `max(1, currentTier - 1)` and suppress the stretch bucket until a correct answer lands.

### A5. Countdown / pacing algorithm

`computeTodaysPlan(today, examDate, profileState)` — pure, stateless, recomputed every call (no
fixed day-N table, so a skipped day just shifts `daysRemaining`):

- `daysRemaining <= 1` → **final-review**: 10 questions, weight toward strong topics, no timer, calm framing.
- else if diagnostic not yet done → **diagnostic**: 12 questions, equal topic weights, no timer, calibration framing.
- else if `daysRemaining <= 3` → **late-stage**: 10-min timed, equal weights, timer visible, exam-condition framing.
- else → **bulk**: 15 questions, weight toward weakest + longest-untouched topics, no timer, encouraging framing.

Each phase returns `{ phase, daysRemaining, sessionLengthSuggestion, topicWeighting, timerVisible, framingTone }`.
The bulk-phase weighting function should boost topics not practiced recently so every topic cycles at
least twice across the window, per spec. The Start screen always shows this suggestion but an explicit
child-picked topic focus overrides `topicWeighting` (100% that topic) for that session only.

### A6. Session engine / question selection loop

Questions are generated **lazily, one at a time** (not precomputed), so the anti-frustration rule can
react mid-session:
```
getNextQuestion(state):
  topic = state.topicFocus ?? weightedRandomPick(plan.topicWeighting)
  tier  = mastery.selectDifficultyTier(topic, masteryRecord[topic])   // includes anti-frustration
  return questionBank.getQuestion(topic, tier, usedWordProblemIdsThisSession)
```
On each answer: update mastery **and persist incrementally** (not just at session end — an
interrupted session on a child's iPad shouldn't lose progress), append to the in-progress log, update
running score/streak/`consecutiveWrong`. Session ends on question-count reached, or elapsed time ≥
limit for timed mode (checked between questions, never mid-question). On completion: write the full
session entry, update `meta` (streak-day delta from `lastPracticeDate`, set `diagnosticCompletedAt`
if applicable).

### A7. UI / screens

Single-page app, four screens toggled by `currentScreen` state (CSS class show/hide, no router lib):

- **Start** — shows today's suggested focus (from `computeTodaysPlan`), large-tap length picker
  (10/20 questions or 5/10-min timed) pre-selected from the suggestion, optional topic-focus chips, Start button.
- **Question** — `'question'`/`'feedback'` sub-states. Question: prompt, touch-first answer input
  (large custom numeric/MCQ buttons preferred over OS keyboard), running score/streak, timer if
  `plan.timerVisible`. Feedback: correct/incorrect (always non-punitive styling), explanation text on
  wrong answers, large "Next" button (child controls pacing, no auto-advance).
- **Summary** — score, accuracy, time, topics covered, points/streak earned, tone-appropriate message,
  links to Start or Progress.
- **Progress** — per-topic mastery bar list (plain CSS bars), streak counter, recent-session list —
  read directly from `storage.js` at render time, no separate app state.

### A8. Build sequencing

**Day 1 — usable end-to-end slice:**
1. `index.html` (4 screen containers) + `styles.css` (touch-first base: large buttons, portrait layout).
2. `storage.js` — schema constants, get/set for profile/mastery/sessions.
3. `questionBank.js` — arithmetic generator only, fixed at tier 3 for now; hand-verify several generated Q/A pairs.
4. `session.js` (minimal) — fixed 10-question arithmetic session, tracks score/streak/time, no persistence yet.
5. `ui.js` + `app.js` — wire Start → Question (prompt, input, feedback) → Summary.
   *→ Child can complete a 10-question arithmetic drill end-to-end by end of Day 1.*

**Day 2 — adaptive difficulty, remaining topics, real explanations:**
6. `mastery.js` — EMA update, tier mapping, anti-frustration rule; wire into `session.js`.
7. `storage.js` — persist mastery per-question and full session log at session end.
8. Extend `questionBank.js` with fdp and geometry generators.
9. `wordProblems.js` — author initial ~30 templates (tiers 2-4 first), wire in with session-scoped dedupe.
10. Draw across all 4 MVP topics (equal weighting placeholder); add topic-focus chips to Start.
11. Add worked-explanation display to feedback screen for all topics.

**Day 3 — pacing/countdown, diagnostic flow, progress view, gamification:**
12. `pacing.js` — `computeTodaysPlan()`; wire into Start; diagnostic auto-detection via `meta.diagnosticCompletedAt`.
13. Replace Day 2's equal-weighting placeholder with `plan.topicWeighting`; drive `timerVisible`/`framingTone`.
14. Progress view — mastery bars, streak counter, recent-session list.
15. Points calc (base + speed bonus + streak bonus) + calendar-day streak tracking. Skip badges/themes (post-MVP).

Everything past Day 3 (remaining syllabus topics, gamification depth) is intentionally not designed
here — `questionBank.js`'s dispatch and `mastery.js`/`pacing.js`'s topic-keyed data already take
arbitrary topic strings, so adding a topic later is a new generator + constant, not a rework. See
Part B for that roadmap.

### Critical files
- [index.html](index.html), [js/session.js](js/session.js), [js/mastery.js](js/mastery.js),
  [js/questionBank.js](js/questionBank.js), [js/pacing.js](js/pacing.js), [js/storage.js](js/storage.js)

---

## Part B — Extended / Nice-to-Have Roadmap (Post-MVP)

Everything below is explicitly out of MVP scope per SPEC.md §10/§12, ordered roughly by expected
value vs. effort for a solo parent-maintainer. None of this should block getting the MVP in front of
the child early.

### B1. Topic coverage expansion
- Add the remaining syllabus topics not in MVP: ratio & proportion, algebra basics, data handling &
  statistics, speed/distance/time, number patterns & sequences. SPEC.md §12 already earmarks the
  "bulk" phase (days 2–13) for this — it's expected to happen *during* the practice window, not after.
- Each new topic should slot into the same question-bank schema (topic/subtopic/difficulty tier) and
  the same adaptive engine — no architecture changes needed if the MVP schema is generic from the start.
- Expand the hand-authored word-problem bank per topic over time (batches of ~10-15 new problems)
  rather than trying to front-load a huge bank before the exam.

### B2. Deeper progress & analytics view
- Trend charts per topic (accuracy/speed improving over time) — simple sparkline or line chart, no
  charting library needed at this scale (a few dozen data points), can be hand-rolled SVG/canvas.
- Session history detail view (drill into a specific past session, review which questions were missed).
- A basic "parent view" summarizing weak spots and suggested focus, a step up from the raw per-topic
  mastery bar list in MVP — explicitly named in SPEC.md §10 as a v2 candidate, not MVP.

### B3. Richer gamification
- Badges/milestones tied to topic mastery thresholds (e.g. "Fractions Level 3 unlocked").
- Unlockable cosmetic rewards — theme colour, streak-flame variants, an avatar — pitched at
  near-11-year-old taste (spec explicitly says "not babyish").
- Speed/streak bonus tuning once real usage data shows what point values actually feel motivating.
- Keep this additive to the MVP's lightweight points/streak layer, not a rework of it.

### B4. Exam-conditions mode
- A dedicated "mock exam" session type: fixed time limit, no immediate per-question feedback (review
  at the end instead), styled closer to a real paper — natural extension of the late-stage pacing
  phase already in §6a, but as an explicit, separately-chosen mode rather than an automatic phase.

### B5. Content quality tooling
- A lightweight internal review/self-check pass for hand-authored questions (e.g. a debug view that
  lists all questions in the bank with their worked answers, so Alex can proofread maths content
  quickly without digging through JS source) — matters because correctness of explanations was
  flagged in CLAUDE.md as more important than shipping speed.
- Optional: a simple "flag this question" affordance during a session for the child or Alex to mark
  a question that seemed wrong/confusing, logged locally for later review.

### B6. Second profile support
- SPEC.md §3 explicitly designs the data model to be profile-ID-keyed for this reason. If ever
  needed, add a profile switcher UI and a profile picker on load — should require no data migration
  if the MVP schema keys everything by profile ID from day one.

### B7. Quality-of-life polish
- Import/export of localStorage data (JSON download/upload) as a manual backup mechanism, since
  there's no cloud sync (out of scope per §10) but losing months of progress to a cleared browser
  cache would be a real risk on a shared family tablet.
- Offline install polish (e.g. a manifest + service worker for "add to home screen" on the iPad) —
  optional since the app is already fully static and offline-capable without one.
- Sound/haptic feedback on correct/incorrect answers (subtle, non-babyish) if it turns out to help
  engagement in practice.

### B8. Verbal/non-verbal reasoning (explicitly deferred)
- SPEC.md §10 explicitly excludes this "unless requested later" — only pick this up if Alex decides
  the target school's 11+ exam actually includes a reasoning component and asks for it. Would likely
  warrant its own question-bank section and possibly its own session type, reusing the same session/
  adaptive engine.

---

## Verification Plan

- Open `index.html` directly in a browser (no server required) and confirm the full loop works:
  start a session → answer questions (including a deliberate wrong answer, to check the worked
  explanation appears) → reach the end-of-session summary → check localStorage (via devtools) to
  confirm the session log and mastery scores were written and persist across a page reload.
- Manually test on an actual iPad (or Chrome DevTools device emulation as a first pass) for tap
  target size and portrait layout before considering the MVP "done."
- Sanity-check the countdown/pacing function by temporarily overriding "today" in devtools console
  to a few different dates (day 1, mid-window, final 2 days) and confirming the suggested phase/
  framing changes sensibly without needing a fixed day-by-day table.
