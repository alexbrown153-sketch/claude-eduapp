// Hand-authored word/reasoning problem bank (SPEC.md §12): the maths in each
// template is verified once, then slots are randomised per draw for variety.
// getWordProblem() avoids repeating a template already used this session
// (usedIds) where a fresh one is still available.

import { barModelSvg } from './diagrams.js';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function round2(n) {
  return Math.round(n * 100) / 100;
}

// Roadmap #126: each name carries its pronoun, picked together, so a named
// child is "he" or "she" (as on 11+ papers) rather than "they". Every name
// is clearly a boy's or a girl's name: 6 of each.
const PEOPLE = [
  { name: 'Amir', he: 'he' }, { name: 'Priya', he: 'she' }, { name: 'Oscar', he: 'he' },
  { name: 'Jess', he: 'she' }, { name: 'Tom', he: 'he' }, { name: 'Mia', he: 'she' },
  { name: 'Leo', he: 'he' }, { name: 'Zara', he: 'she' }, { name: 'Ben', he: 'he' },
  { name: 'Grace', he: 'she' }, { name: 'Noah', he: 'he' }, { name: 'Freya', he: 'she' },
];
const NAMES = PEOPLE.map((p) => p.name);
// A person plus their pronoun, ready for a template: `He` starts a sentence.
function pickPerson() {
  const p = pick(PEOPLE);
  return { name: p.name, he: p.he, He: p.he.charAt(0).toUpperCase() + p.he.slice(1) };
}
const ITEMS = ['book', 'pencil case', 'football', 'puzzle', 'notebook', 'water bottle', 'board game', 'backpack'];

