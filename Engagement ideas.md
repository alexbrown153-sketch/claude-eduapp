# Engagement ideas — making Sprint fun for a 10-year-old

A pool of ideas to pick from. They are **not** in the numbered roadmap on purpose: the
suggestion relay appends to the end of `Roadmap ideas and debug.md`, and items there get
built. Copy any idea you want into that file as a new numbered item.

Already built, so not repeated here: points shop (themes, fonts, 25+ avatars, moods),
streak and points badges, correct-answer and new-badge animations, joke / word of the
day, weather, clock, streak widget, next-session recommendation.

The exam is on **Friday 2 October**, one week from today, so the ideas are split into two
groups. Anything built this week needs to be small and low-risk, and should keep the
calm, confidence-building tone the pacing plan uses for the final days (SPEC §6a).

---

## A. Small enough to build this week

**A1. Combo meter.** Each correct answer in a row adds to a combo: x2 points at 3,
x3 at 6, with a flame that grows. A wrong answer quietly resets it. Nothing is taken
away, so it stays non-punitive (SPEC §8). Hooks into the existing points calculation.

**A2. Secret and skill badges.** Every badge now is for streaks or points. Add some he
can't see coming, shown as "???" until he earns them: *Perfect Ten* (a flawless
session), *Hot Hand* (10 in a row), *Speed Demon* (5 correct under 10s each), *Night Owl*
/ *Early Bird*, *Comeback Kid* (gets right a question he got wrong before; item 78
already tracks those). Kids this age love collecting, and hidden ones give him
something to hunt for.

**A3. Personal-best board.** Show his records on the home screen: best accuracy,
longest combo, fastest correct answer, most questions in a day. When he beats one,
flash a "NEW RECORD!" banner. He's competing with himself, which suits a single-profile
app.

**A4. Mission framing for the last week.** Rename each day's pacing phase as a
mission: "Mission: 5 days to go — Operation Fractions", then "Final Briefing" on the
day before. Only the text changes; the pacing logic stays the same.

**A5. Sound effects (off by default, toggle in Settings).** A short "ding" when he's
right, a coin sound for points, a fanfare for a badge. Generated with the Web Audio API,
so there are no audio files and it still works offline.

**A6. Daily mystery chest.** The first session he finishes each day opens a chest
containing 20–100 bonus points, or sometimes a shop item he can only get from the chest.
It rewards turning up every day, which matters most this week. Keep the odds fixed and
generous, with no "nearly won" teasing.

## B. After the exam, if Sprint keeps going (Year 7 maths, a sibling)

**B1. Beat the Grown-Up.** A guest round where you answer the same 10 questions and
see who scores higher. It doesn't touch his mastery or streak. *Flag:* SPEC says single
profile with no switching UI. A guest round avoids that, but it's your call.

**B2. 60-second Blitz.** An arcade round with as many arithmetic questions as he can
answer in a minute, a leaderboard of his top 5 runs, and a "one more go" button.
(It's in B and not A because a timed mode clashes with the calm final days.)

**B3. Avatar that levels up.** The avatar grows as his total points rise: e.g. egg,
hatchling, dragon, armoured dragon. He'd earn it rather than buy it, and it sits
alongside the shop cosmetics.

**B4. Themed question skins.** The same maths with different stories: football (goal
difference, league points, transfer fees in ratios), space missions, building and
crafting. Every hand-written variant needs its answer checked, since correctness comes
first (CLAUDE.md).

**B5. Boss question.** End each session with one dramatic "boss" question from his
strongest topic, worth triple points, with a health bar that empties when he gets it
right.

**B6. Weekly quests.** Three quests each week (e.g. "20 ratio questions", "a perfect
session", "practise 4 days") with a points reward and a badge for finishing all three.

**B7. Trophy cabinet.** A shelf screen with earned badges lit up and locked ones as
silhouettes with a hint, so he can see what's left to earn.

---

## Something to check before 2 October

`js/pacing.js` has no phase for after the exam. From 2 October, `daysRemaining` goes
to 0 and then negative, so the plan stays on "final-review" and keeps saying *"You're
ready — let's keep today light and calm."* for good. On exam day and after, it should
probably show a "You did it!" celebration (maybe with a special badge) and stop showing
exam pacing. That's small, and it's worth doing before Friday so it isn't the first
thing he sees afterwards.
