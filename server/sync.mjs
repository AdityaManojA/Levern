// Endpoints only the TaskFlow app on this computer may use (never reachable with an API key):
//   POST /sync/state    the app sends its copy, gets back the merged copy (last write wins)
//   GET  /sync/events   server-sent events: "change" whenever the data changes (API, webhooks, other tabs)
//   /sync/dev/…         API keys and webhooks for Settings → Developer
// "This computer" means: the connection comes from the loopback address, the Host header is localhost
// (so a website can't reach it through DNS rebinding) and any Origin is this server itself.
import { mergeDocs, canon } from '../app/js/syncmerge.js';
import { createKey, revokeKey, publicKey } from './keys.mjs';
import { readJson, send } from './api.mjs';
import { ApiError } from '../app/js/questops.js';

const SYNC_MAX = 8 * 1024 * 1024;   // sketches make the app's data much bigger than an API call
const LOOPBACK = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
export function isLocalRequest(req, port) {
  if (!LOOPBACK.includes(req.socket.remoteAddress)) return false;
  const host = (req.headers.host || '').toLowerCase();
  if (![`localhost:${port}`, `127.0.0.1:${port}`, `[::1]:${port}`].includes(host)) return false;
  const origin = req.headers.origin;
  return !origin || origin === `http://${host}`;
}

// the same keys the app syncs (store.js SYNC_KEYS): one missing here made every sync look like a change, so the
// server told every open copy to sync again, endlessly
const DOC_KEYS = ['quests', 'tombstones', 'history', 'historyUpdatedAt', 'sessions', 'sessionsUpdatedAt', 'settings', 'settingsUpdatedAt', 'settingsStamps', 'eventMeta'];
const pick = d => Object.fromEntries(DOC_KEYS.map(k => [k, d[k]]));

export function createSync(db, hooks, port) {
  const clients = new Set();
  db.onChange(({ rev, events, source }) => {
    for (const res of clients) res.write(`event: change\ndata: ${JSON.stringify({ rev, source })}\n\n`);
    hooks.fromChanges(events);
    noteFired();
  });
  setInterval(() => { for (const res of clients) res.write(': keep-alive\n\n'); }, 25000).unref();

  // reminder.fired: whichever side notices first (the app, or the server's own clock below), once per reminder
  function noteFired() {
    const d = db.doc, sent = new Set(d.firedSent);
    for (const q of d.quests) {
      if (!q.remind || !q.remind.fired || q.done) continue;
      const k = `${q.id}@${q.remind.at}`;
      if (sent.has(k)) continue;
      sent.add(k); d.firedSent.push(k);
      if (q.remind.at < Date.now() - 86400000) continue;   // old ones (first sync of an existing app): record, don't announce
      hooks.emit('reminder.fired', { quest_id: q.id, title: q.title, priority: q.tier + 1, at: new Date(q.remind.at).toISOString() });
    }
    if (d.firedSent.length > 500) d.firedSent.splice(0, d.firedSent.length - 500);
    db.touch();
  }
  setInterval(() => {
    const now = Date.now(), due = db.doc.quests.filter(q => q.remind && !q.remind.fired && !q.remind.dismissed && !q.done && q.remind.at <= now);
    if (due.length) db.mutate(() => { for (const q of due) { q.remind.fired = true; q.updatedAt = now; } }, 'server');
  }, 5000).unref();

  const dev = [
    ['GET', /^\/keys$/, () => ({ data: db.doc.keys.filter(k => !k.revokedAt).map(publicKey) })],
    ['POST', /^\/keys$/, (m, body) => { const { key, record } = createKey(db, body); return [201, { data: record, key }]; }],
    ['DELETE', /^\/keys\/([\w-]+)$/, m => revokeKey(db, m[1]) ? [204, null] : [404, { error: { code: 'not_found', message: 'No such key.' } }]],
    ['GET', /^\/webhooks$/, () => ({ data: hooks.list(), deliveries: hooks.deliveries() })],
    ['POST', /^\/webhooks$/, (m, body) => { const r = hooks.add(body); return [201, { data: r.hook, secret: r.secret }]; }],
    ['DELETE', /^\/webhooks\/([\w-]+)$/, m => hooks.remove(m[1]) ? [204, null] : [404, { error: { code: 'not_found', message: 'No such webhook.' } }]],
    ['POST', /^\/webhooks\/([\w-]+)\/test$/, async m => { const ok = await hooks.test(m[1]); return ok === null ? [404, { error: { code: 'not_found', message: 'No such webhook.' } }] : { ok, deliveries: hooks.deliveries() }; }],
  ];

  return async function handle(req, res, path) {
    if (!isLocalRequest(req, port)) return send(res, 403, { error: { code: 'local_only', message: 'Only the TaskFlow app on this computer can use this.' } });
    try {
      if (path === '/sync/ping') return send(res, 200, { ok: true, rev: db.doc.rev });
      if (path === '/sync/events' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
        res.write(`event: hello\ndata: ${JSON.stringify({ rev: db.doc.rev })}\n\n`);
        clients.add(res); req.on('close', () => clients.delete(res));
        return;
      }
      if (path === '/sync/state' && req.method === 'POST') {
        const body = await readJson(req, SYNC_MAX);   // the whole app's data, sketches included
        if (!Array.isArray(body.quests)) throw new ApiError(400, 'bad_doc', 'Expected the app data.');
        const before = canon(pick(db.doc));
        const merged = mergeDocs(pick(db.doc), pick(body));
        if (canon(merged) !== before) db.mutate(d => Object.assign(d, merged), 'app');
        return send(res, 200, { rev: db.doc.rev, ...pick(db.doc) });
      }
      if (path.startsWith('/sync/dev/')) {
        const sub = path.slice('/sync/dev'.length);
        for (const [method, re, fn] of dev) {
          const m = re.exec(sub);
          if (!m || method !== req.method) continue;
          const body = req.method === 'POST' ? await readJson(req) : {};
          const out = await fn(m, body);
          const [status, data] = Array.isArray(out) ? out : [200, out];
          return send(res, status, data);
        }
      }
      send(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
    } catch (e) {
      send(res, e.status || 500, { error: { code: e.code || 'error', message: e.status ? e.message : 'Something went wrong.' } });
      if (!e.status) console.error(e);
    }
  };
}
