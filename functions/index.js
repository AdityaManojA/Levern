// TaskFlow server on Firebase (Cloud Functions + Firestore, asia-south2 next to the database). Firebase Hosting sends /api/** and /feed/**
// here (see firebase.json), so the app calls it on its own address.
//
//   /api/...           the app, signed in with Google (Firebase ID token): sync, calendar feed link,
//                      Google Calendar connect / sync / disconnect, the person's own Google events
//   /feed/<token>.ics  a private calendar feed for Apple Calendar (or any app that subscribes to a URL)
//   gcalOnChange       pushes quests to Google Calendar whenever someone's data changes
//   gcalEvery30Min     keeps Google in step and refreshes everyone's events while their app is closed
//
// Firestore (only this server can read it; firestore.rules denies the app):
//   users/{uid}                  rev, chunk count, time zone, feed token, Google Calendar status
//   users/{uid}/chunks/{i}       the person's TaskFlow data, deflated (lib/blob.js)
//   users/{uid}/private/google   Google refresh token, TaskFlow calendar id, quest → event mapping
//   users/{uid}/private/events   their upcoming Google events, as shown in the app
//   feeds/{token}                feed token → uid
//   oauthStates/{state}          short-lived, links Google's redirect back to the person who started it
import { onRequest } from 'firebase-functions/v2/https';
import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret, defineString } from 'firebase-functions/params';
import { setGlobalOptions, logger } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { randomBytes } from 'node:crypto';
import { pack, unpack } from './lib/blob.js';
import { mergeDocs } from './shared/syncmerge.js';
import { buildICS } from './shared/ics.js';
import * as G from './lib/google.js';

setGlobalOptions({ region: 'asia-south2', maxInstances: 10, memory: '256MiB' });
initializeApp();
const db = getFirestore();
const CLIENT_ID = defineString('GOOGLE_CLIENT_ID', { description: 'OAuth web client ID (ends in .apps.googleusercontent.com)' });
const PUBLIC_URL = defineString('PUBLIC_URL', { default: 'https://getlevern.web.app' });
const CLIENT_SECRET = defineSecret('GOOGLE_CLIENT_SECRET');
// sites that share this server and sign-in (TaskFlow and Solodesk); Google sends people back to the one they came from
const ORIGINS = defineString('ALLOWED_ORIGINS', { default: 'https://getlevern.web.app,https://taskflow-dailytracker.web.app,https://taskflow-solodesk.web.app' });
function originOf(req) {
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  const o = host ? `https://${host}` : '';
  return ORIGINS.value().split(',').map(s => s.trim()).includes(o) ? o : PUBLIC_URL.value();
}
const SYNC_KEYS = ['quests', 'tombstones', 'history', 'historyUpdatedAt', 'sessions', 'sessionsUpdatedAt', 'settings', 'settingsUpdatedAt', 'settingsStamps', 'eventMeta'];

const userRef = uid => db.collection('users').doc(uid);
const token = () => randomBytes(24).toString('base64url');
const feedUrl = t => t ? `${PUBLIC_URL.value()}/feed/${t}.ics` : null;
const pick = d => Object.fromEntries(SYNC_KEYS.map(k => [k, d?.[k]]).filter(([, v]) => v !== undefined));

async function loadDoc(uid, tx) {
  const get = r => tx ? tx.get(r) : r.get();
  const meta = await get(userRef(uid));
  const m = meta.exists ? meta.data() : {};
  if (!m.chunks) return { meta: m, doc: null };
  const snaps = await Promise.all(Array.from({ length: m.chunks }, (_, i) => get(userRef(uid).collection('chunks').doc(String(i)))));
  return { meta: m, doc: unpack(snaps.map(s => s.get('b') || Buffer.alloc(0))) };
}
function writeDoc(tx, uid, meta, doc, extra = {}) {
  const chunks = pack(doc);
  chunks.forEach((b, i) => tx.set(userRef(uid).collection('chunks').doc(String(i)), { b }));
  for (let i = chunks.length; i < (meta.chunks || 0); i++) tx.delete(userRef(uid).collection('chunks').doc(String(i)));
  tx.set(userRef(uid), { ...extra, rev: (meta.rev || 0) + 1, chunks: chunks.length, updatedAt: Date.now() }, { merge: true });
  return (meta.rev || 0) + 1;
}

