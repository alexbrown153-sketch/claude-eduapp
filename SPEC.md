# Sprint — 11+ Maths Trainer Product Specification

*"Sprint" is a suggested working name — ties together the drill-sprint session format and the short countdown to the exam. Easy to rename during the build if it doesn't land.*

> **Timeline note:** the exam is **Friday 2 October 2026** — about 17 days from when this spec was written (15 September 2026). See §6a for how this shapes build priorities. This is a tight window: get a working, usable version in front of the child within the first day or two of building, then iterate daily, rather than polishing before anything is usable.

## 1. Vision

A self-contained, browser-based maths practice app that helps a child preparing for the 11+ entrance exam build fluency, speed, and confidence across the exam's core maths topics — through short, adaptive drill sessions that stay engaging over months of repeated use.

## 2. Background & Precedent

This follows the shape of two apps already built: **The Study** (a chess opening/middlegame trainer) and **The Wire** (a news aggregator). Both are self-contained browser apps with no backend. The Study in particular is the closest precedent: a training-session loop with progress history. Reuse that proven shape rather than inventing a new interaction pattern from scratch.

## 3. Target User

- **Primary:** one child in Year 6, preparing for the 11+ entrance exam on 2 October 2026.
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
- Data handling & statistics (tables, charts, averages)
- Time, money, and real-world word problems
- Multi-step reasoning / worded problems (the hardest and most exam-differentiating category)
- Speed, distance, time
- Number patterns & sequences

**Decision:** don't mirror one specific exam board's format. Cover the core 11+ maths topics broadly and let question *style* stay reasonably generic (mix of direct-calculation and short word-problem framing) rather than replicating a particular board's layout or timing. This is the right call for a general skills boost with only ~2.5 weeks to go — narrowing to one board's quirks would cost time without much payoff unless the target school/board is confirmed.

## 6. Adaptive Difficulty

- Each topic has a mastery score for the child, updated after every question (a simple moving-average of accuracy + speed works fine; no need for a full ELO system).
- Questions are tagged with a difficulty tier (1–5) per topic.
- Session composition skews toward difficulty near the child's current mastery, with some stretch questions and some reinforcement of weak topics — similar in spirit to spaced repetition.
- Avoid frustration: don't stack too many hard questions back-to-back after a wrong answer.

## 6a. Countdown & Pacing Plan

**Decision:** yes, include this. Exam date is **Friday 2 October 2026**, so from a 15 September build start there are roughly 17 days / 2.5 weeks to work with. The app should show days-remaining and suggest a focus for "today" rather than leaving the child to guess what to practice.

Suggested shape (Claude Code should adapt exact days to whatever the actual build/launch date turns out to be, anchored to 2 Oct 2026):

- **Day 1 (diagnostic):** a short mixed-topic session covering all core topics at medium difficulty, purely to seed initial per-topic mastery scores. No pressure framing — this just calibrates the adaptive engine.
- **Bulk of the window (roughly days 2–13):** daily adaptive sessions, weighted toward the weakest topics from the diagnostic, cycling through every topic at least twice by the end of this phase so nothing gets neglected.
- **Late stage (roughly days 14–15):** longer, mixed-topic sessions that feel closer to exam conditions (more questions, a visible timer) to build stamina and pacing under light time pressure.
- **Final 1–2 days before the exam:** light, confidence-building review only — short sessions, skewed toward topics already at high mastery, no new/unfamiliar material. The goal here is calm, not cramming.

This plan is a default the app can compute automatically from "today" and the exam date — it shouldn't require Alex to hand-schedule anything, and it should re-adjust gracefully if a day or two gets skipped.

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

## 10. Out of Scope (MVP)

- Verbal/non-verbal reasoning sections (unless requested later).
- Multiplayer or social features.
- Cloud sync / multi-device accounts.
- A detailed parent analytics dashboard beyond a basic stats view (candidate for v2).

## 11. Decisions Log

All previously-open decisions have been settled:

| Question | Decision |
|---|---|
| Profiles | Single child, single profile. Data model keyed by profile ID for future extensibility, but no profile-switching UI. |
| Exam board style | General 11+ coverage, not tied to one board's format. |
| Countdown / pacing | Yes — exam is Friday 2 October 2026. See §6a for the pacing plan shape. |
| Primary device | Tablet (iPad), touch-first design. Laptop should still work. |
| Name / branding | Working name **"Sprint"** — encouraging, age-appropriate, ties to the countdown framing. Not locked in; easy to change. |
| Question sourcing | Mixed: procedurally generate arithmetic/number questions; hand-author a bank of word/reasoning problems. |

## 12. Suggested MVP Scope

Given the ~17-day runway, bias toward *something working fast* over completeness:

- Single profile, no login.
- Topics for v1: arithmetic & mental maths, fractions/decimals/percentages, word problems, geometry basics — the highest-yield, most exam-differentiating areas. Ratio/proportion, algebra basics, data handling, and speed/distance/time can follow once the core loop is working (there's time in the "bulk" phase of the pacing plan, §6a, to add them).
- Procedurally generated arithmetic questions (fast to build, gives near-infinite practice volume immediately) plus a smaller hand-authored bank of word/reasoning problems (aim for enough per topic to avoid obvious repetition within a session — quality and correctness matter more than a large volume given the audience).
- Adaptive difficulty per topic (simple moving-average model, §6).
- Diagnostic-first flow and daily pacing suggestion per §6a.
- Session summary + basic progress history (§7).
- Lightweight points/streak layer (§8) — enough to motivate daily practice, not an engineering focus.

A reasonable build sequence: (1) core question engine + a handful of arithmetic question generators + basic session UI, usable end-to-end on day one; (2) adaptive difficulty + mastery tracking; (3) countdown/pacing view; (4) progress view + gamification layer; (5) expand topic and question-bank coverage.
