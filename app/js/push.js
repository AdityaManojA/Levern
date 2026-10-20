// Web push for the installed app: the browser's push subscription for this device is saved to the person's
// account (taskflowUsers/{uid}/push/sub). The reminder job (scripts/reminders) sends through it.
import { VAPID_PUBLIC_KEY } from '../config.js';
import * as account from './account.js';
import { slog, serr } from './signinlog.js';
import { dlog } from './debuglog.js';

const toKey = b64 => { const pad = '='.repeat((4 - b64.length % 4) % 4); const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(raw, c => c.charCodeAt(0)); };

// call from a tap, after notification permission is granted
export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !VAPID_PUBLIC_KEY) {
    dlog('push', 'not available on this device', { serviceWorker: 'serviceWorker' in navigator, pushManager: 'PushManager' in window, key: !!VAPID_PUBLIC_KEY });
    return false;
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(VAPID_PUBLIC_KEY) });
    slog('push subscription ready', { existing: !!sub });
    await saveSubscription(sub);
    return true;
  } catch (e) { serr('push subscription', e); return false; }
}

// save this device's subscription to the signed-in account (no-op until someone is signed in)
export async function saveSubscription(sub) {
  const fu = await account.firebaseUser();
  if (!fu || !sub) return false;
  const { db, F } = await account.database();
  await F.setDoc(F.doc(db, 'taskflowUsers', fu.uid, 'push', 'sub'), { endpoint: sub.endpoint, keys: sub.toJSON().keys, updated: F.serverTimestamp() });
  slog('push subscription saved');
  return true;
}
