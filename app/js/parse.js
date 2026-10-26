// Natural-language quest entry: "Renew passport due Friday at 5pm" ->
// { title: 'Renew passport', due: '<next Friday>', time: '17:00', tier: 1, repeat: null, chips: [...] }
// Typed and spoken text go through this same function (voice input turns speech into text first), so the
// words below work the same either way. Spoken numbers ("five thirty pm") are handled as well as digits.
import { todayStr, addDays, addMonths, diffDays, weekday, toStr, MONTHS } from './dates.js';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DAY_CORE = 'sun|mon|tue|tues|wed|weds|thu|thur|thurs|fri|sat';
const DAY_NC = `(?:${DAY_CORE})(?:day|nesday|sday|urday|rsday)?s?`;   // "fri", "friday", "fridays"
const DAY_RE = `(${DAY_CORE})(?:day|nesday|sday|urday|rsday)?s?`;     // group 1 is the short day name
const MONTH_RE = '(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*';
const dayIndex = w => DAYS.indexOf(w.slice(0, 3).toLowerCase());
const monthIndex = m => MONTHS.findIndex(x => x.toLowerCase() === m.slice(0, 3).toLowerCase());

// spoken numbers: "five", "twenty one", "forty five" -> 5, 21, 45
const NUMW = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50 };
const numVal = s => {
  const w = String(s).toLowerCase().split(/[ -]/);
  if (w.length === 2) return (NUMW[w[0]] ?? 0) + (NUMW[w[1]] ?? 0);
  return /^\d+$/.test(w[0]) ? +w[0] : NUMW[w[0]];
};
const HOUR_RE = '(?:\\d{1,2}|twelve|eleven|ten|nine|eight|seven|six|five|four|three|two|one)';
const MIN_RE = '(?:\\d{2}|fifteen|thirty|forty[ -]five|forty|fifty|twenty|ten|five)';
const AMPM = '(am|pm|a\\.m\\.|p\\.m\\.)';

// "5" with no am/pm: 1–6 means afternoon, 7–11 morning, 12 noon (the usual reading for a to-do)
const inferHour = h => (h >= 1 && h <= 6) || h === 12 ? (h % 12) + 12 : h;

