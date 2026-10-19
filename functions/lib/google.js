// Google Calendar from the server: OAuth with a refresh token (so it keeps working while the app is
// closed), pushing quests into the "TaskFlow" calendar the app creates, and reading the person's own
// upcoming events so TaskFlow can show them.
//   calendar.app.created     create the TaskFlow calendar and manage events in it only
//   calendar.events.readonly read events (we only read the primary calendar)
import { planSync, applyOps } from '../shared/gcalmap.js';

export const SCOPES = ['https://www.googleapis.com/auth/calendar.app.created', 'https://www.googleapis.com/auth/calendar.events.readonly', 'openid', 'email'];
const API = 'https://www.googleapis.com/calendar/v3';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';

export function authUrl({ clientId, redirectUri, state, loginHint }) {
  const p = new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPES.join(' '),
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state,
  });
  if (loginHint) p.set('login_hint', loginHint);
  return 'https://accounts.google.com/o/oauth2/v2/auth?' + p;
}

async function tokenCall(params, fetchImpl = fetch) {
  const r = await fetchImpl(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(data.error_description || data.error || `token ${r.status}`); e.code = data.error; e.status = r.status; throw e; }
  return data;
}
export const exchangeCode = ({ code, clientId, clientSecret, redirectUri }, f) =>
  tokenCall({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }, f);
export const refreshAccess = ({ refreshToken, clientId, clientSecret }, f) =>
  tokenCall({ refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' }, f);
export async function revoke(token, fetchImpl = fetch) {
  try { await fetchImpl('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(token), { method: 'POST' }); } catch (e) {}
}

// fetch wrapper in the shape gcalmap.applyOps expects: throws { status } on HTTP errors
export function calendarApi(accessToken, fetchImpl = fetch) {
  return async (method, path, body) => {
    const r = await fetchImpl(API + path, { method, headers: { Authorization: 'Bearer ' + accessToken, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    if (r.status === 204) return null;
    const data = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error(data?.error?.message || `Google Calendar error ${r.status}`); e.status = r.status; throw e; }
    return data;
  };
}

// make sure the TaskFlow calendar exists; returns its id (and an empty mapping if it was re-created)
export async function ensureCalendar(api, g, tz) {
  if (g.calendarId) {
    try { await api('GET', `/calendars/${encodeURIComponent(g.calendarId)}`); return { calendarId: g.calendarId, map: g.map || {} }; }
    catch (e) { if (e.status !== 404 && e.status !== 410) throw e; }
  }
  const cal = await api('POST', '/calendars', { summary: 'TaskFlow', description: 'Quests from TaskFlow. Edit them in TaskFlow; changes here are overwritten.', timeZone: tz || 'UTC' });
  return { calendarId: cal.id, map: {} };
}

export async function pushQuests(api, g, quests, tz) {
  const { calendarId, map } = await ensureCalendar(api, g, tz);
  const ops = planSync(quests, map, tz || 'UTC');
  const res = await applyOps(ops, map, calendarId, api);
  return { calendarId, map: res.mapping, counts: res.counts };
}

// the person's own upcoming events (primary calendar, a week back to two months ahead), kept small
export async function pullEvents(api, now = Date.now()) {
  const p = new URLSearchParams({ singleEvents: 'true', orderBy: 'startTime', maxResults: '250',
    timeMin: new Date(now - 7 * 86400000).toISOString(), timeMax: new Date(now + 62 * 86400000).toISOString() });
  const data = await api('GET', `/calendars/primary/events?${p}`);
  return (data?.items || []).filter(e => e.status !== 'cancelled').map(toEvent);
}
export function toEvent(e) {
  const allDay = !!e.start?.date;
  return {
    id: e.id,
    title: e.summary || '(No title)',
    allDay,
    start: allDay ? e.start.date : e.start?.dateTime,
    end: allDay ? e.end?.date : e.end?.dateTime,
    where: e.location || '',
    url: e.htmlLink || '',
  };
}
