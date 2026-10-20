// Natural-language quest entry: "Renew passport due Friday at 5pm" ->
// { title: 'Renew passport', due: '<next Friday>', time: '17:00', tier: 1, repeat: null, chips: [...] }
import { todayStr, addDays, diffDays, weekday, toStr, MONTHS } from './dates.js';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_RE = '(sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat)(?:day|nesday|sday|urday|rsday)?';
const MONTH_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const dayIndex = w => DAYS.indexOf(w.slice(0, 3).toLowerCase());
const monthIndex = m => MONTHS.findIndex(x => x.toLowerCase() === m.slice(0, 3).toLowerCase());

// the next date on weekday wd; today counts unless strictlyAfter
function nextWeekday(today, wd, strictlyAfter) {
  let n = (wd - weekday(today) + 7) % 7;
  if (n === 0 && strictlyAfter) n = 7;
  return addDays(today, n);
}
function dateFromDayMonth(today, d, m) {
  const y = +today.slice(0, 4);
  let s = toStr(new Date(y, m, d));
  if (s < today) s = toStr(new Date(y + 1, m, d));
  return s;
}

// keyword -> priority tier (0 = P1 ... 5 = P6). Same rules as the prototype, plus date proximity.
const KEYWORDS = [
  [/\b(urgent|asap|critical|important)\b/i, 0],
  [/\b(exam|test|quiz|revise|read|study|assignment)\b/i, 2],
  [/\b(tidy|clean|organi[sz]e|sort out)\b/i, 4],
  [/\b(someday|maybe|idea|learn|try)\b/i, 5],
];