// a feed token for the person, made on first use
async function ensureFeed(uid, meta) {
  if (meta.feed) return meta.feed;
  const t = token();
  await db.batch().set(db.collection('feeds').doc(t), { uid }).set(userRef(uid), { feed: t }, { merge: true }).commit();
  return t;
}
const status = (meta, feed) => ({ rev: meta.rev || 0, eventsRev: meta.eventsRev || 0, gcal: meta.gcal || { connected: false }, feedUrl: feedUrl(feed || meta.feed) });
async function events(uid) { const s = await userRef(uid).collection('private').doc('events').get(); return s.exists ? s.data() : { items: [], at: 0 }; }

/* ---------- Google Calendar work for one person ---------- */
async function syncGoogleFor(uid, { pull = true } = {}) {
  const gRef = userRef(uid).collection('private').doc('google');
  const gs = await gRef.get();
  if (!gs.exists || !gs.get('refreshToken')) return null;
  const g = gs.data();
  try {
    const { access_token } = await G.refreshAccess({ refreshToken: g.refreshToken, clientId: CLIENT_ID.value(), clientSecret: CLIENT_SECRET.value() });
    const api = G.calendarApi(access_token);
    const { meta, doc } = await loadDoc(uid);
    const pushed = await G.pushQuests(api, g, doc?.quests || [], meta.tz);
    await gRef.set({ calendarId: pushed.calendarId, map: pushed.map }, { merge: true });
    const upd = { 'gcal.connected': true, 'gcal.lastSync': Date.now(), 'gcal.lastCounts': pushed.counts, 'gcal.error': FieldValue.delete() };
    if (pull) {
      const items = await G.pullEvents(api);
      const old = await events(uid);
      if (JSON.stringify(old.items) !== JSON.stringify(items)) { await gRef.parent.doc('events').set({ items, at: Date.now() }); upd.eventsRev = FieldValue.increment(1); }
    }
    await userRef(uid).update(upd);
    return pushed.counts;
  } catch (e) {
    logger.warn('google sync failed', { uid, message: e.message, code: e.code, status: e.status });
    // the person removed TaskFlow's access in their Google account: stop trying until they reconnect
    if (e.code === 'invalid_grant') { await gRef.delete(); await userRef(uid).update({ gcal: { connected: false, error: 'Google access was removed. Connect again to keep syncing.' } }); }
    else await userRef(uid).update({ 'gcal.error': "Couldn't reach Google Calendar. TaskFlow will try again." });
    return null;
  }
}

/* ---------- small HTTP helpers ---------- */
const send = (res, code, body) => res.status(code).set('Cache-Control', 'private, no-store').json(body);
async function authed(req) {
  const m = /^Bearer (.+)$/.exec(req.get('Authorization') || '');
  if (!m) return null;
  try { return await getAuth().verifyIdToken(m[1]); } catch (e) { return null; }
}
const page = (title, text, ok) => `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#FFF8EE;color:#1E1B18;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px;box-sizing:border-box}
div{max-width:380px;border:2.5px solid #1E1B18;border-radius:20px;background:#fff;padding:20px;text-align:center}a{color:inherit;font-weight:700}</style>
<div><h1 style="font-size:20px;margin:0 0 8px">${title}</h1><p>${text}</p><p><a href="/#/settings">Back to TaskFlow</a></p></div>
<script>try{window.opener&&window.opener.postMessage({taskflow:'gcal',ok:${ok ? 'true' : 'false'}},location.origin);if(window.opener)setTimeout(()=>window.close(),${ok ? 900 : 4000});else setTimeout(()=>location.replace('/#/settings'),${ok ? 1200 : 6000})}catch(e){}</script>`;