const TEMPLATES = {
  1: [
    {
      id: 'wp-t1-moneyleft', subtopic: 'money',
      generate() {
        const { name, he, He } = pickPerson();
        const a = randInt(10, 20);
        const b = randInt(2, a - 1);
        return {
          prompt: `${name} has £${a}. ${He} spends £${b}. How much money does ${he} have left?`,
          correctAnswer: a - b,
          explanation: `£${a} - £${b} = £${a - b}`,
        };
      },
    },
    {
      id: 'wp-t1-share', subtopic: 'division',
      generate() {
        const name = pick(NAMES);
        const n = pick([2, 3, 4, 5]);
        const each = randInt(2, 6);
        const a = n * each;
        return {
          prompt: `${name} has ${a} stickers and shares them equally between ${n} friends. How many stickers does each friend get?`,
          correctAnswer: each,
          explanation: `${a} ÷ ${n} = ${each}`,
        };
      },
    },
    {
      id: 'wp-t1-total', subtopic: 'addition',
      generate() {
        const name = pick(NAMES);
        const a = randInt(5, 40);
        const b = randInt(5, 40);
        return {
          prompt: `${name} scores ${a} points in one round and ${b} points in the next round. What is ${name}'s total score?`,
          correctAnswer: a + b,
          explanation: `${a} + ${b} = ${a + b}`,
        };
      },
    },
    {
      id: 'wp-t1-multiply', subtopic: 'money',
      generate() {
        const item = pick(ITEMS);
        const price = randInt(2, 9);
        const n = randInt(2, 6);
        return {
          prompt: `A ${item} costs £${price}. How much do ${n} of them cost?`,
          correctAnswer: price * n,
          explanation: `£${price} × ${n} = £${price * n}`,
        };
      },
    },
  ],
  2: [
    {
      id: 'wp-t2-change', subtopic: 'money',
      generate() {
        const { name, he, He } = pickPerson();
        const item = pick(ITEMS);
        const price = randInt(5, 18);
        const options = [20, 25, 30].filter((p) => p > price);
        const payment = options.length ? pick(options) : price + 5;
        return {
          prompt: `${name} buys a ${item} for £${price}. ${He} pays with a £${payment} note. How much change does ${he} get?`,
          correctAnswer: payment - price,
          explanation: `£${payment} - £${price} = £${payment - price}`,
        };
      },
    },
    {
      id: 'wp-t2-twoitems', subtopic: 'money',
      generate() {
        const [item1, item2] = [pick(ITEMS), pick(ITEMS)];
        const p1 = randInt(3, 15);
        const p2 = randInt(3, 15);
        return {
          prompt: `A ${item1} costs £${p1} and a ${item2} costs £${p2}. What is the total cost of one of each?`,
          correctAnswer: p1 + p2,
          explanation: `£${p1} + £${p2} = £${p1 + p2}`,
        };
      },
    },
    {
      id: 'wp-t2-time', subtopic: 'time',
      generate() {
        const { name, he } = pickPerson();
        const startHour = randInt(1, 10);
        const durationMin = pick([15, 20, 30, 40, 45]);
        const endMin = durationMin;
        return {
          prompt: `${name} starts reading at ${startHour}:00 and reads for ${durationMin} minutes. What time does ${he} finish (write as H:MM, e.g. "3:30")?`,
          answerType: 'text',
          correctAnswer: `${startHour}:${String(endMin).padStart(2, '0')}`,
          explanation: `${startHour}:00 + ${durationMin} minutes = ${startHour}:${String(endMin).padStart(2, '0')}`,
        };
      },
    },
    {
      id: 'wp-t2-divideremainder', subtopic: 'division',
      generate() {
        const name = pick(NAMES);
        const n = pick([2, 3, 4, 5, 6]);
        const each = randInt(3, 9);
        const a = n * each;
        return {
          prompt: `${name} has ${a} sweets shared equally among ${n} children. How many does each child get?`,
          correctAnswer: each,
          explanation: `${a} ÷ ${n} = ${each}`,
        };
      },
    },
    {
      id: 'wp-t2-average', subtopic: 'averages',
      generate() {
        const name = pick(NAMES);
        const a = randInt(4, 10) * 2;
        const b = a + pick([2, 4, 6]);
        return {
          prompt: `${name} scored ${a} and ${b} in two spelling tests. What is the average of the two scores?`,
          correctAnswer: (a + b) / 2,
          explanation: `(${a} + ${b}) ÷ 2 = ${(a + b) / 2}`,
        };
      },
    },
  ],
  3: [
    {
      id: 'wp-t3-discount', subtopic: 'money',
      generate() {
        const { name, he } = pickPerson();
        const item = pick(ITEMS);
        const price = pick([20, 30, 40, 50]);
        const discount = pick([5, 10, 15]);
        return {
          prompt: `${name} buys a ${item} priced at £${price}, using a £${discount} off voucher. How much does ${he} pay?`,
          correctAnswer: price - discount,
          explanation: `£${price} - £${discount} = £${price - discount}`,
        };
      },
    },
    {
      id: 'wp-t3-speed', subtopic: 'speed-distance-time',
      generate() {
        const speed = pick([20, 30, 40, 50, 60]);
        const time = randInt(2, 5);
        return {
          prompt: `A car travels at a steady ${speed} miles per hour for ${time} hours. How far does it travel (in miles)?`,
          correctAnswer: speed * time,
          explanation: `Distance = speed × time = ${speed} × ${time} = ${speed * time} miles`,
        };
      },
    },
    {
      id: 'wp-t3-timecrossing', subtopic: 'time',
      generate() {
        const name = pick(NAMES);
        const startHour = randInt(9, 11);
        const durationMin = pick([45, 50, 55, 70, 80]);
        const endHour = startHour + Math.floor(durationMin / 60);
        const endMin = durationMin % 60;
        return {
          prompt: `${name}'s train journey starts at ${startHour}:00 and lasts ${durationMin} minutes. What time does it arrive (write as H:MM)?`,
          answerType: 'text',
          correctAnswer: `${endHour}:${String(endMin).padStart(2, '0')}`,
          explanation: `${durationMin} minutes = ${Math.floor(durationMin / 60)}h ${durationMin % 60}m. ${startHour}:00 + that = ${endHour}:${String(endMin).padStart(2, '0')}`,
        };
      },
    },
    {
      id: 'wp-t3-multistepmoney', subtopic: 'money',
      generate() {
        const { name, he } = pickPerson();
        const item = pick(ITEMS);
        const price = randInt(4, 12);
        const n = randInt(2, 5);
        const payment = pick([50, 40, 30].filter((p) => p > price * n)) || price * n + 10;
        const total = price * n;
        return {
          prompt: `${name} buys ${n} ${item}s at £${price} each and pays with £${payment}. How much change does ${he} get?`,
          correctAnswer: payment - total,
          explanation: `${n} × £${price} = £${total}. £${payment} - £${total} = £${payment - total}`,
        };
      },
    },
    {
      id: 'wp-t3-ratio', subtopic: 'ratio',
      generate() {
        const name = pick(NAMES);
        const parts = pick([[2, 3], [1, 4], [3, 5], [1, 2]]);
        const unit = randInt(3, 8);
        const total = (parts[0] + parts[1]) * unit;
        return {
          prompt: `${name} shares £${total} between two friends in the ratio ${parts[0]}:${parts[1]}. How much does the first friend get?`,
          correctAnswer: parts[0] * unit,
          explanationSvg: barModelSvg({ // Roadmap #122
            rows: [{ label: 'Friend 1', parts: parts[0] }, { label: 'Friend 2', parts: parts[1] }],
            perPart: unit,
            highlight: 0,
            money: true,
          }),
          explanation: `${parts[0]} + ${parts[1]} = ${parts[0] + parts[1]} parts. £${total} ÷ ${parts[0] + parts[1]} = £${unit} per part. First friend: ${parts[0]} × £${unit} = £${parts[0] * unit}`,
        };
      },
    },
  ],
  4: [
    {
      id: 'wp-t4-percentdiscount', subtopic: 'money',
      generate() {
        const { name, he } = pickPerson();
        const item = pick(ITEMS);
        const price = pick([40, 50, 60, 80, 120]);
        const percent = pick([10, 20, 25]);
        const discount = (percent / 100) * price;
        return {
          prompt: `${name} buys a ${item} priced at £${price} in a ${percent}% off sale. How much does ${he} pay?`,
          correctAnswer: price - discount,
          explanation: `${percent}% of £${price} = £${discount}. £${price} - £${discount} = £${price - discount}`,
        };
      },
    },
    {
      id: 'wp-t4-speedfortime', subtopic: 'speed-distance-time',
      generate() {
        const distance = pick([90, 120, 150, 180, 240]);
        const time = pick([2, 3, 4]);
        return {
          prompt: `A cyclist travels ${distance} miles in ${time} hours at a steady speed. What is the cyclist's speed in miles per hour?`,
          correctAnswer: distance / time,
          explanation: `Speed = distance ÷ time = ${distance} ÷ ${time} = ${distance / time} mph`,
        };
      },
    },
    {
      id: 'wp-t4-ratiothreeway', subtopic: 'ratio',
      generate() {
        const name = pick(NAMES);
        const parts = pick([[1, 2, 3], [2, 3, 5], [1, 1, 2], [3, 4, 5]]);
        const unit = randInt(2, 6);
        const total = (parts[0] + parts[1] + parts[2]) * unit;
        return {
          prompt: `${name} shares £${total} between three people in the ratio ${parts[0]}:${parts[1]}:${parts[2]}. How much does the largest share receive?`,
          correctAnswer: Math.max(...parts) * unit,
          // Roadmap #122. Every ratio here has one largest part, so exactly
          // one row is highlighted.
          explanationSvg: barModelSvg({
            rows: parts.map((n, i) => ({ label: `Person ${i + 1}`, parts: n })),
            perPart: unit,
            highlight: parts.indexOf(Math.max(...parts)),
            money: true,
          }),
          explanation: `${parts[0]}+${parts[1]}+${parts[2]} = ${parts[0] + parts[1] + parts[2]} parts. £${total} ÷ ${parts[0] + parts[1] + parts[2]} = £${unit} per part. Largest share: ${Math.max(...parts)} × £${unit} = £${Math.max(...parts) * unit}`,
        };
      },
    },
    {
      id: 'wp-t4-workbackward', subtopic: 'reasoning',
      generate() {
        const name = pick(NAMES);
        const final = randInt(10, 30);
        const added = randInt(5, 15);
        const start = final * 2 - added;
        return {
          prompt: `${name} thinks of a number, doubles it, then subtracts ${added}, and gets ${final * 2 - added}. What number did ${name} start with?`,
          correctAnswer: final,
          explanation: `Work backwards: ${final * 2 - added} + ${added} = ${final * 2}. ${final * 2} ÷ 2 = ${final}`,
        };
      },
    },
    {
      id: 'wp-t4-timespeed', subtopic: 'speed-distance-time',
      generate() {
        const speed = pick([40, 50, 60, 80]);
        const distance = speed * pick([2, 3, 4]);
        return {
          prompt: `A train travels ${distance} miles at a steady ${speed} miles per hour. How many hours does the journey take?`,
          correctAnswer: distance / speed,
          explanation: `Time = distance ÷ speed = ${distance} ÷ ${speed} = ${distance / speed} hours`,
        };
      },
    },
  ],
  5: [
    {
      id: 'wp-t5-profitloss', subtopic: 'reasoning',
      generate() {
        const { name, he } = pickPerson();
        const cost = pick([40, 60, 80, 100]);
        const markupPercent = pick([20, 25, 50]);
        const sellPrice = cost * (1 + markupPercent / 100);
        const discountPercent = pick([10, 20]);
        const finalPrice = round2(sellPrice * (1 - discountPercent / 100));
        return {
          prompt: `${name} buys an item for £${cost} and marks it up by ${markupPercent}% to sell. Later ${he} discounts that sale price by ${discountPercent}%. What is the final selling price?`,
          correctAnswer: finalPrice,
          explanation: `Marked up: £${cost} × ${1 + markupPercent / 100} = £${round2(sellPrice)}. Discounted: × ${1 - discountPercent / 100} = £${finalPrice}`,
        };
      },
    },
    {
      id: 'wp-t5-multilegjourney', subtopic: 'speed-distance-time',
      generate() {
        const speed1 = pick([30, 40, 50]);
        const time1 = pick([1, 2]);
        const speed2 = pick([40, 50, 60]);
        const time2 = pick([1, 2, 3]);
        const totalDistance = speed1 * time1 + speed2 * time2;
        const totalTime = time1 + time2;
        return {
          prompt: `A journey has two legs: ${time1} hour(s) at ${speed1}mph, then ${time2} hour(s) at ${speed2}mph. What is the average speed for the whole journey (in mph)?`,
          correctAnswer: round2(totalDistance / totalTime),
          explanation: `Total distance = ${speed1}×${time1} + ${speed2}×${time2} = ${totalDistance} miles. Total time = ${totalTime} hours. Average speed = ${totalDistance} ÷ ${totalTime} = ${round2(totalDistance / totalTime)}mph`,
        };
      },
    },
    {
      id: 'wp-t5-ratioremainder', subtopic: 'ratio',
      generate() {
        const { name, He } = pickPerson();
        const parts = pick([[2, 3], [3, 4], [1, 4]]);
        const unit = randInt(4, 9);
        const total = (parts[0] + parts[1]) * unit + pick([1, 2, 3]);
        const remainder = total - (parts[0] + parts[1]) * unit;
        return {
          // Whole pounds only: without that, £23 in the ratio 2:3 shares
          // exactly as £9.20 and £13.80 and nothing is left over. Every
          // ratio here is in simplest form, so whole pounds in each jar means
          // a whole number of pounds per part.
          prompt: `${name} has £${total}. ${He} shares as much of it as possible between two savings jars in the ratio ${parts[0]}:${parts[1]}, putting a whole number of pounds in each jar. The rest is spending money. How much spending money is left over?`,
          correctAnswer: remainder,
          explanation: `${parts[0]}+${parts[1]} = ${parts[0] + parts[1]} parts fits into £${total} up to £${(parts[0] + parts[1]) * unit} (£${unit} per part). Left over: £${total} - £${(parts[0] + parts[1]) * unit} = £${remainder}`,
        };
      },
    },
    {
      id: 'wp-t5-workbackwardmultistep', subtopic: 'reasoning',
      generate() {
        const name = pick(NAMES);
        const result = randInt(8, 20);
        const afterHalve = result;
        const beforeHalve = afterHalve * 2;
        const added = randInt(3, 9);
        const start = beforeHalve - added;
        return {
          prompt: `${name} thinks of a number, adds ${added}, then halves the result, getting ${afterHalve}. What number did ${name} start with?`,
          correctAnswer: start,
          explanation: `Work backwards: ${afterHalve} × 2 = ${beforeHalve}. ${beforeHalve} - ${added} = ${start}`,
        };
      },
    },
  ],
};

