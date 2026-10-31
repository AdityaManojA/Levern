import test from 'node:test';
import assert from 'node:assert/strict';
import { isHalloweenWeek, halloweenActive } from '../js/theme.js';

test('Halloween week runs 31 Oct to 6 Nov, local date', () => {
  assert.equal(isHalloweenWeek(new Date(2026, 9, 30, 23, 59)), false);
  assert.equal(isHalloweenWeek(new Date(2026, 9, 31, 0, 0)), true);
  assert.equal(isHalloweenWeek(new Date(2026, 10, 6, 23, 59)), true);
  assert.equal(isHalloweenWeek(new Date(2026, 10, 7, 0, 0)), false);
});

test('Halloween is the default that week until someone picks another theme', () => {
  const d = new Date(2026, 10, 2);
  assert.equal(halloweenActive({ theme: 'light' }, d), true);
  assert.equal(halloweenActive({ theme: 'mono', halloweenOff: '' }, d), true);
  assert.equal(halloweenActive({ theme: 'light', halloweenOff: '2026' }, d), false);
  // last year's switch-off doesn't carry over
  assert.equal(halloweenActive({ theme: 'light', halloweenOff: '2025' }, d), true);
  assert.equal(halloweenActive({ theme: 'dark' }, new Date(2026, 10, 8)), false);
});
