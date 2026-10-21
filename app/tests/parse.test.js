// Quest entry: everyday words, spoken numbers and repeats. Typed and spoken text use the same parser.
// Fixed "now": Wednesday 21 Oct 2026, 10:00.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuest } from '../js/parse.js';

const NOW = new Date(2026, 9, 21, 10, 0);

test('spoken times: "five thirty pm", "quarter past three", "nine thirty am"', () => {
  assert.equal(parseQuest('call mum five thirty pm', NOW).time, '17:30');
  assert.equal(parseQuest('team check-in quarter past three', NOW).time, '15:15');
  const r = parseQuest('clean room at nine thirty am', NOW);
  assert.deepEqual([r.time, r.due], ['09:30', '2026-10-22']);   // already passed today, so tomorrow
});

test('times with words: noon, end of day, o\'clock, half past', () => {
  assert.equal(parseQuest('send the form at noon', NOW).time, '12:00');
  assert.equal(parseQuest('send report end of day', NOW).time, '17:00');
  assert.equal(parseQuest('standup at 5 o\'clock', NOW).time, '17:00');
  assert.equal(parseQuest('half past eight tidy desk', NOW).time, '08:30');
});

test('dates in everyday words', () => {
  assert.equal(parseQuest('dentist on friday at four pm', NOW).due, '2026-10-23');
  assert.equal(parseQuest('pay rent by end of month', NOW).due, '2026-10-31');
  assert.equal(parseQuest('pay bill end of week', NOW).due, '2026-10-23');
  assert.equal(parseQuest('read chapter four in a fortnight', NOW).due, '2026-11-04');
  assert.equal(parseQuest('check fridge next month', NOW).due, '2026-11-21');
  assert.equal(parseQuest('plan trip next weekend', NOW).due, '2026-10-24');
  assert.equal(parseQuest('ship parcel 2026-10-30', NOW).due, '2026-10-30');
});

test('repeats: mornings, weekdays, several days, plural days', () => {
  const water = parseQuest('water plants every morning', NOW);
  assert.deepEqual([water.repeat.freq, water.due], ['daily', '2026-10-21']);
  assert.equal(parseQuest('stand up every weekday', NOW).repeat.freq, 'weekdays');
  const gym = parseQuest('gym every monday, wednesday and friday', NOW);
  assert.deepEqual(gym.repeat, { freq: 'custom', days: [1, 3, 5] });
  assert.equal(gym.due, '2026-10-21');   // today is a Wednesday, so the first gym day is today
  assert.equal(parseQuest('gym on mondays', NOW).repeat.freq, 'weekly');
  assert.equal(parseQuest('laundry every other day', NOW).repeat.freq, 'alternate');
  assert.equal(parseQuest('review budget each month', NOW).repeat.freq, 'monthly');
});

test('a plain "on friday" is a date, not a repeat', () => {
  assert.equal(parseQuest('renew passport on friday', NOW).repeat, null);
});

test('priority in words and digits', () => {
  assert.equal(parseQuest('priority two renew passport', NOW).tier, 1);
  assert.equal(parseQuest('p three call the bank', NOW).tier, 2);
  assert.equal(parseQuest('p1 call the bank', NOW).tier, 0);
});

test('everyday urgency and priority words', () => {
  assert.equal(parseQuest('buy milk asap', NOW).tier, 0);
  assert.equal(parseQuest('critical: fix the server', NOW).tier, 0);
  assert.equal(parseQuest('someday learn guitar', NOW).tier, 5);
  assert.equal(parseQuest('clean the kitchen', NOW).tier, 4);
  assert.equal(parseQuest('send the invoice', NOW).tier, 2);
  assert.equal(parseQuest('grab groceries', NOW).tier, 3);
});
