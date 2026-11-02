import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addVisit, addTime, addDepth, addTap, activeMs, readyDays, docFor, IDLE_MS } from '../js/usage.js';
import { summarize } from '../js/views/usage.js';

test('visits, time and scroll depth add up per screen and day', () => {
  const d = {};
  addVisit(d, '2026-11-01', 'home');
  addTime(d, '2026-11-01', 'home', 2500);
  addTime(d, '2026-11-01', 'home', 600);   // the half second left over is kept, not lost
  addDepth(d, '2026-11-01', 'home', 73.6);
  addVisit(d, '2026-11-01', 'home');
  addDepth(d, '2026-11-01', 'home', 140);   // clamped to 100
  assert.deepEqual(d['2026-11-01'].v.home, [2, 3, 174]);
});

test('names that are not plain identifiers, and the report screen itself, are never recorded', () => {
  const d = {};
  addVisit(d, '2026-11-01', 'Buy milk at 5pm');
  addVisit(d, '2026-11-01', 'usage');
  addTap(d, '2026-11-01', 'usage-range');
  addTap(d, '2026-11-01', '<script>');
  assert.deepEqual(d['2026-11-01'] || { v: {}, a: {} }, { v: {}, a: {} });
});

test('screens and buttons are capped so a day stays small', () => {
  const d = {};
  for (let i = 0; i < 30; i++) addVisit(d, '2026-11-01', 'v' + i);
  for (let i = 0; i < 90; i++) addTap(d, '2026-11-01', 'a' + i);
  assert.equal(Object.keys(d['2026-11-01'].v).length, 20);
  assert.equal(Object.keys(d['2026-11-01'].a).length, 60);
});

test('time stops counting when hidden or idle', () => {
  assert.equal(activeMs(0, 10_000, 0, true), 10_000);
  assert.equal(activeMs(0, 10_000, 0, false), 0);
  // last input at 0: counts only up to IDLE_MS, however long the gap
  assert.equal(activeMs(0, IDLE_MS + 60 * 60 * 1000, 0, true), IDLE_MS);
  assert.equal(activeMs(IDLE_MS + 5000, IDLE_MS + 9000, 0, true), 0);
});

test('only finished days are sent, each once; old and empty days are dropped', () => {
  const d = {};
  addVisit(d, '2026-11-02', 'home');   // today: still being counted
  addVisit(d, '2026-11-01', 'quests');
  addVisit(d, '2026-10-30', 'focus');
  addVisit(d, '2026-10-20', 'home');   // more than a week old
  d['2026-10-31'] = { v: {}, a: { add: 1 } };
  const { send, drop } = readyDays(d, '2026-11-02');
  assert.deepEqual(send, ['2026-10-30', '2026-11-01']);
  assert.deepEqual(drop.sort(), ['2026-10-20', '2026-10-31']);
  // the document holds only the day, device type and counts: nothing that identifies the person
  assert.deepEqual(Object.keys(docFor('2026-11-01', d['2026-11-01'], 'phone')).sort(), ['a', 'day', 'dev', 'v']);
});

test('the report totals many day documents and ignores junk values', () => {
  const s = summarize([
    { day: '2026-11-01', dev: 'phone', v: { home: [2, 120, 150], quests: [1, 40, 100] }, a: { add: 3 } },
    { day: '2026-11-01', dev: 'desktop', v: { home: [1, 40, 50], focus: ['x', -5, null] }, a: { add: 1, bell: '2' } },
  ]);
  assert.equal(s.totalSecs, 200);
  assert.equal(s.rows[0].name, 'home');
  assert.equal(s.rows[0].visits, 3);
  assert.equal(s.rows[0].share, 0.8);
  assert.equal(Math.round(s.rows[0].avgDepth), 67);
  assert.deepEqual(s.taps, [['add', 4], ['bell', 2]]);
  assert.deepEqual(s.dev, { phone: 1, desktop: 1 });
  assert.equal(s.days, 1);
});

test('the new files are in the offline shell and the database rule exists', () => {
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  assert.match(sw, /'js\/usage\.js'/);
  assert.match(sw, /'js\/views\/usage\.js'/);
  const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /match \/levernUsage\/\{id\}/);
  assert.match(rules, /allow update, delete: if false;/);
});
