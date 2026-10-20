// Quest operations for the API (server side), matching what the app's store does. Pure: they take the
// data document and a clock, and change the document in place.
import { todayStr, at, addDays } from './dates.js';
import { rollForward } from './recur.js';
import { parseQuest } from './parse.js';

const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const FREQS = ['daily', 'alternate', 'weekdays', 'weekly', 'monthly'];
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00'));
const isTime = s => typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
export const reminderBase = q => q.due ? at(q.due, q.time || '09:00') : null;

export class ApiError extends Error { constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details; } }
const bad = (msg, field) => new ApiError(422, 'invalid', msg, field ? { field } : undefined);

// validate and normalise fields from an API request (partial for PATCH)
export function cleanFields(body, partial) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'bad_json', 'Send a JSON object.');
  const out = {};
  if ('title' in body) { if (typeof body.title !== 'string' || !body.title.trim()) throw bad('title must be a non-empty string', 'title'); if (body.title.length > 200) throw bad('title is too long (200 max)', 'title'); out.title = body.title.trim(); }
  if ('priority' in body) { const p = body.priority; if (!Number.isInteger(p) || p < 1 || p > 6) throw bad('priority must be 1 (P1, most urgent) to 6', 'priority'); out.tier = p - 1; }
  if ('due' in body) { if (body.due !== null && !isDate(body.due)) throw bad('due must be YYYY-MM-DD or null', 'due'); out.due = body.due; if (body.due === null) { out.time = null; out.repeat = null; } }
  if ('time' in body) { if (body.time !== null && !isTime(body.time)) throw bad('time must be HH:MM (24h) or null', 'time'); out.time = body.time; }
  if ('notes' in body) { if (typeof body.notes !== 'string' || body.notes.length > 5000) throw bad('notes must be a string (5000 max)', 'notes'); out.notes = body.notes; }
  if ('repeat' in body) { if (body.repeat !== null && !FREQS.includes(body.repeat)) throw bad(`repeat must be one of ${FREQS.join(', ')} or null`, 'repeat'); out.repeat = body.repeat ? { freq: body.repeat } : null; }
  if ('subtasks' in body) {
    if (!Array.isArray(body.subtasks) || body.subtasks.length > 100) throw bad('subtasks must be an array (100 max)', 'subtasks');
    out.subtasks = body.subtasks.map((s, i) => {
      const o = typeof s === 'string' ? { title: s } : s;
      if (!o || typeof o.title !== 'string' || !o.title.trim()) throw bad(`subtasks[${i}].title is required`, 'subtasks');
      return { id: o.id || rid(), title: o.title.trim(), done: !!o.done, tier: Number.isInteger(o.priority) ? Math.min(5, Math.max(0, o.priority - 1)) : undefined };
    });
  }
  if (!partial && !out.title && typeof body.text !== 'string') throw bad('title (or text) is required', 'title');
  return out;
}

export function createQuest(doc, body, now = Date.now()) {
  let fields = cleanFields(body, false);
  // "text" is read like the app's quick add: "Call mum tomorrow at 6pm p2" → title, due, time, priority
  if (typeof body.text === 'string' && body.text.trim()) {
    const p = parseQuest(body.text, new Date(now));
    fields = { title: p.title, tier: p.tier, due: p.due, time: p.time, repeat: p.repeat, ...fields };
  }
  const q = { id: rid(), title: fields.title, tier: fields.tier ?? 3, due: fields.due || null, time: fields.due ? fields.time || null : null, notes: fields.notes || '',
    subtasks: (fields.subtasks || []).map(s => ({ ...s, tier: s.tier ?? fields.tier ?? 3 })), repeat: fields.due ? fields.repeat || null : null,
    remind: null, done: false, doneAt: null, createdAt: now, updatedAt: now };
  if (q.repeat && !q.due) q.due = todayStr(new Date(now));
  doc.quests.push(q);
  if (body.reminder) setReminder(q, body.reminder, now);
  return q;
}

export function updateQuest(q, body, now = Date.now()) {
  const f = cleanFields(body, true);
  const dueChanged = ('due' in f && f.due !== q.due) || ('time' in f && f.time !== q.time);
  Object.assign(q, f);
  if (!q.due) { q.time = null; q.repeat = null; }
  if (dueChanged && q.remind && q.remind.offset != null) {
    if (q.due) q.remind = { ...q.remind, at: reminderBase(q) - q.remind.offset, fired: false, dismissed: false };
    else q.remind.offset = null;
  }
  if ('reminder' in body) setReminder(q, body.reminder, now);
  if ('done' in body) { if (typeof body.done !== 'boolean') throw bad('done must be true or false', 'done'); }
  q.updatedAt = now;
  return q;
}

