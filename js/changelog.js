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
export const ROADMAP_LAST_ITEM_NUMBER = 85;

export const CHANGELOG = [
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
