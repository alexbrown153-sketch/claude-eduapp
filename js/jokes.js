// A lightweight "joke of the day" for the home screen — deterministic by
// date (same joke all day, rotates daily) rather than random on every visit.

const JOKES = [
  'Why was the equals sign so humble? Because it knew it wasn’t less than or greater than anyone else.',
  'Why did the boy eat his maths homework? Because the teacher said it was a piece of cake!',
  'Why is it sad that parallel lines have so much in common? Because they’ll never meet.',
  'What do you call a number that can’t keep still? A roamin’ numeral.',
  'Why did the two 4s skip lunch? Because they already 8!',
  'What’s a maths teacher’s favourite season? Sum-mer.',
  'Why did the student wear glasses in maths class? To improve di-vision.',
  'What did the zero say to the eight? Nice belt!',
  'Why don’t maths books ever look sad? They’ve got lots of problems, but they always solve them.',
  'How do you make seven an even number? Take away the s.',
  'Why was the fraction worried about marrying the decimal? Because he would have to convert.',
  'What tool do you use for maths? Multi-pliers.',
  'Why couldn’t the angle get a loan? Its parents wouldn’t co-sine.',
  'What did one geometry book say to the other? Don’t worry, I’ve got your angles covered.',
  'Why did the obtuse angle go to the beach? Because it was over 90 degrees.',
  'What do you call an empty jar of shapes? Hollow-gram.',
  'Why is the number six afraid of seven? Because seven ate nine!',
  'What did the little acorn say when it grew up? Geometry.',
  'Why was the maths lesson so long? The teacher kept going off on a tangent.',
  'What’s the best way to talk to a giant? Use big words... or just use maths.',
  'Why did the circle stop rolling? It ran out of degrees.',
  'What do you call a bunch of chess players bragging about their wins in a hotel lobby? Chess nuts boasting in an open foyer.',
  'Why did the student bring a ladder to school? To get to the higher level maths.',
  'What did the calculator say to the student? You can count on me.',
  'Why was the maths textbook depressed? It had too many problems.',
];

export function getJokeOfTheDay(date = new Date()) {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date - startOfYear) / 86400000);
  return JOKES[dayOfYear % JOKES.length];
}

// Roadmap #86: the refresh button on the home screen widget picks a fresh
// joke on demand rather than the deterministic day-of-year one above.
// Avoids repeating whatever joke is currently showing, where possible.
export function getRandomJoke(excludeText) {
  if (JOKES.length === 1) return JOKES[0];
  let choice;
  do {
    choice = JOKES[Math.floor(Math.random() * JOKES.length)];
  } while (choice === excludeText);
  return choice;
}
