// Calendar connections.
//  Google: Google Identity Services (OAuth token client) + Calendar API, straight from the browser.
//    Dated quests sync into a calendar called "TaskFlow" that the app creates and owns
//    (scope calendar.app.created: TaskFlow can only see and change calendars it made).
//    The access token lives in memory only (about an hour); after that, "Sync now" asks again.
//  Apple (and Outlook, Google, anything that subscribes to a URL): the app keeps a live .ics feed
//    on the local server (server.mjs) at /calendar.ics, so a webcal:// subscription stays in sync.
// Signed in, with the TaskFlow server online, both run on the server instead (cloud.js, functions/):
//   Google keeps syncing with the app closed, the person's own events come back into TaskFlow, and the
//   Apple feed is a private link on the web that their iPhone and Mac can reach.
import { getState, subscribe, commit } from './store.js';
import { planSync, applyOps } from './gcalmap.js';
import { buildICS } from './ics.js';
import { GOOGLE_CLIENT_ID } from '../config.js';
import * as cloud from './cloud.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/calendar/v3';
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
let token = null, tokenExp = 0, tokenClient = null, syncing = false, timer = null;
const listeners = new Set();
const emit = () => listeners.forEach(f => f());
export const onCalendarChange = fn => listeners.add(fn);
cloud.onCloud(() => emit());

/* ---------- Google ---------- */
export const serverMode = () => cloud.cloudOn();
export const googleConfigured = () => serverMode() || !!GOOGLE_CLIENT_ID;
const localGoogle = () => getState().gcal || { connected: false, map: {} };
export const googleState = () => {
  if (!serverMode()) return localGoogle();
  const g = cloud.cloudInfo().gcal || {};
  return { connected: !!g.connected, server: true, lastSync: g.lastSync, lastCounts: g.lastCounts, error: g.error };
};
export const hasToken = () => serverMode() || (!!token && Date.now() < tokenExp - 60000);
export const isSyncing = () => syncing;
export const externalEvents = () => serverMode() ? cloud.externalEvents() : [];

function loadGIS() {
  if (window.google && google.accounts && google.accounts.oauth2) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
    s.onload = () => res(); s.onerror = () => rej(new Error("Couldn't reach Google. Check your connection."));
    document.head.appendChild(s);
  });
}
// must be called from a tap (browsers block the Google popup otherwise)
async function getToken(prompt) {
  await loadGIS();
  return new Promise((res, rej) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: SCOPE,
      callback: r => {
        if (r.error) return rej(new Error(r.error_description || r.error));
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)) return rej(new Error('Calendar access was not granted.'));
        token = r.access_token; tokenExp = Date.now() + (r.expires_in || 3600) * 1000; res(token);
      },
      error_callback: e => rej(new Error(e.type === 'popup_closed' ? 'Sign-in was closed.' : e.message || 'Sign-in failed.')),
    });
    tokenClient.requestAccessToken({ prompt });
  });
}
async function api(method, path, body) {
  const r = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (r.status === 204) return null;
  const data = await r.json().catch(() => null);
  if (!r.ok) { const e = new Error(data?.error?.message || `Google Calendar error ${r.status}`); e.status = r.status; throw e; }
  return data;
}
async function ensureCalendar() {
  const g = localGoogle();
  if (g.calendarId) {
    try { await api('GET', `/calendars/${encodeURIComponent(g.calendarId)}`); return g.calendarId; }
    catch (e) { if (e.status !== 404) throw e; }   // deleted in Google Calendar: make a new one
  }
  const cal = await api('POST', '/calendars', { summary: 'TaskFlow', description: 'Quests from TaskFlow. Edit them in TaskFlow; changes here are overwritten.', timeZone: TZ });
  commit(s => { s.gcal = { ...localGoogle(), calendarId: cal.id, map: {} }; }, { quiet: true });
  return cal.id;
}

export async function connectGoogle() {
  if (serverMode()) {
    syncing = true; emit();
    try { const ok = await cloud.connectGoogleServer(); if (ok === false) throw new Error('Google Calendar was not connected.'); return ok; }
    finally { syncing = false; emit(); }
  }
  if (!GOOGLE_CLIENT_ID) throw new Error('Sign in with Google first (Settings → You), then connect your calendar.');
  await getToken('consent');
  commit(s => { s.gcal = { ...localGoogle(), connected: true }; }, { quiet: true });
  await syncGoogle();
}
export async function disconnectGoogle() {
  if (serverMode()) { await cloud.disconnectGoogleServer(); emit(); return; }
  if (token && window.google) try { google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
  token = null; tokenExp = 0;
  // the TaskFlow calendar is left in place in Google; reconnecting re-uses it
  commit(s => { s.gcal = { connected: false, calendarId: localGoogle().calendarId, map: {} }; }, { quiet: true });
  emit();
}

// interactive: true when called from a tap (may show Google's popup to refresh the token)
export async function syncGoogle({ interactive = true } = {}) {
  if (serverMode()) {
    if (syncing) return null;
    syncing = true; emit();
    try { return await cloud.syncGoogleServer(); } finally { syncing = false; emit(); }
  }
  const g = localGoogle();
  if (!g.connected || syncing) return null;
  if (!hasToken()) { if (!interactive) { emit(); return null; } await getToken(''); }
  syncing = true; emit();
  try {
    const calId = await ensureCalendar();
    const ops = planSync(getState().quests, localGoogle().map || {}, TZ);
    let res;
    try { res = await applyOps(ops, localGoogle().map || {}, calId, api); }
    catch (e) {
      if (e.status === 401) { token = null; commit(s => { s.gcal = { ...localGoogle(), map: e.mapping }; }, { quiet: true }); }
      throw e;
    }
    commit(s => { s.gcal = { ...localGoogle(), map: res.mapping, lastSync: Date.now(), lastCounts: res.counts }; }, { quiet: true });
    return res.counts;
  } finally { syncing = false; emit(); }
}

/* ---------- live .ics feed (Apple Calendar and other subscriptions) ---------- */
export const feedPath = 'calendar.ics';
const localFeedUrl = () => new URL(feedPath, location.href.split('#')[0]).href;
export const feedUrl = () => serverMode() && cloud.cloudInfo().feedUrl ? cloud.cloudInfo().feedUrl : localFeedUrl();
export const webcalUrl = () => feedUrl().replace(/^https?:/, 'webcal:');
let feedOk = null, lastFeed = '';
export const feedAvailable = () => serverMode() ? !!cloud.cloudInfo().feedUrl : feedOk;
export const newFeedLink = () => cloud.newFeedLink();
async function pushFeed() {
  if (cloud.cloudAvailable()) return;   // hosted: the server builds each person's feed itself
  const ics = buildICS(getState().quests);
  const body = ics.replace(/^DTSTAMP:.*$/gm, '');   // ignore the timestamp when deciding if anything changed
  if (body === lastFeed && feedOk) return;
  try {
    const r = await fetch(feedPath, { method: 'PUT', headers: { 'Content-Type': 'text/calendar' }, body: ics });
    feedOk = r.ok; if (r.ok) lastFeed = body;
  } catch (e) { feedOk = false; }
  emit();
}

/* ---------- keep both in step with the quests ---------- */
export function startCalendars() {
  cloud.startCloud().finally(pushFeed);
  subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pushFeed();
      // with the server, cloud.js sends the change and the server updates Google itself
      if (!serverMode() && localGoogle().connected && hasToken()) syncGoogle({ interactive: false }).catch(() => emit());
    }, 2500);
  });
}
