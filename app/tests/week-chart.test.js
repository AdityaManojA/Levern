import { test } from 'node:test';
import assert from 'node:assert/strict';

// Setup mock browser environment
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

test('week-chart: renders animated weekly chart card with headers and goal target', async () => {
  const { init, commit } = await import('../js/store.js');
  init();

  const now = Date.now();
  // Add some history quests: 3 done 6 days ago (hit target of 3), 1 done yesterday
  const history = [
    { doneAt: now - 6 * 86400000, tier: 1 },
    { doneAt: now - 6 * 86400000, tier: 2 },
    { doneAt: now - 6 * 86400000, tier: 3 },
    { doneAt: now - 1 * 86400000, tier: 2 },
  ];
  commit(s => {
    s.history = history;
    s.settings.target = 3;
  });

  const { render } = await import('../js/views/home.js');
  const html = render();

  assert.ok(html.includes('class="card week-card"'), 'Should render .week-card container');
  assert.ok(html.includes('class="week-title"'), 'Should render .week-title');
  assert.ok(html.includes('Quests done this week'), 'Should have title "Quests done this week"');
  assert.ok(html.includes('class="week-badge"'), 'Should render .week-badge with total done');
  assert.ok(html.includes('class="week-target-line"'), 'Should render .week-target-line');
  assert.ok(html.includes('class="week-target-pill"'), 'Should render .week-target-pill');
  assert.ok(html.includes('Goal 3 🎯'), 'Target pill should show goal target with 🎯');
});

test('week-chart: renders 7 day columns with correct hit, zero, star, and today indicators', async () => {
  const { init, commit } = await import('../js/store.js');
  init();

  const now = Date.now();
  const history = [
    { doneAt: now - 6 * 86400000, tier: 1 },
    { doneAt: now - 6 * 86400000, tier: 2 },
    { doneAt: now - 6 * 86400000, tier: 3 },
  ];
  commit(s => {
    s.history = history;
    s.settings.target = 3;
  });

  const { render } = await import('../js/views/home.js');
  const html = render();

  assert.ok(html.includes('class="week-star"'), 'Should render .week-star on days meeting the target');
  assert.ok(html.includes('★'), 'Star element should display ★ icon');
  assert.ok(html.includes('class="today-pip"'), 'Should highlight today with .today-pip');
  assert.ok(html.includes('class="week-tip"'), 'Should render interactive .week-tip tooltips');
  assert.ok(html.includes('is-today'), 'Should mark the today column with is-today');
  assert.ok(html.includes('zero'), 'Should render .zero for empty days');
});
