// Merging two copies of the Levern data (the app's and the server's). Pure, used on both sides.
//  - Quests: last write wins per quest, by updatedAt. Deletions are tombstones { id, deletedAt } that win
//    over any older copy of the quest, so a delete on one side isn't undone by the other.
//  - History and focus sessions: last write wins for the whole list, by their *UpdatedAt stamp.
//  - Settings: last write wins per setting, by settingsStamps (a copy without them, from an older version,
//    counts every setting as changed at its settingsUpdatedAt).

const qTime = q => q.updatedAt || q.createdAt || 0;

// The same data written with object keys in any order gives the same text. Copies are compared with this, never
// with plain JSON.stringify: merging can return settings in a different key order, and treating that as a change
// made every sync write again and wake the other side, which synced back, endlessly.
export const canon = v => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map(key => [key, x[key]])) : x));

// Runtime sanity check before merging quests: guarantees valid structure
export function sanitizeQuest(q) {
  if (!q || typeof q !== 'object') return null;
  const subtasks = Array.isArray(q.subtasks)
    ? q.subtasks.slice(0, 100).filter(s => s && typeof s === 'object').map(s => ({ ...s, title: typeof s.title === 'string' ? s.title.slice(0, 200) : '' }))
    : [];
  const title = typeof q.title === 'string' ? q.title.slice(0, 500) : (q.title != null ? String(q.title).slice(0, 500) : '');
  const notes = typeof q.notes === 'string' ? q.notes.slice(0, 10000) : (q.notes != null ? String(q.notes).slice(0, 10000) : '');
  const rawTier = Number(q.tier);
  const tier = (!Number.isFinite(rawTier) || rawTier < 0) ? 3 : Math.min(5, Math.floor(rawTier));
  return {
    ...q,
    title,
    subtasks,
    notes,
    tier,
  };
}

export function mergeQuests(aQuests = [], aTombs = [], bQuests = [], bTombs = []) {
  const best = new Map();
  for (const raw of [...(aQuests || []), ...(bQuests || [])]) {
    const q = sanitizeQuest(raw);
    if (!q || !q.id) continue;
    const cur = best.get(q.id);
    // same moment: prefer the copy that knows whether it's an example quest (older saves lack the flag),
    // so the two sides agree instead of trading the quest back and forth
    if (!cur || qTime(q) > qTime(cur)) best.set(q.id, q);
  }
  const tombs = new Map();
  for (const t of [...(aTombs || []), ...(bTombs || [])]) {
    if (!t || !t.id) continue;
    const cur = tombs.get(t.id);
    if (!cur || t.deletedAt > cur.deletedAt) tombs.set(t.id, t);
  }
  const quests = [];
  for (const [id, q] of best) { const t = tombs.get(id); if (!t || qTime(q) > t.deletedAt) quests.push(q); }
  // keep tombstones for a month so late copies can't bring a quest back
  const cutoff = Date.now() - 30 * 86400000;
  const tombstones = [...tombs.values()].filter(t => t.deletedAt > cutoff && !quests.some(q => q.id === t.id));
  // stable order: by creation time
  quests.sort((x, y) => (x.createdAt || 0) - (y.createdAt || 0));
  return { quests, tombstones };
}

const newer = (a, b, key) => ((a && a[key]) || 0) >= ((b && b[key]) || 0) ? a : b;

// settings, one at a time: each side's value with the newer change time wins (a ties win, like newer())
export function mergeSettings(a = {}, b = {}) {
  const as = a.settings || {}, bs = b.settings || {};
  const stamp = (side, k) => (side.settingsStamps ? side.settingsStamps[k] || 0 : side.settingsUpdatedAt || 0);
  const settings = {}, settingsStamps = {};
  for (const k of new Set([...Object.keys(as), ...Object.keys(bs)])) {
    const inA = k in as, inB = k in bs, ta = stamp(a, k), tb = stamp(b, k);
    const fromA = inA && (!inB || ta >= tb);
    settings[k] = fromA ? as[k] : bs[k];
    settingsStamps[k] = fromA ? ta : tb;
  }
  return { settings, settingsStamps, settingsUpdatedAt: Math.max(a.settingsUpdatedAt || 0, b.settingsUpdatedAt || 0) };
}

// a, b: { quests, tombstones, history, historyUpdatedAt, sessions, sessionsUpdatedAt, settings, settingsUpdatedAt }
export function mergeDocs(a = {}, b = {}) {
  const { quests, tombstones } = mergeQuests(a.quests, a.tombstones, b.quests, b.tombstones);
  const h = newer(a, b, 'historyUpdatedAt'), s = newer(a, b, 'sessionsUpdatedAt');
  return {
    quests, tombstones,
    history: h.history || [], historyUpdatedAt: h.historyUpdatedAt || 0,
    sessions: s.sessions || [], sessionsUpdatedAt: s.sessionsUpdatedAt || 0,
    ...mergeSettings(a, b),
    eventMeta: mergeEventMeta(a.eventMeta, b.eventMeta),
  };
}

// notes on Google Calendar events ({ [eventId]: { tier, at } }): the later note wins, per event
export function mergeEventMeta(a = {}, b = {}) {
  const out = { ...(a || {}) };
  for (const [id, m] of Object.entries(b || {})) if (!out[id] || (m?.at || 0) > (out[id]?.at || 0)) out[id] = m;
  return out;
}

