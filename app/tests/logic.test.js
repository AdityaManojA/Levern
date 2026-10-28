import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseQuest } from '../js/parse.js';
import { addDays, monthGrid, dueStatus, dueLabel, startOfWeek, addMonths, parseTime } from '../js/dates.js';
import { nextDue, rollForward, occurrences } from '../js/recur.js';
import { buildICS, googleLink, rrule } from '../js/ics.js';
import { dayExp, focusExp, streaks, summary, lastDays } from '../js/stats.js';

// Thursday 22 October 2026, 10:00 local
const NOW = new Date(2026, 9, 22, 10, 0);
const T = '2026-10-22';

test('parse: weekday, time and title cleanup', () => {
  const r = parseQuest('Renew passport, due Friday at 5pm', NOW);
  assert.equal(r.title, 'Renew passport');
  assert.equal(r.due, '2026-10-23');
  assert.equal(r.time, '17:00');
  assert.equal(r.tier, 1);   // due within 2 days -> P2
});
test('parse: relative dates', () => {
  assert.equal(parseQuest('call mum tomorrow', NOW).due, '2026-10-23');
  assert.equal(parseQuest('dentist in 3 days', NOW).due, '2026-10-25');
  assert.equal(parseQuest('plan trip next week', NOW).due, '2026-10-26');
  assert.equal(parseQuest('pay rent on 1 nov', NOW).due, '2026-11-01');
  assert.equal(parseQuest('book review oct 5', NOW).due, '2027-10-05');   // passed this year -> next year
  assert.equal(parseQuest('submit form 30/10', NOW).due, '2026-10-30');
  assert.equal(parseQuest('next thursday sync', NOW).due, '2026-10-29');
  assert.equal(parseQuest('thursday sync', NOW).due, T);
});
test('parse: tonight, today and urgency', () => {
  const r = parseQuest('finish essay tonight', NOW);
  assert.deepEqual([r.due, r.time, r.tier, r.title], [T, '20:00', 0, 'finish essay']);
  assert.equal(parseQuest('urgent: reply to landlord', NOW).tier, 0);
  assert.equal(parseQuest('tidy desk', NOW).tier, 4);
  assert.equal(parseQuest('learn sourdough someday', NOW).tier, 5);
  assert.equal(parseQuest('do laundry', NOW).tier, 3);
  assert.equal(parseQuest('do laundry p2', NOW).tier, 1);
});
test('parse: a time on its own is today, or tomorrow once passed', () => {
  assert.equal(parseQuest('stand-up at 11:30', NOW).due, T);
  assert.equal(parseQuest('gym 7am', NOW).due, '2026-10-23');
});
test('parse: repeats', () => {
  const r = parseQuest('water plants every day', NOW);
  assert.deepEqual(r.repeat, { freq: 'daily' });
  assert.equal(r.due, T); assert.equal(r.title, 'water plants'); assert.equal(r.tier, 3);
  const w = parseQuest('team sync every monday 10am', NOW);
  assert.deepEqual([w.repeat.freq, w.due, w.time], ['weekly', '2026-10-26', '10:00']);
  assert.equal(parseQuest('standup weekdays', NOW).repeat.freq, 'weekdays');
  assert.equal(parseQuest('pay bills monthly', NOW).repeat.freq, 'monthly');
});
test('parse: no false matches inside words', () => {
  const r = parseQuest('Wedding gift for Satish', NOW);
  assert.equal(r.due, null); assert.equal(r.title, 'Wedding gift for Satish');
});

test('dates: grid, week start, months, status', () => {
  const g = monthGrid(2026, 9);
  assert.equal(g.length, 42); assert.equal(g[0], '2026-09-28'); assert.ok(g.includes('2026-10-31'));
  assert.equal(startOfWeek('2026-10-25'), '2026-10-19');   // Sunday -> Monday before
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(dueStatus({ due: '2026-10-21' }, NOW), 'overdue');
  assert.equal(dueStatus({ due: T, time: '09:00' }, NOW), 'overdue');
  assert.equal(dueStatus({ due: T }, NOW), 'today');
  assert.equal(dueStatus({ due: '2026-10-24' }, NOW), 'soon');
  assert.equal(dueStatus({ due: '2026-10-21', done: true }, NOW), 'today');
  assert.equal(dueLabel({ due: '2026-10-20' }, NOW), 'Overdue · 2 days');
  assert.equal(dueLabel({ due: '2026-10-23', time: '17:30' }, NOW), 'Tomorrow 5:30 pm');
});

