// Coordinates topic (11+ "position and direction"): reading points off a
// grid, finding the missing vertex of a shape, midpoints, naming quadrants,
// and translations. Tiered 1-5 like every other generator in
// questionBank.js, which dispatches to genCoordinates() below.
//
// Two things are different about this topic and shape the code here:
//
//  1. Nearly every question needs a picture. gridSvg() builds an inline SVG
//     grid that ships with the question as `diagramSvg` (the same idea as
//     the `diagramImage` data URL an imported question can carry, but drawn
//     here rather than captured from a PDF). ui.js renders it verbatim; the
//     colours come from the app's CSS variables so it follows the themes.
//  2. Answers are coordinate pairs, which the numeric keypad can't type
//     (no minus key, no comma). So pair answers are multiple choice - which
//     is also how 11+ papers usually ask them - and only genuinely
//     non-negative single numbers use the keypad.

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function range(from, to) {
  const out = [];
  for (let i = from; i <= to; i += 1) out.push(i);
  return out;
}

// The one written form of a coordinate pair used everywhere: prompts,
// choices, correct answers and explanations. MCQ answers are compared as
// exact strings (session.js checkAnswer), so this must stay consistent.
function fmt(p) {
  return `(${p.x}, ${p.y})`;
}

function samePoint(a, b) {
  return a.x === b.x && a.y === b.y;
}

// "4 right and 3 down" - used in prompts and explanations so the wording a
// child reads in the question matches the wording of the worked answer.
function moveWords(dx, dy, unit = '') {
  const leg = (d, positive, negative) => {
    const n = Math.abs(d);
    const units = unit ? ` ${unit}${n === 1 ? '' : 's'}` : '';
    return `${n}${units} ${d > 0 ? positive : negative}`;
  };
  const parts = [];
  if (dx !== 0) parts.push(leg(dx, 'right', 'left'));
  if (dy !== 0) parts.push(leg(dy, 'up', 'down'));
  if (parts.length === 0) return 'back to where it started';
  return parts.join(' and ');
}
function moveSquares(dx, dy) {
  return moveWords(dx, dy, 'square');
}

// Four choices, correct one included, no duplicates. `candidates` are the
// plausible wrong answers worth offering (a swapped pair, a sign slip, the
// inverse translation); `filler` supplies more if too many of those
// collided with each other or with the correct answer.
function buildChoices(correct, candidates, filler) {
  const out = [correct];
  candidates.forEach((c) => {
    if (out.length < 4 && !out.includes(c)) out.push(c);
  });
  let n = 1;
  while (out.length < 4 && n < 20) {
    const c = filler(n);
    if (!out.includes(c)) out.push(c);
    n += 1;
  }
  return shuffle(out);
}

function pointChoices(correct, candidates) {
  return buildChoices(
    fmt(correct),
    candidates.map(fmt),
    (n) => fmt({ x: correct.x + n, y: correct.y - n }),
  );
}

// Distinct random points from the whole grid area - no retry loop, so it
// can't ever come back short.
function samplePoints(n, xs, ys) {
  const all = [];
  xs.forEach((x) => ys.forEach((y) => all.push({ x, y })));
  return shuffle(all).slice(0, n);
}

// Places a shape - given as offsets from its own first point - somewhere on
// the grid such that every one of its points lands inside [min, max]. Used
// for rectangles, parallelograms and multi-step translations so a generator
// never has to reject-and-retry its way to a shape that fits.
function placeShape(offsets, min, max) {
  const xs = offsets.map((o) => o.x);
  const ys = offsets.map((o) => o.y);
  const bx = randInt(min - Math.min(...xs), max - Math.max(...xs));
  const by = randInt(min - Math.min(...ys), max - Math.max(...ys));
  return offsets.map((o) => ({ x: bx + o.x, y: by + o.y }));
}

// ---------- The grid picture ----------

