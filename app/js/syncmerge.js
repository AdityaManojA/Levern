// Merging two copies of the TaskFlow data (the app's and the server's). Pure, used on both sides.
//  - Quests: last write wins per quest, by updatedAt. Deletions are tombstones { id, deletedAt } that win
//    over any older copy of the quest, so a delete on one side isn't undone by the other.
//  - History, focus sessions and settings: last write wins for the whole list, by their *UpdatedAt stamp.

const qTime = q => q.updatedAt || q.createdAt || 0;

export function mergeQuests(aQuests = [], aTombs = [], bQuests = [], bTombs = []) {
  const best = new Map();
  for (const q of [...aQuests, ...bQuests]) { const cur = best.get(q.id); if (!cur || qTime(q) > qTime(cur)) best.set(q.id, q); }
  const tombs = new Map();
  for (const t of [...aTombs, ...bTombs]) { const cur = tombs.get(t.id); if (!cur || t.deletedAt > cur.deletedAt) tombs.set(t.id, t); }
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

// a, b: { quests, tombstones, history, historyUpdatedAt, sessions, sessionsUpdatedAt, settings, settingsUpdatedAt }
export function mergeDocs(a = {}, b = {}) {
  const { quests, tombstones } = mergeQuests(a.quests, a.tombstones, b.quests, b.tombstones);
  const h = newer(a, b, 'historyUpdatedAt'), s = newer(a, b, 'sessionsUpdatedAt'), st = newer(a, b, 'settingsUpdatedAt');
  return {
    quests, tombstones,
    history: h.history || [], historyUpdatedAt: h.historyUpdatedAt || 0,
    sessions: s.sessions || [], sessionsUpdatedAt: s.sessionsUpdatedAt || 0,
    settings: st.settings || {}, settingsUpdatedAt: st.settingsUpdatedAt || 0,
    eventMeta: mergeEventMeta(a.eventMeta, b.eventMeta),
  };
}

// notes on Google Calendar events ({ [eventId]: { tier, at } }): the later note wins, per event
export function mergeEventMeta(a = {}, b = {}) {
  const out = { ...(a || {}) };
  for (const [id, m] of Object.entries(b || {})) if (!out[id] || (m?.at || 0) > (out[id]?.at || 0)) out[id] = m;
  return out;
}

// what changed between two quest lists, as webhook-style events
export function diffQuests(before = [], after = [], historyBefore = [], historyAfter = []) {
  const events = [], prev = new Map(before.map(q => [q.id, q])), next = new Map(after.map(q => [q.id, q]));
  const doneKeys = new Set(historyBefore.map(h => `${h.questId}@${h.doneAt}`));
  const newlyDone = new Set(historyAfter.filter(h => !doneKeys.has(`${h.questId}@${h.doneAt}`)).map(h => h.questId));
  for (const [id, q] of next) {
    const p = prev.get(id);
    if (!p) { events.push({ type: 'quest.created', quest: q }); continue; }
    if (JSON.stringify(p) === JSON.stringify(q)) { if (newlyDone.has(id)) events.push({ type: 'quest.completed', quest: q }); continue; }
    if (newlyDone.has(id) || (!p.done && q.done)) events.push({ type: 'quest.completed', quest: q });
    else events.push({ type: 'quest.updated', quest: q });
  }
  for (const [id, p] of prev) if (!next.has(id)) events.push({ type: 'quest.deleted', quest: p });
  return events;
}
