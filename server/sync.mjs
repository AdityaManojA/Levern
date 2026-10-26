// Endpoints only the TaskFlow app on this computer may use:
//   POST /sync/state    the app sends its copy, gets back the merged copy (last write wins)
//   GET  /sync/events   server-sent events: "change" whenever the data changes (another tab, the reminder clock)
// "This computer" means: the connection comes from the loopback address, the Host header is localhost
// (so a website can't reach it through DNS rebinding) and any Origin is this server itself.
import { mergeDocs, canon } from '../app/js/syncmerge.js';

class SyncError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
async function readJson(req, max) {
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > max) throw new SyncError(413, 'too_large', 'The data is too large.'); }
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch (e) { throw new SyncError(400, 'bad_json', 'The body is not valid JSON.'); }
}
function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

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

export function createSync(db, port) {
  const clients = new Set();
  db.onChange(({ rev, source }) => {
    for (const res of clients) res.write(`event: change\ndata: ${JSON.stringify({ rev, source })}\n\n`);
  });
  setInterval(() => { for (const res of clients) res.write(': keep-alive\n\n'); }, 25000).unref();
  // reminders that come due while the app is closed are marked fired here, so every open copy agrees
  setInterval(() => {
    const now = Date.now(), due = db.doc.quests.filter(q => q.remind && !q.remind.fired && !q.remind.dismissed && !q.done && q.remind.at <= now);
    if (due.length) db.mutate(() => { for (const q of due) { q.remind.fired = true; q.updatedAt = now; } }, 'server');
  }, 5000).unref();

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
        if (!Array.isArray(body.quests)) throw new SyncError(400, 'bad_doc', 'Expected the app data.');
        const before = canon(pick(db.doc));
        const merged = mergeDocs(pick(db.doc), pick(body));
        if (canon(merged) !== before) db.mutate(d => Object.assign(d, merged), 'app');
        return send(res, 200, { rev: db.doc.rev, ...pick(db.doc) });
      }
      send(res, 404, { error: { code: 'not_found', message: 'Not found.' } });
    } catch (e) {
      send(res, e.status || 500, { error: { code: e.code || 'error', message: e.status ? e.message : 'Something went wrong.' } });
      if (!e.status) console.error(e);
    }
  };
}