const CELL = 26; // viewBox units per grid square
const PAD = 20; // room round the edge for the axis numbers

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Draws a square grid from `min` to `max` on both axes, with optional
// plotted points ({x, y, label}), line segments ({from, to, dashed}) and
// quadrant labels. Returns SVG markup; every colour and font size comes
// from styles.css (.coord-grid) rather than being baked in here.
function gridSvg({ min, max, points = [], segments = [], quadrants = false, description = '' }) {
  const sx = (x) => PAD + (x - min) * CELL;
  const sy = (y) => PAD + (max - y) * CELL;
  const size = (max - min) * CELL;
  const w = size + PAD * 2;
  const h = size + PAD * 2;
  // A grid that straddles zero has its axes through the middle; a
  // first-quadrant grid has them along its left and bottom edges.
  const axis = min <= 0 && max >= 0 ? 0 : min;
  const parts = [];

  for (let i = min; i <= max; i += 1) {
    parts.push(`<line class="cg-grid" x1="${sx(i)}" y1="${sy(max)}" x2="${sx(i)}" y2="${sy(min)}" />`);
    parts.push(`<line class="cg-grid" x1="${sx(min)}" y1="${sy(i)}" x2="${sx(max)}" y2="${sy(i)}" />`);
  }

  if (quadrants) {
    // Numbered anticlockwise from the top right, as they're taught.
    const right = sx(max / 2);
    const left = sx(min / 2);
    const top = sy(max / 2);
    const bottom = sy(min / 2);
    parts.push(`<text class="cg-quadrant" x="${right}" y="${top}">1st</text>`);
    parts.push(`<text class="cg-quadrant" x="${left}" y="${top}">2nd</text>`);
    parts.push(`<text class="cg-quadrant" x="${left}" y="${bottom}">3rd</text>`);
    parts.push(`<text class="cg-quadrant" x="${right}" y="${bottom}">4th</text>`);
  }

  parts.push(`<line class="cg-axis" x1="${sx(min)}" y1="${sy(axis)}" x2="${sx(max)}" y2="${sy(axis)}" />`);
  parts.push(`<line class="cg-axis" x1="${sx(axis)}" y1="${sy(min)}" x2="${sx(axis)}" y2="${sy(max)}" />`);

  for (let i = min; i <= max; i += 1) {
    if (i === 0) continue; // the single "0" below sits at the origin instead
    parts.push(`<text class="cg-tick" x="${sx(i)}" y="${sy(axis) + 13}" text-anchor="middle">${i}</text>`);
    parts.push(`<text class="cg-tick" x="${sx(axis) - 6}" y="${sy(i) + 4}" text-anchor="end">${i}</text>`);
  }
  parts.push(`<text class="cg-tick" x="${sx(axis) - 6}" y="${sy(axis) + 13}" text-anchor="end">0</text>`);
  parts.push(`<text class="cg-axis-name" x="${w - 4}" y="${sy(axis) - 7}" text-anchor="end">x</text>`);
  parts.push(`<text class="cg-axis-name" x="${sx(axis) + 7}" y="12">y</text>`);

  segments.forEach((s) => {
    const cls = s.dashed ? 'cg-segment cg-dashed' : 'cg-segment';
    parts.push(`<line class="${cls}" x1="${sx(s.from.x)}" y1="${sy(s.from.y)}" x2="${sx(s.to.x)}" y2="${sy(s.to.y)}" />`);
  });

  points.forEach((p) => {
    parts.push(`<circle class="cg-point" cx="${sx(p.x)}" cy="${sy(p.y)}" r="4" />`);
    if (!p.label) return;
    // Labels sit up and to the right of their point, flipping inwards at
    // the top and right edges so they can't fall outside the picture.
    const toLeft = p.x >= max;
    const below = p.y >= max;
    const lx = sx(p.x) + (toLeft ? -7 : 7);
    const ly = sy(p.y) + (below ? 16 : -8);
    parts.push(`<text class="cg-point-label" x="${lx}" y="${ly}" text-anchor="${toLeft ? 'end' : 'start'}">${esc(p.label)}</text>`);
  });

  return `<svg class="coord-grid" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(description)}">${parts.join('')}</svg>`;
}

function describePoints(points) {
  return points.map((p) => `${p.label ? `${p.label} at ` : ''}${fmt(p)}`).join(', ');
}
function gridDescription(min, max, points) {
  const grid = `Coordinate grid from ${min} to ${max} on both axes`;
  return points.length ? `${grid}, showing ${describePoints(points)}.` : `${grid}.`;
}

