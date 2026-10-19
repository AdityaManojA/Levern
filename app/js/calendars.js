// Calendar connections.
//  Google: Google Identity Services (OAuth token client) + Calendar API, straight from the browser.
//    Dated quests sync into a calendar called "TaskFlow" that the app creates and owns
//    (scope calendar.app.created: TaskFlow can only see and change calendars it made).
//    The access token lives in memory only (about an hour); after that, "Sync now" asks again.
//  Apple (and Outlook, Google, anything that subscribes to a URL): the app keeps a live .ics feed
//    on the local server (server.mjs) at /calendar.ics, so a webcal:// subscription stays in sync.
import { getState, subscribe, commit } from './store.js';
import { planSync, applyOps } from './gcalmap.js';
import { buildICS } from './ics.js';
import { GOOGLE_CLIENT_ID } from '../config.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const API = 'https://www.googleapis.com/calendar/v3';
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
let token = null, tokenExp = 0, tokenClient = null, syncing = false, timer = null;
const listeners = new Set();
const emit = () => listeners.forEach(f => f());
export const onCalendarChange = fn => listeners.add(fn);

/* ---------- Google ---------- */
export const googleConfigured = () => !!GOOGLE_CLIENT_ID;
export const googleState = () => getState().gcal || { connected: false, map: {} };
export const hasToken = () => !!token && Date.now() < tokenExp - 60000;
export const isSyncing = () => syncing;

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
  const g = googleState();
  if (g.calendarId) {
    try { await api('GET', `/calendars/${encodeURIComponent(g.calendarId)}`); return g.calendarId; }
    catch (e) { if (e.status !== 404) throw e; }   // deleted in Google Calendar: make a new one
  }
  const cal = await api('POST', '/calendars', { summary: 'TaskFlow', description: 'Quests from TaskFlow. Edit them in TaskFlow; changes here are overwritten.', timeZone: TZ });
  commit(s => { s.gcal = { ...googleState(), calendarId: cal.id, map: {} }; }, { quiet: true });
  return cal.id;
}

export async function connectGoogle() {
  if (!googleConfigured()) throw new Error('Google Calendar is not set up yet (no client ID).');
  await getToken('consent');
  commit(s => { s.gcal = { ...googleState(), connected: true }; }, { quiet: true });
  await syncGoogle();
}
export function disconnectGoogle() {
  if (token && window.google) try { google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
  token = null; tokenExp = 0;
  // the TaskFlow calendar is left in place in Google; reconnecting re-uses it
  commit(s => { s.gcal = { connected: false, calendarId: googleState().calendarId, map: {} }; }, { quiet: true });
  emit();
}

// interactive: true when called from a tap (may show Google's popup to refresh the token)
export async function syncGoogle({ interactive = true } = {}) {
  const g = googleState();
  if (!g.connected || syncing) return null;
  if (!hasToken()) { if (!interactive) { emit(); return null; } await getToken(''); }
  syncing = true; emit();
  try {
    const calId = await ensureCalendar();
    const ops = planSync(getState().quests, googleState().map || {}, TZ);
    let res;
    try { res = await applyOps(ops, googleState().map || {}, calId, api); }
    catch (e) {
      if (e.status === 401) { token = null; commit(s => { s.gcal = { ...googleState(), map: e.mapping }; }, { quiet: true }); }
      throw e;
    }
    commit(s => { s.gcal = { ...googleState(), map: res.mapping, lastSync: Date.now(), lastCounts: res.counts }; }, { quiet: true });
    return res.counts;
  } finally { syncing = false; emit(); }
}

/* ---------- live .ics feed (Apple Calendar and other subscriptions) ---------- */
export const feedPath = 'calendar.ics';
export const feedUrl = () => new URL(feedPath, location.href.split('#')[0]).href;
export const webcalUrl = () => feedUrl().replace(/^https?:/, 'webcal:');
let feedOk = null, lastFeed = '';
export const feedAvailable = () => feedOk;
async function pushFeed() {
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
  pushFeed();
  subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pushFeed();
      if (googleState().connected && hasToken()) syncGoogle({ interactive: false }).catch(() => emit());
    }, 2500);
  });
}
