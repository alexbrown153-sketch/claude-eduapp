// Append-only record of what changed each time "Roadmap ideas and debug.md"
// was processed into the app (Roadmap #81). Shown in Settings > Changes.
//
// Rules for this file:
//  - Every processing run ADDS one entry at the TOP of CHANGELOG.
//  - Existing entries are never edited, reordered or removed — the list is
//    amended only, never truncated, however long it gets.
//  - This is build history, not user data, so it lives in the repo rather
//    than localStorage and survives Settings > Clear all progress.
//
// ROADMAP_LAST_ITEM_NUMBER is the highest numbered item currently in the
// roadmap file. The Suggestions screen numbers new suggestions from here, so
// they slot straight onto the end of that file (see suggestions in ui.js).
// Bump it whenever items are appended to the roadmap file.
export const ROADMAP_LAST_ITEM_NUMBER = 82;

export const CHANGELOG = [
  {
    at: '2026-09-17T18:00+01:00',
    items: '81–82',
    changes: [
      'Added this Changes list to Settings — every future run through the roadmap file adds a dated summary here.',
      'Added a Suggestions screen to the top bar so ideas can be written down in the app, numbered ready for the roadmap file and copied out in one go.',
    ],
  },
  {
    at: '2026-09-17T09:10+01:00',
    items: '1–80',
    changes: [
      'Everything built before the Changes list existed: the session engine and question generation, adaptive difficulty, countdown and pacing, progress and strengths, badges, points and the shop, avatar and themes, the joke/weather/word-of-the-day panel, settings, and the layout and navigation work.',
      'Individual summaries for these were not recorded at the time, so they are grouped into this one entry rather than invented after the fact.',
    ],
  },
];
