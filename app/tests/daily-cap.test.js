import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  toStrIST,
  todayStrIST,
  nextMidnightIST,
  msUntilResetIST,
  formatTimeUntilResetIST,
  IST_OFFSET_MS,
} from '../js/dates.js';
import {
  DAILY_EXP_CAP,
  REDUCED_EXP_RATE,
  applyDailyCap,
  summary,
  seasonExp,
  dayExp,
  focusExp,
} from '../js/stats.js';
import { shouldShowDailyCapPopup, getDailyCapPopupContent } from '../js/dailycappop.js';

test('dates: IST date conversion and next 12:00 AM IST reset calculation', () => {
  assert.equal(IST_OFFSET_MS, 5.5 * 3600000, 'IST offset must be UTC+5:30 (19,800,000 ms)');

  // 2026-10-29 18:29:00 UTC -> 23:59:00 IST on Oct 29
  const justBeforeMidnightUTC = Date.UTC(2026, 9, 29, 18, 29, 0);
  assert.equal(toStrIST(justBeforeMidnightUTC), '2026-10-29');

  // 2026-10-29 18:30:00 UTC -> 00:00:00 IST on Oct 30 (new day in India)
  const midnightUTC = Date.UTC(2026, 9, 29, 18, 30, 0);
  assert.equal(toStrIST(midnightUTC), '2026-10-30');

  // Next reset for justBeforeMidnightUTC should be midnightUTC (which is 2026-10-30 00:00:00 IST)
  const nextReset = nextMidnightIST(justBeforeMidnightUTC);
  assert.equal(nextReset, midnightUTC);

  // Time remaining just 1 minute before midnight IST should be 60,000 ms
  const msRemaining = msUntilResetIST(justBeforeMidnightUTC);
  assert.equal(msRemaining, 60000);
  assert.equal(formatTimeUntilResetIST(justBeforeMidnightUTC), '1m');

  // At 12:00 AM IST, the next reset is 24 hours later (2026-10-30 18:30 UTC = 2026-10-31 00:00 IST)
  const nextResetAfterMidnight = nextMidnightIST(midnightUTC);
  assert.equal(nextResetAfterMidnight, midnightUTC + 24 * 3600000);
  assert.equal(formatTimeUntilResetIST(midnightUTC), '24h');
});

test('stats: daily EXP cap of 55 points and 50% reduced XP after cap', () => {
  assert.equal(DAILY_EXP_CAP, 55, 'Daily EXP cap must be 55 points');
  assert.equal(REDUCED_EXP_RATE, 0.5, 'Reduced EXP rate after cap must be 0.5 (50%)');

  // Within cap: 100% full EXP
  assert.equal(applyDailyCap(0), 0);
  assert.equal(applyDailyCap(20), 20);
  assert.equal(applyDailyCap(30), 30);
  assert.equal(applyDailyCap(55), 55);

  // Beyond cap: 55 + 50% of remainder (floor)
  assert.equal(applyDailyCap(56), 55); // 55 + floor(1 * 0.5) = 55
  assert.equal(applyDailyCap(57), 56); // 55 + floor(2 * 0.5) = 56
  assert.equal(applyDailyCap(65), 60); // 55 + floor(10 * 0.5) = 60
  assert.equal(applyDailyCap(75), 65); // 55 + floor(20 * 0.5) = 65
  assert.equal(applyDailyCap(95), 75); // 55 + floor(40 * 0.5) = 75
  assert.equal(applyDailyCap(115), 85); // 55 + floor(60 * 0.5) = 85
});

test('stats: summary calculates todayRawExp, todayExp with cap, and daily cap status', () => {
  // A day at noon IST (06:30 UTC)
  const todayISTNoon = new Date(Date.UTC(2026, 9, 29, 6, 30));
  const todayMs = todayISTNoon.getTime();

  // 1. User with 35 raw EXP (5 quests on target 5 = 30 EXP, 25 min focus = 5 EXP)
  const histNormal = Array.from({ length: 5 }, (_, i) => ({
    questId: 'q' + i,
    tier: 3,
    doneAt: todayMs + i * 1000,
  }));
  const sessNormal = [{ minutes: 25, endedAt: todayMs + 10000 }];

  const sumNormal = summary(histNormal, sessNormal, 5, todayISTNoon, []);
  assert.equal(sumNormal.todayRawExp, 35);
  assert.equal(sumNormal.todayExp, 35);
  assert.equal(sumNormal.isDailyCapReached, false);
  assert.equal(sumNormal.dailyCap, 55);

  // 2. User spamming/grinding: 5 quests (30 EXP) + 125 min focus (25 EXP) + 5 subtasks (10 EXP) = 65 raw EXP
  const sessSpam = [{ minutes: 125, endedAt: todayMs + 20000 }];
  const questsWithSubs = [
    { id: 'q1', subtasks: [{ id: 's1', done: true, doneAt: todayMs }, { id: 's2', done: true, doneAt: todayMs }, { id: 's3', done: true, doneAt: todayMs }, { id: 's4', done: true, doneAt: todayMs }, { id: 's5', done: true, doneAt: todayMs }] }
  ];

  const sumSpam = summary(histNormal, sessSpam, 5, todayISTNoon, questsWithSubs);
  assert.equal(sumSpam.todayRawExp, 65);
  // 55 + floor((65 - 55) * 0.5) = 60 EXP
  assert.equal(sumSpam.todayExp, 60);
  assert.equal(sumSpam.isDailyCapReached, true);
  assert.equal(sumSpam.dailyCap, 55);
  assert.ok(sumSpam.nextResetLabel.includes('12:00 AM IST'));
});

