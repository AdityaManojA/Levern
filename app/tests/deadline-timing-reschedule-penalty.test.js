import test from 'node:test';
import assert from 'node:assert/strict';
import { addQuest, updateQuest, toggleDone, findQuest, init, getState } from '../js/store.js';
import { memoryAdapter } from '../js/storage.js';
import { summary, dayExp, weightsByDay, LATE } from '../js/stats.js';

test('deadline & timing reschedule penalty: 1 change free, 2nd change flags half XP', () => {
  init(memoryAdapter());

  // 1. Creation has 0 timing changes
  const q = addQuest({ title: 'Complete Quarterly Report', tier: 2, due: '2026-11-10', time: '14:00' });
  assert.equal(q.timingChanges || 0, 0, 'new quest starts with 0 timing changes');
  assert.equal(q.timeChanged, false, 'new quest is not flagged as timeChanged');

  // 2. Non-timing edits (title, tier, notes) do not increment timing changes
  updateQuest(q.id, { title: 'Complete Quarterly Report (Updated Name)' });
  updateQuest(q.id, { tier: 1 });
  updateQuest(q.id, { notes: 'Important notes' });
  const qAfterName = findQuest(q.id);
  assert.equal(qAfterName.timingChanges || 0, 0, 'name/tier/notes edits must not count as timing changes');
  assert.equal(qAfterName.timeChanged, false, 'name/tier/notes edits must not flag quest as timeChanged');

  // 3. First timing change: allowed freely
  updateQuest(q.id, { due: '2026-11-12' });
  const qFirstChange = findQuest(q.id);
  assert.equal(qFirstChange.timingChanges, 1, 'first timing edit sets timingChanges to 1');
  assert.equal(qFirstChange.timeChanged, false, 'first timing edit is allowed freely without penalty');

  // 4. Second timing change (after debounce window): flags quest as changed
  // Manually backdate lastTimingChangeAt to simulate a second change later on
  qFirstChange.lastTimingChangeAt = Date.now() - 15000;
  updateQuest(q.id, { due: '2026-11-15' });
  const qSecondChange = findQuest(q.id);
  assert.equal(qSecondChange.timingChanges, 2, 'second timing edit sets timingChanges to 2');
  assert.equal(qSecondChange.timeChanged, true, 'second timing edit flags quest as timeChanged');

  // 5. Completion gives half XP
  const r = toggleDone(q.id);
  assert.ok(r.done, 'quest marked done');
  assert.equal(r.timeChanged, true, 'toggleDone returns timeChanged flag');

  const hist = getState().history.find(h => h.questId === q.id);
  assert.ok(hist, 'history record exists');
  assert.equal(hist.timeChanged, true, 'history record flagged as timeChanged');

  // Verify weightsByDay gives 0.5 (half XP) for this quest
  const weights = weightsByDay([hist]);
  const dateStr = Object.keys(Object.fromEntries(weights))[0];
  assert.equal(weights.get(dateStr), LATE, 'rescheduled quest receives 0.5 weight (half EXP)');
});

test('first timing change allows completing with full EXP', () => {
  init(memoryAdapter());

  const q = addQuest({ title: 'Study for exam', tier: 3, due: '2026-11-10', time: '10:00' });
  // First change: allowed once freely
  updateQuest(q.id, { time: '11:00' });
  assert.equal(findQuest(q.id).timingChanges, 1);
  assert.equal(findQuest(q.id).timeChanged, false);

  const r = toggleDone(q.id);
  assert.equal(r.timeChanged, false, 'single timing change does not flag timeChanged on completion');
  const hist = getState().history.find(h => h.questId === q.id);
  assert.equal(hist.timeChanged || false, false);

  const weights = weightsByDay([hist]);
  const dateStr = Object.keys(Object.fromEntries(weights))[0];
  assert.equal(weights.get(dateStr), 1, 'single timing change still receives full 1.0 weight');
});

