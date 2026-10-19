// TaskFlow REST API, /api/v1. JSON in and out, "Authorization: Bearer tf_…" on every request.
// Docs: app/API.md.
import { findKey, rateLimit } from './keys.mjs';
import { ApiError, createQuest, updateQuest, completeQuest, reopenQuest, deleteQuest, setReminder, snooze, dismiss, toApi, reminderState } from '../app/js/questops.js';
import { summary, lastDays } from '../app/js/stats.js';

const MAX_BODY = 256 * 1024;
export async function readJson(req) {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > MAX_BODY) throw new ApiError(413, 'too_large', 'Request body is too large (256 KB max).'); }
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch (e) { throw new ApiError(400, 'bad_json', 'The body is not valid JSON.'); }
}
export function send(res, status, data, headers = {}) {
  const body = status === 204 ? undefined : JSON.stringify(data, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const err = (res, e, headers) => send(res, e.status || 500, { error: { code: e.code || 'server_error', message: e.status ? e.message : 'Something went wrong on the server.', ...(e.details || {}) } }, headers);

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS', 'Access-Control-Max-Age': '600' };

// cursor pagination over an already-filtered list
function page(list, q) {
  const limit = q.has('limit') ? Number(q.get('limit')) : 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new ApiError(422, 'invalid', 'limit must be 1 to 200', { field: 'limit' });
  let start = 0;
  if (q.get('cursor')) { start = Number(Buffer.from(q.get('cursor'), 'base64url').toString()); if (!Number.isInteger(start) || start < 0) throw new ApiError(422, 'invalid', 'cursor is not valid', { field: 'cursor' }); }
  const data = list.slice(start, start + limit);
  const next = start + limit < list.length ? Buffer.from(String(start + limit)).toString('base64url') : null;
  return { data, next_cursor: next, total: list.length };
}

function filterQuests(quests, q) {
  const status = q.get('status') || 'open';
  if (!['open', 'done', 'all'].includes(status)) throw new ApiError(422, 'invalid', 'status must be open, done or all', { field: 'status' });
  let list = quests.filter(x => status === 'all' || (status === 'done' ? x.done : !x.done));
  if (q.get('priority')) { const p = Number(q.get('priority')); list = list.filter(x => x.tier + 1 === p); }
  if (q.get('due_before')) list = list.filter(x => x.due && x.due <= q.get('due_before'));
  if (q.get('due_after')) list = list.filter(x => x.due && x.due >= q.get('due_after'));
  if (q.get('search')) { const s = q.get('search').toLowerCase(); list = list.filter(x => (x.title + ' ' + (x.notes || '')).toLowerCase().includes(s)); }
  const sort = q.get('sort') || 'created';
  if (sort === 'due') list = [...list].sort((a, b) => (a.due || '9999') < (b.due || '9999') ? -1 : (a.due || '9999') > (b.due || '9999') ? 1 : a.tier - b.tier);
  else if (sort === 'priority') list = [...list].sort((a, b) => a.tier - b.tier);
  else list = [...list].sort((a, b) => a.createdAt - b.createdAt);
  return list;
}

export function createApi(db) {
  const find = id => db.doc.quests.find(q => q.id === id);
  const need = id => { const q = find(id); if (!q) throw new ApiError(404, 'not_found', `No quest with id ${id}.`); return q; };

  const routes = [
    ['GET', /^\/me$/, 'read', (m, q, body, key) => ({ key: { name: key.name, scope: key.scope, prefix: key.prefix } })],
    ['GET', /^\/quests$/, 'read', (m, q) => { const p = page(filterQuests(db.doc.quests, q), q); return { ...p, data: p.data.map(toApi) }; }],
    ['GET', /^\/quests\/([\w-]+)$/, 'read', m => ({ data: toApi(need(m[1])) })],
    ['POST', /^\/quests$/, 'write', (m, q, body) => [201, { data: toApi(db.mutate(d => createQuest(d, body), 'api')) }]],
    ['PATCH', /^\/quests\/([\w-]+)$/, 'write', (m, q, body) => {
      const quest = need(m[1]);
      return { data: toApi(db.mutate(d => {
        updateQuest(quest, body);
        if (body.done === true) completeQuest(d, quest);
        if (body.done === false) reopenQuest(d, quest);
        return quest;
      }, 'api')) };
    }],
    ['POST', /^\/quests\/([\w-]+)\/complete$/, 'write', m => { const quest = need(m[1]); const r = db.mutate(d => completeQuest(d, quest), 'api'); return { data: toApi(r.quest), next_due: r.next }; }],
    ['POST', /^\/quests\/([\w-]+)\/reopen$/, 'write', m => { const quest = need(m[1]); return { data: toApi(db.mutate(d => reopenQuest(d, quest), 'api')) }; }],
    ['DELETE', /^\/quests\/([\w-]+)$/, 'write', m => { need(m[1]); db.mutate(d => deleteQuest(d, m[1]), 'api'); return [204, null]; }],

    ['GET', /^\/reminders$/, 'read', (m, q) => {
      const status = q.get('status') || 'active';
      const ok = { active: s => s === 'due' || s === 'scheduled', due: s => s === 'due', scheduled: s => s === 'scheduled', all: s => !!s }[status];
      if (!ok) throw new ApiError(422, 'invalid', 'status must be active, due, scheduled or all', { field: 'status' });
      const list = db.doc.quests.filter(x => ok(reminderState(x))).sort((a, b) => a.remind.at - b.remind.at);
      const p = page(list, q);
      return { ...p, data: p.data.map(x => ({ quest_id: x.id, title: x.title, priority: x.tier + 1, ...toApi(x).reminder })) };
    }],
    ['POST', /^\/reminders$/, 'write', (m, q, body) => {
      if (!body.quest_id) throw new ApiError(422, 'invalid', 'quest_id is required', { field: 'quest_id' });
      const quest = need(String(body.quest_id));
      return [201, { data: toApi(db.mutate(() => setReminder(quest, { at: body.at, minutes_before: body.minutes_before }), 'api')) }];
    }],
    ['POST', /^\/reminders\/([\w-]+)\/snooze$/, 'write', (m, q, body) => { const quest = need(m[1]); return { data: toApi(db.mutate(() => snooze(quest, body.minutes ?? 10), 'api')) }; }],
    ['POST', /^\/reminders\/([\w-]+)\/dismiss$/, 'write', m => { const quest = need(m[1]); return { data: toApi(db.mutate(() => dismiss(quest), 'api')) }; }],
    ['DELETE', /^\/reminders\/([\w-]+)$/, 'write', m => { const quest = need(m[1]); db.mutate(() => setReminder(quest, null), 'api'); return [204, null]; }],

    ['GET', /^\/stats$/, 'read', (m, q) => {
      const d = db.doc, target = (d.settings && d.settings.target) || 5, s = summary(d.history, d.sessions, target);
      const days = Math.min(90, Math.max(1, Number(q.get('days') || 7)));
      return { data: { daily_target: target, done_today: s.todayCount, done_total: s.totalDone, streak: s.current, best_streak: s.best, exp_total: s.exp, exp_today: s.todayExp,
        focus_minutes_total: s.focusMin, focus_minutes_today: s.todayFocus, kept_this_month: s.keptThisMonth, done_by_priority: s.tiers,
        open_quests: d.quests.filter(x => !x.done).length, days: lastDays(d.history, d.sessions, target, days) } };
    }],
  ];

  return async function handle(req, res, path) {
    if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return; }
    let headers = { ...CORS };
    try {
      const key = findKey(db, req.headers.authorization);
      if (!key) throw new ApiError(401, 'unauthorized', req.headers.authorization ? 'That API key is not valid (or was revoked).' : 'Add your API key: Authorization: Bearer tf_…');
      const rl = rateLimit(key.id);
      headers = { ...headers, 'X-RateLimit-Limit': rl.limit, 'X-RateLimit-Remaining': rl.remaining, 'X-RateLimit-Reset': Math.ceil(rl.reset / 1000) };
      if (!rl.ok) { headers['Retry-After'] = Math.ceil((rl.reset - Date.now()) / 1000); throw new ApiError(429, 'rate_limited', `Too many requests. Limit is ${rl.limit} a minute per key.`); }
      key.lastUsedAt = Date.now(); db.touch();
      const sub = path.replace(/^\/api\/v1/, '') || '/';
      const url = new URL(req.url, 'http://x');
      let matchedPath = false;
      for (const [method, re, scope, fn] of routes) {
        const m = re.exec(sub);
        if (!m) continue;
        matchedPath = true;
        if (method !== req.method) continue;
        if (scope === 'write' && key.scope !== 'write') throw new ApiError(403, 'forbidden', 'This key is read-only. Create a read/write key to change data.');
        const body = ['POST', 'PATCH'].includes(req.method) ? await readJson(req) : {};
        const out = await fn(m, url.searchParams, body, key);
        const [status, data] = Array.isArray(out) ? out : [200, out];
        return send(res, status, data, headers);
      }
      throw matchedPath ? new ApiError(405, 'method_not_allowed', `${req.method} is not supported here.`) : new ApiError(404, 'not_found', `No endpoint ${req.method} /api/v1${sub}. See API.md.`);
    } catch (e) {
      if (!e.status) console.error(e);
      err(res, e, headers);
    }
  };
}