/* ---------- /api ---------- */
export const api = onRequest({ secrets: [CLIENT_SECRET], cors: false }, async (req, res) => {
  const path = req.path.replace(/^\/api/, '') || '/';
  try {
    if (path === '/ping') return send(res, 200, { ok: true, service: 'taskflow-cloud' });

    // Google sends the person back here after they allow access
    if (path === '/gcal/callback' && req.method === 'GET') {
      const { code, state, error } = req.query;
      const sRef = state && db.collection('oauthStates').doc(String(state));
      const s = sRef && await sRef.get();
      if (sRef) await sRef.delete().catch(() => {});
      if (error || !code || !s?.exists || s.get('exp') < Date.now()) {
        return res.status(400).type('html').send(page('Not connected', error === 'access_denied' ? 'Google Calendar access was not allowed.' : 'That sign-in link expired. Go back to TaskFlow and tap Connect again.', false));
      }
      const uid = s.get('uid');
      const t = await G.exchangeCode({ code: String(code), clientId: CLIENT_ID.value(), clientSecret: CLIENT_SECRET.value(), redirectUri: `${s.get('origin') || PUBLIC_URL.value()}/api/gcal/callback` });
      const granted = String(t.scope || '').split(' ');
      if (!granted.includes(G.SCOPES[0])) return res.status(400).type('html').send(page('Not connected', 'TaskFlow needs permission to manage its own calendar. Tap Connect again and leave that box ticked.', false));
      const gRef = userRef(uid).collection('private').doc('google');
      const prev = (await gRef.get()).data() || {};
      await gRef.set({ refreshToken: t.refresh_token || prev.refreshToken, calendarId: prev.calendarId || null, map: prev.map || {}, scope: t.scope, readsEvents: granted.includes(G.SCOPES[1]) }, { merge: true });
      await userRef(uid).set({ gcal: { connected: true, since: Date.now() } }, { merge: true });
      await syncGoogleFor(uid);
      return res.status(200).type('html').send(page('Google Calendar connected', 'Your dated quests are going into a calendar called TaskFlow, and your own events will show in TaskFlow.', true));
    }

    const user = await authed(req);
    if (!user) return send(res, 401, { error: 'Sign in first.' });
    const uid = user.uid;

    if (path === '/rev' && req.method === 'GET') {
      const meta = (await userRef(uid).get()).data() || {};
      return send(res, 200, status(meta));
    }

    if (path === '/sync' && req.method === 'POST') {
      const mine = pick(req.body?.doc || {});
      const tz = typeof req.body?.tz === 'string' ? req.body.tz.slice(0, 64) : null;
      const out = await db.runTransaction(async tx => {
        const { meta, doc } = await loadDoc(uid, tx);
        const merged = mergeDocs(doc || {}, mine);
        let rev = meta.rev || 0;
        if (!doc || JSON.stringify(merged) !== JSON.stringify(mergeDocs(doc, {}))) rev = writeDoc(tx, uid, meta, merged, tz ? { tz, email: user.email || null } : {});
        else if (tz && tz !== meta.tz) tx.set(userRef(uid), { tz }, { merge: true });
        return { merged, meta: { ...meta, rev } };
      });
      const feed = await ensureFeed(uid, out.meta);
      return send(res, 200, { doc: out.merged, ...status(out.meta, feed), events: req.body?.withEvents ? await events(uid) : undefined });
    }

    if (path === '/events' && req.method === 'GET') return send(res, 200, await events(uid));

    if (path === '/feed/rotate' && req.method === 'POST') {
      const meta = (await userRef(uid).get()).data() || {};
      const t = token(), b = db.batch();
      if (meta.feed) b.delete(db.collection('feeds').doc(meta.feed));
      await b.set(db.collection('feeds').doc(t), { uid }).set(userRef(uid), { feed: t }, { merge: true }).commit();
      return send(res, 200, { feedUrl: feedUrl(t) });
    }

    if (path === '/gcal/start' && req.method === 'POST') {
      if (!CLIENT_ID.value()) return send(res, 503, { error: 'Google Calendar is not set up on the server yet.' });
      const state = token(), origin = originOf(req);
      await db.collection('oauthStates').doc(state).set({ uid, origin, exp: Date.now() + 10 * 60000 });
      return send(res, 200, { url: G.authUrl({ clientId: CLIENT_ID.value(), redirectUri: `${origin}/api/gcal/callback`, state, loginHint: user.email }) });
    }

    // read-only view for other apps on the same account (Solodesk): open quests and calendar events
    if (path === '/quests' && req.method === 'GET') {
      const { meta, doc } = await loadDoc(uid);
      const quests = (doc?.quests || []).filter(q => req.query.all === '1' || !q.done);
      return send(res, 200, { quests, tz: meta.tz || null, rev: meta.rev || 0, events: (await events(uid)).items || [], gcal: meta.gcal || { connected: false } });
    }

    if (path === '/gcal/sync' && req.method === 'POST') {
      const counts = await syncGoogleFor(uid);
      const meta = (await userRef(uid).get()).data() || {};
      return send(res, 200, { counts, ...status(meta), events: await events(uid) });
    }

    if (path === '/gcal/disconnect' && req.method === 'POST') {
      const gRef = userRef(uid).collection('private').doc('google');
      const g = (await gRef.get()).data();
      if (g?.refreshToken) await G.revoke(g.refreshToken);
      // keep the calendar id, so reconnecting re-uses the same TaskFlow calendar
      await gRef.set({ refreshToken: FieldValue.delete(), map: {} }, { merge: true });
      await userRef(uid).collection('private').doc('events').delete().catch(() => {});
      await userRef(uid).set({ gcal: { connected: false }, eventsRev: FieldValue.increment(1) }, { merge: true });
      return send(res, 200, { ok: true });
    }

    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    logger.error('api error', { path, message: e.message, stack: e.stack });
    return send(res, 500, { error: 'Something went wrong on the TaskFlow server.' });
  }
});