// keyword -> priority tier (0 = P1 ... 5 = P6). The first list that matches wins.
const KEYWORDS = [
  [/\b(urgent(?:ly)?|asap|a\.s\.a\.p\.?|critical|emergenc(?:y|ies)|immediately|right now|top priority|can'?t wait|do first|important)\b/i, 0],
  [/\b(priority|pressing|essential|vital|crucial|high priority|time[- ]sensitive|soon|big|key)\b/i, 1],
  [/\b(exams?|tests?|quiz(?:zes)?|revis(?:e|ion)|read(?:ing)?|study|studying|assignments?|homework|essays?|reports?|presentations?|interviews?|meetings?|appointments?|submit|deliver|invoices?|bills?|payments?|pay|renew|renewal|book|apply|applications?|forms?|sign|send|emails?|repl(?:y|ies)|calls?|follow[- ]up|clients?|deadlines?|paperwork|taxes|tax)\b/i, 2],
  [/\b(errands?|shop|shopping|groceries|grocery|buy|pick ?up|collect|drop ?off|return|fetch|refill|restock)\b/i, 3],
  [/\b(tidy|tidying|clean(?:ing)?|organi[sz]e|sort(?:ing)? out|declutter|spring ?clean(?:ing)?)\b/i, 4],
  [/\b(someday|sometime|maybe|idea|ideas|learn|learning|try|eventually|one day|bucket list|wish ?list|explore|consider|hobby)\b/i, 5],
];

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
const lastDayOfMonth = today => {
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  return toStr(new Date(y, m, 0));
};

// repeats, checked in this order
const REPEAT_RULES = [
  ['alternate', /\balternate\s+days?\b|\bevery\s+(?:other|second)\s+days?\b|\bevery\s+(?:2|two)\s+days\b/i],
  ['daily', /\bevery\s*day\b|\beveryday\b|\bdaily\b|\b(?:every|each)\s+(?:morning|evening|night|afternoon)\b/i],
  ['weekdays', /\bweekdays?\b|\bon\s+weekdays\b|\bduring the week\b|\bmon(?:day)?\s*(?:-|to|through|until)\s*fri(?:day)?\b/i],
  ['weekly', /\b(?:every|each|per)\s+week\b|\bweekly\b/i],
  ['monthly', /\b(?:every|each|per)\s+month\b|\bmonthly\b/i],
  ['yearly', /\b(?:every|each|per)\s+year\b|\byearly\b|\bannually\b|\bonce a year\b/i],
];
// "every Monday, Wednesday and Friday"
const DAY_LIST_RE = new RegExp(`\\b(?:every|each|on)\\s+(${DAY_NC}(?:\\s*(?:,|and|&|/|\\+|or)\\s*${DAY_NC})+)\\b`, 'i');
// "every Friday", "each Monday", "on Mondays" (a plain "on Friday" is a date, not a repeat)
const DAY_EVERY_RE = new RegExp(`\\b(?:every|each)\\s+${DAY_RE}\\b|\\bon\\s+(?:${DAY_CORE})(?:day|nesday|sday|urday|rsday)s\\b`, 'i');

// parses duration phrases like "for 2 hours", "for 45 mins", "for half an hour" -> minutes
function parseDurationPhrase(s) {
  const raw = String(s).toLowerCase();
  if (/half\s+an?\s+hour|half\s+hour/.test(raw)) return 30;
  if (/an?\s+hour\s+and\s+(?:a\s+)?half/.test(raw)) return 90;
  let total = 0;
  const hm = raw.match(/(\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half|an?)\s*(?:hours?|hrs?|h)\b/);
  const mm = raw.match(/(\d+|fifteen|twenty|thirty|forty-five|fortyfive|forty|fifty)\s*(?:minutes?|mins?|m)\b/);
  if (hm) {
    const v = hm[1] === 'half' ? 0.5 : (hm[1] === 'a' || hm[1] === 'an') ? 1 : (numVal(hm[1]) ?? parseFloat(hm[1]));
    if (!isNaN(v)) total += Math.round(v * 60);
  }
  if (mm) {
    const v = numVal(mm[1]) ?? parseInt(mm[1], 10);
    if (!isNaN(v)) total += v;
  }
  return total > 0 ? total : null;
}

export function parseQuest(text, now = new Date()) {
  const today = todayStr(now);
  let rest = ' ' + text + ' ';
  const chips = [];
  let due = null, time = null, duration = null, tier = null, repeat = null;
  const take = (re, fn) => {
    const m = rest.match(re);
    if (!m) return false;
    const r = fn(m);
    if (r === false) return false;
    rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
    return true;
  };
  const lead = '(?:\\b(?:due|by|on|before|for|this)\\s+)?';
  const setTime = (hm, m) => { time = hm; chips.push({ kind: 'time', text: m[0].trim() }); };

  // explicit priority: "p1", "!2", "priority one", "p three" (or "level")
  const PRI = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
  take(/(?:^|\s)(?:p|!|priority\s*|level\s*)([1-6]|one|two|three|four|five|six)\b/i, m => {
    const n = PRI[m[1].toLowerCase()] ?? +m[1];
    tier = n - 1; chips.push({ kind: 'tier', text: `P${n}` });
  });

  // repeats: a list of days first, then the usual phrases
  const repeatHit = (freq, m) => { repeat = { freq }; chips.push({ kind: 'repeat', text: m[0].trim() }); };
  take(DAY_LIST_RE, m => {
    const days = [...new Set([...m[1].matchAll(new RegExp(DAY_RE, 'gi'))].map(d => dayIndex(d[1])))].sort((a, b) => a - b);
    if (days.length < 2) return false;
    repeat = { freq: 'custom', days };
    due = days.map(d => nextWeekday(today, d, false)).sort()[0];
    chips.push({ kind: 'repeat', text: m[0].trim() });
  });
  for (const [freq, re] of REPEAT_RULES) { if (repeat) break; take(re, m => repeatHit(freq, m)); }
  if (!repeat) take(DAY_EVERY_RE, m => {
    const day = m[0].match(new RegExp(DAY_RE, 'i'));
    repeat = { freq: 'weekly' }; due = nextWeekday(today, dayIndex(day[1]), false); chips.push({ kind: 'repeat', text: m[0].trim() });
  });

  // duration: "for 2 hours", "for 45 mins", "for 1h", "for 1.5 hours", "for half an hour"
  const DURATION_RE = /\b(?:for|duration|length)\s+(?:(?:an?\s+hour\s+and\s+(?:a\s+)?half)|(?:half\s+an?\s+hour)|(?:half\s+hour)|(?:(?:\d+(?:\.\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|half|an?)\s*(?:hours?|hrs?|h)(?:\s*(?:and\s+)?(?:\d+|fifteen|twenty|thirty|forty-five|fortyfive|forty|fifty)?\s*(?:minutes?|mins?|m)?)?)|(?:(?:\d+|fifteen|twenty|thirty|forty-five|fortyfive|forty|fifty)\s*(?:minutes?|mins?|m)))\b|\b(?:duration|length)\s*[:=]?\s*(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hours?|m|min|mins|minutes?)\b/i;
  take(DURATION_RE, m => {
    const mins = parseDurationPhrase(m[0]);
    if (!mins) return false;
    duration = mins;
    chips.push({ kind: 'duration', text: m[0].trim() });
  });

  // time. Checked from the most specific phrase to the least.
  take(new RegExp(`\\b(?:at\\s+)?(quarter|half)\\s+(past|to)\\s+(${HOUR_RE})(?:\\s*${AMPM}(?![a-z]))?`, 'i'), m => {
    let h = numVal(m[3]);
    if (!m[4]) h = inferHour(h); else if (/^p/i.test(m[4])) h = h % 12 + 12; else h = h % 12;
    let min = m[1].toLowerCase() === 'half' ? 30 : 15;
    if (m[2].toLowerCase() === 'to') { min = 60 - min; h -= 1; }
    if (h < 0 || h > 23) return false;
    setTime(`${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`, m);
  })
  || take(new RegExp(`\\b(?:at\\s+)?(${HOUR_RE})(?:(?::|\\s+)(${MIN_RE}))?\\s*${AMPM}(?![a-z])`, 'i'), m => {
    const h0 = numVal(m[1]);
    if (h0 === undefined || h0 > 12) return false;
    const min = m[2] ? numVal(m[2]) : 0;
    if (min > 59) return false;
    const pm = /^p/i.test(m[3]);
    setTime(`${String((h0 % 12) + (pm ? 12 : 0)).padStart(2, '0')}:${String(min).padStart(2, '0')}`, m);
  })
  || take(new RegExp(`\\b(?:at\\s+)?(${HOUR_RE})\\s*o[''’]?\\s?clock\\b`, 'i'), m => {
    const h = numVal(m[1]);
    if (h === undefined || h > 12) return false;
    setTime(`${String(inferHour(h)).padStart(2, '0')}:00`, m);
  })
  || take(/\b(?:at\s+)?(noon|midnight)\b/i, m => setTime(m[1].toLowerCase() === 'noon' ? '12:00' : '00:00', m))
  || take(/\b(?:by\s+)?(eod|end of (?:the )?day)\b/i, m => setTime('17:00', m))
  || take(/\b(?:at\s+)?([01]?\d|2[0-3]):([0-5]\d)\b/i, m => setTime(`${m[1].padStart(2, '0')}:${m[2]}`, m))
  || take(new RegExp(`\\bat\\s+(${HOUR_RE})\\b(?!\\s*[:/\\d])`, 'i'), m => {
    const h = numVal(m[1]);
    if (h === undefined || h < 1 || h > 12) return false;
    setTime(`${String(inferHour(h)).padStart(2, '0')}:00`, m);
  });

  // dates
  const setDue = (s, m) => { due = s; chips.push({ kind: 'date', text: m[0].trim() }); };
  if (!due) take(new RegExp(`${lead}\\btonight\\b`, 'i'), m => { setDue(today, m); if (!time) time = '20:00'; })
    || take(new RegExp(`${lead}\\b(today|now|later today)\\b`, 'i'), m => setDue(today, m))
    || take(new RegExp(`${lead}\\bday after tomorrow\\b`, 'i'), m => setDue(addDays(today, 2), m))
    || take(new RegExp(`${lead}\\b(tomorrow|tmrw|tmr)\\b`, 'i'), m => setDue(addDays(today, 1), m))
    || take(new RegExp(`${lead}\\b(\\d{4})-(\\d{2})-(\\d{2})\\b`), m => {
      const s = `${m[1]}-${m[2]}-${m[3]}`; if (isNaN(Date.parse(s))) return false; setDue(s, m);
    })
    || take(new RegExp(`${lead}\\bin\\s+(\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten)\\s+(day|week|month)s?\\b`, 'i'), m => {
      const n = { a: 1, an: 1 }[m[1].toLowerCase()] ?? numVal(m[1]);
      const unit = m[2].toLowerCase();
      setDue(unit === 'month' ? addMonths(today, n) : addDays(today, n * (unit === 'week' ? 7 : 1)), m);
    })
    || take(new RegExp(`${lead}\\bin a couple (?:of )?days\\b`, 'i'), m => setDue(addDays(today, 2), m))
    || take(new RegExp(`${lead}\\bin a fortnight\\b|\\bfortnight\\b`, 'i'), m => setDue(addDays(today, 14), m))
    || take(new RegExp(`${lead}\\bnext\\s+week\\b`, 'i'), m => setDue(nextWeekday(today, 1, true), m))
    || take(new RegExp(`${lead}\\bnext\\s+month\\b`, 'i'), m => setDue(addMonths(today, 1), m))
    || take(new RegExp(`${lead}\\bend of (?:the )?week\\b|\\beow\\b`, 'i'), m => setDue(nextWeekday(today, 5, false), m))
    || take(new RegExp(`${lead}\\bend of (?:the )?month\\b|\\beom\\b`, 'i'), m => setDue(lastDayOfMonth(today), m))
    || take(new RegExp(`${lead}\\bnext\\s+weekend\\b`, 'i'), m => setDue(nextWeekday(today, 6, true), m))
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
  return { title: title || text.trim(), due, time, duration, tier: tier ?? 3, repeat, chips };
}
