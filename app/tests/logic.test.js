import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuest } from '../js/parse.js';
import { addDays, monthGrid, dueStatus, dueLabel, startOfWeek, addMonths } from '../js/dates.js';
import { nextDue, rollForward, occurrences } from '../js/recur.js';
import { buildICS, googleLink, rrule } from '../js/ics.js';
import { dayExp, focusExp, streaks, summary, lastDays } from '../js/stats.js';

// Thursday 22 October 2026, 10:00 local
const NOW = new Date(2026, 9, 22, 10, 0);
const T = '2026-10-22';

test('parse: weekday, time and title cleanup', () => {
  const r = parseQuest('Renew passport, due Friday at 5pm', NOW);
  assert.equal(r.title, 'Renew passport');
  assert.equal(r.due, '2026-10-23');
  assert.equal(r.time, '17:00');
  assert.equal(r.tier, 1);   // due within 2 days -> P2
});
test('parse: relative dates', () => {
  assert.equal(parseQuest('call mum tomorrow', NOW).due, '2026-10-23');
  assert.equal(parseQuest('dentist in 3 days', NOW).due, '2026-10-25');
  assert.equal(parseQuest('plan trip next week', NOW).due, '2026-10-26');
  assert.equal(parseQuest('pay rent on 1 nov', NOW).due, '2026-11-01');
  assert.equal(parseQuest('book review oct 5', NOW).due, '2027-10-05');   // passed this year -> next year
  assert.equal(parseQuest('submit form 30/10', NOW).due, '2026-10-30');
  assert.equal(parseQuest('next thursday sync', NOW).due, '2026-10-29');
  assert.equal(parseQuest('thursday sync', NOW).due, T);
});
test('parse: tonight, today and urgency', () => {
  const r = parseQuest('finish essay tonight', NOW);
  assert.deepEqual([r.due, r.time, r.tier, r.title], [T, '20:00', 0, 'finish essay']);
  assert.equal(parseQuest('urgent: reply to landlord', NOW).tier, 0);
  assert.equal(parseQuest('tidy desk', NOW).tier, 4);
  assert.equal(parseQuest('learn sourdough someday', NOW).tier, 5);
  assert.equal(parseQuest('do laundry', NOW).tier, 3);
  assert.equal(parseQuest('do laundry p2', NOW).tier, 1);
});
test('parse: a time on its own is today, or tomorrow once passed', () => {
  assert.equal(parseQuest('stand-up at 11:30', NOW).due, T);
  assert.equal(parseQuest('gym 7am', NOW).due, '2026-10-23');
});
test('parse: repeats', () => {
  const r = parseQuest('water plants every day', NOW);
  assert.deepEqual(r.repeat, { freq: 'daily' });
  assert.equal(r.due, T); assert.equal(r.title, 'water plants'); assert.equal(r.tier, 3);
  const w = parseQuest('team sync every monday 10am', NOW);
  assert.deepEqual([w.repeat.freq, w.due, w.time], ['weekly', '2026-10-26', '10:00']);
  assert.equal(parseQuest('standup weekdays', NOW).repeat.freq, 'weekdays');
  assert.equal(parseQuest('pay bills monthly', NOW).repeat.freq, 'monthly');
});
test('parse: no false matches inside words', () => {
  const r = parseQuest('Wedding gift for Satish', NOW);
  assert.equal(r.due, null); assert.equal(r.title, 'Wedding gift for Satish');
});

test('dates: grid, week start, months, status', () => {
  const g = monthGrid(2026, 9);
  assert.equal(g.length, 42); assert.equal(g[0], '2026-09-28'); assert.ok(g.includes('2026-10-31'));
  assert.equal(startOfWeek('2026-10-25'), '2026-10-19');   // Sunday -> Monday before
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(dueStatus({ due: '2026-10-21' }, NOW), 'overdue');
  assert.equal(dueStatus({ due: T, time: '09:00' }, NOW), 'overdue');
  assert.equal(dueStatus({ due: T }, NOW), 'today');
  assert.equal(dueStatus({ due: '2026-10-24' }, NOW), 'soon');
  assert.equal(dueStatus({ due: '2026-10-21', done: true }, NOW), 'today');
  assert.equal(dueLabel({ due: '2026-10-20' }, NOW), 'Overdue · 2 days');
  assert.equal(dueLabel({ due: '2026-10-23', time: '17:30' }, NOW), 'Tomorrow 5:30 pm');
});