/* ---------- /feed/<token>.ics ---------- */
export const feed = onRequest({ cors: false }, async (req, res) => {
  const m = /^\/feed\/([A-Za-z0-9_-]{20,64})\.ics$/.exec(req.path);
  if (!m) return res.status(404).send('Not found');
  const f = await db.collection('feeds').doc(m[1]).get();
  if (!f.exists) return res.status(404).send('This calendar link was replaced or removed. Get the new one in TaskFlow → Settings → Calendars.');
  const { doc } = await loadDoc(f.get('uid'));
  res.set('Cache-Control', 'private, max-age=300').type('text/calendar; charset=utf-8').send(buildICS(doc?.quests || []));
});

/* ---------- Google Calendar in the background ---------- */
export const gcalOnChange = onDocumentWritten({ document: 'users/{uid}', secrets: [CLIENT_SECRET] }, async event => {
  const before = event.data?.before?.data(), after = event.data?.after?.data();
  if (!after?.gcal?.connected || before?.rev === after.rev) return;   // only when the quests changed
  await syncGoogleFor(event.params.uid, { pull: false });
});

export const gcalEvery30Min = onSchedule({ schedule: 'every 30 minutes', secrets: [CLIENT_SECRET], timeoutSeconds: 540 }, async () => {
  const snap = await db.collection('users').where('gcal.connected', '==', true).limit(500).get();
  for (const d of snap.docs) await syncGoogleFor(d.id);
  // tidy sign-in links nobody finished
  const old = await db.collection('oauthStates').where('exp', '<', Date.now()).limit(200).get();
  await Promise.all(old.docs.map(d => d.ref.delete()));
});
