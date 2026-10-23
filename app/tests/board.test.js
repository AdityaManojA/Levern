import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allowed, BUCKET, START_CAP } from '../js/board.js';

const H = 3600000, t0 = 1_800_000_000_000;

test('a new entry starts at most at the starting cap, with an empty bucket', () => {
  assert.deepEqual(allowed(null, { exp: 120, season: 3, seasonExp: 40 }), { exp: 120, seasonExp: 40, bank: 0 });
  assert.equal(allowed(null, { exp: 99999, season: 3, seasonExp: 99999 }).exp, START_CAP);
});

test('everyday growth goes up in full', () => {
  const o = { exp: 500, season: 3, seasonExp: 100, bank: 0, updatedMs: t0 };
  const got = allowed(o, { exp: 535, season: 3, seasonExp: 135 }, t0 + 4 * H);
  assert.equal(got.exp, 535);
  assert.equal(got.seasonExp, 135);
  assert.ok(got.bank >= 0 && got.bank <= BUCKET);
});

test('a jump is sent a bucketful at a time', () => {
  const o = { exp: 500, season: 3, seasonExp: 100, bank: 0, updatedMs: t0 };
  const got = allowed(o, { exp: 5000, season: 3, seasonExp: 4000 }, t0 + 10 * H);
  assert.equal(got.exp, 500 + BUCKET);
  assert.equal(got.seasonExp, 100 + BUCKET);
  assert.equal(got.bank, 0);
});

test('a new season starts from what was earned since the last update', () => {
  const o = { exp: 500, season: 3, seasonExp: 300, bank: 0, updatedMs: t0 };
  const got = allowed(o, { exp: 520, season: 4, seasonExp: 20 }, t0 + 2 * H);
  assert.equal(got.seasonExp, 20);
  const down = allowed(o, { exp: 480, season: 4, seasonExp: 5 }, t0 + 2 * H);
  assert.equal(down.seasonExp, 0);
});
