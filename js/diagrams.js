// Small generated pictures for questions, drawn as inline SVG the same way
// as the coordinate grids in coordinates.js: markup only, with every colour
// and font size coming from styles.css (.shape-diagram, .bar-model) so the
// pictures follow the themes, dark mode and the boss arena.
//
//  - shapeSvg (Roadmap #121) goes with the question: rectangles, L-shapes
//    and rectangles with two opposite corners cut off. It shows only the
//    measurements the prompt gives, never the area or the removed piece.
//  - barModelSvg (Roadmap #122) goes with the explanation, after the child
//    has answered: one bar per share, one box per part.

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function text(x, y, label, cls, anchor = 'middle') {
  return `<text class="${cls}" x="${x}" y="${y}" text-anchor="${anchor}">${esc(label)}</text>`;
}

// ---------- Shapes (Roadmap #121) ----------

// Drawn roughly to scale: the longer side is LONG units, but the shorter one
// never drops below `minSide`, so thin shapes (3 × 20) stay readable and a
// notch always has room for its labels. That's why every shape carries a
// "Not drawn to scale" caption, as 11+ papers do.
const LONG = 220;
const NOTCH_MIN = 60; // room for a notch's two labels without touching
const M_SIDE = 64; // margin left and right, for side labels
const M_TOP = 34; // margin above, for a top label or dimension line
const M_BOTTOM = 52; // margin below, for a bottom label plus the caption

function drawnSize(w, h, minSide) {
  const s = LONG / Math.max(w, h);
  return { W: Math.max(w * s, minSide), H: Math.max(h * s, minSide) };
}

// A notch's drawn size: in proportion to the drawn outline, clamped so it's
// never too small to label and never larger than `maxW` × `maxH`.
function notchSize(cut, whole, drawn, max) {
  return Math.min(Math.max((cut / whole) * drawn, NOTCH_MIN), max);
}

// Labels a notch's two inner edges with the cut sizes. The notch is the
// empty rectangle [nx, nx + cw] × [ny, ny + ch]; `right`/`bottom` say which
// of its sides lie on the outline's edge (so the other two are the inner
// edges). The vertical edge's label sits halfway down, the horizontal
// edge's label hugs that edge, so with NOTCH_MIN they can't overlap.
function notchLabels(nx, ny, cw, ch, right, bottom, cutW, cutH) {
  const xv = right ? nx : nx + cw; // inner vertical edge
  const yh = bottom ? ny : ny + ch; // inner horizontal edge
  const vx = right ? xv + 6 : xv - 6;
  const hy = bottom ? yh + 17 : yh - 8;
  return text(vx, ny + ch / 2 + 4, `${cutH} cm`, 'sd-label', right ? 'start' : 'end')
    + text(nx + cw / 2, hy, `${cutW} cm`, 'sd-label');
}

function frame(innerW, innerH, body, description) {
  const w = innerW + M_SIDE * 2;
  const h = innerH + M_TOP + M_BOTTOM;
  const caption = text(w / 2, h - 8, 'Not drawn to scale', 'sd-caption');
  return `<svg class="shape-diagram" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(description)}">`
    + `<g transform="translate(${M_SIDE} ${M_TOP})">${body}</g>${caption}</svg>`;
}

function outline(points) {
  return `<polygon class="sd-shape" points="${points.map(([x, y]) => `${x},${y}`).join(' ')}" />`;
}

// A plain w × h rectangle, width along the bottom and height on the left.
export function rectangleSvg(w, h) {
  const { W, H } = drawnSize(w, h, 60);
  const body = outline([[0, 0], [W, 0], [W, H], [0, H]])
    + text(W / 2, H + 20, `${w} cm`, 'sd-label')
    + text(-8, H / 2 + 4, `${h} cm`, 'sd-label', 'end');
  return frame(W, H, body, `Rectangle: ${w} cm by ${h} cm.`);
}

