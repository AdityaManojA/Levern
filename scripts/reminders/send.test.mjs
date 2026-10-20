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
  assert.equal(inWindow(18 * 60 + 5, '18:00'), true);
  assert.equal(inWindow(18 * 60 + 20, '18:00'), false);
  assert.equal(inWindow(0 * 60 + 0, '23:50'), true);   // wraps past midnight (10 minutes after the slot)
});

test('a deadline within the next hour gets a heads-up, once', () => {
  const quests = [{ id: 'a', title: 'Gym', due: '2026-10-20', time: '19:00', done: false }];
  const m = dueNow({ quests, tz: 'Asia/Kolkata', now: NOW });
  assert.ok(m.some(x => x.title === 'Coming up: Gym'));
});

test('the daily summary goes out at the chosen time', () => {
  const settings = { nudges: { daily: { on: true, times: ['18:00'] } } };
  const m = dueNow({ quests: [], settings, tz: 'Asia/Kolkata', now: NOW });
  assert.ok(m.some(x => x.key === 'daily-2026-10-20-18:00'));
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
