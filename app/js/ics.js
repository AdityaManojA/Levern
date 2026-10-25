// Calendar export: an .ics file (Apple Calendar, Outlook, Google import) and Google Calendar "add event" links.
import { addDays, at } from './dates.js';

const RRULE = { daily: 'FREQ=DAILY', alternate: 'FREQ=DAILY;INTERVAL=2', weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
// the chosen weekdays, weekly
const customRule = r => r.days?.length ? `FREQ=WEEKLY;BYDAY=${[...r.days].sort().map(d => BYDAY[d]).join(',')}` : '';
// a monthly repeat on the 29th-31st falls on the month's last day in shorter months (as in the app), and a yearly
// one on 29 Feb on the 28th in other years: "the last of these days that the month has"
const monthEnd = r => {
  if (r.freq === 'monthly' && r.day > 28) return `;BYMONTHDAY=${Array.from({ length: r.day - 27 }, (_, i) => 28 + i).join(',')};BYSETPOS=-1`;
  if (r.freq === 'yearly' && r.month === 2 && r.day === 29) return ';BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1';
  return '';
};
export const rrule = r => r && r.freq === 'custom' ? customRule(r) : r && RRULE[r.freq] ? RRULE[r.freq] + (r.interval > 1 ? `;INTERVAL=${r.interval}` : '') + monthEnd(r) : '';

const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const pad = n => String(n).padStart(2, '0');
const ymd = s => s.replace(/-/g, '');
const local = ms => { const d = new Date(ms); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`; };
const utc = ms => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// RFC 5545: lines longer than 75 octets are folded with CRLF + space
function fold(line) {
  const out = []; let cur = '', bytes = 0;
  for (const ch of line) {
    const b = new TextEncoder().encode(ch).length;
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ''; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.join('\r\n ');
}
const EVENT_MIN = 30;

function eventLines(q, stamp) {
  const L = ['BEGIN:VEVENT', `UID:taskflow-${q.id}@taskflow.app`, `DTSTAMP:${utc(stamp)}`, `SUMMARY:${esc(q.title)}`];
  if (q.time) {
    const start = at(q.due, q.time);
    L.push(`DTSTART:${local(start)}`, `DTEND:${local(start + EVENT_MIN * 60000)}`);
  } else {
    L.push(`DTSTART;VALUE=DATE:${ymd(q.due)}`, `DTEND;VALUE=DATE:${ymd(addDays(q.due, 1))}`);
  }
  const rr = rrule(q.repeat); if (rr) L.push(`RRULE:${rr}`);
  const notes = [q.notes, ...(q.subtasks || []).map(s => `${s.done ? '[x]' : '[ ]'} ${s.title}`)].filter(Boolean).join('\n');
  if (notes) L.push(`DESCRIPTION:${esc(notes)}`);
  L.push(`CATEGORIES:P${q.tier + 1}`);
  if (q.remind) {
    // relative to the start when the reminder was set relative to the due date, otherwise absolute
    const trig = q.remind.offset != null ? `TRIGGER:-PT${Math.max(0, Math.round(q.remind.offset / 60000))}M` : `TRIGGER;VALUE=DATE-TIME:${utc(q.remind.at)}`;
    L.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(q.title)}`, trig, 'END:VALARM');
  }
  L.push('END:VEVENT');
  return L;
}

export function buildICS(quests, now = Date.now()) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TaskFlow//Quests//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:TaskFlow'];
  // example quests stay out of whole-calendar exports and feeds (a single quest asked for by name is still included)
  for (const q of quests) if (q.due && !q.done) L.push(...eventLines(q, now));
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}

export function googleLink(q) {
  let dates;
  if (q.time) { const s = at(q.due, q.time); dates = `${local(s)}/${local(s + EVENT_MIN * 60000)}`; }
  else dates = `${ymd(q.due)}/${ymd(addDays(q.due, 1))}`;
  const p = new URLSearchParams({ action: 'TEMPLATE', text: q.title, dates });
  if (q.notes) p.set('details', q.notes);
  const rr = rrule(q.repeat); if (rr) p.set('recur', 'RRULE:' + rr);
  return 'https://calendar.google.com/calendar/render?' + p.toString();
}
