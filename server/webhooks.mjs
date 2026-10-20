// Outgoing webhooks. Each delivery is a POST with a JSON body, signed with the webhook's secret:
//   TaskFlow-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">
// Failed deliveries (network error or non-2xx) are retried after 5 s, 30 s and 2 min.
import { createHmac, randomBytes } from 'node:crypto';
import { toApi } from '../app/js/questops.js';

export const EVENTS = ['quest.created', 'quest.updated', 'quest.completed', 'quest.deleted', 'reminder.fired'];
const RETRIES = (process.env.TASKFLOW_WEBHOOK_BACKOFF || '5000,30000,120000').split(',').map(Number);
const id = p => p + '_' + randomBytes(8).toString('hex');

export function sign(secret, body, t = Math.floor(Date.now() / 1000)) {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;
}
// for receivers (and the tests): check a signature, rejecting anything older than 5 minutes
export function verify(secret, body, header, toleranceSec = 300) {
  const m = /t=(\d+),v1=([0-9a-f]{64})/.exec(header || '');
  if (!m) return false;
  if (Math.abs(Date.now() / 1000 - +m[1]) > toleranceSec) return false;
  const expected = createHmac('sha256', secret).update(`${m[1]}.${body}`).digest('hex');
  return expected === m[2];
}

export const publicHook = h => ({ id: h.id, url: h.url, events: h.events, active: h.active, created_at: new Date(h.createdAt).toISOString(), secret_hint: h.secret.slice(0, 10) + '…' });

export function createHooks(db) {
  function add({ url, events }) {
    let u; try { u = new URL(url); } catch (e) { throw Object.assign(new Error('Enter a full URL, starting with https:// or http://'), { status: 422 }); }
    if (!['http:', 'https:'].includes(u.protocol)) throw Object.assign(new Error('Webhook URLs must start with https:// or http://'), { status: 422 });
    events = (Array.isArray(events) ? events : []).filter(e => EVENTS.includes(e));
    if (!events.length) throw Object.assign(new Error('Pick at least one event.'), { status: 422 });
    const h = { id: id('wh'), url: u.href, events, secret: 'whsec_' + randomBytes(24).toString('hex'), active: true, createdAt: Date.now() };
    db.doc.webhooks.push(h); db.touch();
    return { hook: publicHook(h), secret: h.secret };
  }
  function remove(hid) { const i = db.doc.webhooks.findIndex(h => h.id === hid); if (i < 0) return false; db.doc.webhooks.splice(i, 1); db.touch(); return true; }
  function log(entry) { db.doc.deliveries.unshift(entry); db.doc.deliveries.length = Math.min(db.doc.deliveries.length, 60); db.touch(); }

  async function deliver(h, payload, attempt = 1) {
    const body = JSON.stringify(payload), t0 = Date.now();
    let status = 0, error = null;
    try {
      const res = await fetch(h.url, { method: 'POST', body, signal: AbortSignal.timeout(10000),
        headers: { 'Content-Type': 'application/json', 'User-Agent': 'TaskFlow-Webhooks/1', 'TaskFlow-Event': payload.type, 'TaskFlow-Delivery': payload.id, 'TaskFlow-Signature': sign(h.secret, body) } });
      status = res.status;
      await res.arrayBuffer().catch(() => {});
    } catch (e) { error = e.name === 'TimeoutError' ? 'timed out' : (e.cause && e.cause.code) || e.message; }
    const ok = status >= 200 && status < 300;
    const willRetry = !ok && attempt <= RETRIES.length;
    log({ id: payload.id, hook: h.id, url: h.url, type: payload.type, attempt, status, ok, error, ms: Date.now() - t0, at: new Date().toISOString(), retry_in_ms: willRetry ? RETRIES[attempt - 1] : null });
    if (willRetry) setTimeout(() => { if (db.doc.webhooks.includes(h)) deliver(h, payload, attempt + 1); }, RETRIES[attempt - 1]).unref?.();
    return ok;
  }
  function emit(type, data) {
    const hooks = db.doc.webhooks.filter(h => h.active && h.events.includes(type));
    if (!hooks.length) return;
    const payload = { id: id('evt'), type, created_at: new Date().toISOString(), data };
    for (const h of hooks) deliver(h, payload);
  }
  // quest changes coming out of db.mutate()
  function fromChanges(events) {
    for (const e of events) emit(e.type, { quest: toApi(e.quest) });
  }
  function test(hid) {
    const h = db.doc.webhooks.find(x => x.id === hid);
    if (!h) return null;
    const payload = { id: id('evt'), type: 'ping', created_at: new Date().toISOString(), data: { message: 'Hello from TaskFlow. Your webhook works.' } };
    return deliver(h, payload, RETRIES.length + 1);   // a test is sent once, no retries
  }
  return { add, remove, emit, fromChanges, test, list: () => db.doc.webhooks.map(publicHook), deliveries: () => db.doc.deliveries.slice(0, 30) };
}