test('recur: next due and rolling forward', () => {
  assert.equal(nextDue('2026-10-23', { freq: 'weekdays' }), '2026-10-26');   // Fri -> Mon
  assert.equal(nextDue('2026-10-22', { freq: 'weekly', interval: 2 }), '2026-11-05');
  assert.equal(nextDue('2026-10-31', { freq: 'monthly' }), '2026-11-30');
  assert.equal(rollForward('2026-10-15', { freq: 'daily' }, NOW), '2026-10-23');   // overdue habit -> tomorrow
  assert.equal(rollForward(T, { freq: 'weekly' }, NOW), '2026-10-29');
  assert.equal(rollForward('2026-10-30', { freq: 'weekly' }, NOW), '2026-11-06');   // done early -> after its own due
  assert.deepEqual(occurrences({ due: '2026-10-20', repeat: { freq: 'weekly' } }, '2026-10-01', '2026-11-10'), ['2026-10-20', '2026-10-27', '2026-11-03', '2026-11-10']);
  assert.deepEqual(occurrences({ due: '2026-10-20' }, '2026-10-21', '2026-10-30'), []);
});

test('ics: events, repeats, alarms and escaping', () => {
  const qs = [
    { id: 1, title: 'Lab report; part 2, final', tier: 0, due: '2026-10-23', time: '17:00', notes: 'Line 1\nLine 2', subtasks: [{ title: 'graphs', done: true }],
      remind: { at: +new Date(2026, 9, 23, 16, 0), offset: 3600000 }, repeat: null },
    { id: 2, title: 'Water plants', tier: 3, due: T, repeat: { freq: 'daily' } },
    { id: 3, title: 'No date', tier: 3, due: null },
    { id: 4, title: 'Done', tier: 3, due: T, done: true },
  ];
  const ics = buildICS(qs, Date.UTC(2026, 9, 22));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 2);
  assert.match(ics, /SUMMARY:Lab report\\; part 2\\, final/);
  assert.match(ics, /DTSTART:20261023T170000/);
  assert.match(ics, /DESCRIPTION:Line 1\\nLine 2\\n\[x\] graphs/);
  assert.match(ics, /TRIGGER:-PT60M/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261022\r\nDTEND;VALUE=DATE:20261023/);
  assert.match(ics, /RRULE:FREQ=DAILY/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal(rrule({ freq: 'weekdays' }), 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR');
  const g = new URL(googleLink(qs[1]));
  assert.equal(g.searchParams.get('dates'), '20261022/20261023');
  assert.equal(g.searchParams.get('recur'), 'RRULE:FREQ=DAILY');
});

test('stats: EXP, streaks and summary', () => {
  assert.equal(dayExp(3, 5), 12);   // brief: 3 of 5 = 12 EXP
  assert.equal(dayExp(5, 5), 30);
  assert.equal(focusExp(25), 5);
  const day = (d, n) => Array.from({ length: n }, (_, i) => ({ doneAt: new Date(2026, 9, d, 9, i).getTime(), tier: i % 6 }));
  const hist = [...day(17, 2), ...day(18, 2), ...day(19, 2), ...day(21, 2), ...day(22, 1)];
  const s = streaks(hist, 2, NOW);
  assert.equal(s.current, 1);      // today (1/2) still open, yesterday kept, the 20th broke it
  assert.equal(s.best, 3);
  assert.equal(s.keptToday, false);
  const sum = summary(hist, [{ minutes: 25, endedAt: NOW.getTime() }], 2, NOW);
  assert.equal(sum.totalDone, 9);
  assert.equal(sum.todayCount, 1);
  assert.equal(sum.todayExp, 10 + 5);
  assert.equal(sum.keptThisMonth, 4);
  const last = lastDays(hist, [], 2, 7, NOW);
  assert.equal(last.length, 7); assert.equal(last[6].date, T); assert.equal(last[6].count, 1);
});

test('parseTime reads what people type into the time picker', () => {
  const cases = { '9': '09:00', '930': '09:30', '9:30': '09:30', '9.30pm': '21:30', '9 pm': '21:00', '21:05': '21:05', '12am': '00:00', '12pm': '12:00', '1230p': '12:30', ' 7:45 AM ': '07:45' };
  for (const [s, want] of Object.entries(cases)) assert.equal(parseTime(s), want, s);
  for (const s of ['', 'soon', '25:00', '9:75', '13pm', '0am']) assert.equal(parseTime(s), null, s);
});

test('Google event priorities merge per event, the later choice wins', async () => {
  const { mergeEventMeta, mergeDocs } = await import('../js/syncmerge.js');
  const a = { e1: { tier: 0, at: 10 }, e2: { tier: 3, at: 50 } }, b = { e1: { tier: 2, at: 20 }, e3: { tier: 5, at: 5 } };
  assert.deepEqual(mergeEventMeta(a, b), { e1: { tier: 2, at: 20 }, e2: { tier: 3, at: 50 }, e3: { tier: 5, at: 5 } });
  assert.deepEqual(mergeDocs({ eventMeta: a }, {}).eventMeta, a);
});

test('no example quests: a new list starts empty, and old ones are dropped when they load', async () => {
  const S = await import('../js/store.js');
  const { memoryAdapter } = await import('../js/storage.js');
  S.init(memoryAdapter());
  assert.equal(S.getState().quests.length, 0);
  S.init(memoryAdapter({ v: 3, quests: [{ id: 's', title: 'Book dentist', sample: true, createdAt: 1 }, { id: 'm', title: 'Mine', createdAt: 1 }], history: [], sessions: [], settings: {} }));
  assert.deepEqual(S.getState().quests.map(x => x.id), ['m']);
});

test('a quest done after it was due counts half toward the day\'s EXP', async () => {
  const { dayExp, summary, LATE } = await import('../js/stats.js');
  assert.equal(LATE, 0.5);
  const day = Date.UTC(2026, 9, 26, 6);
  const h = (late, i) => ({ questId: 'q' + i, tier: 3, doneAt: day + i * 60000, ...(late ? { late: true } : {}) });
  // target 5: one on time = 4 EXP, one late = 2 EXP
  assert.equal(summary([h(false, 1)], [], 5, new Date(day)).exp, dayExp(1, 5));
  assert.equal(summary([h(false, 1)], [], 5, new Date(day)).exp, 4);
  assert.equal(summary([h(true, 1)], [], 5, new Date(day)).exp, 2);
  // five done, two of them late: the share counts 4 of 5 (16 EXP), and the target bonus still comes (+10)
  const five = [h(false, 1), h(false, 2), h(false, 3), h(true, 4), h(true, 5)];
  assert.equal(summary(five, [], 5, new Date(day)).exp, 26);
});

test('store: deleteQuest and restoreQuest undo workflow', async () => {
  const S = await import('../js/store.js');
  const { memoryAdapter } = await import('../js/storage.js');
  S.init(memoryAdapter());

  const q = S.addQuest({ title: 'Undo Test', tier: 2 });
  assert.equal(S.getState().quests.length, 1);
  assert.equal(S.findQuest(q.id)?.title, 'Undo Test');

  // Delete quest
  S.deleteQuest(q.id);
  assert.equal(S.getState().quests.length, 0);
  assert.equal(S.findQuest(q.id), undefined);
  assert.ok(S.getState().tombstones.some(t => t.id === q.id));

  // Restore quest
  S.restoreQuest(q);
  assert.equal(S.getState().quests.length, 1);
  assert.equal(S.findQuest(q.id)?.title, 'Undo Test');
  // Tombstone should be removed
  assert.equal(S.getState().tombstones?.some(t => t.id === q.id), false);
});

test('constants: exports correct collection, storage, and service worker names', async () => {
  const { FIRESTORE_COLLECTIONS, STORAGE_KEYS, SW_CONFIG } = await import('../js/constants.js');
  assert.equal(FIRESTORE_COLLECTIONS.USERS, 'taskflowUsers');
  assert.equal(FIRESTORE_COLLECTIONS.BOARD, 'taskflowBoard');
  assert.equal(FIRESTORE_COLLECTIONS.PROFILES, 'taskflowProfiles');
  assert.equal(STORAGE_KEYS.STATE, 'taskflow.v1');
  assert.equal(STORAGE_KEYS.EVENTS, 'taskflow-events');
  assert.equal(SW_CONFIG.CACHE_VERSION, 'taskflow-v79');
});

test('stats: micro-EXP awards 2 EXP per subtask capped at 10 EXP per quest', async () => {
  const { subtasksExp, summary } = await import('../js/stats.js');
  const quests = [
    { id: 'q1', subtasks: [{ done: true }, { done: true }, { done: true }] },
    { id: 'q2', subtasks: [{ done: true }, { done: true }, { done: true }, { done: true }, { done: true }, { done: true }] },
    { id: 'q3', subtasks: [{ done: false }] },
  ];
  assert.equal(subtasksExp(quests), 16);
  const sum = summary([], [], 5, new Date(), quests);
  assert.equal(sum.subExp, 16);
  assert.equal(sum.exp, 16);
});

test('parse: extractTags detects and normalizes hashtags in quest titles', async () => {
  const { extractTags, parseQuest } = await import('../js/parse.js');
  assert.deepEqual(extractTags('Finish report #work #urgent'), ['work', 'urgent']);
  assert.deepEqual(extractTags('Buy groceries #Home #home'), ['home']);
  assert.deepEqual(extractTags('No tags here'), []);
  const p = parseQuest('Design mockups #UI-ux tomorrow at 3pm');
  assert.deepEqual(p.tags, ['ui-ux']);
});

test('ambient: supports kind selection and play/stop state', async () => {
  const { setAmbientKind, getAmbientKind, isAmbientActive, stopAmbient } = await import('../js/ambient.js');
  setAmbientKind('rain');
  assert.equal(getAmbientKind(), 'rain');
  setAmbientKind('purr');
  assert.equal(getAmbientKind(), 'purr');
  stopAmbient();
  assert.equal(isAmbientActive(), false);
});

test('store: snoozeTomorrow reschedules to 9am tomorrow', async () => {
  const S = await import('../js/store.js');
  const q = S.addQuest({ title: 'Tomorrow Test', tier: 1 });
  S.snoozeTomorrow(q.id);
  const updated = S.findQuest(q.id);
  assert.ok(updated.remind);
  const d = new Date(updated.remind.at);
  assert.equal(d.getHours(), 9);
  assert.equal(d.getMinutes(), 0);
  assert.equal(updated.remind.fired, false);
});

test('quests: matchQuest safely handles missing subtasks, null notes, and tags', async () => {
  const { matchQuest } = await import('../js/views/quests.js');
  const qWithoutSubtasks = { title: 'Call client', notes: null };
  assert.doesNotThrow(() => matchQuest(qWithoutSubtasks, 'call'));
  assert.equal(matchQuest(qWithoutSubtasks, 'call'), true);
  assert.equal(matchQuest(qWithoutSubtasks, 'undefined'), false);

  const qTagged = { title: 'Review budget #finance', notes: 'Urgent task' };
  assert.equal(matchQuest(qTagged, '', 'finance'), true);
  assert.equal(matchQuest(qTagged, '', 'personal'), false);
  assert.equal(matchQuest(qTagged, 'budget', 'finance'), true);
});

test('stats: summary safely tallies tiers with out-of-bounds or non-integer tier values', async () => {
  const { summary } = await import('../js/stats.js');
  const historyWithCorruptTiers = [
    { tier: 0, completedAt: Date.now() },
    { tier: 5, completedAt: Date.now() },
    { tier: -1, completedAt: Date.now() },
    { tier: 99, completedAt: Date.now() },
    { tier: null, completedAt: Date.now() },
    { tier: 'invalid', completedAt: Date.now() },
  ];
  const s = summary(historyWithCorruptTiers, [], 5, new Date(), []);
  assert.equal(s.tiers.length, 6);
  assert.ok(s.tiers.every(n => Number.isInteger(n) && !Number.isNaN(n)));
  assert.equal(s.tiers[0], 1);
  assert.equal(s.tiers[5], 1);
  assert.equal(s.tiers[3], 4);
});

test('dates: at constructs exact local timestamps across dates and times without DST drift', async () => {
  const { at } = await import('../js/dates.js');
  const ts = at('2026-10-22', '14:30');
  const d = new Date(ts);
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 9);
  assert.equal(d.getDate(), 22);
  assert.equal(d.getHours(), 14);
  assert.equal(d.getMinutes(), 30);

  const midnightTs = at('2026-10-22');
  const dMidnight = new Date(midnightTs);
  assert.equal(dMidnight.getDate(), 22);
  assert.equal(dMidnight.getHours(), 0);
  assert.equal(dMidnight.getMinutes(), 0);
});

test('add view: header contains matching theme x close on left and save button on right', async () => {
  globalThis.window = globalThis.window || {};
  globalThis.document = globalThis.document || { querySelector: () => null, addEventListener: () => {} };
  globalThis.localStorage = globalThis.localStorage || { getItem: () => null, setItem: () => {} };
  const { addQuestHeaderHTML } = await import('../js/views/add.js');
  const html = addQuestHeaderHTML();
  assert.ok(html.includes('sheet-h-left'));
  assert.ok(html.includes('data-close'));
  assert.ok(html.includes('sheet-close'));
  assert.ok(html.includes('<svg') && html.includes('viewBox="0 0 24 24"'));
  assert.ok(html.includes('sheet-save'));
  assert.ok(html.includes('Save'));
  assert.ok(!html.includes('>Close<'));
});
