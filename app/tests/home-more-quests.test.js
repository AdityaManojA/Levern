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

test('home: moreLink directs to all quests with data-act="more-quests" and href="#/quests?filter=all"', async () => {
  const { init, commit } = await import('../js/store.js');
  init();

  // Create 8 open quests so that 5 are displayed and 3 more remain
  const quests = Array.from({ length: 8 }, (_, i) => ({
    id: 'q-' + i,
    title: 'Quest ' + (i + 1),
    done: false,
    tier: 1,
    createdAt: Date.now() - i * 1000,
    updatedAt: Date.now() - i * 1000,
    subtasks: []
  }));

  commit(s => { s.quests = quests; });

  const { render } = await import('../js/views/home.js');
  const html = render();

  assert.ok(html.includes('class="more-q"'), 'Should render .more-q when > 5 open quests');
  assert.ok(html.includes('+3 more quests'), 'Should show "+3 more quests"');
  assert.ok(html.includes('data-act="more-quests"'), '.more-q must have data-act="more-quests" for tap handling');
  assert.ok(html.includes('href="#/quests?filter=all"'), '.more-q must direct to #/quests?filter=all');
});

test('home: top "All quests" header link also directs to #/quests?filter=all with data-act="more-quests"', async () => {
  const { render } = await import('../js/views/home.js');
  const html = render();
  assert.ok(html.includes('href="#/quests?filter=all"'), 'Top "All quests" link should direct to all quests');
  assert.ok(html.includes('data-act="more-quests">All quests</a>'), 'Top "All quests" link should have data-act="more-quests"');
});