// spec: { at: ISO time } | { minutes_before: n } | null
export function setReminder(q, spec, now = Date.now()) {
  if (spec === null) { q.remind = null; q.updatedAt = now; return q; }
  if (typeof spec !== 'object') throw bad('reminder must be { at } or { minutes_before } or null', 'reminder');
  if (spec.minutes_before != null) {
    if (!q.due) throw bad('minutes_before needs a due date on the quest', 'reminder');
    const m = Number(spec.minutes_before);
    if (!Number.isFinite(m) || m < 0 || m > 60 * 24 * 30) throw bad('minutes_before must be 0 to 43200', 'reminder');
    q.remind = { at: reminderBase(q) - m * 60000, offset: m * 60000, fired: false, dismissed: false };
  } else {
    const t = Date.parse(spec.at);
    if (!spec.at || isNaN(t)) throw bad('reminder.at must be an ISO date-time, e.g. 2026-10-20T09:00:00+05:30', 'reminder');
    q.remind = { at: t, offset: null, fired: false, dismissed: false };
  }
  q.updatedAt = now;
  return q;
}

// tick a quest: logs it in the history; a repeating quest moves to its next date instead of closing
export function completeQuest(doc, q, now = Date.now()) {
  if (q.done) return { quest: q, next: null };
  doc.history.push({ questId: q.id, title: q.title, tier: q.tier, doneAt: now });
  doc.historyUpdatedAt = now;
  let next = null;
  if (q.repeat && q.due) {
    next = rollForward(q.due, q.repeat, new Date(now));
    q.due = next;
    q.subtasks.forEach(s => { s.done = false; });
    if (q.remind) q.remind = q.remind.offset != null ? { ...q.remind, at: reminderBase(q) - q.remind.offset, fired: false, dismissed: false } : null;
  } else {
    q.done = true; q.doneAt = now;
    if (q.remind) q.remind.dismissed = true;
  }
  q.updatedAt = now;
  return { quest: q, next };
}
export function reopenQuest(doc, q, now = Date.now()) {
  if (!q.done) return q;
  q.done = false; q.doneAt = null;
  const i = doc.history.map(h => h.questId).lastIndexOf(q.id);
  if (i >= 0) { doc.history.splice(i, 1); doc.historyUpdatedAt = now; }
  q.updatedAt = now;
  return q;
}
export function deleteQuest(doc, id, now = Date.now()) {
  const i = doc.quests.findIndex(q => q.id === id);
  if (i < 0) return null;
  const [q] = doc.quests.splice(i, 1);
  doc.tombstones.push({ id, deletedAt: now });
  return q;
}
export function snooze(q, minutes = 10, now = Date.now()) {
  if (!q.remind) throw new ApiError(409, 'no_reminder', 'This quest has no reminder.');
  const m = Number(minutes);
  if (!Number.isFinite(m) || m < 1 || m > 1440) throw bad('minutes must be 1 to 1440', 'minutes');
  q.remind = { at: now + m * 60000, offset: null, fired: false, dismissed: false };
  q.updatedAt = now;
  return q;
}
export function dismiss(q, now = Date.now()) {
  if (!q.remind) throw new ApiError(409, 'no_reminder', 'This quest has no reminder.');
  q.remind.dismissed = true; q.updatedAt = now;
  return q;
}

export const reminderState = q => !q.remind ? null : q.done ? 'done' : q.remind.dismissed ? 'dismissed' : q.remind.fired ? 'due' : 'scheduled';

// the public shape of a quest in the API (stable field names, ISO times, priority 1–6)
export function toApi(q) {
  return {
    id: q.id, title: q.title, priority: q.tier + 1, due: q.due, time: q.time, repeat: q.repeat ? q.repeat.freq : null,
    notes: q.notes || '', done: !!q.done, completed_at: q.doneAt ? new Date(q.doneAt).toISOString() : null,
    subtasks: (q.subtasks || []).map(s => ({ id: s.id, title: s.title, done: !!s.done, priority: (s.tier ?? q.tier) + 1 })),
    reminder: q.remind ? { at: new Date(q.remind.at).toISOString(), minutes_before: q.remind.offset != null ? Math.round(q.remind.offset / 60000) : null, state: reminderState(q) } : null,
    created_at: new Date(q.createdAt).toISOString(), updated_at: new Date(q.updatedAt || q.createdAt).toISOString(),
  };
}
export { addDays };
