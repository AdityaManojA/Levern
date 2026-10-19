// Keeps a signed-in person's data on the TaskFlow server (Firebase, functions/index.js), so it is safe,
// the same on every device they sign in on, and available to their Apple Calendar link and to Google
// Calendar sync while the app is closed. Works like sync.js (the local server): send our copy, the server
// merges (last write wins per quest, deletions win) and returns the result, which we adopt.
// Offline or signed out, the app just keeps working on its own copy.
import { getState, onSave, syncDoc, adoptSynced } from './store.js';
import * as account from './account.js';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const EVENTS_KEY = 'taskflow-events';
let available = null, timer = null, busy = false, again = false, dirty = true, rev = -1, eventsRev = -1, poll = null;
let info = { gcal: { connected: false }, feedUrl: null, lastSync: null, error: null };
let events = (() => { try { return JSON.parse(localStorage.getItem(EVENTS_KEY)) || []; } catch (e) { return []; } })();
const listeners = new Set();
const emit = () => listeners.forEach(f => f(info));
export const onCloud = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const cloudInfo = () => info;
export const cloudAvailable = () => available;
export const cloudOn = () => !!(available && account.user());
// the person's own Google Calendar events (from the server), for the Calendar screen
export const externalEvents = () => events;

async function call(method, path, body) {
  const t = await account.idToken();
  if (!t) throw Object.assign(new Error('Sign in first.'), { status: 401 });
  const r = await fetch('api' + path, { method, headers: { Authorization: 'Bearer ' + t, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(data.error || `TaskFlow server error ${r.status}`), { status: r.status });
  return data;
}
function setEvents(items) {
  events = items || [];
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(events)); } catch (e) {}
}
function take(r) {
  info = { ...info, gcal: r.gcal || info.gcal, feedUrl: r.feedUrl || info.feedUrl, lastSync: Date.now(), error: null };
  if (typeof r.rev === 'number') rev = r.rev;
  if (r.events) { setEvents(r.events.items); eventsRev = r.eventsRev ?? eventsRev; }
}

export async function syncNow() {
  if (!cloudOn()) return;
  if (busy) { again = true; return; }
  busy = true;
  try {
    const mine = syncDoc();
    const r = await call('POST', '/sync', { doc: mine, tz: TZ, withEvents: eventsRev < 0 });
    const now = JSON.stringify(syncDoc());
    const theirs = JSON.stringify(Object.fromEntries(Object.keys(mine).map(k => [k, r.doc[k]])));
    if (theirs !== now) adoptSynced(r.doc);
    take(r);
    if (r.eventsRev !== eventsRev && !r.events) await refreshEvents(r.eventsRev);
    dirty = false;
  } catch (e) {
    info = { ...info, error: navigator.onLine ? "Can't reach the TaskFlow server right now" : 'Offline' };
  } finally {
    busy = false; emit();
    if (again) { again = false; schedule(50); }
  }
}
async function refreshEvents(nextRev) {
  try { const r = await call('GET', '/events'); setEvents(r.items); eventsRev = nextRev; } catch (e) {}
}
const schedule = (ms = 1200) => { clearTimeout(timer); timer = setTimeout(syncNow, ms); };

// cheap check for changes made on another device (or by the server's Google sync)
async function check() {
  if (!cloudOn() || document.hidden) return;
  if (dirty) return syncNow();
  try {
    const r = await call('GET', '/rev');
    info = { ...info, gcal: r.gcal, feedUrl: r.feedUrl || info.feedUrl };
    if (r.rev !== rev) await syncNow();
    else if (r.eventsRev !== eventsRev) { await refreshEvents(r.eventsRev); emit(); }
  } catch (e) {}
}

/* ---------- Google Calendar, run by the server ---------- */
// opens Google's permission page in a popup; the server finishes the connection and syncs
export async function connectGoogleServer() {
  const popup = window.open('', 'taskflow-gcal', 'width=500,height=650');
  try {
    await syncNow();   // the server needs this person's quests first
    const { url } = await call('POST', '/gcal/start');
    if (popup && !popup.closed) popup.location.href = url; else { location.href = url; return null; }
  } catch (e) { popup?.close(); throw e; }
  return new Promise(res => {
    const done = ok => { removeEventListener('message', onMsg); clearInterval(watch); res(ok); };
    const onMsg = e => { if (e.origin === location.origin && e.data?.taskflow === 'gcal') done(!!e.data.ok); };
    addEventListener('message', onMsg);
    const watch = setInterval(() => { if (popup.closed) done(null); }, 700);
  }).then(async ok => { eventsRev = -1; await syncNow(); return ok ?? !!info.gcal?.connected; });
}
export async function syncGoogleServer() {
  await syncNow();
  const r = await call('POST', '/gcal/sync');
  take(r); emit();
  return r.counts;
}
export async function disconnectGoogleServer() {
  await call('POST', '/gcal/disconnect');
  setEvents([]); info = { ...info, gcal: { connected: false } }; emit();
}
export async function newFeedLink() {
  const r = await call('POST', '/feed/rotate');
  info = { ...info, feedUrl: r.feedUrl }; emit();
  return r.feedUrl;
}

export async function startCloud() {
  // the local server (npm start) has its own sync (sync.js); the TaskFlow server only runs when hosted
  if (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) && !new URLSearchParams(location.search).has('cloud')) { available = false; emit(); return false; }
  try { const r = await fetch('api/ping', { cache: 'no-store' }); available = r.ok && (await r.json().catch(() => ({}))).service === 'taskflow-cloud'; }
  catch (e) { available = false; }
  emit();
  if (!available) return false;
  onSave((s, opts) => { if (!opts.fromSync) { dirty = true; schedule(); } });
  account.onAccount(u => { rev = -1; eventsRev = -1; dirty = true; if (u) syncNow(); else { setEvents([]); info = { gcal: { connected: false }, feedUrl: null, lastSync: null, error: null }; emit(); } });
  addEventListener('online', () => schedule(50));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  clearInterval(poll); poll = setInterval(check, 30000);
  if (account.user()) await syncNow();
  return true;
}
