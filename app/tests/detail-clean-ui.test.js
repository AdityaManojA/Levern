import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = globalThis.localStorage || {
  _store: {},
  getItem(k) { return this._store[k] ?? null; },
  setItem(k, v) { this._store[k] = String(v); },
  removeItem(k) { delete this._store[k]; },
  clear() { this._store = {}; }
};

test('detail view: renders clean, card-grouped sections with proper spacing and hierarchy', async () => {
  const { init, commit } = await import('../js/store.js');
  init();
  commit(s => {
    s.quests = [{
      id: 'q-clean-test',
      title: 'Clean UI Quest',
      tier: 1,
      due: '2026-11-01',
      time: '22:00',
      duration: 30,
      subtasks: [{ id: 's1', title: 'Sub 1', done: false }],
      notes: 'Some clean notes',
      createdAt: Date.now()
    }];
  });

  const { render } = await import('../js/views/detail.js');
  const html = render({ id: 'q-clean-test' });

  // Verify section grouping cards exist
  assert.ok(html.includes('class="dt-group"'), 'Should render .dt-group section containers');
  assert.ok(html.includes('class="dt-card"'), 'Should render .dt-card surfaces for clean grouping');
  assert.ok(html.includes('Schedule &amp; Duration') || html.includes('Schedule & Duration'), 'Should group Schedule & Duration');

  // Verify quick dates and duration chips exist
  assert.ok(html.includes('class="chips dt-quick-chips"'), 'Should render quick date chips');
  assert.ok(html.includes('class="chips dt-dur-chips"'), 'Should render duration chips');

  // Verify essential data attributes are preserved
  assert.ok(html.includes('data-act="due-quick"'), 'Preserves due-quick action');
  assert.ok(html.includes('data-act="dur-set"'), 'Preserves dur-set action');
  assert.ok(html.includes('data-act="often"'), 'Preserves often action');
  assert.ok(html.includes('data-tour="subtasks"'), 'Preserves tour attribute for subtasks');
  assert.ok(html.includes('data-addsub'), 'Preserves data-addsub form');
});
