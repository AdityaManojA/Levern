import { test } from 'node:test';
import assert from 'node:assert/strict';

// Set up mock browser environment
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false, addEventListener: () => {} }));
globalThis.location = globalThis.location || { origin: 'http://localhost', pathname: '/', hash: '#/focus' };
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

test('focus view: zero emojis anywhere on the focus screen', async () => {
  const { init } = await import('../js/store.js');
  init();
  const { render } = await import('../js/views/focus.js');
  const html = render({});

  // Match astral emojis and common symbol emojis
  const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
  const matches = html.match(new RegExp(emojiRegex, 'gu')) || [];

  assert.equal(
    matches.length,
    0,
    `Focus screen should have no emojis, found: ${JSON.stringify(matches)}`
  );

  // Check specific musical / ambient toggle buttons
  assert.ok(!html.includes('🔊'));
  assert.ok(!html.includes('🔇'));
  assert.ok(!html.includes('🎻'));
  assert.ok(!html.includes('🎹'));
  assert.ok(!html.includes('🎼'));
  assert.ok(!html.includes('🌙'));
  assert.ok(!html.includes('🌹'));
  assert.ok(!html.includes('🌧'));
});

test('theme selector: zero emojis on all theme options and better names', async () => {
  const { init } = await import('../js/store.js');
  init();
  const { render } = await import('../js/views/settings.js');
  const html = render();

  const selectSnippet = html.slice(html.indexOf('<select class="field theme-select"'), html.indexOf('</select>') + 9);

  // No emojis in the theme selector at all
  assert.ok(!selectSnippet.includes('☀️'), 'No sun emoji');
  assert.ok(!selectSnippet.includes('🌙'), 'No moon emoji');
  assert.ok(!selectSnippet.includes('⚪'), 'No white circle');
  assert.ok(!selectSnippet.includes('⚫'), 'No black circle');
  assert.ok(!selectSnippet.includes('🎨'), 'No palette');
  assert.ok(!selectSnippet.includes('✨'), 'No sparkles');

  // Verify upgraded theme names
  assert.ok(selectSnippet.includes('>Light Mode</option>'), 'Has Light Mode');
  assert.ok(selectSnippet.includes('>Dark Mode</option>'), 'Has Dark Mode');
  assert.ok(selectSnippet.includes('>Monochrome Light</option>'), 'Has Monochrome Light');
  assert.ok(selectSnippet.includes('>Monochrome Light Accent</option>'), 'Has Monochrome Light Accent');
  assert.ok(selectSnippet.includes('>Monochrome Dark</option>'), 'Has Monochrome Dark');
  assert.ok(selectSnippet.includes('>Monochrome Dark Accent</option>'), 'Has Monochrome Dark Accent');
  assert.ok(selectSnippet.includes('>Follow Device</option>'), 'Has Follow Device');
});

test('ambient audio: supports new classical pieces, gentle rain, forest and soft noise', async () => {
  const { setAmbientKind, getAmbientKind } = await import('../js/ambient.js');

  const newTracks = ['mozart', 'pachelbel', 'gentle-rain', 'forest', 'soft-noise'];
  for (const track of newTracks) {
    setAmbientKind(track);
    assert.equal(getAmbientKind(), track, `Should support ambient track: ${track}`);
  }
});