function make(subtopic, tier, fields) {
  return {
    topic: 'coordinates', subtopic, difficulty: tier, source: 'generated',
    choices: null, ...fields,
  };
}

// ---------- Tier 1: reading points in the first quadrant ----------

function coordT1() {
  const min = 0;
  const max = 6;
  const letters = ['A', 'B', 'C', 'D'];
  const plotted = samplePoints(4, range(1, max), range(1, max))
    .map((p, i) => ({ ...p, label: letters[i] }));
  const diagram = gridSvg({ min, max, points: plotted, description: gridDescription(min, max, plotted) });

  if (Math.random() < 0.5) {
    // Prefer a point off the diagonal so that "read it the wrong way round"
    // is a real, distinguishable wrong answer.
    const target = plotted.find((p) => p.x !== p.y) || plotted[0];
    const others = plotted.filter((p) => !samePoint(p, target));
    const choices = pointChoices(target, [{ x: target.y, y: target.x }, ...others]);
    return make('reading-points', 1, {
      prompt: `What are the coordinates of point ${target.label}?`,
      answerType: 'mcq', correctAnswer: fmt(target), choices, diagramSvg: diagram,
      explanation: `Read across first, then up. ${target.label} is ${target.x} across and ${target.y} up, so it is at ${fmt(target)}. (x comes before y — "along the corridor, then up the stairs".)`,
    });
  }

  const target = pick(plotted);
  return make('reading-points', 1, {
    prompt: `Which point is at ${fmt(target)}?`,
    answerType: 'mcq', correctAnswer: target.label, choices: shuffle(plotted.map((p) => p.label)),
    diagramSvg: diagram,
    explanation: `Go ${target.x} along the x-axis, then ${target.y} up. That lands on point ${target.label}.`,
  });
}

// ---------- Tier 2: midpoints and missing vertices, first quadrant ----------

function coordT2() {
  const min = 0;
  const max = 8;
  const variant = pick(['midpoint', 'vertex', 'length']);

  if (variant === 'midpoint' || variant === 'length') {
    // A horizontal or vertical segment of even length, so the midpoint
    // lands on a grid point.
    const horizontal = Math.random() < 0.5;
    const fixed = randInt(1, max - 1);
    const start = randInt(0, max - 4);
    const half = randInt(1, Math.floor((max - start) / 2));
    const end = start + half * 2;
    const a = { ...(horizontal ? { x: start, y: fixed } : { x: fixed, y: start }), label: 'A' };
    const b = { ...(horizontal ? { x: end, y: fixed } : { x: fixed, y: end }), label: 'B' };
    const diagram = gridSvg({
      min, max, points: [a, b], segments: [{ from: a, to: b }],
      description: gridDescription(min, max, [a, b]),
    });

    if (variant === 'length') {
      return make('length', 2, {
        prompt: `How many units long is the line from A ${fmt(a)} to B ${fmt(b)}?`,
        answerType: 'numeric', correctAnswer: String(half * 2), diagramSvg: diagram,
        explanation: horizontal
          ? `A and B are both at y = ${fixed}, so count along: ${end} - ${start} = ${half * 2} units.`
          : `A and B are both at x = ${fixed}, so count up: ${end} - ${start} = ${half * 2} units.`,
      });
    }

    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const along = horizontal ? { x: mid.x + 1, y: mid.y } : { x: mid.x, y: mid.y + 1 };
    const back = horizontal ? { x: mid.x - 1, y: mid.y } : { x: mid.x, y: mid.y - 1 };
    const choices = pointChoices(mid, [along, back, { x: mid.y, y: mid.x }]);
    return make('midpoint', 2, {
      prompt: `A is at ${fmt(a)} and B is at ${fmt(b)}. What are the coordinates of the midpoint of the line AB?`,
      answerType: 'mcq', correctAnswer: fmt(mid), choices, diagramSvg: diagram,
      explanation: `The midpoint is halfway along, so average each coordinate: x = (${a.x} + ${b.x}) ÷ 2 = ${mid.x}, y = (${a.y} + ${b.y}) ÷ 2 = ${mid.y}. Midpoint = ${fmt(mid)}.`,
    });
  }

  // Missing corner of a rectangle with sides parallel to the axes.
  const wide = randInt(2, 5);
  const tall = randInt(2, 5);
  const corners = placeShape(
    [{ x: 0, y: 0 }, { x: wide, y: 0 }, { x: wide, y: tall }, { x: 0, y: tall }],
    min, max,
  );
  return missingVertexQuestion(corners, 2, min, max, 'rectangle');
}

