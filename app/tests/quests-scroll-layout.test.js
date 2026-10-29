import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Setup mock browser environment
globalThis.addEventListener = globalThis.addEventListener || (() => {});
globalThis.matchMedia = globalThis.matchMedia || (() => ({ matches: false, addEventListener: () => {} }));
globalThis.location = globalThis.location || { origin: 'http://localhost', pathname: '/', hash: '#/quests' };
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

test('quests view: renders pinned header and scrollable quest list structure for all tabs', async () => {
  const { init, commit } = await import('../js/store.js');
  init();
  commit(s => {
    s.settings = { ...(s.settings || {}), tierNames: ['Critical', 'High', 'Medium', 'Normal', 'Low', 'Someday'] };
    s.quests = [
      { id: 'q1', title: 'Buy groceries', tier: 2, done: false, due: '2026-10-29', subtasks: [] },
      { id: 'q2', title: 'Work on Levern #dev', tier: 1, done: false, due: '2026-10-30', subtasks: [] },
      { id: 'q3', title: 'Someday idea', tier: 5, done: false, due: null, subtasks: [] },
      { id: 'q4', title: 'Past finished task', tier: 3, done: true, due: '2026-10-28', doneAt: Date.now() - 3600000, subtasks: [] }
    ];
  });

  const { render } = await import('../js/views/quests.js');

  const tabs = ['today', 'upcoming', 'someday', 'done', 'all'];
  for (const tab of tabs) {
    const html = render({ filter: tab });
    assert.ok(html.includes('class="quests-pinned"'), `Tab ${tab} must include quests-pinned container`);
    assert.ok(html.includes('class="h-title"'), `Tab ${tab} must have h-title inside`);
    assert.ok(html.includes('class="seg"'), `Tab ${tab} must have seg tablist`);
    assert.ok(html.includes('class="toolbar"'), `Tab ${tab} must have toolbar`);
    assert.ok(html.includes('id="qlist"'), `Tab ${tab} must have #qlist`);
    assert.ok(html.includes('quests-scroll'), `Tab ${tab} must mark #qlist as quests-scroll`);

    // Ensure #qlist is positioned outside/after the pinned header section
    const pinnedIdx = html.indexOf('class="quests-pinned"');
    const qlistIdx = html.indexOf('id="qlist"');
    assert.ok(pinnedIdx < qlistIdx, `quests-pinned should come before #qlist in tab ${tab}`);
  }
});

test('css layout: quests view limits scrolling to #qlist and pins headers', () => {
  const css = readFileSync(join(__dirname, '../css/app.css'), 'utf8');

  // Verify view flex column container on quests view
  assert.match(css, /\.view\[data-view="quests"\][^{]*\{[^}]*overflow:\s*hidden/i, 'view on quests view must have overflow: hidden');
  assert.match(css, /\.view\[data-view="quests"\][^{]*\{[^}]*display:\s*flex/i, 'view on quests view must be a flex container');
  assert.match(css, /\.view\[data-view="quests"\][^{]*\{[^}]*flex-direction:\s*column/i, 'view on quests view must be flex-direction: column');

  // Verify #qlist is scrollable and fills remaining space
  assert.match(css, /\.view\[data-view="quests"\]\s+#qlist[^{]*\{[^}]*overflow-y:\s*auto/i, '#qlist must have overflow-y: auto');
  assert.match(css, /\.view\[data-view="quests"\]\s+#qlist[^{]*\{[^}]*flex:\s*1/i, '#qlist must have flex: 1');
  assert.match(css, /\.view\[data-view="quests"\]\s+#qlist[^{]*\{[^}]*overscroll-behavior-y:\s*contain/i, '#qlist must contain overscroll');

  // Verify outer page scrolling is disabled when on quests view
  assert.match(css, /body\[data-view="quests"\][^{]*\{[^}]*overflow:\s*hidden/i, 'body on quests view must have overflow: hidden');
});
