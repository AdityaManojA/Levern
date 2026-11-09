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
  assert.equal(down.seasonExp, 5);   // season EXP draws on the bucket, even when all-time EXP went down
});

test('season EXP catches up on its own, from the bucket, when all-time EXP stays the same', () => {
  // the board showed 46 (Gold) while the app had 135 (Ascendant): the season was worked out again, EXP unchanged
  const o = { exp: 500, season: 1, seasonExp: 46, bank: 60, updatedMs: t0 };
  const first = allowed(o, { exp: 500, season: 1, seasonExp: 135 }, t0 + 10 * H);
  assert.deepEqual(first, { exp: 500, seasonExp: 106, bank: 0 });
  const later = allowed({ ...o, seasonExp: 106, bank: 0, updatedMs: t0 + 10 * H }, { exp: 500, season: 1, seasonExp: 135 }, t0 + 13 * H);
  assert.equal(later.seasonExp, 135);
});

test('one load gives every board: this season, Legacy and each past season, best first', async () => {
  const { standings, carryPast } = await import('../js/board.js');
  const all = [
    { id: 'a', name: 'A', exp: 500, season: 2, seasonExp: 40, past: { 1: 90 }, me: false },
    { id: 'b', name: 'B', exp: 300, season: 1, seasonExp: 120, past: {}, me: true },     // hasn't been back since season 1
    { id: 'c', name: 'C', exp: 900, season: 2, seasonExp: 70, past: {}, me: false },     // joined in season 2
  ];
  assert.deepEqual(standings(all, 'season', 2).map(r => [r.id, r.exp]), [['c', 70], ['a', 40], ['b', 0]]);   // b hasn't been back: 0 this season
  assert.deepEqual(standings(all, 'legacy', 2).map(r => r.id), ['c', 'a', 'b']);
  assert.deepEqual(standings(all, 1, 2).map(r => [r.id, r.exp]), [['b', 120], ['a', 90]]);
  // moving to a new season keeps the one just finished, once, with the score it ended on
  assert.deepEqual(carryPast({ season: 1, seasonExp: 120, past: {} }, 2), { 1: 120 });
  assert.deepEqual(carryPast({ season: 2, seasonExp: 40, past: { 1: 90 } }, 2), { 1: 90 });
  assert.deepEqual(carryPast(null, 2), {});
});

test('OG: everyone who was on the board in Seasons 1 to 3, and they keep it', async () => {
  const { isOg, standings } = await import('../js/board.js');
  assert.equal(isOg({ name: 'David', exp: 120 }), true);       // legacy entry before seasons field existed
  assert.equal(isOg({ name: 'David', exp: 120, season: 0 }), true); // legacy entry with season 0
  assert.equal(isOg({ name: 'David', exp: 120, season: null }), true); // legacy entry with season null
  assert.equal(isOg({ season: 2, past: { 1: 46 } }), true);    // moved on, Season 1 score kept
  assert.equal(isOg({ season: 2, past: {} }), true);           // joined in Season 2
  assert.equal(isOg({ season: 3, past: {} }), true);           // joined in Season 3
  assert.equal(isOg({ season: 5, past: { 3: 10, 4: 20 } }), true);   // was there in Season 3, keeps it later
  assert.equal(isOg({ season: 4, past: {} }), false);          // joined in Season 4
  assert.equal(isOg({ season: 6, past: { 4: 30, 5: 12 } }), false);
  const rows = standings([{ id: 'a', name: 'A', exp: 9, season: 2, seasonExp: 5, past: { 1: 3 }, og: true }], 'legacy', 2);
  assert.equal(rows[0].og, true);
});

test('aura: last season\'s top three, for the whole of this season', async () => {
  const { topThreeFrom } = await import('../js/board.js');
  const e = (id, past, season = 3, seasonExp = 0) => ({ id, name: id, exp: 100, season, seasonExp, past, me: false });
  const all = [e('a', { 2: 90 }), e('b', { 2: 120 }), e('c', { 2: 40 }), e('d', { 2: 70 }), e('z', { 2: 0 }), e('n', {}, 2, 200)];   // n hasn't moved on yet
  assert.deepEqual(topThreeFrom(all, 3), { n: 1, b: 2, a: 3 });
  assert.deepEqual(topThreeFrom(all, 1), {});                         // Season 1 has no season before it
  assert.deepEqual(topThreeFrom([e('a', { 2: 0 })], 3), {});          // no EXP, no aura
});

