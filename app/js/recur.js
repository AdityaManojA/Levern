// Repeating quests. repeat = { freq: 'daily' | 'alternate' | 'weekdays' | 'weekly' | 'monthly' | 'yearly' | 'custom',
// interval?: number, days?: [0..6], day?: 1..31, month?: 1..12 } where days are the weekdays picked for 'custom'
// (0 = Sunday, 6 = Saturday), and day (and month, yearly) the date a monthly or yearly repeat keeps to (anchored).
import { addDays, addMonths, weekday, todayStr, MONTHS } from './dates.js';

// the repeats to pick from once "Repeats" is chosen (How often: Once · Repeats · Times per week, see oftenSeg)
export const REPEATS = [
  ['daily', 'Every day'],
  ['alternate', 'Every other day'],
  ['weekdays', 'Every weekday (Mon–Fri)'],
  ['weekly', 'Every week'],
  ['monthly', 'Every month'],
  ['yearly', 'Every year'],
  ['custom', 'On the days I choose…'],
];
// How often a quest happens: once, on a repeat, or a number of times a week (a weekly goal, goals.js: no day,
// it counts the times done). attr: the attribute the buttons carry (the add sheet and the detail screen differ).
export const oftenOf = q => (q.goal ? 'week' : q.repeat ? 'repeat' : 'once');
export const oftenSeg = (mode, attr) => `<div class="seg often" role="radiogroup" aria-label="How often">${[['once', 'Once'], ['repeat', 'Repeats'], ['week', 'Times per week']]
  .map(([k, l]) => `<button type="button" role="radio" aria-checked="${mode === k}" class="${mode === k ? 'on' : ''}" ${attr}="${k}">${l}</button>`).join('')}</div>`;
const DAY_NAME = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];   // the picker starts on Monday
// "Mon Wed Fri", in week order
export const daysLabel = days => DAY_ORDER.filter(d => (days || []).includes(d)).map(d => DAY_NAME[d]).join(' ');
const ordinal = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th');
// "Every month on the 15th", "Every year on 3 Mar" (with the due date, or the date the repeat keeps to)
export function describe(r, due) {
  if (!r) return '';
  if (r.freq === 'custom') return r.days?.length ? `On ${daysLabel(r.days)}` : 'On chosen days';
  const day = r.day || (due ? +due.slice(8) : 0);
  if (r.freq === 'monthly' && day) return `Every month on the ${ordinal(day)}${day > 28 ? ' (or its last day)' : ''}`;
  if (r.freq === 'yearly' && due) return `Every year on ${day} ${MONTHS[+due.slice(5, 7) - 1]}`;
  return (REPEATS.find(x => x[0] === r.freq) || [, ''])[1];
}
// the short tag shown on a quest row
export const repeatShort = r => !r ? '' : r.freq === 'custom' ? daysLabel(r.days) : ({ daily: 'daily', alternate: 'alternate days', weekdays: 'weekdays', weekly: 'weekly', monthly: 'monthly', yearly: 'yearly' }[r.freq] || '');
// A monthly or yearly repeat keeps to its date: due on the 31st, it comes back on the 31st (or the month's last
// day, then the 31st again), never drifting to the 28th after February. The date is taken from the due date
// whenever the due date or the repeat is set.
export function anchored(r, due) {
  if (!r || !due || (r.freq !== 'monthly' && r.freq !== 'yearly')) return r;
  const { day, month, ...rest } = r;
  return r.freq === 'yearly' ? { ...rest, day: +due.slice(8), month: +due.slice(5, 7) } : { ...rest, day: +due.slice(8) };
}
const pad = n => String(n).padStart(2, '0');
// the month that `s` is in, on `day` (or its last day)
const onDay = (s, day) => { const [y, m] = s.split('-').map(Number); return `${y}-${pad(m)}-${pad(Math.min(day, new Date(y, m, 0).getDate()))}`; };
// the seven day buttons: pressed ones are the days the quest repeats on
export const dayChips = days => `<div class="daychips" role="group" aria-label="Repeats on">${DAY_ORDER.map(d => `<button type="button" class="${(days || []).includes(d) ? 'on' : ''}" data-day="${d}" aria-pressed="${(days || []).includes(d)}">${DAY_NAME[d]}</button>`).join('')}</div>`;

export function nextDue(due, r) {
  const n = Math.max(1, r.interval || 1);
  switch (r.freq) {
    case 'daily': return addDays(due, n);
    case 'alternate': return addDays(due, 2 * n);
    case 'weekdays': { let d = addDays(due, 1); while (weekday(d) === 0 || weekday(d) === 6) d = addDays(d, 1); return d; }
    case 'weekly': return addDays(due, 7 * n);
    case 'monthly': return onDay(addMonths(due.slice(0, 8) + '01', n), r.day || +due.slice(8));
    case 'yearly': return onDay(addMonths(due.slice(0, 8) + '01', 12 * n), r.day || +due.slice(8));
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
