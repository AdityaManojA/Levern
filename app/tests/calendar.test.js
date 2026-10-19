import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { questToEvent, planSync, applyOps, eventHash, TIER_COLOR_IDS } from '../js/gcalmap.js';

const q = (o = {}) => ({ id: 'a1', title: 'Lab report', tier: 0, due: '2026-10-23', time: null, notes: '', subtasks: [], repeat: null, remind: null, done: false, ...o });

test('event: all-day quest', () => {
  const e = questToEvent(q(), 'Asia/Kolkata');
  assert.deepEqual(e.start, { date: '2026-10-23' });
  assert.deepEqual(e.end, { date: '2026-10-24' });
  assert.equal(e.summary, 'Lab report');
  assert.equal(e.colorId, TIER_COLOR_IDS[0]);
  assert.equal(e.extendedProperties.private.taskflowId, 'a1');
  assert.equal(e.transparency, 'transparent');
  assert.equal(e.recurrence, undefined);
  assert.deepEqual(e.reminders, { useDefault: false, overrides: [] });
});
test('event: timed, repeating, reminder, notes and subtasks', () => {
  const e = questToEvent(q({ time: '17:30', repeat: { freq: 'weekdays' }, notes: 'Bring USB', subtasks: [{ title: 'Graphs', done: true }, { title: 'Method', done: false }],
    remind: { at: 0, offset: 15 * 60000, fired: false, dismissed: false } }), 'Asia/Kolkata');
  assert.deepEqual(e.start, { dateTime: '2026-10-23T17:30:00', timeZone: 'Asia/Kolkata' });
  assert.deepEqual(e.end, { dateTime: '2026-10-23T18:00:00', timeZone: 'Asia/Kolkata' });
  assert.deepEqual(e.recurrence, ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR']);
  assert.deepEqual(e.reminders.overrides, [{ method: 'popup', minutes: 15 }]);
  assert.equal(e.description, 'Bring USB\n☑ Graphs\n☐ Method');
});
test('event: absolute or dismissed reminders are not sent as alerts', () => {
  assert.deepEqual(questToEvent(q({ remind: { at: 123, offset: null } })).reminders.overrides, []);
  assert.deepEqual(questToEvent(q({ remind: { at: 123, offset: 60000, dismissed: true } })).reminders.overrides, []);
});

test('plan: insert new, update changed, skip unchanged, delete gone/done/undated', () => {
  const same = q({ id: 's', title: 'Same' }), changed = q({ id: 'c', title: 'New name' });
  const map = { s: { eventId: 'E1', hash: eventHash(questToEvent(same)) }, c: { eventId: 'E2', hash: 'old' }, gone: { eventId: 'E3', hash: 'x' }, d: { eventId: 'E4', hash: 'x' }, u: { eventId: 'E5', hash: 'x' } };
  const ops = planSync([same, changed, q({ id: 'n' }), q({ id: 'd', done: true }), q({ id: 'u', due: null }), q({ id: 'never', due: null })], map);
  const by = Object.fromEntries(ops.map(o => [o.questId, o.op]));
  assert.deepEqual(by, { c: 'update', n: 'insert', gone: 'delete', d: 'delete', u: 'delete' });
  assert.equal(ops.find(o => o.questId === 'c').eventId, 'E2');
});

function fakeApi(fail = {}) {
  const calls = []; let n = 0;
  const api = async (method, path, body) => {
    calls.push(`${method} ${path}`);
    const f = fail[`${method} ${path}`];
    if (f) { const e = new Error('x'); e.status = f; throw e; }
    return method === 'POST' ? { id: 'new' + ++n } : null;
  };
  return { api, calls };
}
test('apply: maps ids, recreates events deleted in Google, forgets deleted ones', async () => {
  const ops = [
    { op: 'insert', questId: 'a', event: {}, hash: 'h1' },
    { op: 'update', questId: 'b', eventId: 'GONE', event: {}, hash: 'h2' },
    { op: 'delete', questId: 'c', eventId: 'ALSO_GONE' },
  ];
  const { api, calls } = fakeApi({ 'PUT /calendars/cal%40x/events/GONE': 404, 'DELETE /calendars/cal%40x/events/ALSO_GONE': 410 });
  const r = await applyOps(ops, { b: { eventId: 'GONE', hash: 'h0' }, c: { eventId: 'ALSO_GONE', hash: 'h' } }, 'cal@x', api);
  assert.deepEqual(r.mapping, { a: { eventId: 'new1', hash: 'h1' }, b: { eventId: 'new2', hash: 'h2' } });
  assert.deepEqual(r.counts, { inserted: 1, updated: 1, deleted: 1, failed: 0 });
  assert.equal(calls.length, 4);
});
test('apply: an expired token stops the run but keeps what was done', async () => {
  const ops = [{ op: 'insert', questId: 'a', event: {}, hash: 'h1' }, { op: 'insert', questId: 'b', event: {}, hash: 'h2' }];
  let n = 0;
  const api = async () => { if (++n === 2) { const e = new Error('auth'); e.status = 401; throw e; } return { id: 'E' + n }; };
  await assert.rejects(applyOps(ops, {}, 'c', api), e => e.status === 401 && e.mapping.a.eventId === 'E1' && !e.mapping.b);
});
test('apply: other errors are counted, the rest continues', async () => {
  const { api } = fakeApi({ 'POST /calendars/c/events': 500 });
  const r = await applyOps([{ op: 'insert', questId: 'a', event: {}, hash: 'h' }, { op: 'delete', questId: 'z', eventId: 'Z' }], { z: { eventId: 'Z' } }, 'c', api);
  assert.equal(r.counts.failed, 1); assert.equal(r.counts.deleted, 1); assert.equal(r.mapping.a, undefined);
});

test('server: serves the app and a live calendar feed the app can update', async () => {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const port = 5197;
  const srv = spawn(process.execPath, [join(root, 'server.mjs'), String(port)], { stdio: 'ignore', env: { ...process.env, TASKFLOW_DATA: mkdtempSync(join(tmpdir(), 'tf-feed-')) } });
  try {
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 40; i++) { try { await fetch(base + '/'); break; } catch (e) { await new Promise(r => setTimeout(r, 100)); } }
    const home = await fetch(base + '/');
    assert.equal(home.status, 200); assert.match(home.headers.get('content-type'), /text\/html/);
    assert.match((await fetch(base + '/manifest.webmanifest')).headers.get('content-type'), /manifest\+json/);
    assert.equal((await fetch(base + '/../package.json')).status, 404);
    const ics = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nX-TEST:' + Date.now() + '\r\nEND:VCALENDAR\r\n';
    assert.equal((await fetch(base + '/calendar.ics', { method: 'PUT', body: ics })).status, 204);
    const got = await fetch(base + '/calendar.ics');
    assert.match(got.headers.get('content-type'), /text\/calendar/);
    assert.equal(await got.text(), ics);
    assert.equal((await fetch(base + '/calendar.ics', { method: 'PUT', body: 'not a calendar' })).status, 400);
    assert.equal((await fetch(base + '/calendar.ics', { method: 'PUT', body: ics, headers: { Origin: 'https://evil.example' } })).status, 403);
  } finally { srv.kill(); }
});
