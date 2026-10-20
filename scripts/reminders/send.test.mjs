// Run: node --test scripts/reminders/send.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { localParts, inWindow, dueNow, decodeDoc } from './send.mjs';

// 2026-10-20 18:05 in Asia/Kolkata (UTC+5:30) is 12:35 UTC
const NOW = Date.UTC(2026, 9, 20, 12, 35);

test('local time follows the person’s time zone', () => {
  const p = localParts(NOW, 'Asia/Kolkata');
  assert.equal(p.date, '2026-10-20');
  assert.equal(p.hm, '18:05');
});

test('a slot is handled by exactly one 15-minute window', () => {
  assert.equal(inWindow(18 * 60 + 2, '18:00'), true);
  assert.equal(inWindow(18 * 60 + 10, '18:00'), false);
  assert.equal(inWindow(0 * 60 + 0, '23:58'), true);   // wraps past midnight (2 minutes after the slot)
});

test('a P1 deadline gets its reminders at 20, 15, 10 and 5 minutes before', () => {
  // NOW is 18:05 local; a 18:20 deadline is 15 minutes away
  const quests = [{ id: 'a', title: 'Gym', due: '2026-10-20', time: '18:20', tier: 0, done: false }];
  const m = dueNow({ quests, tz: 'Asia/Kolkata', now: NOW });
  assert.ok(m.some(x => x.title === 'Due in 15 min: Gym'));
  assert.equal(m.filter(x => x.title.startsWith('Due in')).length, 1);
});

test('a P5 deadline gets no lead reminders', () => {
  const quests = [{ id: 'a', title: 'Someday', due: '2026-10-20', time: '18:20', tier: 4, done: false }];
  assert.equal(dueNow({ quests, tz: 'Asia/Kolkata', now: NOW }).filter(x => x.title.startsWith('Due in')).length, 0);
});

test('the most important reminder comes first', () => {
  const quests = [
    { id: 'low', title: 'Low', due: '2026-10-20', time: '18:20', tier: 3, done: false },
    { id: 'top', title: 'Top', due: '2026-10-20', time: '18:20', tier: 0, done: false },
  ];
  const m = dueNow({ quests, tz: 'Asia/Kolkata', now: NOW });
  assert.equal(m[0].title, 'Due in 15 min: Top');
});

test('the daily summary goes out at the chosen time', () => {
  const settings = { nudges: { daily: { on: true, times: ['18:03'] } } };
  const m = dueNow({ quests: [], settings, tz: 'Asia/Kolkata', now: NOW });
  assert.ok(m.some(x => x.key === 'daily-2026-10-20-18:03'));
});

test('a done quest never produces a message', () => {
  const quests = [{ id: 'a', title: 'Gym', due: '2026-10-20', time: '18:00', done: true }];
  assert.equal(dueNow({ quests, tz: 'Asia/Kolkata', now: NOW }).length, 0);
});

test('the saved chunks decode back to the same document', () => {
  const doc = { quests: [{ id: 'x', title: 'Water' }], settings: {} };
  const z = deflateRawSync(Buffer.from(JSON.stringify(doc)));
  assert.deepEqual(decodeDoc([z], true), doc);
});
