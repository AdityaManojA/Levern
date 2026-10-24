// Keeps the app's data in step with the TaskFlow server (server.mjs), which is what the REST API and
// webhooks read and change. The server is the shared copy: the app sends its data, the server merges
// (last write wins per quest, deletions win over older copies) and sends back the result, which the app
// adopts. Changes made through the API arrive as server-sent events. Offline, nothing is lost: the app
// keeps working on its own copy and sends it again when the server is back.
import { getState, onSave, syncDoc, adoptSynced } from './store.js';
import { canon } from './syncmerge.js';

let enabled = false, timer = null, busy = false, again = false, dirty = false, lastSent = '', es = null;
const listeners = new Set();
export const onSyncStatus = fn => listeners.add(fn);
let status = { online: false, lastSync: null, error: null };
const setStatus = s => { status = { ...status, ...s }; listeners.forEach(f => f(status)); };
export const syncStatus = () => status;

async function syncNow() {
  if (!enabled) return;
  if (busy) { again = true; return; }
  busy = true;
  try {
    const mine = syncDoc(), body = JSON.stringify(mine);
    const res = await fetch('sync/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    if (!res.ok) throw new Error('sync ' + res.status);
    const merged = await res.json();
    delete merged.rev;
    // adopt the server's result only if it differs from what we have now
    const now = canon(syncDoc());
    const theirs = canon(Object.fromEntries(Object.keys(mine).map(k => [k, merged[k]])));
    if (theirs !== now) adoptSynced(merged);
    lastSent = body; dirty = false;
    setStatus({ online: true, lastSync: Date.now(), error: null });
  } catch (e) {
    dirty = true;
    setStatus({ online: false, error: navigator.onLine ? "Can't reach the TaskFlow server" : 'Offline' });
  } finally {
    busy = false;
    if (again) { again = false; schedule(50); }
  }
}
const schedule = (ms = 600) => { clearTimeout(timer); timer = setTimeout(syncNow, ms); };

function listen() {
  if (!('EventSource' in window)) return;
  es?.close();
  es = new EventSource('sync/events');
  es.addEventListener('change', () => schedule(150));
  es.addEventListener('hello', () => schedule(50));
  es.onerror = () => setStatus({ online: false });
}

export async function startSync() {
  // the TaskFlow server runs on this computer (npm start); a hosted copy syncs through the account instead (cloud.js)
  const local = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /^(10|192\.168|172\.(1[6-9]|2\d|3[01]))\./.test(location.hostname);
  if (!local) { enabled = false; setStatus({ online: false, error: 'Not connected to a TaskFlow server' }); return false; }
  try {
    const r = await fetch('sync/ping', { cache: 'no-store' });
    enabled = r.ok;
  } catch (e) { enabled = false; }
  if (!enabled) { setStatus({ online: false, error: 'Not connected to a TaskFlow server' }); return false; }
  onSave((s, opts) => { if (!opts.fromSync) { dirty = true; schedule(); } });
  listen();
  addEventListener('online', () => { listen(); schedule(50); });
  setInterval(() => { if (dirty) syncNow(); }, 15000);
  await syncNow();
  return true;
}
export const syncEnabled = () => enabled;
export { getState };
