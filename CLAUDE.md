# CLAUDE.md — Build Context for This Repo

## Project

**Sprint** (working name) — a self-contained browser app for 11+ exam maths practice, for one child sitting the exam on **Friday 2 October 2026**. Read `SPEC.md` in this repo first for the full product spec before writing code — all previously-open decisions are now settled and logged in SPEC.md §11.

**Timeline matters here.** The build window is short (~2.5 weeks from spec date to exam). Get a working end-to-end slice — even just arithmetic questions in a basic session loop — usable in the first day or two, then layer in adaptive difficulty, the countdown/pacing view, progress tracking, and gamification. Don't block a usable v1 on having every topic or every feature built.

## Precedent / Style to Match

Alex has built similar self-contained browser apps before: **The Study** (a chess opening/middlegame trainer) and **The Wire** (a news aggregator). Follow the same philosophy — no unnecessary backend, works as a lightweight personal web app, clean minimal UI, data persisted locally. Don't over-engineer this into a multi-service architecture; it's a personal project for one family.

## Tech Stack

- Client-side only, static site: HTML/CSS/vanilla JS. Only reach for a framework or build step if it clearly earns its complexity — check with Alex before adding one.
- No backend/server required for the MVP. Persist data via `localStorage`.
- Should run by opening `index.html` directly or via a trivial static server — no complex build pipeline.
- **Touch-first, tablet-primary design** (iPad is the main target device): large tap targets, no hover-dependent interactions, portrait-friendly layout. Should still work on a laptop, but design for touch first, not as an afterthought.

## Data Model (starting point)

- Question bank as structured JSON/JS data, tagged by `topic`, `subtopic`, and `difficulty` (tier 1–5).
- Session log stored locally: date, topics, questions asked, correct/incorrect, time per question.
- Per-topic mastery score, recalculated after each session (simple moving-average of accuracy + speed is enough — no need for a full ELO system).

## Key Behaviours to Implement

1. **Session start screen** — choose session length/duration, optionally a topic focus. Should also surface "today's suggested focus" from the pacing plan (see 3 below).
2. **Question engine** — selects the next question based on adaptive difficulty and weak-topic weighting. Arithmetic/number questions are procedurally generated; word/reasoning questions are drawn from a hand-authored bank.
3. **Countdown & pacing view** — computes days remaining until 2 October 2026 and suggests a focus for "today" per the phased plan in `SPEC.md` §6a (diagnostic → weak-area drilling → exam-condition sessions → light pre-exam review). Should recompute gracefully from whatever "today" actually is, not assume a fixed start date.
4. **Immediate feedback** per question, with a brief worked explanation shown on incorrect answers.
5. **End-of-session summary** — score, accuracy, time, topics practiced, points/streak earned.
6. **Progress view** — session history, per-topic mastery visualization, streak counter.
7. **Gamification layer** — points, streaks, badges/milestones. Keep it lightweight, not the focus of engineering effort.

## Decisions (settled — see `SPEC.md` §11 for the full log)

Single profile (data model extensible, no profile-switching UI) · general 11+ topic coverage, not tied to one exam board · countdown/pacing plan included, exam date 2 Oct 2026 · tablet-primary/touch-first design · working name "Sprint" · mixed question sourcing (procedural arithmetic + hand-authored word/reasoning bank).

If a genuinely new ambiguity comes up during the build that isn't covered by SPEC.md, flag it to Alex rather than guessing — per the correctness note below.

## Working Conventions

- Keep the codebase simple and readable — one person maintains this, not a team.
- Prefer a small number of files over a sprawling structure unless the app's growth genuinely demands it.
- Comment non-obvious logic, especially the adaptive difficulty algorithm.
- No telemetry, analytics, or external network calls — the app should be fully offline-capable.
- When a spec decision is genuinely ambiguous, ask rather than guess — this is a learning tool for a real child preparing for a real exam, so correctness of maths content and explanations matters more than shipping speed.
