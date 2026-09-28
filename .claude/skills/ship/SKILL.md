---
name: ship
description: Take a change to Sprint from idea to tested commit by running the product-manager, software-engineer and child-user subagents in order. Use when Alex types /ship followed by roadmap item numbers, a bug report or an idea, or asks to "spec, build and test" a change.
argument-hint: "<roadmap numbers | bug | idea>  [--no-pause]"
---

# /ship: spec → build → child-test → commit

You are the coordinator. The three subagents can't call each other, so you pass each
agent's output to the next one. Each agent starts with no memory of this conversation,
so every prompt you send must stand on its own: include the spec, the files involved
and the findings you want dealt with. Don't write app code yourself. That's the
software-engineer's job.

Arguments: `$ARGUMENTS`

## 0. Work out what's being shipped

- **Numbers** such as `96` or `96-98` are items in `Roadmap ideas and debug.md`. Read
  them. Anything higher than `ROADMAP_LAST_ITEM_NUMBER` in `js/changelog.js` has not been
  processed yet.
- **Anything else** is a bug report or idea written out in plain text.
- **No arguments:** run `bash scripts/roadmap-status.sh`. If there are new items, ship
  them. If not, ask Alex what to ship and stop.

Check the exam date in `SPEC.md`. If the exam is still ahead, count the days left and
pass that number to every agent. In the final week, also tell every agent that only
small, low-risk changes are in scope.

## 1. Spec with the product-manager

Launch the `product-manager` agent. Give it the item text and the days left (if any), and ask
for one spec per item, in the format its instructions set out, plus its S/M/L effort and
risk rating.

If there are several items, run one product-manager agent for each, all at the same
time. If the child-user should also check how the app currently behaves, launch it in
the same batch. Neither of them changes files.

**Pause for Alex.** Show the specs briefly, along with any open questions and any items
the product-manager put under "Won't do". Wait for Alex's approval or answers. Skip the
pause only when `--no-pause` was given **and** there are no open questions. Maths
questions always need Alex's answer.

## 2. Build with the software-engineer

Launch one `software-engineer` agent for all the approved specs. It works one change at
a time, so don't run several in parallel on the same checkout. Include:

- each approved spec word for word, with Alex's answers written in
- for roadmap items: add **one** entry at the top of `CHANGELOG` in `js/changelog.js` in
  child-friendly words, labelled like `Roadmap 96–97`, and set
  `ROADMAP_LAST_ITEM_NUMBER` to the highest item processed
- for bug fixes and ideas outside the roadmap: add a changelog entry labelled `Fix` or
  `New`, and leave the watermark alone
- an instruction not to commit

When it reports back, run `bash scripts/verify.sh` yourself. If it fails, send the output
back to the same agent with SendMessage and ask it to fix the problem. Don't move on
until the script passes.

## 3. Test with the child-user

Launch the `child-user` agent. Tell it exactly which screens changed and how to reach
them, and which topics or saved-progress setup it needs. Also ask it to play one normal
session from start to finish, so it catches anything that broke elsewhere.

## 4. Fix loop, at most two rounds

Sort the child-user's findings into two groups:

- **Must fix:** Blocker and Maths findings, plus anything that contradicts the spec's
  acceptance criteria.
- **Report only:** Confusing, Touch/layout, Tone and Nice to have. Pass these on to Alex
  instead of fixing them now. The one exception is a trivial fix that stays within the
  spec, such as a label's wording.

Send the must-fix findings, word for word, to the software-engineer with SendMessage.
Run `verify.sh` again, then ask the child-user to recheck only those findings. Stop after
two rounds. If must-fix findings remain after that, **don't commit**. Report them to Alex
and stop.

## 5. Commit and report

- Look over the full diff yourself. It should change only what the specs cover, and
  `Roadmap ideas and debug.md` must not be modified.
- Commit on the current branch with a message naming the items. Push only if Alex asked,
  and open a PR only if Alex asked.
- Send Alex a short report:
  - what shipped, one line per item
  - how it was verified: `verify.sh` and the child-user rounds
  - the child-user's "In my words" section, quoted
  - findings that were only reported, and items that were deferred

## Rules

- Correctness of the maths comes before everything else. Any finding tagged Maths blocks
  the commit until it's fixed or Alex accepts it.
- Only the relay Worker writes to `Roadmap ideas and debug.md`. No agent edits it.
- Don't change the agents' instructions to get past a problem. Tell Alex instead.
