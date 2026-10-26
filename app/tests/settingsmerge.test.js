import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeDocs, mergeSettings } from '../js/syncmerge.js';
import { seasonOf, seasonRange, seasonExp, rankOf, rankLabel, rankStep, nextRank, masterLevel, SEASON_EPOCH, FIRST_SEASON_FROM } from '../js/stats.js';

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

test('season 1 runs 19 Oct to the end of Sunday 25 Oct (IST); then two weeks, ending every second Sunday', () => {
  const D = 86400000;
  assert.equal(seasonOf(FIRST_SEASON_FROM), 1);
  assert.equal(seasonRange(1).start, FIRST_SEASON_FROM);
  assert.equal(seasonOf(Date.UTC(2026, 9, 25, 18, 29)), 1);          // Sunday 25 Oct, 23:59 IST
  assert.equal(seasonOf(Date.UTC(2026, 9, 25, 18, 30)), 2);          // Monday 26 Oct, 00:00 IST
  assert.equal(seasonRange(2).start, Date.UTC(2026, 9, 25, 18, 30));
  assert.equal(seasonRange(2).end - seasonRange(2).start, 14 * D);
  assert.equal(seasonOf(Date.UTC(2026, 10, 8, 18, 29)), 2);           // Sunday 8 Nov, 23:59 IST
  assert.equal(seasonOf(Date.UTC(2026, 10, 8, 18, 30)), 3);
  assert.equal(new Date(seasonRange(3).end - 1).getUTCDay(), 0);      // every season ends on a Sunday
  const inS1 = FIRST_SEASON_FROM + 2 * D, before = FIRST_SEASON_FROM - 3 * D;
  const history = [...Array(5)].map(() => ({ doneAt: inS1, tier: 3 })).concat([{ doneAt: before, tier: 3 }]);
  // 5 done on one day with a target of 5: 20 + 10 bonus; the day before the season doesn't count
  assert.equal(seasonExp(history, [{ minutes: 25, endedAt: inS1 }], 5, 1), 35);
});

test('rank tiers are easy to climb in a two-week season', () => {
  assert.equal(rankOf(0), 'Iron');
  assert.equal(rankOf(9), 'Iron');
  assert.equal(rankOf(10), 'Bronze');
  assert.equal(rankOf(30), 'Silver');          // one full day at the target
  assert.equal(rankOf(45), 'Gold');
  assert.equal(rankOf(99), 'Platinum');
  assert.equal(rankOf(100), 'Diamond');
  assert.equal(rankOf(135), 'Ascendant');
  assert.equal(rankOf(175), 'Master');          // about six full days
});

test('Master has no top: a level every 50 EXP after 175', () => {
  assert.equal(rankLabel(174), 'Ascendant');
  assert.equal(rankLabel(175), 'Master 1');
  assert.equal(rankLabel(224), 'Master 1');
  assert.equal(rankLabel(225), 'Master 2');
  assert.equal(rankLabel(675), 'Master 11');
  assert.equal(masterLevel(100), 0);
  assert.ok(rankStep(225) > rankStep(175) && rankStep(175) > rankStep(174) && rankStep(45) > rankStep(25));
  assert.deepEqual(nextRank(140), ['Master 1', 175]);
  assert.deepEqual(nextRank(230), ['Master 3', 275]);
  assert.deepEqual(nextRank(30), ['Gold', 45]);
});
