import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuest } from '../js/parse.js';
import { dueTimestamp, dueStatus, fmtDuration } from '../js/dates.js';
import { buildICS, googleLink } from '../js/ics.js';
import { CHANGELOG } from '../js/changelog.js';
import { newer, unseen } from '../js/updatepop.js';

// Base time: Tuesday 27 Oct 2026, 06:00:00 local
const BASE_DATE = '2026-10-27';
const T_0600 = new Date(2026, 9, 27, 6, 0, 0);
const T_0730 = new Date(2026, 9, 27, 7, 30, 0);
const T_0855 = new Date(2026, 9, 27, 8, 55, 0);
const T_0905 = new Date(2026, 9, 27, 9, 5, 0);

test('parse: extracts duration in hours and minutes', () => {
  // User voice example: "gym at 7 for 2 hours"
  const q1 = parseQuest('go to the gym at 7 for 2 hours', T_0600);
  assert.equal(q1.time, '07:00');
  assert.equal(q1.duration, 120);
  assert.equal(q1.title, 'go to the gym');
  assert.ok(q1.chips.some(c => c.kind === 'duration' && c.text.includes('2 hours')));

  // Minutes format: "study session at 3pm for 45 mins"
  const q2 = parseQuest('study session at 3pm for 45 mins', T_0600);
  assert.equal(q2.time, '15:00');
  assert.equal(q2.duration, 45);
  assert.equal(q2.title, 'study session');

  // Short units: "deep work for 1h"
  const q3 = parseQuest('deep work for 1h', T_0600);
  assert.equal(q3.duration, 60);

  // Fractional and compound: "reading for 1.5 hours"
  const q4 = parseQuest('reading for 1.5 hours', T_0600);
  assert.equal(q4.duration, 90);

  // "half an hour"
  const q5 = parseQuest('stretch for half an hour', T_0600);
  assert.equal(q5.duration, 30);

  // Avoid false positives on personal names or words
  const q6 = parseQuest('gift for Mom', T_0600);
  assert.equal(q6.duration, null);
  assert.equal(q6.title, 'gift for Mom');
});

test('dates: fmtDuration formats minutes to friendly string', () => {
  assert.equal(fmtDuration(120), '2h');
  assert.equal(fmtDuration(45), '45m');
  assert.equal(fmtDuration(90), '1h 30m');
  assert.equal(fmtDuration(0), '');
  assert.equal(fmtDuration(null), '');
});

test('dates: dueTimestamp extends by quest duration', () => {
  const plain = { due: BASE_DATE, time: '07:00' };
  const withDur = { due: BASE_DATE, time: '07:00', duration: 120 };

  const plainDeadline = dueTimestamp(plain);
  const withDurDeadline = dueTimestamp(withDur);

  assert.equal(withDurDeadline - plainDeadline, 120 * 60000);
});

test('dates: overdue flag is delayed until duration elapses (avoiding late penalty)', () => {
  const gymQuest = { due: BASE_DATE, time: '07:00', duration: 120, done: false };

  // At 07:30 (during gym): should still be 'today', NOT 'overdue'
  assert.equal(dueStatus(gymQuest, T_0730), 'today');

  // At 08:55 (still within 2 hours): should still be 'today'
  assert.equal(dueStatus(gymQuest, T_0855), 'today');

  // At 09:05 (past 2 hours from 07:00): should now be flagged 'overdue'
  assert.equal(dueStatus(gymQuest, T_0905), 'overdue');

  // Compare with a quest having no duration (due at 07:00): at 07:30 it is already overdue
  const noDurQuest = { due: BASE_DATE, time: '07:00', done: false };
  assert.equal(dueStatus(noDurQuest, T_0730), 'overdue');
});

test('store: completing within duration window avoids late penalty', async () => {
  const S = await import('../js/store.js');
  const { memoryAdapter } = await import('../js/storage.js');
  S.init(memoryAdapter());

  const q = S.addQuest({
    title: 'Morning Gym',
    due: BASE_DATE,
    time: '07:00',
    duration: 120,
    tier: 1,
  });

  assert.equal(q.duration, 120);

  // Toggle done while mocking time at 07:30 (within 2h window)
  const realNow = Date.now;
  try {
    Date.now = () => T_0730.getTime();
    const res = S.toggleDone(q.id);
    assert.equal(res.done, true);
    assert.equal(res.late, false); // No late penalty!

    const hist = S.getState().history.find(h => h.questId === q.id);
    assert.ok(hist);
    assert.equal(hist.late, undefined); // Not late
  } finally {
    Date.now = realNow;
  }
});

test('calendars: ics and googleLink reflect quest duration', () => {
  const q = { id: 'gym123', title: 'Gym Workout', due: BASE_DATE, time: '07:00', duration: 120, tier: 1 };
  const ics = buildICS([q], T_0600.getTime());
  assert.match(ics, /DTSTART:20261027T070000/);
  assert.match(ics, /DTEND:20261027T090000/);

  const g = googleLink(q);
  assert.match(g, /20261027T070000%2F20261027T090000|20261027T070000\/20261027T090000/);
});

test('changelog & updatepop: version 1.10 announces duration and notifies once per user per update', () => {
  const top = CHANGELOG[0];
  assert.equal(top.v, '1.10');
  assert.match(top.title.toLowerCase(), /duration/);

  assert.equal(newer('1.10', '1.09'), true);
  assert.equal(newer('1.10', '1.10'), false);

  const missing = unseen('1.09');
  assert.equal(missing[0].v, '1.10');

  // Once marked seen, unseen returns empty
  const seenAfter = unseen('1.10');
  assert.equal(seenAfter.length, 0);
});

test('reload update notification: triggers once on reload, never again for the same update', async () => {
  const { maybeShowUpdate } = await import('../js/updatepop.js');
  const S = await import('../js/store.js');
  const { memoryAdapter } = await import('../js/storage.js');
  S.init(memoryAdapter({ v: 3, quests: [], history: [], sessions: [], settings: { updateSeen: '1.09' }, onboarded: true }));

  // Simulate browser environment localStorage
  const memStore = new Map();
  memStore.set('levern-update-seen', '1.09');
  globalThis.localStorage = {
    getItem: k => memStore.get(k) || null,
    setItem: (k, v) => memStore.set(k, String(v)),
    removeItem: k => memStore.delete(k),
  };
  globalThis.document = {
    createElement: () => ({
      className: '',
      setAttribute: () => {},
      addEventListener: () => {},
      querySelector: () => ({ focus: () => {} }),
      classList: { add: () => {}, remove: () => {} },
      remove: () => {},
    }),
    body: { append: () => {} },
    addEventListener: () => {},
    removeEventListener: () => {},
  };
  globalThis.requestAnimationFrame = fn => fn();

  // First reload: update has not been seen for v1.10 -> returns true and shows notification
  const firstReload = maybeShowUpdate({ onboardingOpen: false, force: true });
  assert.equal(firstReload, true);
  assert.equal(memStore.get('levern-update-seen'), '1.10');

  // Subsequent reload: already marked seen -> returns false and does NOT show again
  const secondReload = maybeShowUpdate({ onboardingOpen: false, force: true });
  assert.equal(secondReload, false);
});
