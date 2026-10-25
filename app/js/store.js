// App state and every action that changes it. Views read getState(); changes go through the
// functions below, which save through the storage adapter and notify subscribers.
import { localAdapter } from './storage.js';
import { todayStr, addDays, at, dueTimestamp, dueStatus, toStr } from './dates.js';
import { rollForward, anchored } from './recur.js';
import { nextMultiAt } from './multi.js';
import { cleanSketches } from './ink.js';
import { DEFAULT_ALERTS, cleanAlerts } from './alerts.js';
import { clampGoal, goalProgress } from './goals.js';

// the theme's priority colours (app.css --p1..--p6), so they follow light and dark mode
export const TIER_COLORS = ['var(--p1)', 'var(--p2)', 'var(--p3)', 'var(--p4)', 'var(--p5)', 'var(--p6)'];
const VERSION = 2;
const DEFAULT_SETTINGS = {
  target: 5, tierNames: ['Critical', 'High', 'Medium', 'Normal', 'Low', 'Someday'],
  // sound effects start off when the device asks for reduced motion
  sound: !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches), volume: 0.6, notify: true, focusMin: 25, breakMin: 5, snoozeMin: 10,
  name: '', profile: '', voice: true,
  // boardName: what the leaderboard shows (empty = name). theme: 'light', 'dark' or 'auto' (follow the device)
  boardName: '', theme: 'light',
  // mochiColor: his coat, one of mochi.js COATS
  mochi: true, roam: true, speed: 'slow', mochiSound: true, annoy: 5, mochiColor: 'black',
  // profilePublic: anyone signed in can open your profile (off until you turn it on).
  // rankSeen: the season rank you were last told about ({ season, step }); rankHistory: your best rank per season
  // ({ [season]: { rank, exp } }); both keep the rank-up pop-up and the profile's season history.
  profilePublic: false, rankSeen: null, rankHistory: {},
};

let adapter = localAdapter('taskflow.v1');
let state = null;
const subs = new Set();

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Example quests (the samples and the onboarding starters) are marked sample: true. They stay in the app
// to show how it works, but never go to anyone's account, calendar or Solodesk. Rewriting one makes it yours.
const SAMPLE_TITLES = new Set(['Submit lab report', 'Book dentist', 'Read chapter 4', 'Water the plants', 'Organise notes folder', 'Learn to bake sourdough',
  'Revise for the maths test', 'Finish history essay draft', 'Pack bag for tomorrow', 'Reply to client email', 'Prepare Monday slides', 'Weekly team sync',
  'Update project tracker', 'Clear out downloads folder', 'Call mum', 'Go for a walk']);
// quests saved before the flag existed: an untouched example still has its original title and was never edited
const looksLikeSample = q => q.sample === undefined && SAMPLE_TITLES.has(q.title) && Math.abs((q.updatedAt || q.createdAt || 0) - (q.createdAt || 0)) < 5000;
// Examples an older version turned into ordinary quests and copied into accounts: it did that whenever an example's
// date changed, so a repeating example became "yours" the first time it was ticked, and ended up on every device.
// The examples of one batch still carry their example titles and were created within two seconds of each other,
// which a person typing quests never does: such a group is marked as leaked examples (a lone one is left alone),
// and leaked examples are removed (dropLeaked) wherever they turn up: on the device, in the account, in a sync.
function markLeakedExamples(quests) {
  const ex = (quests || []).filter(q => q.sample !== true && SAMPLE_TITLES.has(q.title)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  let group = [];
  const flush = () => { if (group.length >= 2) for (const q of group) { q.sample = true; q.leaked = true; } group = []; };
  for (const q of ex) { if (group.length && (q.createdAt || 0) - (group[0].createdAt || 0) > 2000) flush(); group.push(q); }
  flush();
  // a device shows one batch of examples at most: older batches (piled up by resets and syncs) are leaked too
  const batches = [];
  for (const q of (quests || []).filter(x => x.sample === true && !x.leaked).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))) {
    const last = batches[batches.length - 1];
    if (last && (q.createdAt || 0) - (last[0].createdAt || 0) <= 2000) last.push(q); else batches.push([q]);
  }
  for (const b of batches.slice(0, -1)) for (const q of b) q.leaked = true;
}
export function markSamples(quests) { for (const q of quests || []) if (looksLikeSample(q)) q.sample = true; markLeakedExamples(quests); return quests; }
export const dropLeaked = quests => (quests || []).filter(q => !q.leaked);
// what makes an example yours: rewriting it (its name, notes or steps). Dates, times, repeats and priority are left
// out on purpose: the app changes them by itself (ticking a repeating example moves its date), which must not.
const sampleKey = q => JSON.stringify([q.title, q.notes, (q.subtasks || []).map(s => s.title)]);

