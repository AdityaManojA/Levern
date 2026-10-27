// Local-date helpers. Due dates are stored as 'YYYY-MM-DD' strings (the user's local calendar day)
// and times as 'HH:MM', so a quest due "Friday" stays on Friday whatever the timezone.

const pad = n => String(n).padStart(2, '0');
export const DAY_MS = 86400000;
export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const toStr = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const fromStr = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayStr = (now = new Date(Date.now())) => toStr(now);
export function addDays(s, n) { const d = fromStr(s); d.setDate(d.getDate() + n); return toStr(d); }
export function addMonths(s, n) {
  const d = fromStr(s), day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return toStr(d);
}
// minutes from now until HH:MM (today, or tomorrow when that time has passed): the Focus timer's "until"
export function minutesUntil(hhmm, now = new Date()) {
  const [h, m] = hhmm.split(':').map(Number), end = new Date(now);
  end.setHours(h, m, 0, 0);
  if (end <= now) end.setDate(end.getDate() + 1);
  return (end - now) / 60000;
}
// whole days from a to b (b - a)
export const diffDays = (a, b) => Math.round((fromStr(b) - fromStr(a)) / DAY_MS);
export const weekday = s => fromStr(s).getDay();
// Monday-based week start
export function startOfWeek(s) { const wd = weekday(s); return addDays(s, wd === 0 ? -6 : 1 - wd); }
// 6 rows x 7 days covering the month, starting on a Monday
export function monthGrid(year, month) {
  const first = toStr(new Date(year, month, 1));
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}
export function at(s, time) {
  const [y, m, d] = s.split('-').map(Number);
  if (time) {
    const [h, min] = time.split(':').map(Number);
    return new Date(y, m - 1, d, h || 0, min || 0, 0, 0).getTime();
  }
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}
// the moment a quest becomes overdue: its time plus any duration, or the end of its day
export const dueTimestamp = q => {
  if (!q.due) return null;
  const durMs = (q.duration && q.duration > 0) ? q.duration * 60000 : 0;
  return q.time ? at(q.due, q.time) + durMs : at(q.due) + DAY_MS - 1;
};

// formats minutes to friendly duration: 120 -> "2h", 90 -> "1h 30m", 45 -> "45m"
export function fmtDuration(mins) {
  const m = Math.round(Number(mins) || 0);
  if (m <= 0) return '';
  const h = Math.floor(m / 60), rem = m % 60;
  if (h && rem) return `${h}h ${rem}m`;
  if (h) return `${h}h`;
  return `${rem}m`;
}

// typed times for the time picker: "9", "930", "9:30", "9.30pm", "21:05", "9 pm" → 'HH:MM' (null if not a time)
export function parseTime(s) {
  const m = String(s ?? '').trim().toLowerCase().replace(/\s+/g, '').match(/^(\d{1,2})(?:[:.h]?(\d{2}))?(a|am|p|pm)?$/);
  if (!m) return null;
  let h = +m[1]; const min = m[2] ? +m[2] : 0, ap = m[3] && m[3][0];
  if (min > 59 || h > 23 || (ap && (h < 1 || h > 12))) return null;
  if (ap === 'p' && h < 12) h += 12;
  if (ap === 'a' && h === 12) h = 0;
  return `${pad(h)}:${pad(min)}`;
}
export function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${((h + 11) % 12) + 1}${m ? ':' + pad(m) : ''} ${h < 12 ? 'am' : 'pm'}`;
}
export function fmtDate(s, now = new Date()) {
  const d = fromStr(s), t = todayStr(now), n = diffDays(t, s);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  const base = `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}
export function fmtStamp(ms, now = new Date()) {
  const d = new Date(ms);
  return `${fmtDate(toStr(d), now)}, ${fmtTime(`${pad(d.getHours())}:${pad(d.getMinutes())}`)}`;
}

// 'overdue' | 'today' | 'soon' (next 2 days) | 'week' | 'later' | 'none'
export function dueStatus(q, now = new Date(Date.now())) {
  if (!q.due) return 'none';
  if (!q.done && dueTimestamp(q) < now.getTime()) return 'overdue';
  const n = diffDays(todayStr(now), q.due);
  if (n <= 0) return 'today';
  if (n <= 2) return 'soon';
  if (n <= 7) return 'week';
  return 'later';
}
export function dueLabel(q, now = new Date()) {
  if (!q.due) return '';
  const st = dueStatus(q, now), t = q.time ? ' ' + fmtTime(q.time) : '';
  if (st === 'overdue') {
    const n = diffDays(q.due, todayStr(now));
    return n > 0 ? `Overdue · ${n} day${n === 1 ? '' : 's'}` : `Overdue · was ${fmtTime(q.time)}`;
  }
  return fmtDate(q.due, now) + t;
}
export function relTime(ms, now = Date.now()) {
  const s = Math.round((ms - now) / 1000), a = Math.abs(s);
  const v = a < 60 ? `${a} s` : a < 3600 ? `${Math.round(a / 60)} min` : a < 86400 ? `${Math.round(a / 3600)} h` : `${Math.round(a / 86400)} d`;
  return s >= 0 ? `in ${v}` : `${v} ago`;
}
