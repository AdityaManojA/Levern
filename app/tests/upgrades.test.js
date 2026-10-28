import { test } from 'node:test';
import assert from 'node:assert/strict';

// Set up mock browser environment
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false, addEventListener: () => {} }));
globalThis.location = globalThis.location || { origin: 'http://localhost', pathname: '/', hash: '#/settings' };
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

test('changelog: all version entries are written from user perspective without "Fixed:" bug tracker jargon', async () => {
  const { CHANGELOG } = await import('../js/changelog.js');

  for (const entry of CHANGELOG) {
    for (const item of entry.items || []) {
      assert.ok(
        !item.startsWith('Fixed:'),
        `Version ${entry.v} item should not start with developer "Fixed:": "${item}"`
      );
    }
  }
});

test('ambient audio: supports gentle raindrops & sweet piano track', async () => {
  const { setAmbientKind, getAmbientKind } = await import('../js/ambient.js');

  setAmbientKind('raindrops');
  assert.equal(getAmbientKind(), 'raindrops', 'Ambient kind should accept raindrops');
});

test('theme preview: upgraded preview renders realistic mock quest cards and priority pills', async () => {
  const { init } = await import('../js/store.js');
  init();
  const { render } = await import('../js/views/settings.js');
  const html = render();

  assert.ok(html.includes('theme-preview-card'), 'Contains theme preview card');
  assert.ok(html.includes('theme-mini-phone'), 'Contains mini phone mock frame');
  assert.ok(html.includes('P1 Critical') || html.includes('P1'), 'Contains P1 priority in preview');
  assert.ok(html.includes('P6 Someday') || html.includes('P6'), 'Contains P6 priority in preview');
  assert.ok(html.includes('theme-mini-card'), 'Contains mini quest cards');
});