// Shared by the rectangle (tiers 2 and 4) and parallelogram (tier 5)
// missing-vertex questions. `corners` must be the four vertices in order
// round the shape; a random three of them (still in order) are shown as A,
// B and C and the fourth is the answer, D.
//
// D = A + C - B for any parallelogram, rectangles included: the diagonals
// bisect each other, so A + C = B + D.
function missingVertexQuestion(corners, tier, min, max, shapeName) {
  const r = randInt(0, 3);
  const a = { ...corners[r], label: 'A' };
  const b = { ...corners[(r + 1) % 4], label: 'B' };
  const c = { ...corners[(r + 2) % 4], label: 'C' };
  const d = { x: a.x + c.x - b.x, y: a.y + c.y - b.y };
  const shown = [a, b, c];
  const dx = a.x - b.x;
  const dy = a.y - b.y;

  const candidates = [
    { x: d.y, y: d.x },
    { x: b.x + c.x - a.x, y: b.y + c.y - a.y }, // wrong corner paired up
    { x: d.x + 1, y: d.y },
  ].filter((p) => !shown.some((s) => samePoint(s, p)));

  return make('missing-vertex', tier, {
    prompt: `Three corners of a ${shapeName} are A ${fmt(a)}, B ${fmt(b)} and C ${fmt(c)}. What are the coordinates of the fourth corner, D?`,
    answerType: 'mcq', correctAnswer: fmt(d), choices: pointChoices(d, candidates),
    diagramSvg: gridSvg({
      min, max, points: shown, segments: [{ from: a, to: b }, { from: b, to: c }],
      description: gridDescription(min, max, shown),
    }),
    explanation: `Opposite sides of a ${shapeName} are equal and parallel. B ${fmt(b)} to A ${fmt(a)} is ${moveWords(dx, dy)}, so C ${fmt(c)} to D is the same move: ${fmt(d)}.`,
  });
}

// ---------- Tier 3: quadrants and single translations ----------

const QUADRANT_CHOICES = ['1st quadrant', '2nd quadrant', '3rd quadrant', '4th quadrant'];

// 1st is top right, then anticlockwise.
function quadrantOf(p) {
  if (p.x > 0 && p.y > 0) return 1;
  if (p.x < 0 && p.y > 0) return 2;
  if (p.x < 0 && p.y < 0) return 3;
  return 4;
}
function quadrantWhy(p) {
  const side = p.x > 0 ? 'right of the y-axis' : 'left of the y-axis';
  const level = p.y > 0 ? 'above the x-axis' : 'below the x-axis';
  return `x is ${p.x > 0 ? 'positive' : 'negative'} so it is ${side}, and y is ${p.y > 0 ? 'positive' : 'negative'} so it is ${level}`;
}

function quadrantGrid(min, max, points = []) {
  return gridSvg({
    min, max, points, quadrants: true,
    description: `Coordinate grid from ${min} to ${max} on both axes with the four quadrants labelled 1st to 4th, anticlockwise from the top right.`,
  });
}

