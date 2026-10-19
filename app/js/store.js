// App state and every action that changes it. Views read getState(); changes go through the
// functions below, which save through the storage adapter and notify subscribers.
import { localAdapter } from './storage.js';
import { todayStr, addDays, at, dueTimestamp, dueStatus } from './dates.js';
import { rollForward } from './recur.js';

export const TIER_COLORS = ['#F4918A', '#F9B77E', '#FFE08A', '#B9E7CC', '#A9D6F0', '#D4C4F2'];
const VERSION = 2;
const DEFAULT_SETTINGS = {
  target: 5, tierNames: ['Critical', 'High', 'Medium', 'Normal', 'Low', 'Someday'],
  sound: true, volume: 0.6, notify: true, focusMin: 25, breakMin: 5, snoozeMin: 10,
  name: '', profile: '', voice: true,
};

let adapter = localAdapter('taskflow.v1');
let state = null;
const subs = new Set();

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function seed() {
  const t = todayStr();
  const q = (title, tier, due, extra = {}) => ({ id: uid(), title, tier, due, time: null, notes: '', subtasks: [], repeat: null, remind: null, done: false, doneAt: null, createdAt: Date.now(), ...extra });
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
    s.quests = kind === 'empty' ? [] : (STARTERS[kind] || []).map(([title, tier, inDays, extra = {}]) => ({ id: uid(), title, tier, due: inDays == null ? null : addDays(t, inDays), time: null, notes: '', subtasks: [], repeat: null, remind: null, done: false, doneAt: null, createdAt: Date.now(), ...extra }));
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
  s.quests ||= []; s.history ||= []; s.sessions ||= []; s.timer ??= null;
  for (const q of s.quests) { q.subtasks ||= []; q.notes ??= ''; }
  // saves from v1 never had seeded cleared when quests were added, so never swap their quests for starters
  if ((s.v || 1) < 2) s.seeded = false;
  s.v = VERSION;
  return s;
}

export const getState = () => state;
export const subscribe = fn => { subs.add(fn); return () => subs.delete(fn); };
// mutate state, save, and tell the views. opts.quiet: save without re-rendering (typing in a field)
export function commit(fn, opts = {}) {
  const r = fn(state);
  adapter.save(state);
  if (!opts.quiet) subs.forEach(f => f(state, opts));
  return r;
}

export const findQuest = id => state.quests.find(q => q.id === id);
export const tierLabel = t => `P${t + 1} · ${state.settings.tierNames[t]}`;

/* ---------- quests ---------- */
export function addQuest(data) {
  const q = { id: uid(), title: data.title, tier: data.tier ?? 3, due: data.due || null, time: data.time || null, notes: data.notes || '',
    subtasks: (data.subtasks || []).map(s => typeof s === 'string' ? { id: uid(), title: s, done: false, tier: data.tier ?? 3 } : s),
    repeat: data.repeat || null, remind: null, done: false, doneAt: null, createdAt: Date.now() };
  commit(s => { s.quests.push(q); s.seeded = false; });
  if (data.remind) setReminder(q.id, data.remind);
  return q;
}
export function updateQuest(id, patch, opts) {
  commit(() => {
    const q = findQuest(id); if (!q) return;
    const dueChanged = ('due' in patch && patch.due !== q.due) || ('time' in patch && patch.time !== q.time);
    Object.assign(q, patch);
    state.seeded = false;
    if (q.repeat && !q.due) q.due = todayStr();
    // a reminder set relative to the due date moves with it
    if (dueChanged && q.remind && q.remind.offset != null) {
      if (q.due) q.remind = { ...q.remind, at: reminderBase(q) - q.remind.offset, fired: false, dismissed: false };
      else q.remind.offset = null;
    }
  }, opts);
}
export function deleteQuest(id) { commit(s => { s.quests = s.quests.filter(q => q.id !== id); s.seeded = false; }); }

// returns { done, next } where next is the new due date when a repeating quest rolls forward
export function toggleDone(id) {
  return commit(s => {
    const q = findQuest(id); if (!q) return {};
    if (q.done) {   // un-tick: drop the latest history entry for it
      q.done = false; q.doneAt = null;
      const i = s.history.map(h => h.questId).lastIndexOf(id);
      if (i >= 0) s.history.splice(i, 1);
      return { done: false };
    }
    s.history.push({ questId: q.id, title: q.title, tier: q.tier, doneAt: Date.now() });
    if (q.repeat && q.due) {
      const next = rollForward(q.due, q.repeat);
      q.due = next;
      q.subtasks.forEach(st => { st.done = false; });
      if (q.remind) q.remind = q.remind.offset != null ? { ...q.remind, at: reminderBase(q) - q.remind.offset, fired: false, dismissed: false } : null;
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
    q.remind = { at: when, offset, fired: false, dismissed: false };
  });
}
export const isReminderDue = q => !!(q.remind && q.remind.fired && !q.remind.dismissed && !q.done);
export const dueReminders = () => state.quests.filter(isReminderDue).sort((a, b) => a.remind.at - b.remind.at);
export const upcomingReminders = () => state.quests.filter(q => q.remind && !q.remind.fired && !q.done).sort((a, b) => a.remind.at - b.remind.at);
export function markFired(ids) { commit(() => { for (const id of ids) { const q = findQuest(id); if (q && q.remind) q.remind.fired = true; } }); }
export function snooze(id, min = state.settings.snoozeMin) {
  commit(() => { const q = findQuest(id); if (q) q.remind = { at: Date.now() + min * 60000, offset: null, fired: false, dismissed: false }; });
}
export function dismissReminder(id) { commit(() => { const q = findQuest(id); if (q && q.remind) q.remind.dismissed = true; }); }

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
export function resetAll() { commit(s => { const f = fresh(); Object.keys(s).forEach(k => delete s[k]); Object.assign(s, f); }); }

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