// A w × h rectangle with a cutW × cutH rectangle missing from `corner`
// ('tl' | 'tr' | 'bl' | 'br'). The full width and height are labelled on
// the two sides that aren't broken by the notch.
export function lShapeSvg(w, h, cutW, cutH, corner) {
  const { W, H } = drawnSize(w, h, 110);
  const cw = notchSize(cutW, w, W, W - 40);
  const ch = notchSize(cutH, h, H, H - 40);
  const right = corner === 'tr' || corner === 'br';
  const bottom = corner === 'bl' || corner === 'br';
  const nx = right ? W - cw : 0;
  const ny = bottom ? H - ch : 0;
  // Walk round the outline clockwise from the top-left, stepping in round
  // the notch at its corner.
  const pts = {
    tl: [[cw, 0], [W, 0], [W, H], [0, H], [0, ch], [cw, ch]],
    tr: [[0, 0], [W - cw, 0], [W - cw, ch], [W, ch], [W, H], [0, H]],
    br: [[0, 0], [W, 0], [W, H - ch], [W - cw, H - ch], [W - cw, H], [0, H]],
    bl: [[0, 0], [W, 0], [W, H], [cw, H], [cw, H - ch], [0, H - ch]],
  }[corner];
  // Unbroken sides: the horizontal side away from the notch, and the
  // vertical side away from it.
  const widthLabel = bottom ? text(W / 2, -10, `${w} cm`, 'sd-label') : text(W / 2, H + 20, `${w} cm`, 'sd-label');
  const heightLabel = right
    ? text(-8, H / 2 + 4, `${h} cm`, 'sd-label', 'end')
    : text(W + 8, H / 2 + 4, `${h} cm`, 'sd-label', 'start');
  const body = outline(pts) + widthLabel + heightLabel
    + notchLabels(nx, ny, cw, ch, right, bottom, cutW, cutH);
  return frame(W, H, body, `L-shape: ${w} cm by ${h} cm rectangle with a ${cutW} cm by ${cutH} cm corner removed.`);
}

// A dimension line with end ticks, for a measurement with no whole side to
// sit on (both long sides are broken by a notch).
function dimension(x1, y1, x2, y2, label, labelX, labelY, anchor) {
  const horizontal = y1 === y2;
  const t = 5;
  const ticks = horizontal
    ? `<line class="sd-dim" x1="${x1}" y1="${y1 - t}" x2="${x1}" y2="${y1 + t}" /><line class="sd-dim" x1="${x2}" y1="${y2 - t}" x2="${x2}" y2="${y2 + t}" />`
    : `<line class="sd-dim" x1="${x1 - t}" y1="${y1}" x2="${x1 + t}" y2="${y1}" /><line class="sd-dim" x1="${x2 - t}" y1="${y2}" x2="${x2 + t}" y2="${y2}" />`;
  return `<line class="sd-dim" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" />${ticks}${text(labelX, labelY, label, 'sd-label', anchor)}`;
}