function coordT3() {
  const min = -5;
  const max = 5;
  const variant = pick(['quadrant', 'quadrant-find', 'translate']);

  if (variant === 'quadrant') {
    const p = { x: pick([-1, 1]) * randInt(1, max), y: pick([-1, 1]) * randInt(1, max) };
    const q = quadrantOf(p);
    return make('quadrants', 3, {
      prompt: `In which quadrant does the point ${fmt(p)} lie?`,
      answerType: 'mcq', correctAnswer: QUADRANT_CHOICES[q - 1], choices: [...QUADRANT_CHOICES],
      diagramSvg: quadrantGrid(min, max),
      explanation: `For ${fmt(p)}, ${quadrantWhy(p)} — that corner of the grid is the ${QUADRANT_CHOICES[q - 1]}. The quadrants are numbered anticlockwise from the top right.`,
    });
  }

  if (variant === 'quadrant-find') {
    // One point in each quadrant; the child picks the one asked for.
    const target = randInt(1, 4);
    const signs = { 1: [1, 1], 2: [-1, 1], 3: [-1, -1], 4: [1, -1] };
    const points = [1, 2, 3, 4].map((q) => ({
      x: signs[q][0] * randInt(1, max),
      y: signs[q][1] * randInt(1, max),
    }));
    const answer = points[target - 1];
    return make('quadrants', 3, {
      prompt: `Which of these points lies in the ${QUADRANT_CHOICES[target - 1]}?`,
      answerType: 'mcq', correctAnswer: fmt(answer), choices: shuffle(points.map(fmt)),
      diagramSvg: quadrantGrid(min, max),
      explanation: `The ${QUADRANT_CHOICES[target - 1]} needs x ${signs[target][0] > 0 ? 'positive' : 'negative'} and y ${signs[target][1] > 0 ? 'positive' : 'negative'}, which is ${fmt(answer)}.`,
    });
  }

  // Translate one point, given in words.
  const p = { x: randInt(min + 1, max - 1), y: randInt(min + 1, max - 1), label: 'P' };
  const dx = pickShift(p.x, min, max);
  const dy = pickShift(p.y, min, max);
  const image = { x: p.x + dx, y: p.y + dy };
  return make('translation', 3, {
    prompt: `Point P is at ${fmt(p)}. It is translated ${moveSquares(dx, dy)}. What are the coordinates of P after the translation?`,
    answerType: 'mcq', correctAnswer: fmt(image),
    choices: pointChoices(image, [
      { x: p.x - dx, y: p.y - dy }, // translated the wrong way
      { x: p.x + dy, y: p.y + dx }, // x and y moves swapped
      { x: image.x, y: p.y },
    ]),
    diagramSvg: gridSvg({ min, max, points: [p], description: gridDescription(min, max, [p]) }),
    explanation: `Right and left change x; up and down change y. x: ${p.x} ${dx >= 0 ? '+' : '-'} ${Math.abs(dx)} = ${image.x}, y: ${p.y} ${dy >= 0 ? '+' : '-'} ${Math.abs(dy)} = ${image.y}. So P lands on ${fmt(image)}.`,
  });
}

// A non-zero shift that keeps a coordinate on the grid, preferring a move
// of at least 2 so the translation is worth doing.
function pickShift(value, min, max) {
  const all = range(min - value, max - value).filter((d) => d !== 0);
  const chunky = all.filter((d) => Math.abs(d) >= 2);
  return pick(chunky.length ? chunky : all);
}

// ---------- Tier 4: negatives across all four quadrants ----------

