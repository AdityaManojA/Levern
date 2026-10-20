// Quest → Google Calendar event, and the plan of API calls that brings the "TaskFlow" calendar in
// line with the quests. Pure functions (no network), covered by tests/calendar.test.js.
import { addDays, at } from './dates.js';
import { rrule } from './ics.js';

// Google's event colours closest to the six priority tiers (P1 … P6)
export const TIER_COLOR_IDS = ['11', '6', '5', '2', '7', '1'];   // Tomato, Tangerine, Banana, Sage, Peacock, Lavender
const EVENT_MIN = 30;
const pad = n => String(n).padStart(2, '0');
const localDateTime = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`; };

// a quest belongs in the calendar when it has a date and is still open (repeating quests stay open);
// example quests never do: people only get the quests they made themselves
export const syncable = q => !!q.due && !q.done && !q.sample;

export function questToEvent(q, tz = 'UTC') {
  const ev = {
    summary: q.title,
    colorId: TIER_COLOR_IDS[q.tier] || '2',
    extendedProperties: { private: { taskflowId: String(q.id) } },
    transparency: 'transparent',   // a to-do, so it doesn't block time
  };
  if (q.time) {
    const s = at(q.due, q.time);
    ev.start = { dateTime: localDateTime(s), timeZone: tz };
    ev.end = { dateTime: localDateTime(s + EVENT_MIN * 60000), timeZone: tz };
  } else {
    ev.start = { date: q.due };
    ev.end = { date: addDays(q.due, 1) };
  }
  const notes = [q.notes, ...(q.subtasks || []).map(s => `${s.done ? '☑' : '☐'} ${s.title}`)].filter(Boolean).join('\n');
  if (notes) ev.description = notes;
  const rr = rrule(q.repeat);
  if (rr) ev.recurrence = ['RRULE:' + rr];
  // reminders: a relative one ("1 hour before") becomes a popup alert; absolute ones stay in TaskFlow
  if (q.remind && !q.remind.dismissed && q.remind.offset != null) {
    ev.reminders = { useDefault: false, overrides: [{ method: 'popup', minutes: Math.max(0, Math.round(q.remind.offset / 60000)) }] };
  } else ev.reminders = { useDefault: false, overrides: [] };
  return ev;
}

// stable fingerprint of what we send, so unchanged quests make no API calls
export function eventHash(ev) {
  const s = JSON.stringify(ev);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

// mapping: { [questId]: { eventId, hash } } → list of operations
//   { op: 'insert', questId, event, hash } | { op: 'update', questId, eventId, event, hash } | { op: 'delete', questId, eventId }
export function planSync(quests, mapping = {}, tz = 'UTC') {
  const ops = [], wanted = new Set();
  for (const q of quests) {
    if (!syncable(q)) continue;
    const id = String(q.id); wanted.add(id);
    const event = questToEvent(q, tz), hash = eventHash(event), m = mapping[id];
    if (!m) ops.push({ op: 'insert', questId: id, event, hash });
    else if (m.hash !== hash) ops.push({ op: 'update', questId: id, eventId: m.eventId, event, hash });
  }
  for (const [id, m] of Object.entries(mapping)) if (!wanted.has(id)) ops.push({ op: 'delete', questId: id, eventId: m.eventId });
  return ops;
}

// Apply planned operations through `api(method, path, body)` (a fetch wrapper that throws
// { status } on HTTP errors). Returns the new mapping and counts. A 404/410 on update or delete
// means the event was removed in Google Calendar: updates re-create it, deletes just forget it.
export async function applyOps(ops, mapping, calendarId, api) {
  const next = { ...mapping }, counts = { inserted: 0, updated: 0, deleted: 0, failed: 0 };
  const base = `/calendars/${encodeURIComponent(calendarId)}/events`;
  for (const o of ops) {
    try {
      if (o.op === 'insert') { const ev = await api('POST', base, o.event); next[o.questId] = { eventId: ev.id, hash: o.hash }; counts.inserted++; }
      if (o.op === 'update') {
        try { await api('PUT', `${base}/${encodeURIComponent(o.eventId)}`, o.event); next[o.questId] = { eventId: o.eventId, hash: o.hash }; }
        catch (e) { if (e.status !== 404 && e.status !== 410) throw e; const ev = await api('POST', base, o.event); next[o.questId] = { eventId: ev.id, hash: o.hash }; }
        counts.updated++;
      }
      if (o.op === 'delete') {
        try { await api('DELETE', `${base}/${encodeURIComponent(o.eventId)}`); } catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
        delete next[o.questId]; counts.deleted++;
      }
    } catch (e) {
      if (e.status === 401) { e.mapping = next; e.counts = counts; throw e; }   // token expired: keep what was done, ask to sign in again
      counts.failed++;
    }
  }
  return { mapping: next, counts };
}