function seed() {
  const t = todayStr();
  const q = (title, tier, due, extra = {}) => ({ id: uid(), title, tier, due, time: null, notes: '', subtasks: [], repeat: null, remind: null, done: false, doneAt: null, createdAt: Date.now(), sample: true, ...extra });
  return [
    q('Submit lab report', 0, t, { time: '17:00', subtasks: [{ id: uid(), title: 'Write up method', done: true, tier: 0 }, { id: uid(), title: 'Add graphs', done: false, tier: 1 }],
      remind: { at: at(t, '17:00') - 3600000, offset: 3600000, fired: false, dismissed: false } }),
    q('Book dentist', 1, addDays(t, 1)),
    q('Read chapter 4', 2, addDays(t, 3), { notes: 'Pages 80–112. Make flashcards for the key terms.' }),
    q('Water the plants', 3, t, { repeat: { freq: 'daily' } }),
    q('Organise notes folder', 4, null),
    q('Learn to bake sourdough', 5, null),
  ];
}

// starter quests picked in onboarding ("About you"), replacing the samples while nothing has been touched
const STARTERS = {
  student: [['Revise for the maths test', 1, 2], ['Finish history essay draft', 2, 4], ['Read chapter 4', 2, 3], ['Pack bag for tomorrow', 3, 0, { repeat: { freq: 'weekdays' } }], ['Organise notes folder', 4, null]],
  work: [['Reply to client email', 0, 0], ['Prepare Monday slides', 1, 3], ['Weekly team sync', 3, 1, { repeat: { freq: 'weekly' }, time: '10:00' }], ['Update project tracker', 3, 2], ['Clear out downloads folder', 4, null]],
  personal: [['Book dentist', 1, 1], ['Water the plants', 3, 0, { repeat: { freq: 'daily' } }], ['Call mum', 2, 2, { time: '18:00' }], ['Go for a walk', 3, 0], ['Learn to bake sourdough', 5, null]],
};
export function applyStarter(kind) {
  commit(s => {
    if (!s.seeded || s.history.length) return;
    const t = todayStr();
    s.quests = kind === 'empty' ? [] : (STARTERS[kind] || []).map(([title, tier, inDays, extra = {}]) => ({ id: uid(), title, tier, due: inDays == null ? null : addDays(t, inDays), time: null, notes: '', subtasks: [], repeat: null, remind: null, done: false, doneAt: null, createdAt: Date.now(), sample: true, ...extra }));
  });
}
export function finishOnboarding() { commit(s => { s.onboarded = true; }); }

function fresh() {
  return { v: VERSION, quests: seed(), history: [], sessions: [], timer: null, settings: { ...DEFAULT_SETTINGS }, seeded: true };
}

export function init(customAdapter) {
  if (customAdapter) adapter = customAdapter;
  const saved = adapter.load();
  state = saved && saved.v ? migrate(saved) : fresh();
  if (!saved) adapter.save(state);
  return state;
}
function migrate(s) {
  s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
  s.quests ||= []; s.history ||= []; s.sessions ||= []; s.timer ??= null; s.notifs ||= []; s.tombstones ||= [];
  // each setting's own change time (see commit); a save from before that gets the old whole-settings time on every key
  s.settingsStamps ||= Object.fromEntries(Object.keys(s.settings).map(k => [k, s.settingsUpdatedAt || 0]));
  for (const q of s.quests) q.updatedAt ??= q.createdAt || 0;
  for (const q of s.quests) { q.subtasks ||= []; q.notes ??= ''; if (q.sketches) q.sketches = cleanSketches(q.sketches); }
  s.quests = dropLeaked(markSamples(s.quests));
  // saves from v1 never had seeded cleared when quests were added, so never swap their quests for starters
  if ((s.v || 1) < 2) s.seeded = false;
  s.v = VERSION;
  return s;
}