function coordT4() {
  const min = -6;
  const max = 6;
  const variant = pick(['midpoint', 'vertex', 'describe']);

  if (variant === 'midpoint') {
    // Both steps even, so the midpoint is a whole-number point.
    let step = { x: randInt(-3, 3) * 2, y: randInt(-3, 3) * 2 };
    if (step.x === 0 && step.y === 0) step = { x: 4, y: -2 };
    const [rawA, rawB] = placeShape([{ x: 0, y: 0 }, step], min, max);
    const a = { ...rawA, label: 'A' };
    const b = { ...rawB, label: 'B' };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return make('midpoint', 4, {
      prompt: `A is at ${fmt(a)} and B is at ${fmt(b)}. What are the coordinates of the midpoint of AB?`,
      answerType: 'mcq', correctAnswer: fmt(mid),
      choices: pointChoices(mid, [
        { x: a.x + b.x, y: a.y + b.y }, // forgot to halve
        { x: mid.y, y: mid.x },
        { x: (b.x - a.x) / 2, y: (b.y - a.y) / 2 }, // subtracted instead of added
      ]),
      diagramSvg: gridSvg({
        min, max, points: [a, b], segments: [{ from: a, to: b }],
        description: gridDescription(min, max, [a, b]),
      }),
      explanation: `Average each coordinate: x = (${a.x} + ${b.x}) ÷ 2 = ${mid.x}, y = (${a.y} + ${b.y}) ÷ 2 = ${mid.y}. Midpoint = ${fmt(mid)}.`,
    });
  }

  if (variant === 'vertex') {
    const wide = randInt(2, 5);
    const tall = randInt(2, 5);
    const corners = placeShape(
      [{ x: 0, y: 0 }, { x: wide, y: 0 }, { x: wide, y: tall }, { x: 0, y: tall }],
      min, max,
    );
    return missingVertexQuestion(corners, 4, min, max, 'rectangle');
  }

  // Given a point and its image, describe the translation.
  const p = { x: randInt(min + 1, max - 1), y: randInt(min + 1, max - 1), label: 'A' };
  const dx = pickShift(p.x, min, max);
  const dy = pickShift(p.y, min, max);
  const image = { x: p.x + dx, y: p.y + dy, label: "A'" };
  const correct = moveSquares(dx, dy);
  return make('translation', 4, {
    prompt: `A is at ${fmt(p)} and is translated to A' at ${fmt(image)}. Which translation moves A onto A'?`,
    answerType: 'mcq', correctAnswer: correct,
    choices: buildChoices(
      correct,
      [moveSquares(-dx, -dy), moveSquares(dy, dx), moveSquares(dx, -dy), moveSquares(-dx, dy)],
      (n) => moveSquares(dx + n, dy),
    ),
    diagramSvg: gridSvg({
      min, max, points: [p, image], segments: [{ from: p, to: image, dashed: true }],
      description: gridDescription(min, max, [p, image]),
    }),
    explanation: `Compare the coordinates: x goes ${p.x} → ${image.x}, a change of ${dx > 0 ? '+' : ''}${dx}; y goes ${p.y} → ${image.y}, a change of ${dy > 0 ? '+' : ''}${dy}. That is ${correct}.`,
  });
}

// ---------- Tier 5: working backwards and multi-step ----------

// All the non-zero offsets a parallelogram side can use, small enough that
// the finished shape always fits on the grid.
const SIDE_VECTORS = [];
range(-3, 3).forEach((x) => range(-3, 3).forEach((y) => {
  if (x !== 0 || y !== 0) SIDE_VECTORS.push({ x, y });
}));

