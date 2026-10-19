// Repeating quests. repeat = { freq: 'daily' | 'weekdays' | 'weekly' | 'monthly', interval?: number }
import { addDays, addMonths, weekday, todayStr } from './dates.js';

export const REPEATS = [
  ['', 'Does not repeat'],
  ['daily', 'Every day'],
  ['weekdays', 'Every weekday (Mon–Fri)'],
  ['weekly', 'Every week'],
  ['monthly', 'Every month'],
];
export const describe = r => !r ? '' : (REPEATS.find(x => x[0] === r.freq) || [, ''])[1];

export function nextDue(due, r) {
  const n = Math.max(1, r.interval || 1);
  switch (r.freq) {
    case 'daily': return addDays(due, n);
    case 'weekdays': { let d = addDays(due, 1); while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1); return d; }
    case 'weekly': return addDays(due, 7 * n);
    case 'monthly': return addMonths(due, n);
    default: return null;
  }
}

// After completing a repeating quest: the next occurrence that is after today
// (finishing a week-old daily habit today makes it due tomorrow, not today).
export function rollForward(due, r, now = new Date()) {
  const today = todayStr(now);
  let next = nextDue(due, r), guard = 0;
  while (next <= today && guard++ < 2000) next = nextDue(next, r);
  return next;
}

// every occurrence of a quest's due date inside [from, to] (inclusive), for the calendar
export function occurrences(q, from, to) {
  if (!q.due) return [];
  if (!q.repeat) return q.due >= from && q.due <= to ? [q.due] : [];
  const out = [];
  let d = q.due, guard = 0;
  while (d < from && guard++ < 5000) d = nextDue(d, q.repeat);
  while (d <= to && guard++ < 5000) { out.push(d); d = nextDue(d, q.repeat); }
  return out;
}
