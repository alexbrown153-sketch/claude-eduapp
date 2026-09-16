// A lightweight "word of the day" for the home screen — deterministic by
// date (same word all day, rotates daily), same approach as jokes.js.
// Words are picked for the kind of vocabulary that comes up in 11+ verbal
// reasoning / comprehension papers.

const WORDS = [
  { word: 'Abundant', meaning: 'Existing in large quantities; plentiful.' },
  { word: 'Adjacent', meaning: 'Next to or adjoining something else.' },
  { word: 'Ambiguous', meaning: 'Open to more than one interpretation; not clear.' },
  { word: 'Benevolent', meaning: 'Kind, generous and caring towards others.' },
  { word: 'Candid', meaning: 'Open and honest; truthful and straightforward.' },
  { word: 'Diligent', meaning: 'Hard-working and careful in what you do.' },
  { word: 'Eloquent', meaning: 'Fluent and persuasive in speaking or writing.' },
  { word: 'Frugal', meaning: 'Careful not to waste money or resources.' },
  { word: 'Hostile', meaning: 'Unfriendly and aggressive; showing opposition.' },
  { word: 'Immense', meaning: 'Extremely large in size or amount.' },
  { word: 'Jubilant', meaning: 'Feeling or showing great happiness and triumph.' },
  { word: 'Keen', meaning: 'Having a strong interest or enthusiasm for something.' },
  { word: 'Lethargic', meaning: 'Lacking energy; sluggish and tired.' },
  { word: 'Meticulous', meaning: 'Very careful and precise about details.' },
  { word: 'Notorious', meaning: 'Well known for something bad.' },
  { word: 'Obstinate', meaning: 'Stubbornly refusing to change your mind.' },
  { word: 'Plausible', meaning: 'Seeming reasonable or probable; believable.' },
  { word: 'Quaint', meaning: 'Attractively unusual or old-fashioned.' },
  { word: 'Reluctant', meaning: 'Unwilling and hesitant to do something.' },
  { word: 'Scarce', meaning: 'Not enough to meet demand; rare.' },
  { word: 'Tedious', meaning: 'Long, slow and boring.' },
  { word: 'Unanimous', meaning: 'Fully in agreement; everyone agrees.' },
  { word: 'Vigilant', meaning: 'Keeping careful watch for possible danger.' },
  { word: 'Wary', meaning: 'Cautious about possible dangers or problems.' },
  { word: 'Zealous', meaning: 'Showing great energy and enthusiasm for a cause.' },
  { word: 'Concise', meaning: 'Giving information clearly, in few words.' },
  { word: 'Dubious', meaning: 'Not sure or certain about something.' },
  { word: 'Feeble', meaning: 'Lacking physical or mental strength; weak.' },
  { word: 'Genuine', meaning: 'Truly what it is said to be; authentic.' },
  { word: 'Hesitant', meaning: 'Slow to act because of uncertainty.' },
];

export function getWordOfTheDay(date = new Date()) {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - startOfYear) / 86400000);
  return WORDS[dayOfYear % WORDS.length];
}