function coordT5() {
  const min = -6;
  const max = 6;
  const variant = pick(['endpoint', 'parallelogram', 'two-step']);

  if (variant === 'endpoint') {
    // A -> M is the same step as M -> B, so B = A + 2 × (M - A).
    let step = { x: randInt(-3, 3), y: randInt(-3, 3) };
    if (step.x === 0 && step.y === 0) step = { x: 2, y: -3 };
    const [rawA, rawM, rawB] = placeShape(
      [{ x: 0, y: 0 }, step, { x: step.x * 2, y: step.y * 2 }], min, max,
    );
    const a = { ...rawA, label: 'A' };
    const m = { ...rawM, label: 'M' };
    return make('midpoint', 5, {
      prompt: `M ${fmt(m)} is the midpoint of the line AB, and A is at ${fmt(a)}. What are the coordinates of B?`,
      answerType: 'mcq', correctAnswer: fmt(rawB),
      choices: pointChoices(rawB, [
        { x: a.x - step.x, y: a.y - step.y }, // stepped the wrong way from A
        { x: m.x + a.x, y: m.y + a.y }, // added instead of stepping on
        { x: rawB.y, y: rawB.x },
      ]),
      diagramSvg: gridSvg({
        min, max, points: [a, m], segments: [{ from: a, to: m }],
        description: gridDescription(min, max, [a, m]),
      }),
      explanation: `A to M is ${moveWords(step.x, step.y)}. M is halfway, so take that same step again from M: x = ${m.x} ${step.x >= 0 ? '+' : '-'} ${Math.abs(step.x)} = ${rawB.x}, y = ${m.y} ${step.y >= 0 ? '+' : '-'} ${Math.abs(step.y)} = ${rawB.y}. B is ${fmt(rawB)}.`,
    });
  }

  if (variant === 'parallelogram') {
    const u = pick(SIDE_VECTORS);
    // Not parallel to u, or the four points would sit in a straight line.
    const v = pick(SIDE_VECTORS.filter((w) => u.x * w.y - u.y * w.x !== 0));
    // Offsets from B: B, A, C, D — kept in order round the shape (A, B, C, D).
    const [b, a, c, d] = placeShape(
      [{ x: 0, y: 0 }, u, v, { x: u.x + v.x, y: u.y + v.y }], min, max,
    );
    return missingVertexQuestion([a, b, c, d], 5, min, max, 'parallelogram');
  }

  // Two translations one after the other. Neither move, nor the two
  // combined, may come to nothing - "translated nowhere" is a silly
  // question, not a hard one.
  const first = { x: randInt(-4, 4), y: randInt(-4, 4) };
  const second = { x: randInt(-4, 4), y: randInt(-4, 4) };
  if (first.x === 0 && first.y === 0) first.x = -3;
  if (second.x === 0 && second.y === 0) second.y = 4;
  if (first.x + second.x === 0 && first.y + second.y === 0) second.x += second.x >= 0 ? 1 : -1;
  const total = { x: first.x + second.x, y: first.y + second.y };
  const [rawP, , rawEnd] = placeShape(
    [{ x: 0, y: 0 }, first, total], min, max,
  );
  const p = { ...rawP, label: 'P' };
  const diagram = gridSvg({ min, max, points: [p], description: gridDescription(min, max, [p]) });
  const steps = `It is translated ${moveSquares(first.x, first.y)}, and then ${moveSquares(second.x, second.y)}`;

  // Asking for the quadrant only works if the finished point isn't sitting
  // on an axis, where it belongs to no quadrant at all.
  if (Math.random() < 0.4 && rawEnd.x !== 0 && rawEnd.y !== 0) {
    const q = quadrantOf(rawEnd);
    return make('translation', 5, {
      prompt: `Point P is at ${fmt(p)}. ${steps}. In which quadrant does it end up?`,
      answerType: 'mcq', correctAnswer: QUADRANT_CHOICES[q - 1], choices: [...QUADRANT_CHOICES],
      diagramSvg: quadrantGrid(min, max, [p]),
      explanation: `Add the two moves together: ${moveWords(total.x, total.y)} altogether. x = ${p.x} ${total.x >= 0 ? '+' : '-'} ${Math.abs(total.x)} = ${rawEnd.x}, y = ${p.y} ${total.y >= 0 ? '+' : '-'} ${Math.abs(total.y)} = ${rawEnd.y}. At ${fmt(rawEnd)}, ${quadrantWhy(rawEnd)} — the ${QUADRANT_CHOICES[q - 1]}.`,
    });
  }

  return make('translation', 5, {
    prompt: `Point P is at ${fmt(p)}. ${steps}. What are its final coordinates?`,
    answerType: 'mcq', correctAnswer: fmt(rawEnd),
    choices: pointChoices(rawEnd, [
      { x: p.x + first.x, y: p.y + first.y }, // stopped after the first move
      { x: p.x - total.x, y: p.y - total.y },
      { x: p.x + total.y, y: p.y + total.x },
    ]),
    diagramSvg: diagram,
    explanation: `Add the two moves together first: ${moveWords(first.x, first.y)}, then ${moveWords(second.x, second.y)}, is ${moveWords(total.x, total.y)} altogether. x = ${p.x} ${total.x >= 0 ? '+' : '-'} ${Math.abs(total.x)} = ${rawEnd.x}, y = ${p.y} ${total.y >= 0 ? '+' : '-'} ${Math.abs(total.y)} = ${rawEnd.y}. P ends at ${fmt(rawEnd)}.`,
  });
}

export function genCoordinates(tier) {
  return { 1: coordT1, 2: coordT2, 3: coordT3, 4: coordT4, 5: coordT5 }[tier]();
}
