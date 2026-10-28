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

test('displayName priority: leaderboard name first, then email name, then fallback', async () => {
  // Mock account in localStorage
  globalThis.localStorage.setItem(
    'taskflow-account',
    JSON.stringify({ uid: 'u1', name: 'Original Name', email: 'aditya.dev@gmail.com' })
  );

  const { displayName } = await import('../js/account.js');

  // Case 1: Both leaderboard name and email exist -> Leaderboard name wins
  const sWithBoard = { boardName: 'SpeedRunner', name: 'Original' };
  assert.equal(displayName(sWithBoard), 'SpeedRunner', 'Leaderboard name takes 1st priority');

  // Case 2: No leaderboard name, but email exists -> Email name wins
  const sNoBoard = { boardName: '', name: 'Original' };
  assert.equal(displayName(sNoBoard), 'Aditya', 'Email name takes 2nd priority when leaderboard name is absent');

  // Case 3: Neither leaderboard name nor email exists -> settings.name wins
  globalThis.localStorage.removeItem('taskflow-account');
  const sOnlyLocal = { boardName: '', name: 'MochiFan' };
  assert.equal(displayName(sOnlyLocal), 'MochiFan', 'settings.name is fallback when no boardName or email');
});

test('settings "You" section contains option to change name', async () => {
  globalThis.localStorage.setItem(
    'taskflow-account',
    JSON.stringify({ uid: 'u1', name: 'Original Name', email: 'aditya.dev@gmail.com' })
  );

  const { init, setSetting } = await import('../js/store.js');
  init();
  setSetting('boardName', 'MasterCoder');

  const { render } = await import('../js/views/settings.js');
  const html = render();

  const youSection = html.slice(html.indexOf('<div class="sec">You</div>'), html.indexOf('<div class="sec">Every day</div>'));

  // Should have a name row
  assert.ok(youSection.includes('Name'), 'You section should have a Name row');
  assert.ok(youSection.includes('MasterCoder'), 'You section should display the current leaderboard name');
  assert.ok(youSection.includes('data-act="change-name"'), 'You section should have a change-name action button');
});
