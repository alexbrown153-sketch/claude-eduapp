# Sprint — 11+ Maths Trainer Product Specification

*"Sprint" is the working name — it comes from the short drill-sprint session format. Easy to rename if it doesn't land.*

*Status: the 11+ exam this app was first built for has passed. Sprint is now an app for ongoing maths practice with no exam date, countdown or deadline-driven pacing.*


## 1. Vision

A self-contained, browser-based maths practice app that helps a child build fluency, speed, and confidence across the core 11+ / upper-primary maths topics — through short, adaptive drill sessions that stay engaging over months of repeated use. The key is engagement from the child user. They should want to use it more as they find it enjoyable and pleasureable.

## 2. Background & Precedent

No background. This is a new concept.

## 3. Target User

- **Primary:** one child (upper primary / early secondary) doing ongoing maths practice. The 11+ exam that prompted the app has passed.
- **Secondary:** parent (Alex) — reviews progress, may adjust settings or topic focus, not a primary daily user.
- **Decision:** single profile only for this build. Keep the data model (session log, mastery scores) keyed by a profile ID even though there's only one, so a second profile could be added later without restructuring the data — but don't build any profile-switching UI now.

## 4. Core Learning Loop

1. Child starts a session — picks a length (e.g. 10/20 questions, or a 5/10-minute timed sprint) and optionally a topic focus.
2. Questions are drawn from the topic pool, weighted toward weaker areas and the child's current difficulty level.
3. Each question gives immediate feedback: correct/incorrect, with a brief worked explanation on incorrect answers.
4. A running score/streak is visible during the session.
5. Session ends with a summary: score, accuracy, time, topics covered, points/streak earned.

## 5. Topic Coverage (11+ Maths Syllabus)

- Arithmetic & mental maths (all four operations, order of operations, mental strategies under time pressure)
- Fractions, decimals, percentages (equivalence, conversion, operations)
- Ratio & proportion
- Algebra basics (simple equations, sequences, substitution)
- Geometry & measures (angles, area/perimeter, 2D/3D shapes, units)
- Coordinates & the grid (reading and plotting points, missing vertices of shapes, midpoints, quadrants, translations)
- Data handling & statistics (tables, charts, averages)
- Time, money, and real-world word problems
- Multi-step reasoning / worded problems (the hardest category)
- Speed, distance, time
- Number patterns & sequences

**Decision:** don't mirror any specific exam board's format. Cover the core topics broadly and keep question *style* generic (a mix of direct calculation and short word-problem framing) rather than replicating a particular paper's layout or timing.

## 6. Adaptive Difficulty

- Each topic has a mastery score for the child, updated after every question (a simple moving-average of accuracy + speed works fine; no need for a full ELO system).
- Questions are tagged with a difficulty tier (1–5) per topic.
- Session composition skews toward difficulty near the child's current mastery, with some stretch questions and some reinforcement of weak topics — similar in spirit to spaced repetition.
- Avoid frustration: don't stack too many hard questions back-to-back after a wrong answer.

## 6a. Daily Focus (replaces the old exam pacing plan)

There is no exam date, countdown or phased pacing plan. The Home screen's focus card suggests today's practice:

- **Diagnostic** — until the first diagnostic session has been completed, suggest a short mixed diagnostic session (all topics, low tiers) to seed mastery scores.
- **Daily practice** — after that, every day: weight topics toward the weakest and least-recently-practised ones (the existing weak-and-stale weighting), and name the weakest topic on the focus card ("Today's focus: …"). The same weakest topic is used by the Next-session widget and the summary's "practise next time" line so they always agree.
- The suggestion depends only on saved progress (and how long since each topic was practised), never on a calendar deadline.
- Timed sessions (e.g. a 5-minute sprint) are a normal session option, always showing their clock; they are not "exam conditions".

## 7. Progress Tracking & Stats

- Session history log: date, topics covered, accuracy, average time per question.
- Per-topic mastery view (e.g. a simple heatmap or bar list) so weak vs strong areas are visible at a glance.
- Streak tracking (consecutive days practiced).
- Trend over time — is accuracy/speed improving per topic?

## 8. Gamification & Motivation

- Points per correct answer, with bonuses for speed and streaks.
- Levels or badges tied to topic-mastery milestones.
- A lightweight visual reward layer (streak flame, unlockable theme/avatar, etc.) — pitched for a near-11-year-old, not babyish.
- Encouraging framing throughout; avoid anything punitive for wrong answers.

## 9. Non-Functional Requirements

- Self-contained, client-side only — no backend (matches prior builds).
- Data persistence via localStorage (session history, mastery scores).
- **Decision:** primary device is a tablet (iPad) — design touch-first: large tap targets, no hover-dependent interactions, portrait-friendly layout. Should still be usable on a laptop, but tablet is the design center, not an afterthought.
- No login/accounts required for MVP.
- Fast load, minimal dependencies, works offline.

## 11. Decisions Log

All previously-open decisions have been settled:

| Question | Decision |
|---|---|
| Profiles | Single child, single profile. Data model keyed by profile ID for future extensibility, but no profile-switching UI. |
| Exam board style | General 11+-level coverage, not tied to one board's format. |
| Exam date / pacing | The exam has passed. No countdown or deadline pacing; daily focus per §6a. |
| Primary device | Tablet (iPad), touch-first design. Laptop should still work. |
| Name / branding | Working name **"Sprint"** — encouraging, age-appropriate, named after the short drill-sprint sessions. Not locked in; easy to change. |
| Question sourcing | Mixed: procedurally generate arithmetic/number questions; hand-author a bank of word/reasoning problems. |

## 12. Original MVP Scope (historical)

The MVP was built on a short runway before the exam, biased toward *something working fast* over completeness:

- Single profile, no login.
- Topics for v1: arithmetic & mental maths, fractions/decimals/percentages, word problems, geometry basics — the highest-yield areas. Ratio/proportion, algebra basics, data handling, and speed/distance/time followed once the core loop was working.
- Procedurally generated arithmetic questions (fast to build, gives near-infinite practice volume immediately) plus a smaller hand-authored bank of word/reasoning problems (aim for enough per topic to avoid obvious repetition within a session — quality and correctness matter more than a large volume given the audience).
- Adaptive difficulty per topic (simple moving-average model, §6).
- Diagnostic-first flow and a daily focus suggestion per §6a.
- Session summary + basic progress history (§7).
- Lightweight points/streak layer (§8) — enough to motivate daily practice, not an engineering focus.

A reasonable build sequence: (1) core question engine + a handful of arithmetic question generators + basic session UI, usable end-to-end on day one; (2) adaptive difficulty + mastery tracking; (3) daily focus suggestion; (4) progress view + gamification layer; (5) expand topic and question-bank coverage.