export function parseQuest(text, now = new Date()) {
  const today = todayStr(now);
  let rest = ' ' + text + ' ';
  const chips = [];
  let due = null, time = null, tier = null, repeat = null;
  const take = (re, fn) => {
    const m = rest.match(re);
    if (!m) return false;
    const r = fn(m);
    if (r === false) return false;
    rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
    return true;
  };
  const lead = '(?:\\b(?:due|by|on|before|for|this)\\s+)?';

  // explicit priority: "p1".."p6" or "!1".."!6"
  take(/(?:^|\s)(?:p|!)([1-6])\b/i, m => { tier = +m[1] - 1; chips.push({ kind: 'tier', text: `P${m[1]}` }); });

  // repeat
  // "alternate days" / "every other day": every second day
  take(/\balternate\s+days?\b|\bevery\s+other\s+days?\b/i, m => { repeat = { freq: 'alternate' }; chips.push({ kind: 'repeat', text: m[0].trim() }); });
  if (!repeat) take(/\bevery\s*day\b|\bdaily\b/i, m => { repeat = { freq: 'daily' }; chips.push({ kind: 'repeat', text: m[0].trim() }); });
  if (!repeat) take(/\bevery\s+weekdays?\b|\bweekdays\b/i, m => { repeat = { freq: 'weekdays' }; chips.push({ kind: 'repeat', text: m[0].trim() }); });
  if (!repeat) take(new RegExp(`\\bevery\\s+${DAY_RE}\\b`, 'i'), m => {
    repeat = { freq: 'weekly' }; due = nextWeekday(today, dayIndex(m[1]), false); chips.push({ kind: 'repeat', text: m[0].trim() });
  });
  if (!repeat) take(/\bevery\s+week\b|\bweekly\b/i, m => { repeat = { freq: 'weekly' }; chips.push({ kind: 'repeat', text: m[0].trim() }); });
  if (!repeat) take(/\bevery\s+month\b|\bmonthly\b/i, m => { repeat = { freq: 'monthly' }; chips.push({ kind: 'repeat', text: m[0].trim() }); });

  // time: "at 5pm", "5:30 pm", "at 17:00"
  take(/\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i, m => {
    let h = +m[1] % 12; if (m[3].toLowerCase() === 'pm') h += 12;
    if (+m[1] > 12 || (m[2] && +m[2] > 59)) return false;
    time = `${String(h).padStart(2, '0')}:${m[2] || '00'}`; chips.push({ kind: 'time', text: m[0].trim() });
  }) || take(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i, m => {
    time = `${m[1].padStart(2, '0')}:${m[2]}`; chips.push({ kind: 'time', text: m[0].trim() });
  });

  // dates
  const setDue = (s, m) => { due = s; chips.push({ kind: 'date', text: m[0].trim() }); };
  if (!due) take(new RegExp(`${lead}\\btonight\\b`, 'i'), m => { setDue(today, m); if (!time) time = '20:00'; })
    || take(new RegExp(`${lead}\\b(today|now)\\b`, 'i'), m => setDue(today, m))
    || take(new RegExp(`${lead}\\bday after tomorrow\\b`, 'i'), m => setDue(addDays(today, 2), m))
    || take(new RegExp(`${lead}\\b(tomorrow|tmrw|tmr)\\b`, 'i'), m => setDue(addDays(today, 1), m))
    || take(new RegExp(`${lead}\\bin\\s+(\\d+|a|an|one|two|three)\\s+(day|week)s?\\b`, 'i'), m => {
      const n = { a: 1, an: 1, one: 1, two: 2, three: 3 }[m[1].toLowerCase()] ?? +m[1];
      setDue(addDays(today, n * (m[2].toLowerCase() === 'week' ? 7 : 1)), m);
    })
    || take(new RegExp(`${lead}\\bnext\\s+week\\b`, 'i'), m => setDue(nextWeekday(today, 1, true), m))
    || take(new RegExp(`${lead}\\b(?:this\\s+)?weekend\\b`, 'i'), m => setDue(nextWeekday(today, 6, false), m))
    || take(new RegExp(`${lead}\\bnext\\s+${DAY_RE}\\b`, 'i'), m => setDue(nextWeekday(today, dayIndex(m[1]), true), m))
    || take(new RegExp(`${lead}\\b${DAY_RE}\\b`, 'i'), m => setDue(nextWeekday(today, dayIndex(m[1]), false), m))
    || take(new RegExp(`${lead}\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\b`, 'i'), m => setDue(dateFromDayMonth(today, +m[1], monthIndex(m[2])), m))
    || take(new RegExp(`${lead}\\b${MONTH_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`, 'i'), m => setDue(dateFromDayMonth(today, +m[2], monthIndex(m[1])), m))
    || take(new RegExp(`${lead}\\b(\\d{1,2})/(\\d{1,2})\\b`), m => {   // day/month
      if (+m[2] < 1 || +m[2] > 12 || +m[1] < 1 || +m[1] > 31) return false;
      setDue(dateFromDayMonth(today, +m[1], +m[2] - 1), m);
    });
  // a time on its own means today (or tomorrow if that time has passed)
  if (time && !due) {
    const [h, mi] = time.split(':').map(Number);
    due = h * 60 + mi > now.getHours() * 60 + now.getMinutes() ? today : addDays(today, 1);
  }
  if (repeat && !due) due = today;

  // priority from keywords, then from how soon it is due
  if (tier === null) for (const [re, t] of KEYWORDS) { const m = text.match(re); if (m) { tier = t; chips.push({ kind: 'keyword', text: m[0] }); break; } }
  if (due) {
    const n = diffDays(today, due);
    const byDate = n <= 0 ? 0 : n <= 2 ? 1 : n <= 7 ? 2 : null;
    if (byDate !== null && (tier === null || (byDate < tier && !chips.some(c => c.kind === 'tier')))) tier = byDate;
  }
  if (repeat && tier !== null && tier < 3 && !chips.some(c => c.kind === 'tier' || c.kind === 'keyword')) tier = 3;   // habits are not emergencies

  const title = rest.replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, '').replace(/\s+(due|by|on|at|for|before)$/i, '').trim();
  return { title: title || text.trim(), due, time, tier: tier ?? 3, repeat, chips };
}