export const getState = () => state;
export const subscribe = fn => { subs.add(fn); return () => subs.delete(fn); };
// mutate state, save, and tell the views. opts.quiet: save without re-rendering (typing in a field)
// Every change is stamped for syncing with the server copy: quests get updatedAt, deleted quests leave a
// tombstone, and history / sessions / settings get a *UpdatedAt. Changes that came from the server
// (opts.fromSync) keep the server's stamps.
const saveSubs = new Set();
export const onSave = fn => { saveSubs.add(fn); return () => saveSubs.delete(fn); };
export function commit(fn, opts = {}) {
  const track = !opts.fromSync && state;
  let before, hBefore, sBefore, stBefore;
  let samplesBefore;
  if (track) {
    before = new Map(state.quests.map(q => [q.id, JSON.stringify(q)]));
    samplesBefore = new Map(state.quests.filter(q => q.sample).map(q => [q.id, sampleKey(q)]));
    hBefore = JSON.stringify(state.history); sBefore = JSON.stringify(state.sessions); stBefore = JSON.stringify(state.settings);
  }
  const r = fn(state);
  if (track) {
    const now = Date.now(), ids = new Set();
    for (const q of state.quests) {
      ids.add(q.id);
      // an example quest the person rewrote (name, date, notes…) is now really theirs
      if (q.sample && samplesBefore.has(q.id) && samplesBefore.get(q.id) !== sampleKey(q)) q.sample = false;
      if (before.get(q.id) !== JSON.stringify(q)) q.updatedAt = now;
    }
    state.tombstones ||= [];
    for (const id of before.keys()) if (!ids.has(id)) state.tombstones.push({ id, deletedAt: now });
    if (JSON.stringify(state.history) !== hBefore) state.historyUpdatedAt = now;
    if (JSON.stringify(state.sessions) !== sBefore) state.sessionsUpdatedAt = now;
    if (JSON.stringify(state.settings) !== stBefore) {
      // stamp each setting that changed, so syncing merges settings one by one: changing the focus length on one
      // phone no longer brings back that phone's old copy of every other setting (daily reminders included)
      state.settingsUpdatedAt = now;
      const old = JSON.parse(stBefore) || {}, st = state.settingsStamps ||= {};
      for (const k of new Set([...Object.keys(old), ...Object.keys(state.settings)])) if (JSON.stringify(old[k]) !== JSON.stringify(state.settings[k])) st[k] = now;
    }
  }
  adapter.save(state);
  saveSubs.forEach(f => f(state, opts));
  if (!opts.quiet) subs.forEach(f => f(state, opts));
  return r;
}
// the parts of the data that sync with the server
export const SYNC_KEYS = ['quests', 'tombstones', 'history', 'historyUpdatedAt', 'sessions', 'sessionsUpdatedAt', 'settings', 'settingsUpdatedAt', 'settingsStamps', 'eventMeta'];

// TaskFlow's own notes on the person's Google Calendar events (only a priority for now), by event id.
// Google stays the owner of the event itself: TaskFlow never changes or deletes it there.
export const eventTier = id => state.eventMeta?.[id]?.tier ?? null;
export function setEventTier(id, tier) {
  commit(s => { s.eventMeta = { ...(s.eventMeta || {}), [id]: { tier, at: Date.now() } }; });
}
export const syncDoc = () => Object.fromEntries(SYNC_KEYS.map(k => [k, state[k]]));
export function adoptSynced(doc) { if (doc.quests) doc.quests = dropLeaked(markSamples(doc.quests)); commit(s => { for (const k of SYNC_KEYS) if (doc[k] !== undefined) s[k] = k === 'settings' ? { ...DEFAULT_SETTINGS, ...doc[k] } : doc[k]; }, { fromSync: true }); }

export const findQuest = id => state.quests.find(q => q.id === id);
export const tierLabel = t => `P${t + 1} · ${state.settings.tierNames[t]}`;