test('stats: leaderboard protection applies daily cap per day to prevent spamming', () => {
  // Season 1: start at FIRST_SEASON_FROM (Monday 19 Oct 2026)
  const day1 = Date.UTC(2026, 9, 20, 6, 30); // Tuesday 20 Oct 2026 (IST)
  const day2 = Date.UTC(2026, 9, 21, 6, 30); // Wednesday 21 Oct 2026 (IST)

  // Day 1: Honest use (30 quest EXP + 15 focus EXP = 45 EXP <= 55)
  const histDay1 = Array.from({ length: 5 }, (_, i) => ({ questId: 'd1_q' + i, tier: 3, doneAt: day1 + i * 1000 }));
  const sessDay1 = [{ minutes: 75, endedAt: day1 + 10000 }];

  // Day 2: Quest spammer tries to get 95 raw EXP in one day (30 quest EXP + 50 focus EXP + 15 subtasks EXP = 95 EXP)
  const histDay2 = Array.from({ length: 5 }, (_, i) => ({ questId: 'd2_q' + i, tier: 3, doneAt: day2 + i * 1000 }));
  const sessDay2 = [{ minutes: 250, endedAt: day2 + 10000 }]; // 50 EXP

  const allHist = [...histDay1, ...histDay2];
  const allSess = [...sessDay1, ...sessDay2];

  // Day 1 gave 45 EXP (under 55 cap)
  // Day 2 gave 80 raw EXP -> 55 + floor((80 - 55) * 0.5) = 55 + 12 = 67 EXP
  // Total seasonExp should be 45 + 67 = 112 EXP (NOT 45 + 80 = 125 EXP!)
  const sExp = seasonExp(allHist, allSess, 5, 1, []);
  assert.equal(sExp, 45 + 67);

  // All-time EXP summary also reflects daily capped values
  const sum = summary(allHist, allSess, 5, new Date(day2), []);
  assert.equal(sum.exp, 45 + 67);
});

test('dailycappop: shouldShowDailyCapPopup gate and message content', () => {
  // Under 55 points: no pop-up
  assert.equal(
    shouldShowDailyCapPopup({ todayRawExp: 50, seenDate: null, todayDate: '2026-10-29' }),
    false
  );

  // Crosses 55 points for the first time today: show pop-up
  assert.equal(
    shouldShowDailyCapPopup({ todayRawExp: 55, seenDate: null, todayDate: '2026-10-29' }),
    true
  );
  assert.equal(
    shouldShowDailyCapPopup({ todayRawExp: 60, seenDate: '', todayDate: '2026-10-29' }),
    true
  );

  // Already seen today: do NOT show again today
  assert.equal(
    shouldShowDailyCapPopup({ todayRawExp: 62, seenDate: '2026-10-29', todayDate: '2026-10-29' }),
    false
  );

  // Seen yesterday, crosses 55 on a new day: show pop-up!
  assert.equal(
    shouldShowDailyCapPopup({ todayRawExp: 56, seenDate: '2026-10-28', todayDate: '2026-10-29' }),
    true
  );

  // Content verification
  const content = getDailyCapPopupContent(Date.UTC(2026, 9, 29, 14, 0)); // 19:30 IST
  assert.ok(content.title.includes('Daily EXP Cap'));
  assert.ok(content.body.includes('55'));
  assert.ok(content.body.includes('reduced XP') || content.body.includes('reduced'));
  assert.ok(content.resetInfo.includes('12:00 AM IST'));
  assert.ok(content.resetInfo.includes('Tomorrow') || content.resetInfo.includes('midnight'));
});
