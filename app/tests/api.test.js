import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer, request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mergeQuests, mergeDocs, diffQuests } from '../js/syncmerge.js';
import { verify } from '../../server/webhooks.mjs';

/* ---------- pure: merging and change events ---------- */
test('merge: last write wins per quest, tombstones beat older copies', () => {
  const a = [{ id: '1', title: 'old', updatedAt: 10 }, { id: '2', title: 'keep', updatedAt: 5 }];
  const b = [{ id: '1', title: 'new', updatedAt: 20 }, { id: '3', title: 'deleted on a', updatedAt: 5 }];
  const r = mergeQuests(a, [{ id: '3', deletedAt: Date.now() }], b, []);
  assert.deepEqual(r.quests.map(q => q.title).sort(), ['keep', 'new']);
  assert.equal(r.tombstones.length, 1);
  // edited after it was deleted: the edit wins
  const r2 = mergeQuests([{ id: '4', title: 'back', updatedAt: Date.now() + 10 }], [], [], [{ id: '4', deletedAt: Date.now() }]);
  assert.equal(r2.quests.length, 1);
  const d = mergeDocs({ history: [1], historyUpdatedAt: 5, settings: { target: 3 }, settingsUpdatedAt: 9 }, { history: [1, 2], historyUpdatedAt: 7, settings: { target: 7 }, settingsUpdatedAt: 2 });
  assert.deepEqual(d.history, [1, 2]); assert.equal(d.settings.target, 3);
});
test('diff: created, updated, completed, deleted', () => {
  const ev = diffQuests([{ id: 'a', t: 1 }, { id: 'b', t: 1, done: false }, { id: 'c' }], [{ id: 'a', t: 2 }, { id: 'b', t: 1, done: true }, { id: 'd' }]);
  assert.deepEqual(ev.map(e => `${e.type}:${e.quest.id}`).sort(), ['quest.completed:b', 'quest.created:d', 'quest.deleted:c', 'quest.updated:a']);
});

