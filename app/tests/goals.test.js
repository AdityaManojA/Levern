// Weekly goals: the week runs Monday to Sunday, and times past the goal count as extra.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalProgress, weekStart, clampGoal } from '../js/goals.js';

const local = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();

test('the week starts on Monday', () => {
  // Wed 21 Oct 2026 → the week began Mon 19 Oct
  assert.equal(weekStart(local(2026, 10, 21)), local(2026, 10, 19, 0));
  // Sunday 25 Oct belongs to the week that began Mon 19 Oct
  assert.equal(weekStart(local(2026, 10, 25, 23)), local(2026, 10, 19, 0));
});

test('completions count within the current week only', () => {
  const now = local(2026, 10, 21);
  const q = { goal: { target: 3, log: [local(2026, 10, 19), local(2026, 10, 21), local(2026, 10, 14)] } };   // last week's one doesn't count
  assert.deepEqual(goalProgress(q, now), { count: 2, target: 3, met: false, extra: 0 });
});

test('the goal is met at the target, and anything past it is extra', () => {
  const now = local(2026, 10, 21);
  const log = [local(2026, 10, 19), local(2026, 10, 20), local(2026, 10, 21), local(2026, 10, 21, 18)];
  assert.deepEqual(goalProgress({ goal: { target: 3, log } }, now), { count: 4, target: 3, met: true, extra: 1 });
});

test('the target stays between 1 and 14', () => {
  assert.equal(clampGoal(0), 1);
  assert.equal(clampGoal(99), 14);
  assert.equal(clampGoal('2'), 2);
});
