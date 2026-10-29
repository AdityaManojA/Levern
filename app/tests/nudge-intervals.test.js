import { test } from 'node:test';
import assert from 'node:assert/strict';

// Set up mock browser environment
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false, addEventListener: () => {} }));
globalThis.location = globalThis.location || { origin: 'http://localhost', pathname: '/', hash: '#/home' };
globalThis.window = globalThis.window || {
  addEventListener: () => {},
  matchMedia: globalThis.matchMedia,
  location: globalThis.location,
  navigator: globalThis.navigator,
};
globalThis.document = globalThis.document || {
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener: () => {},
  documentElement: { dataset: {} },
};
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};

test('nudges: generateIntervalTimes generates correct fixed intervals between start and end time', async () => {
  const { generateIntervalTimes } = await import('../js/nudges.js');

  // 10:00 to 12:00 every 60 min -> 10:00, 11:00, 12:00
  assert.deepEqual(generateIntervalTimes('10:00', '12:00', 60), ['10:00', '11:00', '12:00']);

  // 10:00 to 12:00 every 30 min -> 10:00, 10:30, 11:00, 11:30, 12:00
  assert.deepEqual(generateIntervalTimes('10:00', '12:00', 30), ['10:00', '10:30', '11:00', '11:30', '12:00']);

  // 10:00 to 00:00 (midnight) every 120 min (2 hours)
  assert.deepEqual(generateIntervalTimes('10:00', '00:00', 120), [
    '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00', '00:00'
  ]);

  // Overnight wrapping (23:00 to 01:00 every 60 min)
  assert.deepEqual(generateIntervalTimes('23:00', '01:00', 60), ['23:00', '00:00', '01:00']);
});

test('nudges: setNudge configures optional interval mode for water, eat, and walk', async () => {
  const { init } = await import('../js/store.js');
  const { memoryAdapter } = await import('../js/storage.js');
  const { nudgeSettings, setNudge, occurrences } = await import('../js/nudges.js');

  init(memoryAdapter());

  // Default is specific times mode
  const defaults = nudgeSettings();
  assert.equal(defaults.water.intervalMode, false);

  // Configure water with interval mode from 10:00 to 12:00 every 60m
  setNudge('water', {
    on: true,
    intervalMode: true,
    interval: 60,
    start: '10:00',
    end: '12:00',
  });

  const waterSet = nudgeSettings().water;
  assert.equal(waterSet.on, true);
  assert.equal(waterSet.intervalMode, true);
  assert.equal(waterSet.interval, 60);
  assert.equal(waterSet.start, '10:00');
  assert.equal(waterSet.end, '12:00');
  assert.deepEqual(waterSet.times, ['10:00', '11:00', '12:00']);

  // Check occurrences produces events at 10:00, 11:00, 12:00
  const from = new Date(2026, 9, 29, 0, 0, 0).getTime();
  const to = new Date(2026, 9, 29, 23, 59, 59).getTime();
  const occs = occurrences(from, to).filter(o => o.kind === 'water');
  assert.equal(occs.length, 3);
  assert.equal(new Date(occs[0].at).getHours(), 10);
  assert.equal(new Date(occs[1].at).getHours(), 11);
  assert.equal(new Date(occs[2].at).getHours(), 12);

  // Configure eat with interval mode from 08:00 to 20:00 every 4 hours (240 min)
  setNudge('eat', {
    on: true,
    intervalMode: true,
    interval: 240,
    start: '08:00',
    end: '20:00',
  });
  const eatSet = nudgeSettings().eat;
  assert.equal(eatSet.intervalMode, true);
  assert.deepEqual(eatSet.times, ['08:00', '12:00', '16:00', '20:00']);

  // Configure walk with interval mode from 10:00 to 18:00 every 2 hours (120 min)
  setNudge('walk', {
    on: true,
    intervalMode: true,
    interval: 120,
    start: '10:00',
    end: '18:00',
  });
  const walkSet = nudgeSettings().walk;
  assert.equal(walkSet.intervalMode, true);
  assert.deepEqual(walkSet.times, ['10:00', '12:00', '14:00', '16:00', '18:00']);
});

test('nudges editor: renders interval mode options and time range inputs for water, eat, and walk', async () => {
  const { init } = await import('../js/store.js');
  const { memoryAdapter } = await import('../js/storage.js');
  const { editor, setNudge } = await import('../js/nudges.js');

  init(memoryAdapter());
  setNudge('water', { on: true, intervalMode: false });

  // Renders mode selector
  const html = editor();
  assert.ok(html.includes('data-nudge-mode="water"'), 'Should render mode switch for water');
  assert.ok(html.includes('data-mode="times"'));
  assert.ok(html.includes('data-mode="interval"'));

  // When interval mode is turned on for water
  setNudge('water', { on: true, intervalMode: true, interval: 60, start: '10:00', end: '12:00' });
  const intervalHtml = editor();
  assert.ok(intervalHtml.includes('data-nudge-interval="water"'), 'Should render interval select');
  assert.ok(intervalHtml.includes('data-nudge-start="water"'), 'Should render start time input');
  assert.ok(intervalHtml.includes('data-nudge-end="water"'), 'Should render end time input');
  assert.ok(intervalHtml.includes('value="10:00"'));
  assert.ok(intervalHtml.includes('value="12:00"'));
});
