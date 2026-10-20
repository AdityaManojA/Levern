// Run with: node --test alerts.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dueNow } from './send.mjs';
import { alertsOf, alertMoment, cleanAlerts, alertLabel, DEFAULT_ALERTS } from '../../app/js/alerts.js';

const q = (over) => ({ id: 'q1', title: 'Pay rent', tier: 3, due: '2026-10-20', time: '18:15', done: false, alerts: DEFAULT_ALERTS.slice(), ...over });
const at = iso => Date.parse(iso);   // the tz below is UTC, so local time = UTC here

test('a new quest reminds at its due time by default', () => {
  const quest = q({});
  assert.deepEqual(quest.alerts, [0]);
  assert.equal(dueNow({ quests: [quest], tz: 'UTC', now: at('2026-10-20T18:15:00Z') }).length, 1);
  assert.equal(dueNow({ quests: [quest], tz: 'UTC', now: at('2026-10-20T18:10:00Z') }).length, 0);
});

test('several reminders before the due time each go off once, at their moment', () => {
  const quest = q({ alerts: [60, 15, 0] });
  const hour = dueNow({ quests: [quest], tz: 'UTC', now: at('2026-10-20T17:15:00Z') });
  assert.deepEqual(hour.map(m => m.key), ['alert-q1-2026-10-20-18:15-60']);
  // a late run still catches the reminders it missed (the sent keys stop a second send)
  const quarter = dueNow({ quests: [quest], tz: 'UTC', now: at('2026-10-20T18:00:00Z') });
  assert.deepEqual(quarter.map(m => m.key), ['alert-q1-2026-10-20-18:15-60', 'alert-q1-2026-10-20-18:15-15']);
  assert.deepEqual(dueNow({ quests: [quest], tz: 'UTC', now: at('2026-10-20T18:15:00Z') }).map(m => m.key), ['alert-q1-2026-10-20-18:15-15', 'now-q1-2026-10-20-18:15']);   // the hour-before one is now an hour late: past the catch-up
});

test('quests with their own alerts are not given the priority lead-ups too', () => {
  const quest = q({ tier: 0, time: '18:20', alerts: [] });   // P1, but the person turned its reminders off
  assert.deepEqual(dueNow({ quests: [quest], tz: 'UTC', now: at('2026-10-20T18:05:00Z') }), []);
});

test('an alert can fall on the day before the due date', () => {
  const quest = q({ due: '2026-10-21', time: '00:10', alerts: [1440] });
  assert.deepEqual(alertMoment('2026-10-21', '00:10', 1440), { date: '2026-10-20', minutes: 10 });
  assert.equal(dueNow({ quests: [quest], tz: 'UTC', now: at('2026-10-20T00:08:00Z') }).length, 0);   // not yet
  assert.equal(dueNow({ quests: [quest], tz: 'UTC', now: at('2026-10-20T00:11:00Z') }).length, 1);
});

test('alerts are cleaned and labelled', () => {
  assert.deepEqual(cleanAlerts([60, 15, 15, -5, 'x', 60 * 24 * 30]), [15, 60]);
  assert.equal(alertLabel(0), 'At due time');
  assert.equal(alertLabel(1), '1 min before');
  assert.equal(alertLabel(120), '2 hours before');
  assert.equal(alertLabel(1440), '1 day before');
  assert.equal(alertsOf(q({ alerts: [15] }))[0].m, 15);
});
