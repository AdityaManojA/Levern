// Diagnostic log for testers. Off unless someone turns it on in Settings > Debugging. While it's on, the app
// records what the sign-in, sync, push and notification code does, so the text can be copied and sent back.
// Lines never hold quest titles, emails, tokens or push endpoints: only steps, codes, counts and flags.
const ON = 'taskflow-debug', LOG = 'taskflow-debug-log', MAX = 400;

const storage = () => { try { return localStorage; } catch (e) { return null; } };
export const debugOn = () => storage()?.getItem(ON) === '1';

function readLog() {
  try { return JSON.parse(storage()?.getItem(LOG)) || []; } catch (e) { return []; }
}
function writeLog(lines) {
  try { storage()?.setItem(LOG, JSON.stringify(lines.slice(-MAX))); } catch (e) {}
}

// record one line (no-op when the log is off)
export function dlog(area, msg, data) {
  if (!debugOn()) return;
  const line = { t: new Date().toISOString(), area, msg };
  if (data !== undefined) line.data = data;
  const lines = readLog();
  lines.push(line);
  writeLog(lines);
}

export function logCount() { return readLog().length; }
export function clearLog() { try { storage()?.removeItem(LOG); } catch (e) {} }

// turn logging on or off; the service worker is told too, so push events are recorded
export function setDebug(on) {
  try { on ? storage()?.setItem(ON, '1') : storage()?.removeItem(ON); } catch (e) {}
  navigator.serviceWorker?.controller?.postMessage({ type: 'debug', on: !!on });
  dlog('debug', on ? 'logging turned on' : 'logging turned off');
}

// what the service worker recorded (push received, notification shown or failed)
function swLog() {
  return new Promise(resolve => {
    const sw = navigator.serviceWorker?.controller;
    if (!sw || !('MessageChannel' in window)) return resolve([]);
    const ch = new MessageChannel();
    const timer = setTimeout(() => resolve([]), 1500);
    ch.port1.onmessage = e => { clearTimeout(timer); resolve(Array.isArray(e.data) ? e.data : []); };
    sw.postMessage({ type: 'get-debug' }, [ch.port2]);
  });
}

// the device details testers should send along with the log
export async function deviceInfo(extra = {}) {
  const reg = await navigator.serviceWorker?.getRegistration?.().catch(() => null);
  const sub = await reg?.pushManager?.getSubscription?.().catch(() => null);
  const caches_ = await caches?.keys?.().catch(() => []) || [];
  return {
    app: caches_.join(', ') || 'unknown',   // the service worker's cache name is the app version (sw.js VERSION)
    time: new Date().toString(),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
    installed: matchMedia('(display-mode: standalone)').matches || navigator.standalone === true,
    notifications: 'Notification' in window ? Notification.permission : 'unsupported',
    pushSupported: 'PushManager' in window,
    serviceWorker: !!navigator.serviceWorker?.controller,
    pushSubscribed: !!sub,
    ...extra,
  };
}

// the whole report as plain text: device details, the page's log, then the service worker's log
export async function reportText(extra = {}) {
  const [info, swLines] = await Promise.all([deviceInfo(extra), swLog()]);
  const pageLines = readLog();
  const all = [...pageLines, ...swLines].sort((a, b) => (a.t || '').localeCompare(b.t || ''));
  return [
    'Levern diagnostic log',
    JSON.stringify(info, null, 2),
    '',
    ...all.map(l => `${l.t} [${l.area}] ${l.msg}${l.data !== undefined ? ' ' + JSON.stringify(l.data) : ''}`),
    all.length ? '' : '(no entries yet)',
  ].join('\n');
}
