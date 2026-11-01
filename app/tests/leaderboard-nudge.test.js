import test from 'node:test';
import assert from 'node:assert/strict';

// Test-driven development for leaderboard completion nudge
// Rule: At most once per day, shown when completing a task, never on startup

// Mock localStorage if in node environment
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: k => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
    clear: () => store.clear(),
  };
}

test('leaderboard nudge: shouldShowLeaderboardNudge allows exactly once per day', async () => {
  localStorage.clear();
  const { shouldShowLeaderboardNudge, maybeLeaderboardNudge } = await import('../js/leaderboardnudge.js');

  const now = new Date('2026-11-02T10:00:00Z').getTime();

  // First check on Day 1: should be allowed
  assert.equal(shouldShowLeaderboardNudge(now), true, 'First task completion of the day should allow nudge');

  // Trigger the nudge
  const shown = maybeLeaderboardNudge(now);
  assert.equal(shown, true, 'First completion should show the leaderboard nudge');

  // Second task completion 5 minutes later on same day
  const fiveMinLater = now + 5 * 60 * 1000;
  assert.equal(shouldShowLeaderboardNudge(fiveMinLater), false, 'Second completion on same day must NOT allow nudge');
  assert.equal(maybeLeaderboardNudge(fiveMinLater), false, 'Second completion must return false');

  // Third, fourth, fifth completions on same day: all blocked
  for (let i = 1; i <= 5; i++) {
    const later = now + i * 3600 * 1000;
    assert.equal(maybeLeaderboardNudge(later), false, `Completion ${i + 2} on same day must be blocked`);
  }

  // Next day (Day 2): should allow again exactly once
  const nextDay = now + 24 * 3600 * 1000;
  assert.equal(shouldShowLeaderboardNudge(nextDay), true, 'Next day first completion should allow nudge again');
  assert.equal(maybeLeaderboardNudge(nextDay), true, 'Next day first completion should show nudge');
  assert.equal(shouldShowLeaderboardNudge(nextDay + 1000), false, 'Next day second completion should be blocked');
});

test('leaderboard nudge: suppressed if user is already on #/leaderboard or dialog is open', async () => {
  localStorage.clear();
  const { shouldShowLeaderboardNudge } = await import('../js/leaderboardnudge.js');

  const now = new Date('2026-11-02T10:00:00Z').getTime();

  // Mock location hash
  globalThis.location = { hash: '#/leaderboard' };
  assert.equal(shouldShowLeaderboardNudge(now), false, 'Should not show nudge if already on leaderboard page');

  // On home view
  globalThis.location = { hash: '#/home' };
  assert.equal(shouldShowLeaderboardNudge(now), true, 'Should allow nudge when on home');
});

test('leaderboard nudge: app startup does not schedule maybeLeaderboardNudge', async () => {
  const fs = await import('node:fs');
  const mainSrc = fs.readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

  // Verify that the startup setTimeout for maybeLeaderboardNudge is removed
  assert.ok(
    !mainSrc.includes('maybeLeaderboardNudge(); }, 4000)'),
    'Startup 4s timer for leaderboard nudge must be removed from main.js'
  );
  assert.ok(
    !mainSrc.includes('import { maybeLeaderboardNudge } from \'./leaderboardnudge.js\''),
    'main.js should not import maybeLeaderboardNudge for startup'
  );
});

test('leaderboard nudge: completeQuest calls maybeLeaderboardNudge on quest completion', async () => {
  const fs = await import('node:fs');
  const completeSrc = fs.readFileSync(new URL('../js/complete.js', import.meta.url), 'utf8');

  assert.ok(
    completeSrc.includes('maybeLeaderboardNudge'),
    'complete.js must import and call maybeLeaderboardNudge upon task completion'
  );
});
