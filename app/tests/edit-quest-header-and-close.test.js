import { test } from 'node:test';
import assert from 'node:assert/strict';

// Setup browser globals for test environment
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (cb => setTimeout(cb, 0));
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false, addEventListener: () => {} }));
globalThis.location = globalThis.location || { origin: 'http://localhost', pathname: '/', hash: '#/quests' };
if (globalThis.navigator) {
  try {
    Object.defineProperty(globalThis.navigator, 'onLine', { value: true, configurable: true, writable: true });
  } catch (e) {}
}
globalThis.window = globalThis.window || {
  addEventListener: () => {},
  matchMedia: globalThis.matchMedia,
  location: globalThis.location,
  navigator: globalThis.navigator,
};
const mockView = { innerHTML: '', querySelectorAll: () => [], animate: () => ({ finished: Promise.resolve() }) };
globalThis.document = globalThis.document || {
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => mockView,
  addEventListener: () => {},
  documentElement: { dataset: {}, classList: { add: () => {}, remove: () => {} } },
};
globalThis.document.getElementById = () => mockView;
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};

test('questPanel: renders Close button right next to Edit button in expanded card', async () => {
  const { questPanel } = await import('../js/views/common.js');
  const dummyQuest = { id: 'q123', title: 'Test Quest', tier: 2, subtasks: [] };
  const html = questPanel(dummyQuest);

  assert.ok(html.includes('data-act="open"'), 'Should contain Edit button (data-act="open")');
  assert.ok(html.includes('data-act="expand"'), 'Should contain Close button (data-act="expand")');
  assert.ok(html.includes('Close'), 'Should display "Close" text on the button next to Edit');

  // Verify Close button is inside qx-acts
  const qxActsIdx = html.indexOf('class="qx-acts"');
  const editIdx = html.indexOf('data-act="open"');
  const closeIdx = html.indexOf('data-act="expand"');

  assert.ok(qxActsIdx !== -1, 'qx-acts container should exist');
  assert.ok(editIdx > qxActsIdx, 'Edit button should be inside qx-acts');
  assert.ok(closeIdx > qxActsIdx, 'Close button should be inside qx-acts');
});

test('detail view: renders top header with Close, Edit quest title, and direct top Save button', async () => {
  const { init, commit } = await import('../js/store.js');
  init();
  commit(s => {
    s.quests = [{ id: 'q-edit-1', title: 'Edit Me', tier: 2, subtasks: [], createdAt: Date.now() }];
  });

  const { render, actions } = await import('../js/views/detail.js');
  const html = render({ id: 'q-edit-1' });

  // Top header elements
  assert.ok(html.includes('Edit quest'), 'Header should say "Edit quest"');
  assert.ok(html.includes('sheet-close') || html.includes('aria-label="Close"'), 'Should have top Close button');
  assert.ok(html.includes('data-act="save-detail"'), 'Should have direct top Save button');

  // Action test
  assert.ok(actions && typeof actions['save-detail'] === 'function', 'Should export save-detail action');
});
