// Calendar connections, all from the browser (no TaskFlow server needed).
//  Google: dated quests sync into a calendar called "TaskFlow" that the app creates and owns
//    (scope calendar.app.created: TaskFlow can only see and change calendars it made), and the person's
//    own upcoming events are read (calendar.events.readonly, primary calendar) to show on the Calendar
//    screen and to share with Solodesk. Signed in, Google access comes through the person's Google
//    sign-in (Firebase); otherwise through Google Identity Services with the client ID in config.js.
//    Access lasts about an hour and lives in memory only; after that, "Sync now" asks again.
//  Apple (and Outlook, anything that subscribes to a URL): the local server (server.mjs) serves a live
//    .ics feed at /calendar.ics. A hosted live link needs a server (the Firebase Blaze plan, functions/).
import { getState, subscribe, commit } from './store.js';
import { planSync, applyOps } from './gcalmap.js';
import { buildICS } from './ics.js';
import { GOOGLE_CLIENT_ID } from '../config.js';
import * as account from './account.js';
import * as cloud from './cloud.js';

const SCOPE = 'https://www.googleapis.com/auth/calendar.app.created';
const READ_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly';
const API = 'https://www.googleapis.com/calendar/v3';
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const EVENTS_KEY = 'taskflow-events';
let token = null, tokenExp = 0, tokenClient = null, syncing = false, timer = null, pullT = null;
let events = (() => { try { return JSON.parse(localStorage.getItem(EVENTS_KEY)) || []; } catch (e) { return []; } })();
const listeners = new Set();
const emit = () => listeners.forEach(f => f());
export const onCalendarChange = fn => listeners.add(fn);

/* ---------- Google ---------- */
const viaAccount = () => !!account.user();
export const googleConfigured = () => viaAccount() || !!GOOGLE_CLIENT_ID;
export const googleState = () => getState().gcal || { connected: false, map: {} };
export const hasToken = () => !!token && Date.now() < tokenExp - 60000;
export const isSyncing = () => syncing;
// the person's own Google events (cached on the device), for the Calendar screen
export const externalEvents = () => googleState().connected ? events : [];

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
  if (viaAccount()) { const t = await account.googleAccess([SCOPE, READ_SCOPE]); token = t.token; tokenExp = t.exp; return token; }
  await loadGIS();
  return new Promise((res, rej) => {
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID, scope: `${SCOPE} ${READ_SCOPE}`,
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
  if (!r.ok) { const e = new Error(friendlyGoogle(r.status, data?.error)); e.status = r.status; e.reason = data?.error?.errors?.[0]?.reason || data?.error?.status; throw e; }
  return data;
}
// Google's 403s in words a person can act on
function friendlyGoogle(status, err = {}) {
  const msg = String(err.message || ''), reason = err.errors?.[0]?.reason || '';
  if (/has not been used|is disabled|accessNotConfigured/i.test(msg + reason)) return 'Google Calendar isn\'t switched on for TaskFlow yet. The Google Calendar API needs enabling in Google Cloud (project taskflow-dailytracker).';
  if (/insufficient/i.test(msg + reason) || err.status === 'PERMISSION_DENIED' && /scope/i.test(msg)) return 'TaskFlow didn\'t get calendar access. Tap Connect again and tick the calendar boxes when Google asks.';
  if (status === 401) return 'Google Calendar access ran out. Tap Sync now to continue.';
  if (status === 429 || /rate|quota/i.test(reason)) return 'Google Calendar is busy. TaskFlow will try again in a moment.';
  return msg || `Google Calendar error ${status}`;
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

// the person's own upcoming events (primary calendar, a week back to two months ahead)
async function pullEvents() {
  const now = Date.now();
  const p = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
    timeMin: new Date(now - 7 * 86400000).toISOString(), timeMax: new Date(now + 62 * 86400000).toISOString() });
  let data;
  const note = patch => commit(s => { s.gcal = { ...googleState(), ...patch }; }, { quiet: true });
  try { data = await api('GET', `/calendars/primary/events?${p}`); }
  catch (e) {
    // reading wasn't allowed (the "see events" box was left unticked): quests still sync
    note({ eventsError: e.status === 403 ? 'denied' : 'failed', eventsAt: Date.now() });
    if (e.status === 403) return;
    throw e;
  }
  note({ eventsError: null, eventsAt: Date.now(), eventsCount: (data?.items || []).length });
  events = (data?.items || []).filter(e => e.status !== 'cancelled').map(e => {
    const allDay = !!e.start?.date;
    return { id: e.id, title: e.summary || '(No title)', allDay, start: allDay ? e.start.date : e.start?.dateTime, end: allDay ? e.end?.date : e.end?.dateTime, where: e.location || '', url: e.htmlLink || '' };
  });
  try { localStorage.setItem(EVENTS_KEY, JSON.stringify(events)); } catch (e) {}
  cloud.setSharedEvents(events);
}

