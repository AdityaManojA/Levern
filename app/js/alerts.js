// Reminders for a quest with a due time. A quest's `alerts` is a list of minutes before its due time
// (0 = at the due time). A new quest starts with [0], so it always reminds at its due time. The app and the
// reminder job (scripts/reminders) both use these functions, so they agree on the times.
// Pure: no browser or Node APIs, so both can import it.

export const DEFAULT_ALERTS = [0];
export const PRESETS = [0, 5, 15, 60, 1440];
export const MAX_ALERT = 7 * 1440;   // a week ahead at most

// clean a list: whole numbers of minutes, no duplicates, earliest first
export const cleanAlerts = list => [...new Set((list || []).map(Number).filter(n => Number.isInteger(n) && n >= 0 && n <= MAX_ALERT))].sort((a, b) => a - b);

const plural = (n, word) => word === 'min' ? `${n} min` : `${n} ${word}${n === 1 ? '' : 's'}`;
export function alertLabel(m) {
  if (m === 0) return 'At due time';
  if (m % 1440 === 0) return `${plural(m / 1440, 'day')} before`;
  if (m % 60 === 0) return `${plural(m / 60, 'hour')} before`;
  return `${plural(m, 'min')} before`;
}
export const alertShort = m => m === 0 ? 'At due time' : m % 1440 === 0 ? plural(m / 1440, 'day') : m % 60 === 0 ? plural(m / 60, 'hour') : plural(m, 'min');

// the moment (date, minute of day) an alert goes off, for a due date 'YYYY-MM-DD' and time 'HH:MM'
export function alertMoment(due, time, m) {
  const [h, mi] = String(time).split(':').map(Number);
  const idx = Math.round(Date.parse(due + 'T00:00:00Z') / 60000) + h * 60 + mi - m;   // minutes since the epoch, as if UTC
  const d = new Date(idx * 60000);
  return { date: d.toISOString().slice(0, 10), minutes: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

// does this quest use its own alerts (a dated quest with a list, possibly empty)? Untimed quests count from 09:00.
export const usesAlerts = q => Array.isArray(q.alerts) && !!q.due;
// all alert times of a quest, as { m, date, minutes }
export function alertsOf(q) {
  if (!usesAlerts(q)) return [];
  return q.alerts.map(m => ({ m, ...alertMoment(q.due, q.time || '09:00', m) }));
}
