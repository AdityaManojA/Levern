import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDocs, mergeSettings } from '../js/syncmerge.js';
import { seasonOf, seasonRange, seasonExp, rankOf, SEASON_EPOCH } from '../js/stats.js';

test('changing one setting on a phone does not bring back its old copy of the others (reminders stop bug)', () => {
  // the account: daily reminders set on phone A at t=200
  const account = { settings: { focusMin: 25, nudges: { water: true } }, settingsStamps: { focusMin: 10, nudges: 200 }, settingsUpdatedAt: 200 };
  // phone B: old nudges, then the focus length changed at t=300
  const phoneB = { settings: { focusMin: 50, nudges: { water: false } }, settingsStamps: { focusMin: 300, nudges: 10 }, settingsUpdatedAt: 300 };
  const m = mergeDocs(account, phoneB);
  assert.equal(m.settings.focusMin, 50);
  assert.deepEqual(m.settings.nudges, { water: true });
  assert.equal(m.settingsUpdatedAt, 300);
});

test('a copy from an older version counts every setting at its settingsUpdatedAt', () => {
  const old = { settings: { focusMin: 30, name: 'A' }, settingsUpdatedAt: 500 };
  const now = { settings: { focusMin: 25, name: 'B' }, settingsStamps: { focusMin: 600, name: 100 }, settingsUpdatedAt: 600 };
  const m = mergeSettings(old, now);
  assert.equal(m.settings.focusMin, 25);
  assert.equal(m.settings.name, 'A');
});

test('seasons are two weeks, the same for everyone, starting 19 Oct 2026', () => {
  assert.equal(seasonOf(SEASON_EPOCH), 1);
  assert.equal(seasonOf(SEASON_EPOCH + 13.9 * 86400000), 1);
  assert.equal(seasonOf(SEASON_EPOCH + 14 * 86400000), 2);
  assert.equal(seasonRange(2).start, SEASON_EPOCH + 14 * 86400000);
  const inS1 = SEASON_EPOCH + 2 * 86400000, before = SEASON_EPOCH - 3 * 86400000;
  const history = [...Array(5)].map(() => ({ doneAt: inS1, tier: 3 })).concat([{ doneAt: before, tier: 3 }]);
  // 5 done on one day with a target of 5: 20 + 10 bonus; the day before the season doesn't count
  assert.equal(seasonExp(history, [{ minutes: 25, endedAt: inS1 }], 5, 1), 35);
});

test('rank tiers', () => {
  assert.equal(rankOf(0), 'Iron');
  assert.equal(rankOf(150), 'Gold');
  assert.equal(rankOf(379), 'Diamond');
  assert.equal(rankOf(380), 'Ascendant');
  assert.equal(rankOf(500), 'Master');
});
