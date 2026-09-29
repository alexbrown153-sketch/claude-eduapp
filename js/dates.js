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
