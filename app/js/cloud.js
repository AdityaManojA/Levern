// Keeps a signed-in person's Levern data in their account (Firestore, straight from the browser; the
// database rules only let each person reach their own documents). The same on every device they sign in
// on, and readable by Solodesk, which shares the account. Works like sync.js (the local server): merge
// our copy with the account's copy (last write wins per quest, deletions win, syncmerge.js), save the
// result to both. Offline or signed out, the app just keeps working on its own copy.
//
//   taskflowUsers/{uid}               rev, chunk count, time zone, when it changed
//   taskflowUsers/{uid}/chunks/{i}    the data, deflated (sketches can make it big; a document holds 1 MiB)
//   taskflowUsers/{uid}/share/open    plain list of open quests and upcoming Google events, for Solodesk
import { getState, onSave, syncDoc, adoptSynced, commit, resetAll, dropSamples } from './store.js';
import { mergeDocs, canon } from './syncmerge.js';
import * as account from './account.js';
import { dlog } from './debuglog.js';
import { kv } from './storage.js';
import { FIRESTORE_COLLECTIONS } from './constants.js';

const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const CHUNK = 700 * 1024;
let started = false, timer = null, busy = false, again = false, dirty = true, rev = -1, unlisten = null, sharedEvents = [], lastShare = '', shareT = null;
let info = { lastSync: null, error: null };
const listeners = new Set();
const emit = () => listeners.forEach(f => f(info));
export const onCloud = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const cloudInfo = () => info;
export const cloudOn = () => !!account.user();
// Until the account's copy has been read (or the attempt failed), a signed-in person's screens wait, so the
// screen never shows an empty or out-of-date list before their own quests load. Offline, local quests show immediately.
const isOffline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
let ready = !account.user() || isOffline();
export const cloudReady = () => ready || isOffline();
const becomeReady = () => { if (!ready) { ready = true; emit(); } };

