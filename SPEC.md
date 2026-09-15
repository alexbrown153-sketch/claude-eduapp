# 11+ Maths Trainer — Product Specification

*Working title — see Open Questions for naming/branding.*

## 1. Vision

A self-contained, browser-based maths practice app that helps a child preparing for the 11+ entrance exam build fluency, speed, and confidence across the exam's core maths topics — through short, adaptive drill sessions that stay engaging over months of repeated use.

## 2. Background & Precedent

This follows the shape of two apps already built: **The Study** (a chess opening/middlegame trainer) and **The Wire** (a news aggregator). Both are self-contained browser apps with no backend. The Study in particular is the closest precedent: a training-session loop with progress history. Reuse that proven shape rather than inventing a new interaction pattern from scratch.

## 3. Target User

- **Primary:** one or more children in Year 5/6 (roughly age 9–11) preparing for the 11+ entrance exam.
- **Secondary:** parent (Alex) — reviews progress, may adjust settings or topic focus, not a primary daily user.
- Open question: is this for a single child or more than one? (See §11.)

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

Note: the exact syllabus emphasis varies by exam board (CEM/Durham, GL Assessment, ISEB Common Pre-Test, or a bespoke school paper). See §11.

## 6. Adaptive Difficulty

- Each topic has a mastery score for the child, updated after every question (a simple moving-average of accuracy + speed works fine; no need for a full ELO system).
- Questions are tagged with a difficulty tier (1–5) per topic.
- Session composition skews toward difficulty near the child's current mastery, with some stretch questions and some reinforcement of weak topics — similar in spirit to spaced repetition.
- Avoid frustration: don't stack too many hard questions back-to-back after a wrong answer.

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
- Touch-friendly and responsive — likely used on a tablet as well as a laptop.
- No login/accounts required for MVP.
- Fast load, minimal dependencies, works offline.

## 10. Out of Scope (MVP)

- Verbal/non-verbal reasoning sections (unless requested later).
- Multiplayer or social features.
- Cloud sync / multi-device accounts.
- A detailed parent analytics dashboard beyond a basic stats view (candidate for v2).

## 11. Open Questions / Decisions Needed

- How many children will use this — do we need separate profiles?
- Which exam board style should the question bank mirror (CEM, GL, ISEB, or a specific target school's past papers)?
- How long until the exam — should the app include a countdown or a topic pacing plan?
- Primary device (tablet vs laptop) — affects UI sizing and touch targets.
- Any preference on app name / branding / visual style?
- How should question content be sourced: procedurally generated (works well for arithmetic), hand-authored (needed for word/reasoning problems), or a mix?

## 12. Suggested MVP Scope

Single profile. Four to five core topics to start: arithmetic, fractions/decimals/percentages, word problems, and geometry basics. Procedurally generated arithmetic questions plus a hand-authored bank of roughly 150–300 word/reasoning questions. Adaptive difficulty per topic. Session summary and basic progress history. Simple points/streak gamification layer.
