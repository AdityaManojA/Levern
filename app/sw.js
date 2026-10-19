/* TaskFlow service worker: offline app shell, reminder notifications, notification buttons.
   Limits: a page-less service worker only runs when the browser wakes it. Reminders are shown
   on time while the app is open (even in a background tab). With the app closed they are shown
   when the browser runs a periodic background sync (installed app, Chrome/Edge, roughly every
   15 min at best and at the browser's discretion) or when a push message arrives. Exact-time
   delivery with the app closed needs a push server (or the native wrapper's local notifications). */
const VERSION = 'taskflow-v22';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/store.js', 'js/storage.js', 'js/dates.js', 'js/parse.js', 'js/recur.js', 'js/ics.js', 'js/stats.js',
  'js/notify.js', 'js/reminders.js', 'js/speech.js', 'js/ui.js', 'js/complete.js', 'js/motion.js', 'js/mochi.js', 'js/mascot.js', 'js/sync.js', 'js/syncmerge.js', 'js/questops.js', 'js/views/developer.js', 'js/ptr.js', 'mochi/strips/stretch.png', 'mochi/strips/wave.png', 'mochi/strips/happy-spin.png', 'js/views/tour.js', 'mochi/manifest.js', 'mochi/strips/rest.png', 'mochi/strips/blink.png', 'js/calendars.js', 'js/gcalmap.js', 'config.js', 'js/install.js', 'js/views/common.js',
  'js/views/home.js', 'js/views/quests.js', 'js/views/detail.js', 'js/views/add.js', 'js/views/calendar.js',
  'js/views/focus.js', 'js/views/stats.js', 'js/views/settings.js', 'js/views/reminders.js', 'js/views/onboarding.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/badge-96.png', 'icons/icon.svg', 'icons/apple-touch-icon.png',
  'sounds/tap-1.mp3', 'sounds/tap-2.mp3', 'sounds/tap-3.mp3', 'sounds/tab-1.mp3', 'sounds/tab-2.mp3', 'sounds/tick-1.mp3', 'sounds/tick-2.mp3', 'sounds/tick-3.mp3', 'sounds/coin.mp3', 'sounds/chime-1.mp3', 'sounds/chime-2.mp3', 'sounds/mrrp-1.mp3', 'sounds/mrrp-2.mp3', 'sounds/mrrp-3.mp3', 'sounds/meow-sweet-1.mp3', 'sounds/meow-sweet-2.mp3', 'sounds/meow-hey-1.mp3', 'sounds/meow-hey-2.mp3', 'sounds/meow-grumpy-1.mp3', 'sounds/meow-grumpy-2.mp3', 'sounds/step-1.mp3', 'sounds/step-2.mp3', 'sounds/step-3.mp3', 'sounds/land.mp3', 'sounds/meow-1.mp3', 'sounds/meow-2.mp3', 'sounds/meow-3.mp3', 'sounds/pickup-1.mp3', 'sounds/pickup-2.mp3', 'sounds/angry-1.mp3', 'sounds/angry-2.mp3',
  'js/sound.js', 'js/ink.js', 'js/inkpad.js', 'js/handwriting.js', 'js/views/ink.js',
  'js/controls.js', 'js/menu.js', 'js/account.js', 'js/cloud.js','privacy.html', 'cookies.html','mochi/strips/happy-wiggle.png', 'fonts/inter-latin-wght-normal.woff2', 'fonts/inter-latin-ext-wght-normal.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
// network first for the app's own files (so updates show up straight away), cache when offline
self.addEventListener('fetch', e => {
  const req = e.request;
  const u = new URL(req.url);
  if (req.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('/calendar.ics') || /\/(sync|api|feed)\//.test(u.pathname)) return;   // live data is never cached
  e.respondWith(
    fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});

/* ---------- tiny IndexedDB key-value store (same as js/storage.js kv) ---------- */
const db = () => new Promise((res, rej) => {
  const r = indexedDB.open('taskflow-sw', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
});
const kvGet = async k => { const d = await db(); return new Promise(res => { const r = d.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); }); };
const kvSet = async (k, v) => { const d = await db(); return new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = res; t.onerror = res; }); };

const key = it => `${it.id}@${it.at}`;
const notifyOpts = it => ({
  body: it.body, tag: 'quest-' + it.id, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
  data: { id: it.id, url: '#/quest/' + it.id },
  actions: [{ action: 'done', title: 'Done' }, { action: 'snooze', title: 'Snooze 10 min' }],
});

// show every scheduled reminder whose time has come and that nobody has shown yet
async function checkDue() {
  const items = (await kvGet('schedule')) || [], shown = new Set((await kvGet('shown')) || []);
  const now = Date.now(), fresh = items.filter(it => it.at <= now && !shown.has(key(it)));
  if (!fresh.length) return;
  // an open, visible app shows them itself
  const wins = await self.clients.matchAll({ type: 'window' });
  if (wins.some(w => w.visibilityState === 'visible')) return;
  for (const it of fresh) { shown.add(key(it)); await self.registration.showNotification('Reminder: ' + it.title, notifyOpts(it)); }
  await kvSet('shown', [...shown].slice(-200));
  try { const n = items.filter(it => it.at <= now).length; if (self.navigator.setAppBadge) self.navigator.setAppBadge(n); } catch (e) {}
}

self.addEventListener('message', e => {
  const m = e.data || {};
  if (m.type === 'schedule') e.waitUntil(kvSet('schedule', m.items || []));
  if (m.type === 'check') e.waitUntil(checkDue());
});
self.addEventListener('periodicsync', e => { if (e.tag === 'taskflow-reminders') e.waitUntil(checkDue()); });
// a future sync server can push { title, body, id } and it is shown the same way
self.addEventListener('push', e => {
  let d = {}; try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.title || 'TaskFlow', d.id ? notifyOpts(d) : { body: d.body || '', icon: 'icons/icon-192.png' }));
});

self.addEventListener('notificationclick', e => {
  const n = e.notification, data = n.data || {}, action = e.action || 'open';
  n.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (data.id && action !== 'open') {
      if (wins.length) wins[0].postMessage({ type: 'reminder-action', action, id: data.id });
      else { const q = (await kvGet('actions')) || []; q.push({ action, id: data.id, t: Date.now() }); await kvSet('actions', q); }
      return;
    }
    const url = new URL('./' + (data.url || ''), self.registration.scope).href;
    if (wins.length) { await wins[0].focus(); wins[0].postMessage({ type: 'navigate', url: data.url || '#/home' }); }
    else await self.clients.openWindow(url);
  })());
});
