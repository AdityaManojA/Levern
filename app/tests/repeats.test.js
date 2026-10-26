// Yearly repeats, monthly and yearly repeats that keep to their date, and the Focus timer's "until".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextDue, anchored, describe, occurrences, REPEATS } from '../js/recur.js';
import { rrule } from '../js/ics.js';
import { parseQuest } from '../js/parse.js';
import { minutesUntil } from '../js/dates.js';

const run = (due, r, n) => { const out = []; for (let i = 0; i < n; i++) out.push(due = nextDue(due, r)); return out; };

test('a monthly repeat on the 31st keeps to the 31st (or the last day), never drifting', () => {
  const r = anchored({ freq: 'monthly' }, '2026-01-31');
  assert.deepEqual(r, { freq: 'monthly', day: 31 });
  assert.deepEqual(run('2026-01-31', r, 5), ['2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31', '2026-06-30']);
});

test('yearly repeats: every year on the same date, 29 Feb on the 28th in other years', () => {
  assert.ok(REPEATS.some(([k]) => k === 'yearly'));
  assert.deepEqual(run('2026-03-03', anchored({ freq: 'yearly' }, '2026-03-03'), 2), ['2027-03-03', '2028-03-03']);
  assert.deepEqual(run('2028-02-29', anchored({ freq: 'yearly' }, '2028-02-29'), 4), ['2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
  assert.deepEqual(occurrences({ due: '2026-03-03', repeat: { freq: 'yearly' } }, '2026-01-01', '2028-12-31'), ['2026-03-03', '2027-03-03', '2028-03-03']);
});

test('repeats made before anchoring (no day) still repeat on the due date', () => {
  assert.equal(nextDue('2026-03-15', { freq: 'monthly' }), '2026-04-15');
  assert.equal(nextDue('2026-03-15', { freq: 'yearly' }), '2027-03-15');
  assert.deepEqual(anchored({ freq: 'weekly' }, '2026-03-15'), { freq: 'weekly' });
});

test('the repeat says which date it keeps to', () => {
  assert.equal(describe(anchored({ freq: 'monthly' }, '2026-03-02'), '2026-03-02'), 'Every month on the 2nd');
  assert.equal(describe({ freq: 'monthly' }, '2026-03-31'), 'Every month on the 31st (or its last day)');
  assert.equal(describe({ freq: 'yearly' }, '2026-03-03'), 'Every year on 3 Mar');
  assert.equal(describe({ freq: 'monthly' }), 'Every month');
});

test('calendars get the same dates', () => {
  assert.equal(rrule(anchored({ freq: 'monthly' }, '2026-01-31')), 'FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1');
  assert.equal(rrule(anchored({ freq: 'monthly' }, '2026-01-15')), 'FREQ=MONTHLY');
  assert.equal(rrule(anchored({ freq: 'yearly' }, '2028-02-29')), 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=28,29;BYSETPOS=-1');
  assert.equal(rrule(anchored({ freq: 'yearly' }, '2026-03-29')), 'FREQ=YEARLY');
});

test('"every year" and "annually" are understood when typing a quest', () => {
  const now = new Date(2026, 9, 25);
  assert.deepEqual(parseQuest('Pay car insurance every year', now).repeat, { freq: 'yearly' });
  assert.deepEqual(parseQuest('renew domain annually', now).repeat, { freq: 'yearly' });
});

test('focus "until": minutes to that time today, or tomorrow once it has passed', () => {
  const now = new Date(2026, 9, 25, 14, 20, 30);
  assert.equal(minutesUntil('15:00', now), 39.5);
  assert.equal(minutesUntil('14:00', now), 23 * 60 + 39.5);
});