test('recur: next due and rolling forward', () => {
  assert.equal(nextDue('2026-10-23', { freq: 'weekdays' }), '2026-10-26');   // Fri -> Mon
  assert.equal(nextDue('2026-10-22', { freq: 'weekly', interval: 2 }), '2026-11-05');
  assert.equal(nextDue('2026-10-31', { freq: 'monthly' }), '2026-11-30');
  assert.equal(rollForward('2026-10-15', { freq: 'daily' }, NOW), '2026-10-23');   // overdue habit -> tomorrow
  assert.equal(rollForward(T, { freq: 'weekly' }, NOW), '2026-10-29');
  assert.equal(rollForward('2026-10-30', { freq: 'weekly' }, NOW), '2026-11-06');   // done early -> after its own due
  assert.deepEqual(occurrences({ due: '2026-10-20', repeat: { freq: 'weekly' } }, '2026-10-01', '2026-11-10'), ['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10']);
  assert.deepEqual(occurrences({ due: '2026-10-20' }, '2026-10-21', '2026-10-30'), []);
});

test('ics: events, repeats, alarms and escaping', () => {
  const qs = [
    { id: 1, title: 'Lab report; part 2, final', tier: 0, due: '2026-10-23', time: '17:00', notes: 'Line 1\nLine 2', subtasks: [{ title: 'graphs', done: true }],
      remind: { at: +new Date(2026, 9, 23, 16, 0), offset: 3600000 }, repeat: null },
    { id: 2, title: 'Water plants', tier: 3, due: T, repeat: { freq: 'daily' } },
    { id: 3, title: 'No date', tier: 3, due: null },
    { id: 4, title: 'Done', tier: 3, due: T, done: true },
  ];
  const ics = buildICS(qs, Date.UTC(2026, 9, 22));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /SUMMARY:Lab report\\; part 2\\, final/);
  assert.match(ics, /DTSTART:20261023T170000/);
  assert.match(ics, /DESCRIPTION:Line 1\\nLine 2\\n\[x\] graphs/);
  assert.match(ics, /TRIGGER:-PT60M/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261022\r\nDTEND;VALUE=DATE:20261023/);
  assert.match(ics, /RRULE:FREQ=DAILY/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal(rrule({ freq: 'weekdays' }), 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  const g = new URL(googleLink(qs[1]));
  assert.equal(g.searchParams.get('dates'), '20261022/20261023');
  assert.equal(g.searchParams.get('recur'), 'RRULE:FREQ=DAILY');
});

test('stats: EXP, streaks and summary', () => {
  assert.equal(dayExp(3, 5), 12);   // brief: 3 of 5 = 12 EXP
  assert.equal(dayExp(5, 5), 30);
  assert.equal(focusExp(25), 5);
  const day = (d, n) => Array.from({ length: n }, (_, i) => ({ doneAt: new Date(2026, 9, d, 9, i).getTime(), tier: i % 6 }));
  const hist = [...day(17, 2), ...day(18, 2), ...day(19, 2), ...day(21, 2), ...day(22, 1)];
  const s = streaks(hist, 2, NOW);
  assert.equal(s.current, 1);      // today (1/2) still open, yesterday kept, the 20th broke it
  assert.equal(s.best, 3);
  assert.equal(s.keptToday, false);
  const sum = summary(hist, [{ minutes: 25, endedAt: NOW.getTime() }], 2, NOW);
  assert.equal(sum.totalDone, 9);
  assert.equal(sum.todayCount, 1);
  assert.equal(sum.todayExp, 10 + 5);
  assert.equal(sum.keptThisMonth, 4);
  const last = lastDays(hist, [], 2, 7, NOW);
  assert.equal(last.length, 7); assert.equal(last[6].date, T); assert.equal(last[6].count, 1);
});
