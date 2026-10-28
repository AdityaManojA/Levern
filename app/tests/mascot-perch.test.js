import { test } from 'node:test';
import assert from 'node:assert/strict';
import MOCHI from '../mochi/manifest.js';
import COOKIE from '../cookie/manifest.js';
import { animEdge } from '../js/mochi.js';

test('mascot manifests define edge for edge-peek on both Mochi and Cookie', () => {
  assert.ok(MOCHI.anims['edge-peek'], 'Mochi has edge-peek animation');
  assert.equal(typeof MOCHI.anims['edge-peek'].edge, 'number', 'Mochi edge-peek defines edge');
  assert.equal(MOCHI.anims['edge-peek'].edge, 37.0, 'Mochi edge-peek edge is 37');

  assert.ok(COOKIE.anims['edge-peek'], 'Cookie has edge-peek animation');
  assert.equal(typeof COOKIE.anims['edge-peek'].edge, 'number', 'Cookie edge-peek defines edge to prevent unclipped sheet overflow');
  assert.equal(COOKIE.anims['edge-peek'].edge, 38.0, 'Cookie edge-peek edge is 38');
});

test('animEdge resolves edge properly with safe gy fallback', () => {
  assert.equal(animEdge(MOCHI.anims['edge-peek']), 37.0);
  assert.equal(animEdge(COOKIE.anims['edge-peek']), 38.0);

  // If an animation has edge defined, it returns edge
  assert.equal(animEdge({ edge: 40, gy: 50 }), 40);

  // If an animation has no edge, null is returned unless it is edge-peek
  assert.equal(animEdge({ gy: 50 }), null);
});

test('sheet perch clipPath calculation clips sprite below sheet top edge', () => {
  // Mochi edge peek
  const mochiA = MOCHI.anims['edge-peek'];
  const mochiEdge = animEdge(mochiA);
  // When lift is 0 (fully peeked):
  const mochiBottomInset0 = Math.max(0, mochiA.h - mochiEdge + 0);
  assert.equal(mochiBottomInset0, 37); // Bottom 37px clipped, leaving top 37px (head & paws) visible
  // When lift is h (ducked down):
  const mochiBottomInsetFull = Math.max(0, mochiA.h - mochiEdge + mochiA.h);
  assert.equal(mochiBottomInsetFull, 111); // > h (74), fully clipped / hidden

  // Cookie edge peek
  const cookieA = COOKIE.anims['edge-peek'];
  const cookieEdge = animEdge(cookieA);
  // When lift is 0 (fully peeked):
  const cookieBottomInset0 = Math.max(0, cookieA.h - cookieEdge + 0);
  assert.equal(cookieBottomInset0, 4); // Bottom 4px clipped, paws resting on sheet border
  // When lift is h (ducked down):
  const cookieBottomInsetFull = Math.max(0, cookieA.h - cookieEdge + cookieA.h);
  assert.equal(cookieBottomInsetFull, 46); // > h (42), fully clipped / hidden
});
