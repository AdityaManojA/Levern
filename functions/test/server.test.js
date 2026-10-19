import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pack, unpack, CHUNK } from '../lib/blob.js';
import * as G from '../lib/google.js';

test('pack and unpack round-trip, splitting big data into chunks', () => {
  const doc = { quests: [{ id: 'a', title: 'Read', sketches: [{ d: 'x'.repeat(10) }] }], settings: { name: 'Sam' } };
  assert.deepEqual(unpack(pack(doc)), doc);
  // random-looking data doesn't compress, so this needs several chunks
  const noise = Array.from({ length: 3 * CHUNK / 8 }, () => Math.random().toString(36).slice(2, 10)).join('');
  const parts = pack({ blob: noise });
  assert.ok(parts.length >= 2 && parts.every(p => p.length <= CHUNK));
  assert.equal(unpack(parts).blob, noise);
  assert.equal(unpack([Buffer.alloc(0)]), null);
});

test('Google sign-in link asks for offline access and both calendar permissions', () => {
  const u = new URL(G.authUrl({ clientId: 'cid', redirectUri: 'https://x.app/api/gcal/callback', state: 's1', loginHint: 'a@b.c' }));
  assert.equal(u.searchParams.get('access_type'), 'offline');
  assert.equal(u.searchParams.get('prompt'), 'consent');
  assert.equal(u.searchParams.get('state'), 's1');
  const scopes = u.searchParams.get('scope').split(' ');
  assert.ok(scopes.includes('https://www.googleapis.com/auth/calendar.app.created'));
  assert.ok(scopes.includes('https://www.googleapis.com/auth/calendar.events.readonly'));
});

test('events from Google become small TaskFlow events', () => {
  assert.deepEqual(G.toEvent({ id: '1', summary: 'Standup', start: { dateTime: '2026-10-20T09:00:00+05:30' }, end: { dateTime: '2026-10-20T09:15:00+05:30' }, htmlLink: 'https://g/1' }),
    { id: '1', title: 'Standup', allDay: false, start: '2026-10-20T09:00:00+05:30', end: '2026-10-20T09:15:00+05:30', where: '', url: 'https://g/1' });
  assert.equal(G.toEvent({ id: '2', start: { date: '2026-10-21' }, end: { date: '2026-10-22' } }).allDay, true);
  assert.equal(G.toEvent({ id: '3', start: { date: '2026-10-21' } }).title, '(No title)');
});

test('pushQuests creates the TaskFlow calendar once and adds dated quests', async () => {
  const calls = [];
  let n = 0;
  const api = async (method, path, body) => {
    calls.push(`${method} ${path}`);
    if (method === 'POST' && path === '/calendars') return { id: 'cal1' };
    if (method === 'POST') return { id: 'ev' + (++n) };
    return {};
  };
  const quests = [{ id: 'q1', title: 'Dentist', due: '2026-10-22', time: '16:00', tier: 1, subtasks: [] }, { id: 'q2', title: 'No date', tier: 3, subtasks: [] }];
  const r = await G.pushQuests(api, {}, quests, 'Asia/Kolkata');
  assert.equal(r.calendarId, 'cal1');
  assert.equal(r.counts.inserted, 1);
  assert.equal(r.map.q1.eventId, 'ev1');
  // second run: calendar exists, nothing changed, so only the calendar check is made
  calls.length = 0;
  const r2 = await G.pushQuests(api, { calendarId: 'cal1', map: r.map }, quests, 'Asia/Kolkata');
  assert.deepEqual(calls, ['GET /calendars/cal1']);
  assert.deepEqual(r2.counts, { inserted: 0, updated: 0, deleted: 0, failed: 0 });
});

test('pullEvents drops cancelled events and asks for a bounded window', async () => {
  let asked;
  const api = async (m, path) => { asked = path; return { items: [{ id: 'a', summary: 'A', status: 'confirmed', start: { date: '2026-10-20' }, end: { date: '2026-10-21' } }, { id: 'b', status: 'cancelled', start: {} }] }; };
  const items = await G.pullEvents(api, Date.UTC(2026, 9, 19));
  assert.equal(items.length, 1);
  assert.match(asked, /^\/calendars\/primary\/events\?.*singleEvents=true/);
  assert.match(asked, /timeMin=2026-10-12/);
});
