// Repeating quests. repeat = { freq: 'daily' | 'alternate' | 'weekdays' | 'weekly' | 'monthly' | 'custom', interval?: number,
// days?: [0..6] } where days are the weekdays picked for 'custom' (0 = Sunday, 6 = Saturday).
import { addDays, addMonths, weekday, todayStr } from './dates.js';

export const REPEATS = [
  ['', 'Does not repeat'],
  ['daily', 'Every day'],
  ['alternate', 'Every other day'],
  ['weekdays', 'Every weekday (Mon–Fri)'],
  ['weekly', 'Every week'],
  ['monthly', 'Every month'],
  ['custom', 'On the days I choose…'],
  ['goal', 'A goal: a set number of times a week'],   // not a repeat: a weekly goal (goals.js), no day
];
const DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];   // the picker starts on Monday
// "Mon Wed Fri", in week order
export const daysLabel = days => DAY_ORDER.filter(d => (days || []).includes(d)).map(d => DAY_NAME[d]).join(' ');
export const describe = r => !r ? '' : r.freq === 'custom' ? (r.days?.length ? `On ${daysLabel(r.days)}` : 'On chosen days') : (REPEATS.find(x => x[0] === r.freq) || [, ''])[1];
// the short tag shown on a quest row
export const repeatShort = r => !r ? '' : r.freq === 'custom' ? daysLabel(r.days) : ({ daily: 'daily', alternate: 'alternate days', weekdays: 'weekdays', weekly: 'weekly', monthly: 'monthly' }[r.freq] || '');
// the seven day buttons: pressed ones are the days the quest repeats on
export const dayChips = days => `<div class="daychips" role="group" aria-label="Repeats on">${DAY_ORDER.map(d => `<button type="button" class="${(days || []).includes(d) ? 'on' : ''}" data-day="${d}" aria-pressed="${(days || []).includes(d)}">${DAY_NAME[d]}</button>`).join('')}</div>`;

export function nextDue(due, r) {
  const n = Math.max(1, r.interval || 1);
  switch (r.freq) {
    case 'daily': return addDays(due, n);
    case 'alternate': return addDays(due, 2 * n);
    case 'weekdays': { let d = addDays(due, 1); while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1); return d; }
    case 'weekly': return addDays(due, 7 * n);
    case 'monthly': return addMonths(due, n);
    case 'custom': {
      // the next picked weekday after this one (within a week, since at least one day is picked)
      if (!r.days?.length) return null;
      let d = due;
      for (let i = 0; i < 7; i++) { d = addDays(d, 1); if (r.days.includes(weekday(d))) return d; }
      return null;
    }
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