export async function connectGoogle() {
  if (!googleConfigured()) throw new Error('Sign in with Google first (Settings → You), then connect your calendar.');
  await getToken('consent');
  commit(s => { s.gcal = { ...googleState(), connected: true }; }, { quiet: true });
  // the first sync proves it works; if it doesn't, don't leave it looking connected
  try { await syncGoogle(); }
  catch (e) { commit(s => { s.gcal = { ...googleState(), connected: false }; }, { quiet: true }); emit(); throw e; }
}
export function disconnectGoogle() {
  if (token && !viaAccount() && window.google) try { google.accounts.oauth2.revoke(token, () => {}); } catch (e) {}
  token = null; tokenExp = 0; events = [];
  try { localStorage.removeItem(EVENTS_KEY); } catch (e) {}
  cloud.setSharedEvents([]);
  // the TaskFlow calendar is left in place in Google; reconnecting re-uses it
  commit(s => { s.gcal = { connected: false, calendarId: googleState().calendarId, map: {} }; }, { quiet: true });
  emit();
}

// interactive: true when called from a tap (may show Google's popup to refresh access)
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
    await pullEvents().catch(() => {});
    return res.counts;
  } finally { syncing = false; emit(); }
}

/* ---------- live .ics feed (Apple Calendar and other subscriptions), local server only ---------- */
export const feedPath = 'calendar.ics';
export const feedUrl = () => new URL(feedPath, location.href.split('#')[0]).href;
export const webcalUrl = () => feedUrl().replace(/^https?:/, 'webcal:');
const hosted = () => !/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
let feedOk = hosted() ? false : null, lastFeed = '';
export const feedAvailable = () => feedOk;
async function pushFeed() {
  if (hosted()) return;   // the feed lives on the local server (npm start)
  const ics = buildICS(getState().quests);
  const body = ics.replace(/^DTSTAMP:.*$/gm, '');   // ignore the timestamp when deciding if anything changed
  if (body === lastFeed && feedOk) return;
  try {
    const r = await fetch(feedPath, { method: 'PUT', headers: { 'Content-Type': 'text/calendar' }, body: ics });
    feedOk = r.ok; if (r.ok) lastFeed = body;
  } catch (e) { feedOk = false; }
  emit();
}

/* ---------- keep everything in step with the quests ---------- */
export function startCalendars() {
  cloud.startCloud();
  cloud.onCloud(() => emit());
  account.onAccount(() => emit());
  if (googleState().connected) cloud.setSharedEvents(events);
  pushFeed();
  subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pushFeed();
      if (googleState().connected && hasToken()) syncGoogle({ interactive: false }).catch(() => emit());
    }, 2500);
  });
  // refresh the person's events every 15 minutes while access lasts
  clearInterval(pullT);
  pullT = setInterval(() => { if (googleState().connected && hasToken() && !document.hidden) pullEvents().then(emit, () => {}); }, 15 * 60000);
}
