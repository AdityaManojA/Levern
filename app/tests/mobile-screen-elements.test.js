import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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

test('settings sound and voice: try sounds uses structured container preventing button and label overlap', async () => {
  const { init } = await import('../js/store.js');
  init();
  const { render } = await import('../js/views/settings.js');
  const html = render();

  assert.ok(html.includes('srow-sounds'), 'Settings Sound and voice section contains srow-sounds container');
  assert.ok(html.includes('sound-btns'), 'Sound buttons are wrapped in dedicated sound-btns container');
  assert.ok(!html.includes('<div class="srow"><div class="l"><b>Try them</b></div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">'),
    'Old squished sound buttons container should be replaced with structured responsive layout');

  // Verify all 4 sounds are present
  assert.ok(html.includes('data-s="tick"'), 'Has Tick preview button');
  assert.ok(html.includes('data-s="chime"'), 'Has Reminder preview button');
  assert.ok(html.includes('data-s="mrrp"'), 'Has Mochi preview button');
  assert.ok(html.includes('Cookie</button>'), 'Has Cookie preview button');
});

test('css layout: root html and body have background: var(--cream) and nav has elevation shadow', () => {
  const css = fs.readFileSync('app/css/app.css', 'utf8');

  // html and body must both have background: var(--cream) so Android system navigation bar area matches theme
  assert.ok(
    /html\s*,\s*body\s*\{[^}]*background:\s*var\(--cream\)/.test(css) ||
    /html\s*\{[^}]*background:\s*var\(--cream\)/.test(css),
    'html element must define background: var(--cream) for edge-to-edge system navigation bars'
  );

  // srow-sounds must define grid / responsive layout
  assert.ok(css.includes('.srow-sounds'), 'app.css contains .srow-sounds responsive rules');
  assert.ok(css.includes('.sound-btns'), 'app.css contains .sound-btns rules');
  assert.ok(!/\.srow-sounds\s*\{[^}]*flex-direction:\s*row/.test(css), 'srow-sounds must not switch to row layout that squeezes labels');

  // nav bar should have elevation box-shadow to stand out crisply above scrolled content
  assert.ok(
    /\.nav\s*\{[^}]*box-shadow:/.test(css),
    '.nav must have a box-shadow elevation so content scrolling underneath maintains clear contrast'
  );
});

test('theme management: updates all meta theme-color tags for light and dark system bars', async () => {
  const html = fs.readFileSync('app/index.html', 'utf8');
  assert.ok(html.includes('name="theme-color"'), 'index.html has meta theme-color');

  const themeJs = fs.readFileSync('app/js/theme.js', 'utf8');
  assert.ok(
    themeJs.includes('querySelectorAll') || themeJs.includes('meta[name="theme-color"]'),
    'theme.js sets meta theme-color'
  );
});