/* ---------- quests ---------- */
export function addQuest(data) {
  const q = { id: uid(), title: data.title, tier: data.tier ?? 3, due: data.due || null, time: data.time || null, notes: data.notes || '',
    subtasks: (data.subtasks || []).map(s => typeof s === 'string' ? { id: uid(), title: s, done: false, tier: data.tier ?? 3 } : s),
    repeat: anchored(data.repeat, data.due) || null, remind: null, done: false, doneAt: null, createdAt: Date.now(), sample: false };
  // a quest with a due date always reminds at its due time, unless its alerts say otherwise.
  // A reminder set for several times a day is kept as it is (the default alert used to replace it with one).
  if (q.due && !data.remind?.multi) q.alerts = cleanAlerts(data.alerts ?? DEFAULT_ALERTS);
  // a weekly goal has no day: it counts completions in the week instead
  if (data.goal) { q.goal = { target: clampGoal(data.goal.target), log: [] }; q.due = null; q.time = null; q.alerts = undefined; }
  if (data.sketches && data.sketches.length) q.sketches = data.sketches.map(k => ({ id: uid(), createdAt: Date.now(), ...k }));
  commit(s => { s.quests.push(q); s.seeded = false; });
  if (q.alerts) setAlerts(q.id, q.alerts);
  else if (data.remind) setReminder(q.id, data.remind);
  return q;
}

// the reminders for a dated quest: a list of minutes before the due time (0 = at the due time)
export function setAlerts(id, list) {
  commit(() => {
    const q = findQuest(id); if (!q || !q.due) return;
    state.seeded = false;
    q.alerts = cleanAlerts(list);
    syncNearest(q);
  });
}
// the quest's single reminder shows its next alert, so the notifications and the list have one to show
export function syncNearest(q, now = Date.now()) {
  if (!q.alerts) return;
  if (!q.due) { q.remind = null; return; }
  const base = reminderBase(q);
  const next = q.alerts.map(m => ({ m, at: base - m * 60000 })).filter(x => x.at > now).sort((a, b) => a.at - b.at)[0];
  if (!next) { if (q.remind && !q.remind.fired) q.remind = null; return; }
  if (q.remind && q.remind.at === next.at && q.remind.offset === next.m * 60000) return;   // already showing it
  q.remind = { at: next.at, offset: next.m * 60000, fired: false, dismissed: false };
}
export function updateQuest(id, patch, opts) {
  commit(() => {
    const q = findQuest(id); if (!q) return;
    const dueChanged = ('due' in patch && patch.due !== q.due) || ('time' in patch && patch.time !== q.time);
    Object.assign(q, patch);
    state.seeded = false;
    if (q.repeat && !q.due) q.due = todayStr();
    if ('due' in patch || 'repeat' in patch) q.repeat = anchored(q.repeat, q.due);   // a monthly/yearly repeat keeps to the new date
    // a reminder set relative to the due date moves with it
    if (dueChanged && q.remind && q.remind.offset != null) {
      if (q.due) q.remind = { ...q.remind, at: reminderBase(q) - q.remind.offset, fired: false, dismissed: false };
      else q.remind.offset = null;
    }
    if (dueChanged && q.alerts) syncNearest(q);
  }, opts);
}
// take back the last time logged for a weekly goal
export function undoGoal(id) {
  commit(s => {
    const q = findQuest(id); if (!q?.goal || !q.goal.log.length) return;
    q.goal.log.pop();
    const i = s.history.map(h => h.questId).lastIndexOf(id);
    if (i >= 0) s.history.splice(i, 1);
  });
}
export function deleteQuest(id) { commit(s => { s.quests = s.quests.filter(q => q.id !== id); s.seeded = false; }); }

// returns { done, next } where next is the new due date when a repeating quest rolls forward
export function toggleDone(id) {
  return commit(s => {
    const q = findQuest(id); if (!q) return {};
    // a weekly goal: each tick logs one more time this week (it is never "done", so it stays on the list)
    if (q.goal) {
      const now = Date.now();
      q.goal.log.push(now);
      s.history.push({ questId: q.id, title: q.title, tier: q.tier, doneAt: now });
      state.seeded = false;
      return { done: false, goal: true, progress: goalProgress(q, now) };
    }
    if (q.done) {   // un-tick: drop the latest history entry for it
      q.done = false; q.doneAt = null;
      const i = s.history.map(h => h.questId).lastIndexOf(id);
      if (i >= 0) s.history.splice(i, 1);
      return { done: false };
    }
    // a repeating quest counts once per occurrence: once its next date is ahead, today's is already done
    if (q.repeat && q.due && q.due > todayStr()) return { done: false, blocked: true, next: q.due };
    s.history.push({ questId: q.id, title: q.title, tier: q.tier, doneAt: Date.now() });
    noteNotif(s, q.id, 'done');
    if (q.repeat && q.due) {
      const next = rollForward(q.due, q.repeat);
      q.due = next;
      q.subtasks.forEach(st => { st.done = false; });
      if (q.remind) q.remind = q.remind.multi ? { ...q.remind, at: nextMultiAt(q.remind.multi, at(q.due, '00:00') - 1), fired: false, dismissed: false } : q.remind.offset != null ? { ...q.remind, at: reminderBase(q) - q.remind.offset, fired: false, dismissed: false } : null;
      if (q.alerts) { q.remind = null; syncNearest(q, at(q.due, '00:00') - 1); }   // the alerts come back for the next occurrence
      return { done: true, next };
    }
    q.done = true; q.doneAt = Date.now();
    if (q.remind) q.remind.dismissed = true;
    return { done: true };
  });
}