/* ---------- packing ---------- */
const canZip = typeof CompressionStream === 'function';
async function zip(bytes, mode) {
  const s = new Blob([bytes]).stream().pipeThrough(mode === 'in' ? new CompressionStream('deflate-raw') : new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function pack(doc) {
  let bytes = new TextEncoder().encode(JSON.stringify(doc));
  if (canZip) bytes = await zip(bytes, 'in');
  const parts = [];
  for (let i = 0; i < bytes.length; i += CHUNK) parts.push(bytes.subarray(i, i + CHUNK));
  return { parts: parts.length ? parts : [new Uint8Array(0)], z: canZip };
}
async function unpack(parts, z) {
  const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0; for (const p of parts) { all.set(p, o); o += p.length; }
  if (!all.length) return null;
  return JSON.parse(new TextDecoder().decode(z ? await zip(all, 'out') : all));
}

/* ---------- sync ---------- */
const norm = d => canon(mergeDocs(d || {}, {}));
// returns { ok, hadData } (hadData: the account already had quests, i.e. a returning person)
// one sync at a time. A caller that asks while a sync is running (for example sign-in, which must know whether
// this is a returning account) gets the result of that run, instead of an empty answer.
let inFlight = null;
export function syncNow() {
  if (!inFlight) inFlight = runSync().finally(() => { inFlight = null; });
  return inFlight;
}
async function runSync() {
  if (isOffline()) {
    info = { ...info, error: "Offline. Changes will be saved when you're back online." };
    becomeReady();
    emit();
    return { ok: false };
  }
  const u = account.user();
  if (!u) return { ok: false };
  if (busy) { again = true; return { ok: false }; }
  busy = true;
  let result = { ok: false };
  try {
    const { db, F } = await account.database();
    if (!(await account.firebaseUser())) throw new Error('signed out');
    const meta = F.doc(db, FIRESTORE_COLLECTIONS.USERS, u.uid);
    const mine = syncDoc();
    // read the account's copy first (outside the transaction: big reads are cheaper to do once)
    const read = async get => {
      const m = await get(meta);
      const md = m.exists() ? m.data() : {};
      if (!md.chunks) {
        // the account has a revision but no data we can read: stop, rather than write this device over it
        if (md.rev) throw new Error('account data could not be read');
        return { md, doc: null };
      }
      const snaps = await Promise.all(Array.from({ length: md.chunks }, (_, i) => get(F.doc(db, FIRESTORE_COLLECTIONS.USERS, u.uid, 'chunks', String(i)))));
      const doc = await unpack(snaps.map(s => s.exists() ? s.get('b').toUint8Array() : new Uint8Array(0)), md.z);
      if (!doc) throw new Error('account data could not be read');
      return { md, doc };
    };
    const { md, doc } = await read(F.getDoc);
    // examples an older version put in the account go
    if (doc?.quests) doc.quests = dropSamples(doc.quests);
    const hadData = !!doc?.quests?.length;
    mine.quests = dropSamples(mine.quests);
    const merged = mergeDocs(doc || {}, mine);
    let nextRev = md.rev || 0;
    if (!doc || norm(doc) !== canon(merged)) {
      const { parts, z } = await pack(merged);
      // only write if nobody else wrote since we read; otherwise go round again
      const ok = await F.runTransaction(db, async tx => {
        const cur = await tx.get(meta);
        if ((cur.exists() ? cur.get('rev') || 0 : 0) !== (md.rev || 0)) return false;
        parts.forEach((p, i) => tx.set(F.doc(db, FIRESTORE_COLLECTIONS.USERS, u.uid, 'chunks', String(i)), { b: F.Bytes.fromUint8Array(p) }));
        for (let i = parts.length; i < (md.chunks || 0); i++) tx.delete(F.doc(db, FIRESTORE_COLLECTIONS.USERS, u.uid, 'chunks', String(i)));
        tx.set(meta, { rev: (md.rev || 0) + 1, chunks: parts.length, z, tz: TZ, updatedAt: Date.now(), app: 'taskflow' }, { merge: true });
        return true;
      });
      if (!ok) { again = true; return result; }
      nextRev = (md.rev || 0) + 1;
    }
    rev = nextRev;
    const now = canon(syncDoc());
    const theirs = canon(Object.fromEntries(Object.keys(mine).map(k => [k, merged[k]])));
    if (theirs !== now) adoptSynced(merged);
    // the account's quests are real: onboarding must not swap them for starter quests
    if (hadData && getState().seeded) commit(s => { s.seeded = false; }, { fromSync: true, quiet: true });
    dirty = false;
    info = { lastSync: Date.now(), error: null };
    // known: the account has been saved to before (even if it has no quests now), so it is a returning account
    result = { ok: true, hadData, known: !!md.rev };
    dlog('sync', 'synced with account', { quests: merged.quests.length, hadData, rev: nextRev, localChanged: theirs !== now });
    queueShare();
  } catch (e) {
    console.warn('Levern: account sync failed', e);
    dlog('sync', 'account sync failed', { code: e?.code || null, message: String(e?.message || e), online: navigator.onLine });
    info = { ...info, error: !navigator.onLine ? 'Offline. Changes will be saved when you\'re back online.'
      : e.code === 'permission-denied' ? 'Your account storage isn\'t set up yet (database rules).'
      : "Couldn't save to your account right now. Levern will try again. If you use an ad blocker, allow Levern in it." };
  } finally {
    busy = false; becomeReady(); emit();
    if (again) { again = false; schedule(300); }
  }
  return result;
}

// Sign out: make sure everything reached the account, then clear this device so the next person
// starts from the beginning. force: sign out even if the last changes couldn't be saved.
export async function signOutAndReset({ force = false } = {}) {
  if (account.user() && dirty) {
    const r = await syncNow();
    if (!r.ok && !force) return { ok: false, unsaved: true };
  }
  unlisten?.(); unlisten = null;
  await account.signOut();
  try { localStorage.removeItem('taskflow-events'); } catch (e) {}
  if (typeof indexedDB !== 'undefined') kv.del('taskflow-events').catch(() => {});
  resetAll({ fromSync: true });   // this device only: the empty copy must never look newer than the account
  rev = -1; dirty = false; lastShare = ''; sharedEvents = [];
  info = { lastSync: null, error: null }; emit();
  return { ok: true };
}
// Delete account: everything Levern keeps for this person on the backend, then this device.
//  1. their feedback, if they gave any: anonymous (a reason and a note, no name, email or account id), and only
//     readable in the Firebase console (taskflowFeedback);
//  2. their data (taskflowUsers/{uid}, its chunks and the copy shared with Solodesk), their public profile and their leaderboard entry
//     (hidden instead, if the rules don't allow deleting it yet);
//  3. their Google sign-in, unless a Solodesk workspace shares it (deleting it would cut them off from Solodesk:
//     a new sign-in gets a new account id). Then this device starts fresh.
// Returns { signInKept } (true when the sign-in was kept for Solodesk).
export async function deleteAccount(feedback = {}) {
  const u = await account.firebaseUser();
  if (!u) throw new Error('Sign in first.');
  const { db, F } = await account.database();
  unlisten?.(); unlisten = null; clearTimeout(timer); clearTimeout(shareT); dirty = false;
  const reason = String(feedback.reason || '').slice(0, 60), note = String(feedback.note || '').trim().slice(0, 1000);
  if (reason || note) await F.addDoc(F.collection(db, FIRESTORE_COLLECTIONS.FEEDBACK), { kind: 'account-deleted', reason, note, app: 'taskflow', at: F.serverTimestamp() }).catch(() => {});
  const [chunks, shares] = await Promise.all([F.getDocs(F.collection(db, FIRESTORE_COLLECTIONS.USERS, u.uid, 'chunks')), F.getDocs(F.collection(db, FIRESTORE_COLLECTIONS.USERS, u.uid, 'share'))]);
  const batch = F.writeBatch(db);
  chunks.forEach(d => batch.delete(d.ref));
  shares.forEach(d => batch.delete(d.ref));
  batch.delete(F.doc(db, FIRESTORE_COLLECTIONS.USERS, u.uid));
  await batch.commit();
  await F.deleteDoc(F.doc(db, FIRESTORE_COLLECTIONS.PROFILES, u.uid)).catch(() => {});   // the public profile, if there is one
  const entry = F.doc(db, FIRESTORE_COLLECTIONS.BOARD, u.uid);
  try { await F.deleteDoc(entry); }
  catch (e) { try { await (await import('./board.js')).unpublish(); } catch (e2) {} }   // rules not updated yet: hide it
  let solodesk = false;
  try { solodesk = (await F.getDoc(F.doc(db, 'solodeskWorkspaces', u.uid))).exists(); } catch (e) {}
  if (solodesk) await account.signOut();
  else { try { await account.deleteSignIn(); } catch (e) { await account.signOut(); } }
  try { localStorage.removeItem('taskflow-events'); } catch (e) {}
  if (typeof indexedDB !== 'undefined') kv.del('taskflow-events').catch(() => {});
  resetAll({ fromSync: true });
  rev = -1; dirty = false; lastShare = ''; sharedEvents = [];
  info = { lastSync: null, error: null }; emit();
  return { signInKept: solodesk };
}
const schedule = (ms = 1200) => { clearTimeout(timer); timer = setTimeout(syncNow, ms); };

// changes made on another device: Firestore tells us when the rev moves
async function listen() {
  unlisten?.(); unlisten = null;
  const u = account.user(); if (!u) return;
  try {
    const { db, F } = await account.database();
    await account.firebaseUser();
    unlisten = F.onSnapshot(F.doc(db, FIRESTORE_COLLECTIONS.USERS, u.uid), s => {
      const r = s.exists() ? s.get('rev') || 0 : 0;
      // a change that arrives during a sync is picked up right after it, instead of being missed
      if (r !== rev) { if (busy) again = true; else schedule(100); }
    }, () => {});
  } catch (e) {}
}

/* ---------- what Solodesk reads ---------- */
export function setSharedEvents(items) { sharedEvents = items || []; queueShare(); }
function queueShare() { clearTimeout(shareT); shareT = setTimeout(writeShare, 1500); }
async function writeShare() {
  const u = account.user(); if (!u) return;
  const quests = getState().quests.filter(q => !q.done).map(q => ({
    id: q.id, title: q.title, tier: q.tier, due: q.due || null, time: q.time || null, repeat: q.repeat?.freq || null,
    notes: q.notes || '', subtasks: (q.subtasks || []).map(s => ({ title: s.title, done: !!s.done })), updatedAt: q.updatedAt || q.createdAt || null,
  }));
  const meta = getState().eventMeta || {};
  const body = { quests, events: sharedEvents.slice(0, 300).map(e => ({ ...e, tier: meta[e.id]?.tier ?? null })), tz: TZ };
  const key = JSON.stringify(body);
  if (key === lastShare) return;
  try {
    const { db, F } = await account.database();
    await F.setDoc(F.doc(db, FIRESTORE_COLLECTIONS.USERS, u.uid, 'share', 'open'), { ...body, updatedAt: Date.now() });
    lastShare = key;
  } catch (e) {}
}

export function startCloud() {
  if (started) return; started = true;
  onSave((s, opts) => { if (!opts.fromSync && account.user()) { dirty = true; schedule(); } });
  account.onAccount(u => {
    rev = -1; dirty = true; lastShare = '';
    if (u) { if (ready) { ready = false; emit(); } syncNow().then(listen); }
    else { unlisten?.(); unlisten = null; info = { lastSync: null, error: null }; ready = true; emit(); }
  });
  // offline or slow: never keep the screens waiting for more than a few seconds
  if (!ready && !isOffline()) setTimeout(becomeReady, 6000);
  else becomeReady();
  addEventListener('offline', () => {
    info = { ...info, error: "Offline. Changes will be saved when you're back online." };
    becomeReady();
    emit();
  });
  // coming back online or back to the app always checks the account too (the other phone may have changed
  // things while this one was asleep and its listener missed it), not only when this device has changes to send
  addEventListener('online', () => { if (account.user()) schedule(50); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && account.user()) schedule(50); });
  setInterval(() => { if (account.user() && (dirty || Date.now() - (info.lastSync || 0) > 120000)) syncNow(); }, 20000);
  if (account.user()) syncNow().then(listen);
}
