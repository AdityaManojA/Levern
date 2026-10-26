// System notifications through the service worker, the app-icon badge, and the reminder schedule
// the service worker reads when it wakes up without the page.
import { kv } from './storage.js';
import { dlog } from './debuglog.js';

export const supported = 'Notification' in window;
let reg = null;
const listeners = new Set();

export async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    reg = await navigator.serviceWorker.register('./sw.js');
    navigator.serviceWorker.addEventListener('message', e => listeners.forEach(f => f(e.data)));
    await navigator.serviceWorker.ready;
    reg = await navigator.serviceWorker.getRegistration() || reg;
    tryPeriodicSync();
  } catch (e) { console.warn('Levern: service worker not registered', e); }
  return reg;
}
export const onMessage = fn => listeners.add(fn);
export const permission = () => supported ? Notification.permission : 'unsupported';
export async function requestPermission() {
  if (!supported || Notification.permission !== 'default') return permission();
  try {
    const p = await Notification.requestPermission();
    dlog('notify', 'permission answered', { result: p });
    if (p === 'granted') { tryPeriodicSync(); import('./push.js').then(m => m.enablePush()); }
    return p;
  } catch (e) { dlog('notify', 'permission request failed', { message: String(e?.message || e) }); return permission(); }
}

// Shows a notification through the service worker when there is one (needed on Android and for the
// Done / Snooze buttons), else with the page's Notification constructor. Returns true when shown.
export async function show(title, opts = {}) {
  if (permission() !== 'granted') return false;
  const o = { icon: 'icons/icon-v4-192.png', badge: 'icons/badge-v4-96.png', ...opts };
  try {
    if (reg && reg.showNotification) { await reg.showNotification(title, o); return true; }
    const { actions, ...rest } = o;   // actions are only allowed on service-worker notifications
    const n = new Notification(title, rest);
    n.onclick = () => { window.focus(); if (o.data && o.data.url) location.hash = o.data.url; n.close(); };
    return true;
  } catch (e) { return false; }
}

export function setBadge(n) {
  try { if ('setAppBadge' in navigator) n ? navigator.setAppBadge(n) : navigator.clearAppBadge(); } catch (e) {}
}

// The service worker keeps its own copy of upcoming reminders so it can show them if the browser
// wakes it (periodic background sync) while the app is closed.
export async function syncSchedule(items) {
  try { await kv.set('schedule', items); } catch (e) {}
  if (reg && reg.active) reg.active.postMessage({ type: 'schedule', items });
}
// reminders the service worker already showed, and notification button taps made while the app was closed
export async function drainFromSW() {
  try {
    const shown = (await kv.get('shown')) || [], actions = (await kv.get('actions')) || [];
    if (actions.length) await kv.set('actions', []);
    return { shown, actions };
  } catch (e) { return { shown: [], actions: [] }; }
}
async function tryPeriodicSync() {
  try {
    if (!reg || !('periodicSync' in reg)) return;
    const st = await navigator.permissions.query({ name: 'periodic-background-sync' });
    if (st.state === 'granted') await reg.periodicSync.register('taskflow-reminders', { minInterval: 15 * 60 * 1000 });
  } catch (e) {}
}
export const hasPeriodicSync = () => !!(reg && 'periodicSync' in reg);
