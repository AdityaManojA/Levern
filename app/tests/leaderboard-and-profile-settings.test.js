import { test } from 'node:test';
import assert from 'node:assert/strict';

// Setup browser globals for test environment
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.scrollY = 0;
globalThis.scrollX = 0;
globalThis.scrollTo = () => {};
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (cb => setTimeout(cb, 0));
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false, addEventListener: () => {} }));
globalThis.location = globalThis.location || { origin: 'http://localhost', pathname: '/', hash: '#/leaderboard' };
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

test('leaderboard: "Show me on the board" is outside and below the Settings panel', async () => {
  const { init } = await import('../js/store.js');
  init();
  const { render } = await import('../js/views/leaderboard.js');
  const html = render();

  const detailsOpenTag = '<details class="card lb-settings"';
  const detailsCloseTag = '</details>';

  const detailsIdx = html.indexOf(detailsOpenTag);
  const closeDetailsIdx = html.indexOf(detailsCloseTag, detailsIdx);
  const showOnBoardIdx = html.indexOf('data-act="lb-toggle"');
  const publicProfileIdx = html.indexOf('data-act="lb-public"');

  assert.ok(detailsIdx !== -1, 'Settings details panel should exist');
  assert.ok(closeDetailsIdx !== -1, 'Settings details closing tag should exist');
  assert.ok(showOnBoardIdx !== -1, '"Show me on the board" toggle should exist');
  assert.ok(publicProfileIdx !== -1, '"Make my profile public" toggle should exist in settings');

  // "Make my profile public" should be inside the details panel
  assert.ok(publicProfileIdx > detailsIdx && publicProfileIdx < closeDetailsIdx, '"Make my profile public" should remain inside the Settings dropdown');

  // "Show me on the board" must be OUTSIDE and BELOW the details panel
  assert.ok(showOnBoardIdx > closeDetailsIdx, '"Show me on the board" must be outside and below the Settings dropdown panel');
});

test('profile view: renders interactive "Make my profile public" toggle for own profile', async () => {
  const { init, setSetting } = await import('../js/store.js');
  init();
  setSetting('profilePublic', false);

  const profileView = await import('../js/views/profile.js');
  assert.ok(profileView.actions && typeof profileView.actions['pf-public'] === 'function', 'profile view should export pf-public action');

  // Initial call triggers async load
  profileView.render({ id: 'me' });

  // Wait a tick for load('me') to complete
  await new Promise(r => setTimeout(r, 50));

  // Render loaded profile
  const html = profileView.render({ id: 'me' });

  // Should contain toggle with pf-public
  assert.ok(html.includes('data-act="pf-public"'), 'Profile view should render toggle with data-act="pf-public"');
  assert.ok(html.includes('Make my profile public'), 'Profile view should include "Make my profile public" text');
  assert.ok(html.includes('aria-checked="false"'), 'Toggle should reflect profilePublic state');
});