// A w × h rectangle with a cutW × cutH rectangle missing from two opposite
// corners: `diagonal` 'tl-br' or 'tr-bl'. Callers keep each cut strictly
// under half of each side, so the two notches never meet; the drawing
// keeps them under half too.
export function twoCornersSvg(w, h, cutW, cutH, diagonal) {
  const { W, H } = drawnSize(w, h, 150);
  const cw = notchSize(cutW, w, W, W / 2 - 12);
  const ch = notchSize(cutH, h, H, H / 2 - 12);
  const pts = diagonal === 'tl-br'
    ? [[cw, 0], [W, 0], [W, H - ch], [W - cw, H - ch], [W - cw, H], [0, H], [0, ch], [cw, ch]]
    : [[0, 0], [W - cw, 0], [W - cw, ch], [W, ch], [W, H], [cw, H], [cw, H - ch], [0, H - ch]];
  const notches = diagonal === 'tl-br'
    ? notchLabels(0, 0, cw, ch, false, false, cutW, cutH) + notchLabels(W - cw, H - ch, cw, ch, true, true, cutW, cutH)
    : notchLabels(W - cw, 0, cw, ch, true, false, cutW, cutH) + notchLabels(0, H - ch, cw, ch, false, true, cutW, cutH);
  // Full width above the shape; full height on the side whose top corner
  // is intact, so the line doesn't run past an empty notch.
  const dimX = diagonal === 'tl-br' ? W + 14 : -14;
  const body = outline(pts) + notches
    + dimension(0, -14, W, -14, `${w} cm`, W / 2, -20, 'middle')
    + dimension(dimX, 0, dimX, H, `${h} cm`, diagonal === 'tl-br' ? dimX + 8 : dimX - 8, H / 2 + 4, diagonal === 'tl-br' ? 'start' : 'end');
  return frame(W, H, body, `A ${w} cm by ${h} cm rectangle with a ${cutW} cm by ${cutH} cm rectangle cut from two opposite corners.`);
}

// ---------- Bar model (Roadmap #122) ----------

// rows: [{ label, parts }] in ratio order. perPart: the amount in each box.
// highlight: index of the row the question asked for. money: prefix "£".
// totalNoun: what the total counts ("sweets", "pupils"), or '' for money.
// All boxes are the same width across every row, and rows line up on the
// left, so the picture shows the "same amount in every box" idea directly.
const BOX = 34;
const ROW_H = 30;
const ROW_GAP = 10;
const LABEL_W = 84;
const TOTAL_W = 64;

export function barModelSvg({ rows, perPart, highlight, money = false, totalNoun = '' }) {
  const amount = (n) => (money ? `£${n}` : String(n));
  const maxParts = Math.max(...rows.map((r) => r.parts));
  const totalParts = rows.reduce((s, r) => s + r.parts, 0);
  const total = totalParts * perPart;
  // At least wide enough for the summary line under short bars.
  const w = Math.max(LABEL_W + maxParts * BOX + TOTAL_W, 320);
  const summaryY = rows.length * (ROW_H + ROW_GAP) + 16;
  const h = summaryY + 8;
  const parts = [];

  rows.forEach((r, i) => {
    const y = i * (ROW_H + ROW_GAP) + 4;
    const on = i === highlight ? ' bm-on' : '';
    parts.push(text(LABEL_W - 8, y + ROW_H / 2 + 5, r.label, `bm-label${on}`, 'end'));
    for (let b = 0; b < r.parts; b += 1) {
      const x = LABEL_W + b * BOX;
      parts.push(`<rect class="bm-box${on}" x="${x}" y="${y}" width="${BOX}" height="${ROW_H}" />`);
      parts.push(text(x + BOX / 2, y + ROW_H / 2 + 5, amount(perPart), `bm-num${on}`));
    }
    parts.push(text(LABEL_W + r.parts * BOX + 8, y + ROW_H / 2 + 5, `= ${amount(r.parts * perPart)}`, `bm-total${on}`, 'start'));
  });

  const totalWords = money ? `£${total}` : `${total} ${totalNoun}`;
  const summary = `${totalWords} ÷ ${totalParts} boxes = ${amount(perPart)} in each box`;
  parts.push(text(w / 2, summaryY, summary, 'bm-summary'));

  const spoken = rows.map((r) => `${r.label} ${r.parts} box${r.parts === 1 ? '' : 'es'} of ${amount(perPart)} makes ${amount(r.parts * perPart)}`).join('; ');
  // Capped so a short model isn't blown up to huge text on a wide card.
  return `<svg class="bar-model" viewBox="0 0 ${w} ${h}" style="max-width:${Math.round(w * 1.3)}px" role="img" aria-label="${esc(`Bar model: ${spoken}; ${amount(total)} in total.`)}">${parts.join('')}</svg>`;
}
