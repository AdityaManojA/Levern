import { test } from 'node:test';
import assert from 'node:assert/strict';

// Setup browser globals for test environment
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false, addEventListener: () => {} }));
globalThis.location = globalThis.location || { origin: 'http://localhost', pathname: '/', hash: '#/settings' };
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

test('settings layout: "Every day" is above Theme/Look section, and "Cat" is below Theme/Look section', async () => {
  const { init } = await import('../js/store.js');
  init();
  const { render } = await import('../js/views/settings.js');
  const html = render();

  // Find index positions of sections in rendered HTML
  const everydayIdx = html.indexOf('Every day');
  const lookIdx = html.indexOf('<div class="sec">Look</div>');
  const themeCardIdx = html.indexOf('class="card theme-section"');
  const catIdx = html.indexOf('<div class="sec">Cat</div>');

  assert.ok(everydayIdx !== -1, '"Every day" section should exist');
  assert.ok(lookIdx !== -1, '"Look" section should exist');
  assert.ok(themeCardIdx !== -1, 'Theme card should exist');
  assert.ok(catIdx !== -1, '"Cat" section should exist');

  // "Every day" must be above "Look"
  assert.ok(
    everydayIdx < lookIdx,
    `"Every day" (idx ${everydayIdx}) should be above "Look" (idx ${lookIdx})`
  );

  // "Cat" must be below Theme card
  assert.ok(
    catIdx > themeCardIdx,
    `"Cat" (idx ${catIdx}) should be below Theme card (idx ${themeCardIdx})`
  );
});

test('settings "Your data": structured, easy-to-read layout with clear rows and safe danger distinction', async () => {
  const { init } = await import('../js/store.js');
  init();
  const { render } = await import('../js/views/settings.js');
  const html = render();

  const yourDataSnippet = html.slice(html.indexOf('<div class="sec">Your data</div>'));

  // Should have individual structured rows (.srow) with descriptions
  assert.ok(yourDataSnippet.includes('Export backup'), 'Has Export backup');
  assert.ok(yourDataSnippet.includes('Import backup'), 'Has Import backup');
  assert.ok(yourDataSnippet.includes('Clear done quests'), 'Has Clear done quests');
  assert.ok(yourDataSnippet.includes('Reset everything'), 'Has Reset everything');

  // Distinct danger button styling for reset
  assert.ok(
    yourDataSnippet.includes('danger-mini') && yourDataSnippet.includes('data-act="reset"'),
    'Reset everything button must use danger-mini styling for clear visual separation'
  );

  // Must not have the old clustered row-btns container with 5 lumped buttons
  assert.ok(
    !yourDataSnippet.includes('<div class="row-btns"><button class="btn white sm" data-act="export">'),
    'Old clustered buttons in Your Data should be replaced with clean structured rows'
  );
});

test('offline cloud readiness: immediately ready when offline so quests show without blocking', async () => {
  // Simulate signed-in account in localStorage
  globalThis.localStorage.setItem('taskflow-account', JSON.stringify({ uid: 'test-user', email: 'test@example.com' }));
  
  // Set offline
  Object.defineProperty(globalThis.navigator, 'onLine', { value: false, configurable: true, writable: true });

  const { cloudReady, syncNow, cloudInfo } = await import('../js/cloud.js');

  // When offline, cloudReady must be immediately true so main.js does not block showing quests
  assert.equal(cloudReady(), true, 'cloudReady() must be true immediately when navigator.onLine is false');

  // syncNow must immediately return without trying to fetch Firestore over network
  const syncResult = await syncNow();
  assert.equal(syncResult.ok, false);
  assert.ok(cloudInfo().error?.includes('Offline'), 'cloudInfo error indicates offline status');
});