/* ---------- subtasks ---------- */
export function addSubtask(id, title) { commit(s => { s.seeded = false; const q = findQuest(id); q && q.subtasks.push({ id: uid(), title, done: false, tier: q.tier }); }); }
export function updateSubtask(id, sid, patch, opts) { commit(() => { const st = findQuest(id)?.subtasks.find(x => x.id === sid); st && Object.assign(st, patch); }, opts); }
export function removeSubtask(id, sid) { commit(() => { const q = findQuest(id); if (q) q.subtasks = q.subtasks.filter(x => x.id !== sid); }); }

/* ---------- sketches and handwriting (see ink.js) ---------- */
export function addSketch(id, sketch) {
  const k = { id: uid(), createdAt: Date.now(), kind: 'sketch', ...sketch };
  commit(s => { s.seeded = false; const q = findQuest(id); if (q) (q.sketches ||= []).push(k); });
  return k;
}
export function updateSketch(id, kid, patch) { commit(() => { const k = findQuest(id)?.sketches?.find(x => x.id === kid); k && Object.assign(k, patch, { editedAt: Date.now() }); }); }
export function removeSketch(id, kid) { commit(() => { const q = findQuest(id); if (q && q.sketches) { q.sketches = q.sketches.filter(x => x.id !== kid); if (!q.sketches.length) delete q.sketches; } }); }

/* ---------- reminders ----------
   q.remind = { at, offset, fired, dismissed }
   offset: ms before the due time when set relative to the due date (moves with it and repeats), else null.
   A reminder is "due" once fired and until the quest is done or the reminder is dismissed or snoozed. */
export const reminderBase = q => q.due ? at(q.due, q.time || '09:00') : null;
// spec: { at } absolute, or { offset } minutes-before-due in ms
export function setReminder(id, spec) {
  commit(() => {
    const q = findQuest(id); if (!q) return;
    state.seeded = false;
    if (!spec) { q.remind = null; return; }
    const offset = spec.offset != null && q.due ? spec.offset : null;
    const when = offset != null ? reminderBase(q) - offset : spec.at;
    q.remind = { at: when, offset, fired: false, dismissed: false, ...(spec.multi ? { multi: spec.multi } : {}) };
  });
}
export const isReminderDue = q => !!(q.remind && q.remind.fired && !q.remind.dismissed && !q.done);
export const dueReminders = () => state.quests.filter(isReminderDue).sort((a, b) => a.remind.at - b.remind.at);
export const upcomingReminders = () => state.quests.filter(q => q.remind && !q.remind.fired && !q.done).sort((a, b) => a.remind.at - b.remind.at);
export function markFired(ids) {
  commit(s => {
    s.notifs ||= [];
    for (const id of ids) {
      const q = findQuest(id); if (!q || !q.remind) continue;
      q.remind.fired = true;
      // a repeating reminder comes back at its next time (it stays fired only once per occurrence)
      if (q.remind.multi) { q.remind.at = nextMultiAt(q.remind.multi, Date.now()); q.remind.fired = false; q.remind.dismissed = false; }
      // a quest with several alerts moves on to its next one
      else if (q.alerts) { q.remind = null; syncNearest(q, Date.now() + 1000); }
      s.notifs.push({ id: q.id, title: q.title, tier: q.tier, at: Date.now(), status: 'due' });
    }
    if (s.notifs.length > 50) s.notifs.splice(0, s.notifs.length - 50);
  });
}
// what happened to the latest notification for a quest: 'done' | 'snoozed' | 'dismissed'
function noteNotif(s, id, status) {
  const n = (s.notifs || []).slice().reverse().find(x => x.id === id && x.status === 'due');
  if (n) { n.status = status; n.handledAt = Date.now(); }
}
export const recentNotifs = () => (state.notifs || []).filter(n => n.status !== 'due').slice(-10).reverse();
export function snooze(id, min = state.settings.snoozeMin) {
  commit(s => { const q = findQuest(id); if (q) q.remind = { at: Date.now() + min * 60000, offset: null, fired: false, dismissed: false }; noteNotif(s, id, 'snoozed'); });
}
export function dismissReminder(id) { commit(s => { const q = findQuest(id); if (q && q.remind) q.remind.dismissed = true; noteNotif(s, id, 'dismissed'); }); }

