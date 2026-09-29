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
export const ROADMAP_LAST_ITEM_NUMBER = 153;

export const CHANGELOG = [
  {
    at: '2026-09-29T13:37+01:00',
    label: 'Roadmap 153 (part 1)',
    changes: [
      'Sprint has a brighter, friendlier new look. Boxes float on the page, and buttons and number keys press down like real keys when you tap them.',
      'The Classic writing now uses the iPad\u2019s rounded letters. Bubbly and Robot Mode still work, and now change the buttons and number keys too.',
      'The Sunset and Forest colours are a little deeper on buttons, so the white writing is easier to read. The Shop still shows their bright colours.',
      'Green \u201cright\u201d and red \u201cwrong\u201d writing is a bit darker, so it\u2019s easier to read.',
      'The settings cog, the buttons at the top and the Exit button are bigger, so they\u2019re easier to tap.',
    ],
  },
  {
    at: '2026-09-29T18:00+01:00',
    label: 'Roadmap 127\u2013128, 130\u2013131, 134\u2013142, 149',
    changes: [
      'At the end of a session you can now see the questions you got wrong, with the right answer and \u201cHow to work it out\u201d. Tap \u201cTry these again\u201d to have another go at up to 5 of them with new numbers.',
      'Home has a new \u201cFix my mistakes\u201d card. It gives you new versions of the questions you got wrong this week, up to 10 at a time, easiest first.',
      'The big blue box on Home now has a daily goal ring. Answer 20 questions in a day to fill it up and make it sparkle.',
      'Progress has a new \u201cThis week vs last week\u201d card. It shows which topics went up this week.',
      'Badges now live in a Trophy cabinet. Tap Badges at the top, or the Trophy cabinet button on Progress, to see the ones you\u2019ve won and the ones still to win.',
      'There are 4 secret badges to discover. They show as ??? until you win one!',
      'Every week there are 3 new quests on Home. Each one you finish gives you 50 stars, and finishing all 3 gives you 100 more and a badge the first time.',
      'There\u2019s a new adventure map! Every session of 5 or more questions moves you one step along the path, through a new place for each topic. Tap the Adventure card on Home to see it.',
      'A grown-up can now set a real-life reward goal in Settings, like a cinema trip. Home shows a bar that fills up as you earn stars.',
      'A grown-up can now leave you a note in Settings. It pops up on Home the next time you open Sprint.',
      'Progress now shows a calendar of your practice days for the last 5 weeks, with a tick for every day you practised.',
      'On the first visit of each month, Home shows what you did last month: how many questions you answered, your most improved topic and any new records.',
      'You can switch on sound effects in Settings: a ding for a right answer, and a little tune when you finish a session.',
      'Every 4 weeks Home offers a check-up quiz: 2 questions from every topic, to see how you\u2019re doing now.',
    ],
  },
  {
    at: '2026-09-29T09:30+01:00',
    label: 'Roadmap 97, 115\u2013126, 129, 132\u2013133, 150\u2013151',
    changes: [
      'Got the right number but typed it the wrong way, like 0.3 when the question wanted 3/10? Sprint now says \u201cRight number!\u201d, tells you how to write it, and gives you one more go.',
      'Quadrant questions no longer have 1st, 2nd, 3rd and 4th written on the grid, so you work it out yourself. Remember: the quadrants are numbered anticlockwise, starting at the top right.',
      'The question number now stays the same while you read how you did. It moves on when you tap Next question.',
      'When you get one wrong, the \u201cNot quite\u201d message now shows as a strip at the top of the screen, so it doesn\u2019t cover the answer buttons. You can see which one you picked and which one was right.',
      'Your very first session is now called a warm-up quiz. It\u2019s not a test, it just helps Sprint know what to practise with you.',
      'On Progress, \u201cMastery by topic\u201d is now called \u201cHow I\u2019m doing in each topic\u201d.',
      'Home only names your strongest topic once you\u2019ve really shown it. Until then it says \u201cWe\u2019ll find out as you practise\u201d.',
      'Rectangle and L-shape questions now come with a picture of the shape and its measurements. The rectangles-with-corners-cut-off questions have a picture too, and now say exactly which corners.',
      'Ratio sharing questions now show a bar model after you answer: one bar for each share, with the same amount in every box.',
      'Top-heavy fraction questions now show \u201cType it like this: 7/5\u201d under the question, so you know how to write the answer.',
      'Got one wrong? The explanation now comes one step at a time. Tap \u201cShow next step\u201d to see the next bit.',
      'Fraction questions no longer ask you to times or divide by a whole one, like 4/5 \u00d7 5/5, and take-away questions never come out as 0.',
      'Word problems now say \u201che\u201d or \u201cshe\u201d instead of \u201cthey\u201d for the person in the question.',
      'Each topic now has bronze, silver and gold medals at 50%, 70% and 90%. Answer 10 questions in a topic to start winning them. Progress shows your medal and how far it is to the next one.',
      'With the iPad on its side, the question is on the left and the number pad is on the right, so it isn\u2019t stretched right across the screen.',
      'The first time a remainder question comes up, a little tip shows you how to use the r key.',
      'Settings has a new Back up and restore section. You can save your progress to a file and bring it back later, even on a different iPad.',
      'If your progress hasn\u2019t been saved to a file for a month, Home shows a gentle reminder to save a copy.',
      'Practice just after midnight now counts for the right day, so it can\u2019t break your streak by mistake.',
    ],
  },
  {
    at: '2026-09-28T13:55+01:00',
    label: 'Roadmap 96\u2013114',
    changes: [
      'The big blue box on Home now always shows today\u2019s focus, which is the topic you most need to practise, like \u201cToday\u2019s focus: Algebra\u201d. The day counter and the missions have gone, because the exam is over and Sprint is now for everyday practice. The app is now just called Sprint.',
      'Timed sprints now show their clock at the top of every question, so you can see how much time is left.',
      'On an iPad held upright, the big blue box and the topic buttons are now at the top of Home. Your streak comes next, and the clock, weather, joke and word of the day are further down.',
      'Remainder and fraction questions now have an r key and a / key on the number pad, so the iPad keyboard doesn\u2019t pop up and cover the question.',
      'The \u201cNot quite\u201d pop-up is smaller and goes away faster, and you can tap anywhere to make it go straight away, so you can read how to do the question.',
      'Got one wrong? Tap \u201cTry one like it\u201d to have another go at the same kind of question with new numbers. It counts as one of your questions and can win you points.',
      'The Progress page has a new \u201cMistakes I fixed\u201d list. It shows the kinds of question you used to get wrong and now get right. The end of a session tells you when you\u2019ve fixed one.',
      'The end of every session now tells you the best thing you did, and one thing to practise next time.',
      'The end of a session now shows how your points add up: points from questions, the boss bonus and the mystery chest, and how many stars you now have to spend.',
      'New in the Shop: a Streak Shield for 150 points. If you miss one day, it saves your streak by itself. You can hold one at a time, and Home shows \u201cShield ready\u201d while you have it.',
      'The app starts faster and works better without the internet, because the PDF reader is now only loaded on the Import screen.',
    ],
  },
  {
    at: '2026-09-28T13:50+01:00',
    label: 'Fix',
    changes: [
      'Fraction questions whose answer is a whole number now take the whole number. For 3/4 + 1/4 you type 1, and the answer shows as 1 instead of \u201c1/1\u201d.',
      'Fraction explanations no longer say the same answer twice, like \u201c3/10 = 3/10\u201d.',
      'Fixed the answers for 1/8 and 3/8 as a percentage. They are 12.5% and 37.5%, not 13% and 38%.',
      'When a fraction answer is top-heavy, like 17/12, the question now says \u201cas an improper fraction\u201d, so you know not to write it as a mixed number.',
      'Sharing questions never use a ratio like 3:3 any more, because then there is no smaller or larger share.',
      'Two-discount price questions always come out in whole pennies now, so there is no rounding to guess.',
    ],
  },
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
