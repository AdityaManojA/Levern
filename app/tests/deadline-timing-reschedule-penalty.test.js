import test from 'node:test';
import assert from 'node:assert/strict';
import { addQuest, updateQuest, toggleDone, findQuest, init, getState } from '../js/store.js';
import { memoryAdapter } from '../js/storage.js';
import { summary, dayExp, weightsByDay, LATE } from '../js/stats.js';
import { addDays, todayStr } from '../js/dates.js';

test('deadline reschedule penalty: 2 changes free, 3rd change (more than twice) flags half XP', () => {
  init(memoryAdapter());
  const futureDue = addDays(todayStr(), 3);

  // 1. Creation has 0 timing changes
  const q = addQuest({ title: 'Complete Quarterly Report', tier: 2, due: futureDue, time: '14:00' });
  assert.equal(q.timingChanges || 0, 0, 'new quest starts with 0 timing changes');
  assert.equal(q.timeChanged, false, 'new quest is not flagged as timeChanged');

  // 2. Non-deadline edits (title, tier, notes, duration) do not increment timing changes
  updateQuest(q.id, { title: 'Complete Quarterly Report (Updated Name)' });
  updateQuest(q.id, { tier: 1 });
  updateQuest(q.id, { notes: 'Important notes' });
  updateQuest(q.id, { duration: 90 });
  const qAfterEdits = findQuest(q.id);
  assert.equal(qAfterEdits.timingChanges || 0, 0, 'title/tier/notes/duration edits must not count as timing changes');
  assert.equal(qAfterEdits.timeChanged, false, 'title/tier/notes/duration edits must not flag quest as timeChanged');

  // 3. First deadline change: allowed freely
  updateQuest(q.id, { due: addDays(futureDue, 1) });
  const qFirstChange = findQuest(q.id);
  assert.equal(qFirstChange.timingChanges, 1, 'first deadline edit sets timingChanges to 1');
  assert.equal(qFirstChange.timeChanged, false, 'first deadline edit is allowed freely without penalty');

  // 4. Second deadline change: also allowed freely (not too cruel!)
  qFirstChange.lastTimingChangeAt = Date.now() - 15000;
  updateQuest(q.id, { time: '16:00' });
  const qSecondChange = findQuest(q.id);
  assert.equal(qSecondChange.timingChanges, 2, 'second deadline edit sets timingChanges to 2');
  assert.equal(qSecondChange.timeChanged, false, 'second deadline edit is still allowed freely');

  // 5. Third deadline change (more than twice): flags quest as changed
  qSecondChange.lastTimingChangeAt = Date.now() - 15000;
  updateQuest(q.id, { due: addDays(futureDue, 2) });
  const qThirdChange = findQuest(q.id);
  assert.equal(qThirdChange.timingChanges, 3, 'third deadline edit sets timingChanges to 3');
  assert.equal(qThirdChange.timeChanged, true, 'third deadline edit (>2) flags quest as timeChanged');

  // 6. Completion gives half XP
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

test('up to two deadline changes allow completing with full EXP', () => {
  init(memoryAdapter());
  const futureDue = addDays(todayStr(), 4);

  const q = addQuest({ title: 'Study for exam', tier: 3, due: futureDue, time: '10:00' });
  // First change: allowed freely
  updateQuest(q.id, { time: '11:00' });
  assert.equal(findQuest(q.id).timingChanges, 1);
  assert.equal(findQuest(q.id).timeChanged, false);

  // Second change: also allowed freely
  findQuest(q.id).lastTimingChangeAt = Date.now() - 15000;
  updateQuest(q.id, { due: addDays(futureDue, 1) });
  assert.equal(findQuest(q.id).timingChanges, 2);
  assert.equal(findQuest(q.id).timeChanged, false);

  const r = toggleDone(q.id);
  assert.equal(r.timeChanged, false, 'two timing changes do not flag timeChanged on completion');
  const hist = getState().history.find(h => h.questId === q.id);
  assert.equal(hist.timeChanged || false, false);

  const weights = weightsByDay([hist]);
  const dateStr = Object.keys(Object.fromEntries(weights))[0];
  assert.equal(weights.get(dateStr), 1, 'up to two deadline changes still receive full 1.0 weight');
});

test('same edit session: rapid due and time changes within 10s count as 1 change', () => {
  init(memoryAdapter());
  const futureDue = addDays(todayStr(), 3);

  const q = addQuest({ title: 'Design Review', tier: 2, due: futureDue, time: '10:00' });
  // User picks date in detail screen
  updateQuest(q.id, { due: addDays(futureDue, 1) });
  // User picks time 50ms later in same form
  updateQuest(q.id, { time: '15:00' });

  const current = findQuest(q.id);
  assert.equal(current.timingChanges, 1, 'rapid date and time change in same session counts as 1 change');
  assert.equal(current.timeChanged, false, 'not flagged on first grouped change');
});

test('repeating quest rolls forward with fresh timing change count for new occurrence', () => {
  init(memoryAdapter());
  const todayDue = todayStr();

  const q = addQuest({ title: 'Daily Workout', tier: 2, due: todayDue, repeat: { freq: 'daily' } });
  // Change timing 3 times on this occurrence (>2 times)
  updateQuest(q.id, { time: '08:00' });
  q.lastTimingChangeAt = Date.now() - 15000;
  updateQuest(q.id, { time: '09:00' });
  q.lastTimingChangeAt = Date.now() - 15000;
  updateQuest(q.id, { time: '10:00' });
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

  // 4. Completing a 6th rescheduled quest (>2 deadline changes) gives half EXP (30 -> 32, never zero!)
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

test('only deadline date and time affect EXP reduction; duration and priority changes do not', () => {
  init(memoryAdapter());
  const futureDue = addDays(todayStr(), 5);

  const q = addQuest({ title: 'Gym Workout', tier: 3, due: futureDue, time: '07:00', duration: 60 });
  assert.equal(q.timingChanges || 0, 0);
  assert.equal(q.timeChanged, false);

  // 1. Change duration multiple times across different sessions
  updateQuest(q.id, { duration: 90 });
  findQuest(q.id).lastTimingChangeAt = Date.now() - 15000;
  updateQuest(q.id, { duration: 120 });
  findQuest(q.id).lastTimingChangeAt = Date.now() - 15000;
  updateQuest(q.id, { duration: null });

  const qAfterDurations = findQuest(q.id);
  assert.equal(qAfterDurations.timingChanges || 0, 0, 'duration changes must never increment timing changes');
  assert.equal(qAfterDurations.timeChanged, false, 'duration changes must never flag quest as timeChanged');

  // 2. Change priority (tier) multiple times across different sessions
  updateQuest(q.id, { tier: 1 });
  findQuest(q.id).lastTimingChangeAt = Date.now() - 15000;
  updateQuest(q.id, { tier: 2 });
  findQuest(q.id).lastTimingChangeAt = Date.now() - 15000;
  updateQuest(q.id, { tier: 4 });

  const qAfterTiers = findQuest(q.id);
  assert.equal(qAfterTiers.timingChanges || 0, 0, 'priority changes must never increment timing changes');
  assert.equal(qAfterTiers.timeChanged, false, 'priority changes must never flag quest as timeChanged');

  // 3. Completing quest after multiple duration and priority changes gives full EXP
  const r = toggleDone(q.id);
  assert.equal(r.timeChanged, false, 'quest completed with full EXP despite duration/priority edits');
});