/* ---------- focus timer ----------
   timer = { questId, mode: 'focus'|'break', minutes, startedAt, pausedAt, elapsed } (elapsed = ms before the last start) */
export function startTimer(questId, mode, minutes) { commit(s => { s.timer = { questId, mode, minutes, startedAt: Date.now(), pausedAt: null, elapsed: 0 }; }); }
export function pauseTimer() { commit(s => { const t = s.timer; if (t && !t.pausedAt) { t.elapsed += Date.now() - t.startedAt; t.pausedAt = Date.now(); } }); }
export function resumeTimer() { commit(s => { const t = s.timer; if (t && t.pausedAt) { t.startedAt = Date.now(); t.pausedAt = null; } }); }
export function stopTimer() { commit(s => { s.timer = null; }); }
export const timerElapsed = t => t ? t.elapsed + (t.pausedAt ? 0 : Date.now() - t.startedAt) : 0;
export function logSession(questId, minutes) { commit(s => { s.sessions.push({ questId, minutes, endedAt: Date.now() }); }); }

/* ---------- settings and data ---------- */
export function setSetting(k, v, opts) { commit(s => { s.settings[k] = v; }, opts); }
export function exportData() { return JSON.stringify(state, null, 2); }
export function importData(json) {
  const data = JSON.parse(json);
  if (!data || !Array.isArray(data.quests)) throw new Error('Not a TaskFlow backup');
  commit(s => { Object.keys(s).forEach(k => delete s[k]); Object.assign(s, migrate(data)); });
}
export function clearCompleted() { commit(s => { s.quests = s.quests.filter(q => !q.done); }); }
// Removes repeat completions of the same quest on the same day (from the spam bug). Each quest counts once a day,
// so this only takes away credit that shouldn't have been given. Focus sessions are kept. Returns how many went.
export function tidyHistory() {
  let removed = 0;
  commit(s => {
    const seen = new Set(), kept = [];
    for (const h of s.history) {
      const k = h.questId + '|' + toStr(new Date(h.doneAt));
      if (seen.has(k)) { removed++; continue; }
      seen.add(k); kept.push(h);
    }
    if (removed) s.history = kept;
  });
  return removed;
}
// opts.fromSync: a reset of this device only (signing out). It's saved without change stamps or deletion
// markers, so the empty copy never counts as newer than the account's data at the next sign-in.
export function resetAll(opts = {}) { commit(s => { const f = fresh(); Object.keys(s).forEach(k => delete s[k]); Object.assign(s, f); }, opts); }

/* ---------- sorting ---------- */
const rank = { overdue: 0, today: 1, soon: 2, week: 3, later: 4, none: 5 };
export const SORTS = { smart: 'Smart', priority: 'Priority', due: 'Due date', added: 'Newest' };
export function sortQuests(list, mode = 'smart', now = new Date()) {
  const due = q => dueTimestamp(q) ?? Infinity;
  const cmp = {
    smart: (a, b) => rank[dueStatus(a, now)] - rank[dueStatus(b, now)] || a.tier - b.tier || due(a) - due(b),
    priority: (a, b) => a.tier - b.tier || due(a) - due(b),
    due: (a, b) => due(a) - due(b) || a.tier - b.tier,
    added: (a, b) => b.createdAt - a.createdAt,
  }[mode];
  return [...list].sort((a, b) => (a.done - b.done) || cmp(a, b));
}
