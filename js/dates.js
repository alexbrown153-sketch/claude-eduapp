// Calendar days, on the child's own clock (UTC→local date fix).
//
// All day-based features (streak, chest, goals, quests, calendar, recaps,
// backup reminder) must use these. Never take the date part of an ISO
// string (toISOString): that is the UTC date, which in British Summer Time
// is still "yesterday" between midnight and 1am. Stored instants (session `date`, `finishedAt`) stay as
// ISO timestamps; a day is only ever derived from them here.
//
// Pure helpers only: no storage access.

// Zero-padded local "YYYY-MM-DD" for a Date (default: now).
export function localDateStr(date = new Date()) {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
}

// Whole calendar days from local date string `a` to local date string `b`
// (negative if b is earlier). Both are read as local midnight and the result
// is rounded, so a clock change in between doesn't matter. NaN, never an
// error, if either is missing or unreadable, which no caller's rule matches.
export function daysBetweenLocalDates(a, b) {
  if (!a || !b) return NaN;
  const from = new Date(`${a}T00:00:00`);
  const to = new Date(`${b}T00:00:00`);
  return Math.round((to - from) / 86400000);
}

// The local day a logged session counts for: the day it finished. Entries
// from before `finishedAt` existed fall back to their start time.
export function sessionLocalDay(entry) {
  return localDateStr(new Date(entry.finishedAt ?? entry.date));
}

// ---------- Weeks and months (build 2: #128, #131, #136, #140, #141) ----------
//
// Ranges are inclusive pairs of local "YYYY-MM-DD" strings, { start, end }.
// Zero-padded date strings compare correctly as text, so "is this day in the
// range" is a plain string comparison. Every step between days goes through
// new Date(y, m, d ± n), which is always local midnight, so a clock change
// (BST starts or ends) can never shift a day.

function parseLocal(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// The local date string n days after (or before, if negative) `dateStr`.
export function addDays(dateStr, n) {
  const d = parseLocal(dateStr);
  return localDateStr(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

// 0 for Monday … 6 for Sunday (weeks start on Monday, the UK convention).
export function weekdayIndex(dateStr) {
  return (parseLocal(dateStr).getDay() + 6) % 7;
}

// The Monday-to-Sunday week containing `dateStr` (default: today).
export function weekRange(dateStr = localDateStr()) {
  const start = addDays(dateStr, -weekdayIndex(dateStr));
  return { start, end: addDays(start, 6) };
}

// The whole week before the one containing `dateStr`.
export function previousWeekRange(dateStr = localDateStr()) {
  return weekRange(addDays(weekRange(dateStr).start, -1));
}

// Local "YYYY-MM" for a Date (default: now).
export function localMonthStr(date = new Date()) {
  return localDateStr(date).slice(0, 7);
}

// The month before "YYYY-MM".
export function previousMonthStr(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return localMonthStr(new Date(y, m - 2, 1));
}

// First to last day of the month "YYYY-MM".
export function monthRange(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  return { start: localDateStr(new Date(y, m - 1, 1)), end: localDateStr(new Date(y, m, 0)) };
}

export function inRange(dateStr, range) {
  return dateStr >= range.start && dateStr <= range.end;
}