/* ---------- the server ---------- */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = 5195, BASE = `http://127.0.0.1:${PORT}`;
let srv, hookSrv, hookPort, received = [], failNext = 0;
const api = (method, path, { key, body, headers = {} } = {}) => fetch(BASE + '/api/v1' + path, { method, headers: { ...(key ? { Authorization: 'Bearer ' + key } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
const json = async r => ({ status: r.status, body: r.status === 204 ? null : await r.json(), headers: r.headers });
const dev = (method, path, body) => fetch(BASE + '/sync/dev' + path, { method, headers: body ? { 'Content-Type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined }).then(json);
const wait = ms => new Promise(r => setTimeout(r, ms));
let writeKey, readKey;

before(async () => {
  hookSrv = createServer((req, res) => {
    let b = ''; req.on('data', c => { b += c; }); req.on('end', () => {
      if (failNext > 0) { failNext--; res.writeHead(500).end(); return; }
      received.push({ headers: req.headers, body: b }); res.writeHead(200).end('ok');
    });
  });
  await new Promise(r => hookSrv.listen(0, '127.0.0.1', r));
  hookPort = hookSrv.address().port;
  srv = spawn(process.execPath, [join(ROOT, 'server.mjs'), String(PORT)], { stdio: 'ignore',
    env: { ...process.env, TASKFLOW_DATA: mkdtempSync(join(tmpdir(), 'tf-api-')), TASKFLOW_RATE: '40', TASKFLOW_WEBHOOK_BACKOFF: '150,300' } });
  for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/'); break; } catch (e) { await wait(100); } }
  writeKey = (await dev('POST', '/keys', { name: 'tests rw', scope: 'write' })).body.key;
  readKey = (await dev('POST', '/keys', { name: 'tests ro', scope: 'read' })).body.key;
});
after(() => { srv.kill(); hookSrv.close(); });

test('keys: created once, listed without the secret, required on every call', async () => {
  assert.match(writeKey, /^tf_[A-Za-z0-9]{32}$/);
  const list = await dev('GET', '/keys');
  assert.equal(list.body.data.length, 2);
  assert.ok(!JSON.stringify(list.body).includes(writeKey));
  assert.equal(list.body.data[0].prefix, writeKey.slice(0, 10));
  assert.equal((await json(await api('GET', '/quests'))).status, 401);
  assert.equal((await json(await api('GET', '/quests', { key: 'tf_' + 'x'.repeat(32) }))).status, 401);
  const me = await json(await api('GET', '/me', { key: readKey }));
  assert.equal(me.body.key.scope, 'read');
});
test('scopes: a read-only key cannot write', async () => {
  const r = await json(await api('POST', '/quests', { key: readKey, body: { title: 'nope' } }));
  assert.equal(r.status, 403); assert.equal(r.body.error.code, 'forbidden');
});
test('quests: create from text, read, update, complete, reopen, delete', async () => {
  let r = await json(await api('POST', '/quests', { key: writeKey, body: { text: 'Call mum tomorrow at 6pm p2', notes: 'about the trip' } }));
  assert.equal(r.status, 201);
  const q = r.body.data;
  assert.equal(q.title, 'Call mum'); assert.equal(q.priority, 2); assert.equal(q.time, '18:00'); assert.ok(q.due);
  r = await json(await api('GET', '/quests/' + q.id, { key: readKey }));
  assert.equal(r.body.data.notes, 'about the trip');
  r = await json(await api('PATCH', '/quests/' + q.id, { key: writeKey, body: { priority: 1, title: 'Call mum back' } }));
  assert.equal(r.body.data.priority, 1); assert.equal(r.body.data.title, 'Call mum back');
  r = await json(await api('POST', '/quests/' + q.id + '/complete', { key: writeKey }));
  assert.equal(r.body.data.done, true); assert.ok(r.body.data.completed_at);
  r = await json(await api('POST', '/quests/' + q.id + '/reopen', { key: writeKey }));
  assert.equal(r.body.data.done, false);
  assert.equal((await api('DELETE', '/quests/' + q.id, { key: writeKey })).status, 204);
  assert.equal((await json(await api('GET', '/quests/' + q.id, { key: readKey }))).status, 404);
});
test('quests: repeating quests move to their next date when completed', async () => {
  const today = new Date(); const ds = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const q = (await json(await api('POST', '/quests', { key: writeKey, body: { title: 'Water plants', due: ds, repeat: 'daily' } }))).body.data;
  const r = await json(await api('POST', '/quests/' + q.id + '/complete', { key: writeKey }));
  assert.equal(r.body.data.done, false); assert.ok(r.body.next_due > ds);
});
test('quests: validation errors are clear', async () => {
  let r = await json(await api('POST', '/quests', { key: writeKey, body: { title: '', priority: 9 } }));
  assert.equal(r.status, 422); assert.equal(r.body.error.code, 'invalid');
  r = await json(await api('POST', '/quests', { key: writeKey, body: { title: 'x', due: '2026-13-40' } }));
  assert.equal(r.status, 422); assert.equal(r.body.error.field, 'due');
  r = await json(await fetch(BASE + '/api/v1/quests', { method: 'POST', headers: { Authorization: 'Bearer ' + writeKey, 'Content-Type': 'application/json' }, body: '{oops' }));
  assert.equal(r.status, 400);
  assert.equal((await json(await api('GET', '/nope', { key: readKey }))).status, 404);
});
test('quests: list filters and cursor pagination', async () => {
  for (let i = 0; i < 5; i++) await api('POST', '/quests', { key: writeKey, body: { title: 'Page item ' + i, priority: 4 } });
  let r = await json(await api('GET', '/quests?search=page%20item&limit=2', { key: readKey }));
  assert.equal(r.body.data.length, 2); assert.equal(r.body.total, 5); assert.ok(r.body.next_cursor);
  const seen = r.body.data.map(q => q.title);
  while (r.body.next_cursor) { r = await json(await api('GET', '/quests?search=page%20item&limit=2&cursor=' + r.body.next_cursor, { key: readKey })); seen.push(...r.body.data.map(q => q.title)); }
  assert.equal(new Set(seen).size, 5);
  assert.equal((await json(await api('GET', '/quests?limit=500', { key: readKey }))).status, 422);
});
test('reminders: set, list, snooze, dismiss; the server fires them on time', async () => {
  const q = (await json(await api('POST', '/quests', { key: writeKey, body: { title: 'Reminder me' } }))).body.data;
  let r = await json(await api('POST', '/reminders', { key: writeKey, body: { quest_id: q.id, at: new Date(Date.now() + 60000).toISOString() } }));
  assert.equal(r.status, 201); assert.equal(r.body.data.reminder.state, 'scheduled');
  r = await json(await api('GET', '/reminders?status=scheduled', { key: readKey }));
  assert.ok(r.body.data.some(x => x.quest_id === q.id));
  r = await json(await api('POST', `/reminders/${q.id}/snooze`, { key: writeKey, body: { minutes: 15 } }));
  assert.equal(r.body.data.reminder.state, 'scheduled');
  r = await json(await api('POST', `/reminders/${q.id}/dismiss`, { key: writeKey }));
  assert.equal(r.body.data.reminder.state, 'dismissed');
  const q2 = (await json(await api('POST', '/quests', { key: writeKey, body: { title: 'Due soon', reminder: { at: new Date(Date.now() + 500).toISOString() } } }))).body.data;
  await wait(5600);
  r = await json(await api('GET', '/reminders?status=due', { key: readKey }));
  assert.ok(r.body.data.some(x => x.quest_id === q2.id), 'server marks it due');
});
test('stats', async () => {
  const r = await json(await api('GET', '/stats?days=3', { key: readKey }));
  assert.equal(r.status, 200); assert.ok(r.body.data.done_total >= 1);   // the reopened quest no longer counts assert.equal(r.body.data.days.length, 3);
});
test('webhooks: signed deliveries, retries, test pings', async () => {
  const add = await dev('POST', '/webhooks', { url: `http://127.0.0.1:${hookPort}/hook`, events: ['quest.created', 'quest.completed', 'reminder.fired'] });
  assert.equal(add.status, 201); const secret = add.body.secret; assert.match(secret, /^whsec_/);
  received = [];
  const q = (await json(await api('POST', '/quests', { key: writeKey, body: { title: 'Hooked' } }))).body.data;
  await wait(400);
  const got = received.find(x => JSON.parse(x.body).type === 'quest.created');
  assert.ok(got, 'delivered');
  assert.equal(got.headers['taskflow-event'], 'quest.created');
  assert.ok(verify(secret, got.body, got.headers['taskflow-signature']), 'signature checks out');
  assert.ok(!verify('whsec_wrong', got.body, got.headers['taskflow-signature']));
  assert.equal(JSON.parse(got.body).data.quest.id, q.id);
  // a failing receiver gets retried with backoff
  failNext = 1; received = [];
  await api('POST', '/quests/' + q.id + '/complete', { key: writeKey });
  await wait(900);
  assert.ok(received.some(x => JSON.parse(x.body).type === 'quest.completed'), 'retried after a 500');
  const log = await dev('GET', '/webhooks');
  assert.ok(log.body.deliveries.some(d => d.type === 'quest.completed' && !d.ok && d.retry_in_ms));
  assert.ok(log.body.deliveries.some(d => d.type === 'quest.completed' && d.ok && d.attempt === 2));
  const t = await dev('POST', `/webhooks/${add.body.data.id}/test`);
  assert.equal(t.body.ok, true);
});
test('app sync: merges both ways; local-only endpoints refuse other hosts', async () => {
  const mine = { quests: [{ id: 'app1', title: 'From the app', tier: 3, subtasks: [], createdAt: Date.now(), updatedAt: Date.now() }], tombstones: [], history: [], historyUpdatedAt: 0, sessions: [], sessionsUpdatedAt: 0, settings: { target: 4 }, settingsUpdatedAt: Date.now() };
  const r = await json(await fetch(BASE + '/sync/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(mine) }));
  assert.ok(r.body.quests.some(q => q.id === 'app1'));
  assert.ok(r.body.quests.some(q => q.title === 'Hooked'), 'API quests come back to the app');
  const viaApi = await json(await api('GET', '/quests/app1', { key: readKey }));
  assert.equal(viaApi.body.data.title, 'From the app');
  const status = await new Promise(res => { const rq = request({ host: '127.0.0.1', port: PORT, path: '/sync/dev/keys', headers: { Host: 'evil.example' } }, rs => { rs.resume(); res(rs.statusCode); }); rq.on('error', () => res(0)); rq.end(); });
  assert.equal(status, 403);
  const origin = await json(await fetch(BASE + '/sync/dev/keys', { headers: { Origin: 'https://evil.example' } }));
  assert.equal(origin.status, 403);
});
test('rate limit per key, and revoking a key', async () => {
  const k = (await dev('POST', '/keys', { name: 'burst', scope: 'read' })).body.key;
  let last;
  for (let i = 0; i < 41; i++) last = await api('GET', '/me', { key: k });
  assert.equal(last.status, 429); assert.ok(last.headers.get('retry-after'));
  assert.equal(last.headers.get('x-ratelimit-limit'), '40');
  const id = (await dev('GET', '/keys')).body.data.find(x => x.name === 'burst').id;
  assert.equal((await dev('DELETE', '/keys/' + id)).status, 204);
  const ro = (await dev('GET', '/keys')).body.data.find(x => x.name === 'tests ro').id;
  await dev('DELETE', '/keys/' + ro);
  assert.equal((await api('GET', '/me', { key: readKey })).status, 401);
});
