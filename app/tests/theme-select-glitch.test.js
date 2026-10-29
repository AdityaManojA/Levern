import { test } from 'node:test';
import assert from 'node:assert/strict';

// Setup browser globals for test environment
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (cb => setTimeout(cb, 0));
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
  documentElement: { dataset: {}, classList: { add: () => {}, remove: () => {} } },
};
globalThis.localStorage = {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};

test('renderThemePreview renders modular preview card without full view re-render', async () => {
  const { renderThemePreview, themeInfo } = await import('../js/views/settings.js');
  assert.equal(typeof renderThemePreview, 'function', 'renderThemePreview should be exported');
  assert.equal(typeof themeInfo, 'function', 'themeInfo should be exported');

  const lightHtml = renderThemePreview('light');
  assert.ok(lightHtml.includes('theme-preview-card'));
  assert.ok(lightHtml.includes('Light Mode'));
  assert.ok(lightHtml.includes('Live Preview'));

  const darkHtml = renderThemePreview('dark');
  assert.ok(darkHtml.includes('theme-preview-card'));
  assert.ok(darkHtml.includes('Dark Mode'));
  assert.ok(darkHtml.includes('#0E1014'));
});

test('theme selection in settings updates preview card without calling full swap / rerender', async () => {
  const { init, getState, subscribe } = await import('../js/store.js');
  init();
  const { onChange, renderThemePreview } = await import('../js/views/settings.js');

  let storeSubscriberNotified = false;
  const unsub = subscribe(() => {
    storeSubscriberNotified = true;
  });

  // Mock DOM preview card
  let outerHTMLReplacement = null;
  const mockPreviewCard = {
    className: 'theme-preview-card',
    set outerHTML(val) {
      outerHTMLReplacement = val;
    }
  };

  const origQS = globalThis.document.querySelector;
  globalThis.document.querySelector = sel => {
    if (sel === '.theme-preview-card') return mockPreviewCard;
    return null;
  };

  try {
    onChange({ dataset: { change: 'theme' }, value: 'mono-dark' });

    // 1. Setting should be updated in store
    assert.equal(getState().settings.theme, 'mono-dark');

    // 2. Setting change should be quiet: no full app subscriber notifications (which triggers full-page morph)
    assert.equal(storeSubscriberNotified, false, 'store subscriber should not fire full view re-render for theme change');

    // 3. Preview card should be updated in-place via outerHTML
    assert.ok(outerHTMLReplacement !== null, 'theme preview card should be updated directly in DOM');
    assert.ok(outerHTMLReplacement.includes('Monochrome Dark'));
  } finally {
    globalThis.document.querySelector = origQS;
    unsub();
  }
});

test('scrollChildIntoView scopes scrolling to the container and avoids outer window scroll', async () => {
  const { scrollChildIntoView } = await import('../js/controls.js');
  assert.equal(typeof scrollChildIntoView, 'function');

  const container = {
    scrollTop: 100,
    getBoundingClientRect: () => ({ top: 100, bottom: 300 }),
  };

  // Item above container viewport
  const itemAbove = {
    getBoundingClientRect: () => ({ top: 80, bottom: 110 }),
  };
  scrollChildIntoView(container, itemAbove);
  assert.equal(container.scrollTop, 80, 'should scroll container up by 20px');

  // Item below container viewport
  const itemBelow = {
    getBoundingClientRect: () => ({ top: 290, bottom: 330 }),
  };
  scrollChildIntoView(container, itemBelow);
  assert.equal(container.scrollTop, 110, 'should scroll container down by 30px');

  // Item inside container viewport
  const itemInside = {
    getBoundingClientRect: () => ({ top: 120, bottom: 150 }),
  };
  scrollChildIntoView(container, itemInside);
  assert.equal(container.scrollTop, 110, 'should leave container scrollTop unchanged');
});
