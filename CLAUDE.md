# CLAUDE.md — Build Context for This Repo

## Project

**11+ Maths Trainer** — a self-contained browser app for 11+ exam maths practice. Read `SPEC.md` in this repo first for the full product spec before writing code.

## Precedent / Style to Match

Alex has built similar self-contained browser apps before: **The Study** (a chess opening/middlegame trainer) and **The Wire** (a news aggregator). Follow the same philosophy — no unnecessary backend, works as a lightweight personal web app, clean minimal UI, data persisted locally. Don't over-engineer this into a multi-service architecture; it's a personal project for one family.

## Tech Stack

- Client-side only, static site: HTML/CSS/vanilla JS. Only reach for a framework or build step if it clearly earns its complexity — check with Alex before adding one.
- No backend/server required for the MVP. Persist data via `localStorage`.
- Should run by opening `index.html` directly or via a trivial static server — no complex build pipeline.
- Responsive and touch-friendly (large tap targets, no hover-only interactions) — likely used on a tablet as well as a laptop.

## Data Model (starting point)

- Question bank as structured JSON/JS data, tagged by `topic`, `subtopic`, and `difficulty` (tier 1–5).
- Session log stored locally: date, topics, questions asked, correct/incorrect, time per question.
- Per-topic mastery score, recalculated after each session (simple moving-average of accuracy + speed is enough — no need for a full ELO system).

## Key Behaviours to Implement

1. **Session start screen** — choose session length/duration, optionally a topic focus.
2. **Question engine** — selects the next question based on adaptive difficulty and weak-topic weighting.
3. **Immediate feedback** per question, with a brief worked explanation shown on incorrect answers.
4. **End-of-session summary** — score, accuracy, time, topics practiced, points/streak earned.
5. **Progress view** — session history, per-topic mastery visualization, streak counter.
6. **Gamification layer** — points, streaks, badges/milestones. Keep it lightweight, not the focus of engineering effort.

## Open Decisions Before/During Build

Pull these from `SPEC.md` §11 and flag them to Alex rather than silently assuming:

- Number of child profiles needed.
- Which exam board style the question bank should mirror (CEM, GL, ISEB, or a specific school's papers).
- Whether to include an exam countdown / topic pacing plan.
- Primary target device (tablet vs laptop).
- App name, branding, and visual style.
- How the question bank will be authored/sourced (procedural generation vs hand-authored vs mixed).

## Working Conventions

- Keep the codebase simple and readable — one person maintains this, not a team.
- Prefer a small number of files over a sprawling structure unless the app's growth genuinely demands it.
- Comment non-obvious logic, especially the adaptive difficulty algorithm.
- No telemetry, analytics, or external network calls — the app should be fully offline-capable.
- When a spec decision is genuinely ambiguous, ask rather than guess — this is a learning tool for a real child preparing for a real exam, so correctness of maths content and explanations matters more than shipping speed.
