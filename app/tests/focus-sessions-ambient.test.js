globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { querySelector: () => null, addEventListener: () => {} };
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} };

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAmbientKind, setAmbientKind, playAmbient, stopAmbient, isAmbientActive } from '../js/ambient.js';
import { getState, commit, logSession, init } from '../js/store.js';
import { memoryAdapter } from '../js/storage.js';
import { render } from '../js/views/focus.js';

test('ambient audio supports rain, cafe, and classical, with graceful fallback', () => {
  setAmbientKind('rain');
  assert.equal(getAmbientKind(), 'rain');

  setAmbientKind('cafe');
  assert.equal(getAmbientKind(), 'cafe');

  setAmbientKind('classical');
  assert.equal(getAmbientKind(), 'classical');

  // Deprecated whitenoise falls back to rain
  setAmbientKind('whitenoise');
  assert.equal(getAmbientKind(), 'rain', 'whitenoise should fall back to rain');

  // Unsupported kind falls back to none
  setAmbientKind('unknown-sound');
  assert.equal(getAmbientKind(), 'none');

  // None stops ambient
  setAmbientKind('none');
  assert.equal(getAmbientKind(), 'none');
});

test('focus view renders "See Past Focus Sessions" dropdown with all history', () => {
  init(memoryAdapter());
  // Setup store with sample past sessions across different days
  const now = Date.now();
  const pastTime1 = now - 86400000 * 2; // 2 days ago
  const pastTime2 = now - 86400000 * 5; // 5 days ago

  commit(s => {
    s.timer = null;
    s.quests = [{ id: 'q1', title: 'Write unit tests', tier: 1 }];
    s.sessions = [
      { questId: 'q1', minutes: 25, endedAt: pastTime2 },
      { questId: null, minutes: 40, endedAt: pastTime1 },
    ];
  });

  const html = render({});

  // Verify dropdown exists
  assert.ok(html.includes('See Past Focus Sessions'), 'HTML contains "See Past Focus Sessions" section');
  assert.ok(html.includes('past-focus-details'), 'HTML contains details dropdown element');

  // Verify past sessions are rendered in the dropdown
  assert.ok(html.includes('Write unit tests'), 'Contains quest title in past sessions');
  assert.ok(html.includes('25 min'), 'Contains 25 min session');
  assert.ok(html.includes('40 min'), 'Contains 40 min session');

  // Verify ambient sound options in focus view: only gentle rain, cafe, classical, and off
  assert.ok(html.includes('value="rain"'), 'Has rain option');
  assert.ok(html.includes('value="cafe"'), 'Has cafe option');
  assert.ok(html.includes('value="classical"'), 'Has classical option');
  assert.ok(!html.includes('value="purr"'), 'UI does not offer purr option');
  assert.ok(!html.includes('value="whitenoise"'), 'UI does not offer whitenoise option');
});
