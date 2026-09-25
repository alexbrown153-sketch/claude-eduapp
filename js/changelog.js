// Append-only record of what changed each time "Roadmap ideas and debug.md"
// was processed into the app (Roadmap #81). Shown in Settings > Changes.
//
// Rules for this file:
//  - Every processing run ADDS one entry at the TOP of CHANGELOG. Entries
//    are { at, label, changes }; `label` is the optional tag shown beside the
//    date ("Roadmap 81-82", "Fix", ...) and is rendered verbatim.
//  - Existing entries are never edited, reordered or removed — the list is
//    amended only, never truncated, however long it gets.
//  - This is build history, not user data, so it lives in the repo rather
//    than localStorage and survives Settings > Clear all progress.
//
// ROADMAP_LAST_ITEM_NUMBER is the highest numbered item currently in the
// roadmap file. The Suggestions screen numbers new suggestions from here, so
// they slot straight onto the end of that file (see suggestions in ui.js).
// Bump it whenever items are appended to the roadmap file.
export const ROADMAP_LAST_ITEM_NUMBER = 95;

export const CHANGELOG = [
  {
    at: '2026-09-25T17:06+01:00',
    label: 'Roadmap 94\u201395',
    changes: [
      'The boss question is now the Boss Challenge: three questions against a big angry monster. Every question you get right knocks a bit off it \u2014 first a horn snaps and it cracks, then the other horn goes and it gets an eye knocked out \u2014 and the third hit splits it in two. Destroy it completely and you get a 100-point bonus on top of the triple points for each hit.',
      'The Boss Challenge has its own look: a dark arena with the monster, a health bar and three dots showing your hits. Get one wrong and the monster just roars \u2014 nothing is taken off you, and the challenge carries on to the next question.',
      'You now have to earn the Boss Challenge: it only appears if you get more than 80% of the session\u2019s questions right (so 9 out of 10, or all 5 in a 5-question session). If you don\u2019t quite get there, the end-of-session summary tells you what you need to unlock it next time.',
    ],
  },
  {
    at: '2026-09-25T13:50+01:00',
    label: 'Roadmap 88\u201393',
    changes: [
      'Combo meter: get 3 right in a row and every answer is worth double points, 6 in a row and it\u2019s triple. The flame at the top of the question grows as your combo goes up. A wrong answer just starts the combo again \u2014 you never lose points you\u2019ve already won.',
      'Personal bests: a new box on the Home screen shows your records \u2014 best accuracy, longest combo, fastest correct answer and most questions in a day. Beat one and a big NEW RECORD! banner shows at the end of the session.',
      'Missions: for the last week before the exam, the big blue box on the Home screen turns each day into a mission, like \u201cMission: 5 days to go \u2014 Operation Fractions\u201d, and the day before is the \u201cFinal Briefing\u201d. Only the words have changed; the practice plan behind it is the same.',
      'Daily mystery chest: the first session you finish each day opens a chest with 20 to 100 bonus points, or sometimes a special item for your character that you can\u2019t buy in the Shop. The chest just shows what you won.',
      'Boss question: every session now ends with one harder boss question from your strongest topic, worth triple points. Get it right and its health bar drains away. Get it wrong and nothing is taken off you \u2014 it just survives until next time.',
      'Dark mode: the Light, Dark and Match device buttons all worked when tested here, so the most likely cause is the iPad still using an older, cached copy of the app. The page background behind the app now goes dark too, which it didn\u2019t before.',
    ],
  },
  {
    at: '2026-09-25T12:00+01:00',
    label: 'Roadmap 87',
    changes: [
      'Added a dark mode. Settings now has an Appearance section with three buttons: Light, Dark, and Match device, which follows the iPad\u2019s own light/dark setting and switches over with it. The choice is remembered, and it starts on Light so nothing changes until you pick.',
      'Dark mode works with whichever colour theme you\u2019ve bought from the shop \u2014 the theme colour stays, and just the background, text and boxes go dark.',
    ],
  },
  {
    at: '2026-09-20T17:00+01:00',
    label: 'Feedback',
    changes: [
      'Made it much clearer on the iPad whether you got a question right or wrong. A big green tick or red cross now pops up in the middle of the screen the moment you tap Check, instead of the answer appearing in a box right at the bottom of a long question where it was easy to miss.',
      'The star burst for a correct answer and the \u201cStreak!\u201d celebration now happen in the middle of the screen too, rather than up at the top where they were often scrolled out of sight.',
      'After you check an answer the number pad folds away and just shows what you typed, the whole question box turns green or red, and the page scrolls so the explanation and the Next question button are both on screen together.',
      'Multiple choice questions now tick the right answer and cross out the one you picked if it was wrong, so you can see at a glance what you should have chosen.',
    ],
  },
  {
    at: '2026-09-20T10:30+01:00',
    label: 'Coordinates',
    changes: [
      'Added a new Coordinates topic, alongside the others on the Home screen and in Progress. It covers reading points off a grid, finding the missing corner of a rectangle or parallelogram, midpoints, naming the four quadrants, and translations \u2014 getting harder as you get better at it, like every other topic.',
      'Coordinates questions come with their own grid drawn on screen to work from, and the answers are multiple choice so there is no fiddly typing of brackets and minus signs on the iPad.',
    ],
  },
  {
    at: '2026-09-19T09:00+01:00',
    label: 'Roadmap 86',
    changes: [
      'Added a little refresh button to the joke of the day and word of the day boxes on the Home screen, so you can tap it to get a different joke or word whenever you like, instead of waiting until tomorrow.',
    ],
  },
  {
    at: '2026-09-18T15:00+01:00',
    label: 'Roadmap 85',
    changes: [
      'Added a new "Next session" box on the Home screen, under the streak widget, that recommends what to practice next based on your strengths and weaknesses — it points at your weakest topic and how many questions to aim for, or suggests a mixed session until there’s enough practice data to tell.',
    ],
  },
  {
    at: '2026-09-18T12:20+01:00',
    label: 'Roadmap 84',
    changes: [
      'Restyled the clock widget on the Home screen to look like an iPhone lock screen: a dark card with the date in small capitals above a big, thin-weight time, instead of the plain bold time it had before.',
    ],
  },
  {
    at: '2026-09-18T11:40+01:00',
    label: 'Roadmap 83',
    changes: [
      'Smartened up the joke of the day and word of the day panels on the Home screen. They now look like proper cards, matching the clock and weather boxes above them, with a coloured stripe down the side and a little heading so you can tell at a glance which is which.',
      'The word of the day now shows the word big on its own line with the meaning underneath, instead of everything running together in one sentence.',
    ],
  },
  {
    at: '2026-09-18T10:15+01:00',
    label: 'Suggestions \u2192 GitHub',
    changes: [
      'Suggestions can now be added straight to the roadmap file on GitHub instead of being copied across by hand. Turn it on in Settings under "Send suggestions to GitHub".',
      'Suggestions are still saved on this device first, so the screen works exactly as before when the connection is off or the iPad is offline \u2014 anything that didn\u2019t get through is marked "Saved here" and can be sent again.',
    ],
  },
  {
    at: '2026-09-17T23:30+01:00',
    label: 'Fix',
    changes: [
      'Fixed the top bar on phones: it was laid out wider than an iPhone screen, which stacked the four navigation buttons one per row and pushed the points and settings gear off the right-hand edge. The bar is now two rows — name and avatar above, all four buttons side by side below — and fits the screen at any width.',
    ],
  },
  {
    at: '2026-09-17T18:00+01:00',
    label: 'Roadmap 81–82',
    changes: [
      'Added this Changes list to Settings — every future run through the roadmap file adds a dated summary here.',
      'Added a Suggestions screen to the top bar so ideas can be written down in the app, numbered ready for the roadmap file and copied out in one go.',
    ],
  },
  {
    at: '2026-09-17T09:10+01:00',
    label: 'Roadmap 1–80',
    changes: [
      'Everything built before the Changes list existed: the session engine and question generation, adaptive difficulty, countdown and pacing, progress and strengths, badges, points and the shop, avatar and themes, the joke/weather/word-of-the-day panel, settings, and the layout and navigation work.',
      'Individual summaries for these were not recorded at the time, so they are grouped into this one entry rather than invented after the fact.',
    ],
  },
];
