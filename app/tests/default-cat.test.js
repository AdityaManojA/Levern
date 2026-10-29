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

test('default cat: Cookie is default on fresh setup, switchable to Mochi in settings', async () => {
  const { init, getState, setSetting } = await import('../js/store.js');
  const { memoryAdapter } = await import('../js/storage.js');
  const { catLabel, COATS } = await import('../js/mochi.js');
  const { coatNow, catName } = await import('../js/views/settings.js');
  const { mine } = await import('../js/profile.js');

  // Initialize with empty/fresh storage
  init(memoryAdapter());
  const st = getState();

  // 1. Default must be Cookie
  assert.equal(st.settings.mochiColor, 'cookie', 'Default mochiColor setting should be "cookie"');
  assert.equal(catLabel(), 'Cookie', 'catLabel() should default to Cookie');
  assert.equal(coatNow(st.settings), 'cookie', 'coatNow() should resolve to cookie by default');
  assert.equal(catName(st.settings), 'Cookie', 'catName() should resolve to Cookie by default');
  assert.equal(mine().cat, 'cookie', 'mine().cat should default to cookie');

  // 2. Switch to Mochi
  setSetting('mochiColor', 'black');
  const mochiSt = getState();
  assert.equal(mochiSt.settings.mochiColor, 'black');
  assert.equal(catLabel(), 'Mochi');
  assert.equal(coatNow(mochiSt.settings), 'black');
  assert.equal(catName(mochiSt.settings), 'Mochi');
  assert.equal(mine().cat, 'mochi');

  // 3. Switch back to Cookie
  setSetting('mochiColor', 'cookie');
  const cookieSt = getState();
  assert.equal(cookieSt.settings.mochiColor, 'cookie');
  assert.equal(catLabel(), 'Cookie');
  assert.equal(coatNow(cookieSt.settings), 'cookie');
  assert.equal(catName(cookieSt.settings), 'Cookie');
  assert.equal(mine().cat, 'cookie');

  // 4. COATS configuration
  assert.ok(COATS.cookie, 'COATS must contain cookie');
  assert.ok(COATS.black, 'COATS must contain black (Mochi)');
  assert.equal(COATS.cookie.label, 'Cookie');
  assert.equal(COATS.black.label, 'Mochi');
});
