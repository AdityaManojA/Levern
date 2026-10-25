/* TaskFlow service worker: offline app shell, reminder notifications, notification buttons.
   Limits: a page-less service worker only runs when the browser wakes it. Reminders are shown
   on time while the app is open (even in a background tab). With the app closed they are shown
   when the browser runs a periodic background sync (installed app, Chrome/Edge, roughly every
   15 min at best and at the browser's discretion) or when a push message arrives. Exact-time
   delivery with the app closed needs a push server (or the native wrapper's local notifications). */
const VERSION = 'taskflow-v46';
const SHELL = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css',
  'js/main.js', 'js/store.js', 'js/storage.js', 'js/dates.js', 'js/parse.js', 'js/recur.js', 'js/ics.js', 'js/stats.js',
  'js/notify.js', 'js/reminders.js', 'js/speech.js', 'js/ui.js', 'js/complete.js', 'js/motion.js', 'js/mochi.js', 'js/mascot.js', 'js/sync.js', 'js/syncmerge.js', 'js/questops.js', 'js/views/developer.js', 'js/ptr.js', 'mochi/strips/stretch.webp', 'mochi/strips/wave.webp', 'mochi/strips/happy-spin.webp', 'js/views/tour.js', 'mochi/manifest.js', 'cookie/manifest.js', 'mochi/strips/rest.webp', 'mochi/strips/blink.webp', 'js/calendars.js', 'js/gcalmap.js', 'config.js', 'js/install.js', 'js/views/common.js',
  'js/views/home.js', 'js/views/quests.js', 'js/views/detail.js', 'js/views/add.js', 'js/views/calendar.js',
  'js/views/focus.js', 'js/views/stats.js', 'js/views/settings.js', 'js/views/reminders.js', 'js/views/onboarding.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/favicon-squircle.png', 'icons/maskable-512.png', 'icons/badge-96.png', 'icons/apple-touch-icon-v2.png',
  'sounds/tap-1.mp3', 'sounds/tap-2.mp3', 'sounds/tap-3.mp3', 'sounds/tab-1.mp3', 'sounds/tab-2.mp3', 'sounds/tick-1.mp3', 'sounds/tick-2.mp3', 'sounds/tick-3.mp3', 'sounds/coin.mp3', 'sounds/chime-1.mp3', 'sounds/chime-2.mp3', 'sounds/mrrp-1.mp3', 'sounds/mrrp-2.mp3', 'sounds/mrrp-3.mp3', 'sounds/meow-sweet-1.mp3', 'sounds/meow-sweet-2.mp3', 'sounds/meow-hey-1.mp3', 'sounds/meow-hey-2.mp3', 'sounds/meow-grumpy-1.mp3', 'sounds/meow-grumpy-2.mp3', 'sounds/step-1.mp3', 'sounds/step-2.mp3', 'sounds/step-3.mp3', 'sounds/land.mp3', 'sounds/meow-1.mp3', 'sounds/meow-2.mp3', 'sounds/meow-3.mp3', 'sounds/pickup-1.mp3', 'sounds/pickup-2.mp3', 'sounds/angry-1.mp3', 'sounds/angry-2.mp3',
  'js/sound.js', 'js/ink.js', 'js/inkpad.js', 'js/handwriting.js', 'js/views/ink.js',
  'js/controls.js', 'js/menu.js', 'js/account.js', 'js/cloud.js', 'js/nudges.js', 'js/theme.js', 'js/theme-boot.js', 'js/namefilter.js', 'js/namecheck.js', 'js/board.js', 'js/views/leaderboard.js', 'js/views/whatsnew.js', 'js/changelog.js', 'js/views/profile.js', 'js/profile.js', 'js/rankup.js', 'privacy.html', 'cookies.html','mochi/strips/happy-wiggle.webp', 'fonts/inter-latin-wght-normal.woff2', 'fonts/inter-latin-ext-wght-normal.woff2',
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
// daily nudges (kind 'nudge': water, meals, a walk, today's quests) have no Done/Snooze and open Home
const notifyOpts = it => it.kind === 'nudge'
  ? { body: it.body, tag: 'nudge-' + it.id, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: '#/home' } }
  : {
    body: it.body, tag: 'quest-' + it.id, renotify: true, icon: 'icons/icon-192.png', badge: 'icons/badge-96.png',
    data: { id: it.id, url: '#/quest/' + it.id },
    actions: [{ action: 'done', title: 'Done' }, { action: 'snooze', title: 'Snooze 10 min' }],
  };

// show every scheduled reminder whose time has come and that nobody has shown yet
async function checkDue() {
  const items = (await kvGet('schedule')) || [], shown = new Set((await kvGet('shown')) || []);
  const now = Date.now(), fresh = items.filter(it => it.at <= now && !shown.has(key(it)));
  if (!fresh.length) return;
  // an open, visible app shows them itself
  const wins = await self.clients.matchAll({ type: 'window' });
  if (wins.some(w => w.visibilityState === 'visible')) return;
  for (const it of fresh) { shown.add(key(it)); await self.registration.showNotification(it.kind === 'nudge' ? it.title : 'Reminder: ' + it.title, notifyOpts(it)); }
  await kvSet('shown', [...shown].slice(-200));
  try { const n = items.filter(it => it.at <= now && it.kind !== 'nudge').length; if (self.navigator.setAppBadge) self.navigator.setAppBadge(n); } catch (e) {}
}

self.addEventListener('message', e => {
  const m = e.data || {};
  if (m.type === 'schedule') e.waitUntil(kvSet('schedule', m.items || []));
  if (m.type === 'check') e.waitUntil(checkDue());
  if (m.type === 'debug') e.waitUntil(kvSet('debugOn', !!m.on));
  if (m.type === 'get-debug' && e.ports[0]) e.waitUntil(kvGet('debuglog').then(l => e.ports[0].postMessage(l || [])));
});
// diagnostics for testers (Settings > Debugging): recorded only while the app has logging turned on
async function swlog(msg, data) {
  if (!(await kvGet('debugOn'))) return;
  const lines = (await kvGet('debuglog')) || [];
  lines.push({ t: new Date().toISOString(), area: 'sw', msg, ...(data === undefined ? {} : { data }) });
  await kvSet('debuglog', lines.slice(-300));
}
self.addEventListener('periodicsync', e => { if (e.tag === 'taskflow-reminders') e.waitUntil(checkDue()); });
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

// reminders pushed from the server (scripts/reminders): shown even when the app is closed.
// One handler only, so each push shows once. A payload with an `id` uses the local reminder options.
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: 'TaskFlow', body: e.data ? e.data.text() : '' }; }
  // Show the notification first, straight away: iOS expects every push to produce one, and nothing may stand
  // in front of it. The diagnostic log is written afterwards and can't stop or delay the notification.
  const show = d.id ? self.registration.showNotification(d.title || 'TaskFlow', notifyOpts(d))
    : self.registration.showNotification(d.title || 'TaskFlow', {
      body: d.body || '', tag: d.tag || 'taskflow', renotify: true,
      icon: 'icons/icon-192.png', badge: 'icons/badge-96.png', data: { url: d.url || '#/home' },
    });
  // the log keeps the kind of reminder, not its title (titles name the person's quests)
  e.waitUntil(show.then(
    () => swlog('notification shown', { tag: d.tag || null }).catch(() => {}),
    err => swlog('notification failed', { name: err?.name || null, message: String(err?.message || err) }).catch(() => {}).then(() => { throw err; })));
});