export function getWordProblem(tier, usedIds = new Set()) {
  const pool = TEMPLATES[tier] || TEMPLATES[3];
  let available = pool.filter((t) => !usedIds.has(t.id));
  if (available.length === 0) available = pool;
  return fromTemplate(pick(available), tier);
}

// Roadmap #128: a new version of the same word problem — the same template
// (so the same scenario and method) with new numbers, never with the same
// prompt as `notPrompt`. Answers saved before the template id was logged
// fall back to any template of that subtopic and tier. Null if nothing
// different comes up in a fixed number of tries (a narrow template).
const VERSION_ATTEMPTS = 40;
export function getWordProblemVersion({ templateId, tier, subtopic, notPrompt }) {
  const pool = TEMPLATES[tier] || [];
  const candidates = templateId
    ? pool.filter((t) => t.id === templateId)
    : pool.filter((t) => t.subtopic === subtopic);
  if (candidates.length === 0) return null;
  for (let i = 0; i < VERSION_ATTEMPTS; i += 1) {
    const q = fromTemplate(pick(candidates), tier);
    if (q.prompt !== notPrompt) return q;
  }
  return null;
}

function fromTemplate(template, tier) {
  const q = template.generate();
  return {
    topic: 'wordProblems',
    subtopic: template.subtopic,
    difficulty: tier,
    source: 'authored',
    id: template.id,
    prompt: q.prompt,
    answerType: q.answerType || 'numeric',
    correctAnswer: String(q.correctAnswer),
    choices: q.choices || null,
    explanation: q.explanation,
    ...(q.explanationSvg ? { explanationSvg: q.explanationSvg } : {}),
  };
}