test('aura: in Season 3, exclusively Season 2 top 3 have glowing badges and old Season 1 auras are removed', async () => {
  const { topThreeFrom, standings } = await import('../js/board.js');
  const { auraOf, auraName, auraSpark } = await import('../js/views/common.js');

  // S1 top three: user_s1_gold, user_s1_silver, user_s1_bronze
  // S2 top three: user_s2_gold (350 EXP), user_s2_silver (280 EXP), user_s2_bronze (210 EXP)
  // user_s1_gold was top 1 in S1, but only earned 50 EXP in S2 (rank 4)
  // user_s1_silver was top 2 in S1, but didn't participate in S2 (0 EXP)
  const users = [
    { id: 'user_s1_gold', name: 'S1 Champion', exp: 600, season: 3, seasonExp: 10, past: { '1': 450, '2': 50 }, me: false },
    { id: 'user_s1_silver', name: 'S1 Runner Up', exp: 400, season: 1, seasonExp: 400, past: {}, me: false },
    { id: 'user_s1_bronze', name: 'S1 Bronze', exp: 350, season: '2', seasonExp: '150', past: { 1: 300 }, me: false },
    { id: 'user_s2_gold', name: 'S2 Champion', exp: 350, season: 2, seasonExp: 350, past: { '1': 80 }, me: false },
    { id: 'user_s2_silver', name: 'S2 Runner Up', exp: 500, season: 3, seasonExp: 0, past: { '1': 120, '2': 280 }, me: false },
    { id: 'user_s2_bronze', name: 'S2 Bronze', exp: 450, season: '3', seasonExp: 20, past: { '2': 210 }, me: false },
  ];

  // In Season 3 (now = 3):
  const auras = topThreeFrom(users, 3);
  assert.deepEqual(auras, {
    user_s2_gold: 1,
    user_s2_silver: 2,
    user_s2_bronze: 3,
  }, 'Only the top three from Season 2 receive glowing badge places 1, 2, 3');

  // Verify old Season 1 finishers do NOT have an aura
  assert.equal(auras.user_s1_gold, undefined, 'S1 Champion has no aura because they placed 4th in S2');
  assert.equal(auras.user_s1_silver, undefined, 'S1 Runner Up has no aura because they did not participate in S2');
  assert.equal(auras.user_s1_bronze, undefined, 'S1 Bronze has no aura because they placed below top 3 in S2');

  // Verify aura badges and titles for Season 2 winners
  const au1 = auraOf(auras.user_s2_gold, 2);
  assert.equal(au1.cls, ' aura aura-1');
  assert.equal(au1.title, ' title="#1 in Season 2"');
  assert.ok(auraName(auras.user_s2_gold, 'S2 Champion').includes('class="aura-name"'));
  assert.ok(auraSpark(auras.user_s2_gold).includes('class="aura-sp"'));

  const au2 = auraOf(auras.user_s2_silver, 2);
  assert.equal(au2.cls, ' aura aura-2');
  assert.equal(au2.title, ' title="#2 in Season 2"');

  const au3 = auraOf(auras.user_s2_bronze, 2);
  assert.equal(au3.cls, ' aura aura-3');
  assert.equal(au3.title, ' title="#3 in Season 2"');

  // Verify someone without an aura gets clean empty classes and titles
  const noAu = auraOf(auras.user_s1_gold, 2);
  assert.equal(noAu.cls, '');
  assert.equal(noAu.title, '');
  assert.equal(auraName(auras.user_s1_gold, 'S1 Champion'), 'S1 Champion');
  assert.equal(auraSpark(auras.user_s1_gold), '');
});

test('the board tries again as soon as the bucket has room, and leaves the entry alone until then', async () => {
  const { waitForRoom, allowed } = await import('../js/board.js');
  const o = { exp: 135, season: 2, seasonExp: 0, bank: 0.27 };
  const min = waitForRoom(o, { exp: 143, season: 2, seasonExp: 8 }, 0.27) / 60000;
  assert.ok(min > 7.5 && min < 8.5, `about 8 minutes at 60 an hour, got ${min}`);
  assert.equal(waitForRoom(o, { exp: 135, season: 2, seasonExp: 0 }, 60), 30000);     // nothing to send: the minimum
  // ten minutes after the last update there's room for 8 EXP (no 6-minute margin eating the refill)
  const got = allowed({ ...o, updatedMs: t0 }, { exp: 143, season: 2, seasonExp: 8 }, t0 + 10 * 60000);
  assert.deepEqual([got.exp, got.seasonExp], [143, 8]);
});

test('anti-cheat: safe 45s clock margin prevents premature bank refill on client time drift', () => {
  const o = { exp: 500, season: 3, seasonExp: 100, bank: 0, updatedMs: t0 };
  const got = allowed(o, { exp: 505, season: 3, seasonExp: 105 }, t0 + 30000);
  assert.equal(got.exp, 500);
  assert.equal(got.seasonExp, 100);
  assert.equal(got.bank, 0);
});
