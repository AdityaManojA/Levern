// End-to-end PWA check in a headless Chromium browser (Edge or Chrome) over the DevTools protocol:
// service worker, offline, installability, notifications, and reminders while the app is closed.
// Run: npm run test:pwa   (set BROWSER_PATH to use another browser)
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP_DIR = process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 5191, ORIGIN = `http://127.0.0.1:${PORT}`, DBG = 9333;
const EDGE = [process.env.BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/microsoft-edge'].find(p => p && existsSync(p));
if (!EDGE) { console.error('No Chromium browser found. Set BROWSER_PATH.'); process.exit(2); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, info = '') => { results.push({ name, ok: !!ok, info }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${info ? '  — ' + info : ''}`); };

let server = spawn(process.execPath, [join(APP_DIR, '..', 'server.mjs'), String(PORT)], { stdio: 'ignore', env: { ...process.env, TASKFLOW_DATA: mkdtempSync(join(tmpdir(), 'tf-feed-')) } });
const profile = mkdtempSync(join(tmpdir(), 'tf-edge-'));
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
await sleep(2500);

const ver = await (await fetch(`http://127.0.0.1:${DBG}/json/version`)).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r, { once: true }));
let nextId = 1; const pending = new Map(), listeners = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  else listeners.forEach(f => f(m));
});
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const id = nextId++; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params, sessionId })); });
async function openPage(url) {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  await send('Page.enable', {}, sessionId); await send('Runtime.enable', {}, sessionId);
  await send('Page.navigate', { url }, sessionId);
  await sleep(2500);
  return { targetId, sessionId };
}
const evalIn = async (sessionId, expr) => {
  const r = await send('Runtime.evaluate', { expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

try {
  await send('Browser.grantPermissions', { origin: ORIGIN, permissions: ['notifications', 'periodicBackgroundSync'] });
  let p = await openPage(ORIGIN + '/');
  const errs = [];
  listeners.push(m => { if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text); });

  const sw = await evalIn(p.sessionId, `const r = await navigator.serviceWorker.ready; return { scope: r.scope, state: r.active && r.active.state, perm: Notification.permission, periodic: 'periodicSync' in r };`);
  check('Service worker registers and activates', sw.state === 'activated', JSON.stringify(sw));
  check('Notification permission granted (test profile)', sw.perm === 'granted');

  await send('Page.reload', {}, p.sessionId); await sleep(2000);
  const ctl = await evalIn(p.sessionId, `const keys = await caches.keys(); const c = await caches.open(keys[0]); return { controlled: !!navigator.serviceWorker.controller, caches: keys, files: (await c.keys()).length };`);
  check('Page is controlled by the service worker after reload', ctl.controlled);
  check('App shell cached for offline', ctl.files >= 30, `${ctl.files} files in ${ctl.caches.join(',')}`);

  const inst = await send('Page.getInstallabilityErrors', {}, p.sessionId);
  check('Installable (no installability errors)', inst.installabilityErrors.length === 0, JSON.stringify(inst.installabilityErrors));
  const man = await send('Page.getAppManifest', {}, p.sessionId);
  check('Manifest parses without errors', man.errors.length === 0, man.errors.map(e => e.message).join('; '));

  // reminder while the app is open (in the background is the same code path): shown via the service worker
  await evalIn(p.sessionId, `const s = window.TaskFlow.store; const q = s.addQuest({ title: 'Open-app reminder', tier: 1 }); s.setReminder(q.id, { at: Date.now() + 2000 }); return q.id;`);
  await sleep(4000);
  const shown1 = await evalIn(p.sessionId, `const r = await navigator.serviceWorker.ready; const n = await r.getNotifications(); return { list: n.map(x => ({ title: x.title, body: x.body, actions: (x.actions || []).map(a => a.title) })), badge: document.querySelector('[data-rcount]').textContent, title: document.title };`);
  const n1 = shown1.list.find(x => x.title === 'Reminder: Open-app reminder');
  check('Reminder shows a system notification through the service worker', !!n1, JSON.stringify(n1));
  check('Notification has Done and Snooze buttons', n1 && n1.actions.includes('Done') && n1.actions.some(a => a.startsWith('Snooze')));
  check('Badge and tab title show the due count', shown1.badge === '1' && shown1.title.startsWith('(1)'), `${shown1.badge} / ${shown1.title}`);

  // app closed: schedule a reminder, close the page, let the worker wake via periodic sync
  await evalIn(p.sessionId, `const s = window.TaskFlow.store; const q = s.addQuest({ title: 'Closed-app reminder', tier: 0 }); s.setReminder(q.id, { at: Date.now() + 3000 }); return 1;`);
  await sleep(1500);   // schedule mirrored to IndexedDB
  await send('ServiceWorker.enable', {}, p.sessionId);
  let regId = null;
  const regPromise = new Promise(res => listeners.push(m => { if (m.method === 'ServiceWorker.workerRegistrationUpdated') { const r = m.params.registrations.find(x => x.scopeURL.startsWith(ORIGIN)); if (r) { regId = r.registrationId; res(); } } }));
  await Promise.race([regPromise, sleep(3000)]);
  // a second, non-app target to drive the worker after the app page is gone
  const helper = await send('Target.attachToTarget', { targetId: (await send('Target.createTarget', { url: 'about:blank' })).targetId, flatten: true });
  await send('Target.closeTarget', { targetId: p.targetId });
  await sleep(3000);
  await send('ServiceWorker.enable', {}, helper.sessionId);
  await send('ServiceWorker.dispatchPeriodicSyncEvent', { origin: ORIGIN, registrationId: regId, tag: 'taskflow-reminders', lastChance: false }, helper.sessionId);
  await sleep(2000);
  // look at the notifications from a fresh page, before it runs its own check
  p = await openPage(ORIGIN + '/#/home');
  const shown2 = await evalIn(p.sessionId, `const r = await navigator.serviceWorker.ready; return (await r.getNotifications()).map(x => x.title);`);
  check('With the app closed, the worker shows the reminder on periodic sync', shown2.includes('Reminder: Closed-app reminder'), JSON.stringify(shown2));
  const marked = await evalIn(p.sessionId, `await new Promise(r => setTimeout(r, 1500)); const q = window.TaskFlow.store.getState().quests.find(x => x.title === 'Closed-app reminder'); return { fired: q.remind.fired, notes: (await (await navigator.serviceWorker.ready).getNotifications()).filter(x => x.title === 'Reminder: Closed-app reminder').length };`);
  check('Reopened app counts it as due without a duplicate notification', marked.fired && marked.notes === 1, JSON.stringify(marked));

  // notification "Done" tapped while the app was closed: queued, applied on next open
  await evalIn(p.sessionId, `const d = await new Promise((res, rej) => { const r = indexedDB.open('taskflow-sw', 1); r.onsuccess = () => res(r.result); r.onerror = rej; });
    const id = window.TaskFlow.store.getState().quests.find(x => x.title === 'Closed-app reminder').id;
    await new Promise(res => { const t = d.transaction('kv', 'readwrite'); t.objectStore('kv').put([{ action: 'done', id, t: Date.now() }], 'actions'); t.oncomplete = res; }); return id;`);
  await send('Page.reload', {}, p.sessionId); await sleep(2500);
  const applied = await evalIn(p.sessionId, `const q = window.TaskFlow.store.getState().quests.find(x => x.title === 'Closed-app reminder'); return q.done;`);
  check('Queued notification action (Done) is applied when the app opens', applied === true);

  // offline: stop the server and reload
  server.kill(); await sleep(800);
  await send('Page.reload', {}, p.sessionId); await sleep(2500);
  const off = await evalIn(p.sessionId, `return { h: document.querySelector('.h-title')?.textContent, quests: window.TaskFlow.store.getState().quests.length };`);
  check('Works offline (server stopped, page reloads from cache)', off.h === 'Your progress' && off.quests > 0, JSON.stringify(off));
  await send('Page.navigate', { url: ORIGIN + '/#/calendar' }, p.sessionId); await sleep(1500);
  const off2 = await evalIn(p.sessionId, `return document.querySelector('.h-title')?.textContent;`);
  check('Other screens work offline too', off2 === 'Calendar');
  check('No uncaught page errors', errs.length === 0, errs.join(' | '));
} catch (e) {
  check('Test run', false, e.stack);
} finally {
  try { ws.close(); } catch (e) {}
  edge.kill(); server.kill();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  setTimeout(() => process.exit(failed ? 1 : 0), 500);
}
