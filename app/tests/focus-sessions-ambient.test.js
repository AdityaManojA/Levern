globalThis.window = globalThis.window || {};
globalThis.document = globalThis.document || { querySelector: () => null, addEventListener: () => {} };
globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} };

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAmbientKind, setAmbientKind, playAmbient, stopAmbient, isAmbientActive } from '../js/ambient.js';
import { getState, commit, logSession, init } from '../js/store.js';
import { memoryAdapter } from '../js/storage.js';
import { render } from '../js/views/focus.js';

test('ambient audio supports 5 long public-domain classical pieces with graceful fallback', () => {
  setAmbientKind('satie');
  assert.equal(getAmbientKind(), 'satie');

  setAmbientKind('debussy');
  assert.equal(getAmbientKind(), 'debussy');

  setAmbientKind('bach');
  assert.equal(getAmbientKind(), 'bach');

  setAmbientKind('beethoven');
  assert.equal(getAmbientKind(), 'beethoven');

  setAmbientKind('chopin');
  assert.equal(getAmbientKind(), 'chopin');

  // Legacy 'classical' alias falls back to satie
  setAmbientKind('classical');
  assert.equal(getAmbientKind(), 'satie');

  // Deprecated rain/cafe/whitenoise falls back to none or first classical
  setAmbientKind('rain');
  assert.equal(getAmbientKind(), 'none');

  setAmbientKind('cafe');
  assert.equal(getAmbientKind(), 'none');

  setAmbientKind('whitenoise');
  assert.equal(getAmbientKind(), 'none');

  // Unsupported kind falls back to none
  setAmbientKind('unknown-sound');
  assert.equal(getAmbientKind(), 'none');

  // None stops ambient
  setAmbientKind('none');
  assert.equal(getAmbientKind(), 'none');
});

test('focus view renders "See Past Focus Sessions" and 5 long classical pieces', () => {
  init(memoryAdapter());
  // Setup store with sample past sessions across different days
  const now = Date.now();
  const pastTime1 = now - 86400000 * 2; // 2 days ago
  const pastTime2 = now - 86400000 * 5; // 5 days ago

  commit(s => {
    s.timer = null;
    s.quests = [{ id: 'q1', title: 'Deep focus work', tier: 1 }];
    s.sessions = [
      { questId: 'q1', minutes: 25, endedAt: pastTime2 },
      { questId: null, minutes: 40, endedAt: pastTime1 },
    ];
  });

  const html = render({});

  // Verify dropdown exists
  assert.ok(html.includes('See Past Focus Sessions'), 'HTML contains "See Past Focus Sessions" section');
  assert.ok(html.includes('past-focus-details'), 'HTML contains details dropdown element');

  // Verify ambient sound options: 5 classical pieces and off
  assert.ok(html.includes('value="satie"'), 'Has Satie option');
  assert.ok(html.includes('value="debussy"'), 'Has Debussy option');
  assert.ok(html.includes('value="bach"'), 'Has Bach option');
  assert.ok(html.includes('value="beethoven"'), 'Has Beethoven option');
  assert.ok(html.includes('value="chopin"'), 'Has Chopin option');
  // Removed old noisy tracks
  assert.ok(!html.includes('value="rain"'), 'Old rain option removed');
  assert.ok(!html.includes('value="cafe"'), 'Old cafe option removed');
  assert.ok(!html.includes('value="whitenoise"'), 'Old whitenoise option removed');
});