test('same edit session: rapid due and time changes within 10s count as 1 change', () => {
  init(memoryAdapter());

  const q = addQuest({ title: 'Design Review', tier: 2, due: '2026-11-10', time: '10:00' });
  // User picks date in detail screen
  updateQuest(q.id, { due: '2026-11-11' });
  // User picks time 50ms later in same form
  updateQuest(q.id, { time: '15:00' });

  const current = findQuest(q.id);
  assert.equal(current.timingChanges, 1, 'rapid date and time change in same session counts as 1 change');
  assert.equal(current.timeChanged, false, 'not flagged on first grouped change');
});

test('repeating quest rolls forward with fresh timing change count for new occurrence', () => {
  init(memoryAdapter());

  const q = addQuest({ title: 'Daily Workout', tier: 2, due: '2026-11-09', repeat: { freq: 'daily' } });
  // Change timing twice on today's occurrence
  updateQuest(q.id, { time: '08:00' });
  q.lastTimingChangeAt = Date.now() - 15000;
  updateQuest(q.id, { time: '09:00' });
  assert.equal(findQuest(q.id).timeChanged, true);

  // Complete occurrence
  const r = toggleDone(q.id);
  assert.ok(r.done);
  assert.equal(r.timeChanged, true, 'completed occurrence was flagged');

  // Next occurrence should have clean slate
  const nextOccurrence = findQuest(q.id);
  assert.equal(nextOccurrence.timingChanges, 0, 'new occurrence resets timingChanges to 0');
  assert.equal(nextOccurrence.timeChanged, false, 'new occurrence resets timeChanged to false');
});

test('completing a quest always awards EXP and is never zero (regular and rescheduled)', () => {
  init(memoryAdapter());

  const target = 5;
  const today = Date.UTC(2026, 10, 9, 10, 0); // Nov 9, 2026 IST
  const h = (timeChanged, i) => ({
    questId: 'q_' + i,
    tier: 3,
    doneAt: today + i * 1000,
    ...(timeChanged ? { timeChanged: true, half: true } : {})
  });

  // Target 5: each regular quest is 4 EXP. Each rescheduled quest is 2 EXP.
  // 1. First quest (regular): 0 -> 4 EXP (+4)
  assert.equal(summary([h(false, 1)], [], target, new Date(today)).exp, 4);

  // 2. First quest (rescheduled): 0 -> 2 EXP (+2, half EXP, never zero)
  assert.equal(summary([h(true, 1)], [], target, new Date(today)).exp, 2);

  // 3. Godfrey scenario: 5 quests done (target reached = 30 EXP).
  // Completing a 6th regular quest MUST increase EXP (30 -> 34, NOT 30!)
  const fiveNormal = [h(false, 1), h(false, 2), h(false, 3), h(false, 4), h(false, 5)];
  const expFive = summary(fiveNormal, [], target, new Date(today)).exp;
  assert.equal(expFive, 30, '5 regular quests on target 5 give 30 EXP');

  const sixWithRegular = [...fiveNormal, h(false, 6)];
  const expSixRegular = summary(sixWithRegular, [], target, new Date(today)).exp;
  assert.equal(expSixRegular, 34, 'completing 6th regular quest awards 4 EXP (30 -> 34, never 0!)');
  assert.ok(expSixRegular > expFive, 'EXP increased after completing task');

  // 4. Completing a 6th rescheduled quest (>1 timing changes) gives half EXP (30 -> 32, never zero!)
  const sixWithRescheduled = [...fiveNormal, h(true, 6)];
  const expSixRescheduled = summary(sixWithRescheduled, [], target, new Date(today)).exp;
  assert.equal(expSixRescheduled, 32, 'completing 6th rescheduled quest awards 2 EXP (30 -> 32, half EXP, never zero!)');
  assert.ok(expSixRescheduled > expFive, 'EXP increased after completing rescheduled task');

  // 5. Subsequent tasks continue awarding EXP
  const sevenRegular = [...sixWithRegular, h(false, 7)];
  assert.equal(summary(sevenRegular, [], target, new Date(today)).exp, 38, '7th regular quest awards 4 EXP (34 -> 38)');

  const sevenWithRescheduled = [...sixWithRegular, h(true, 7)];
  assert.equal(summary(sevenWithRescheduled, [], target, new Date(today)).exp, 36, '7th rescheduled quest awards 2 EXP (34 -> 36, half EXP)');
});
