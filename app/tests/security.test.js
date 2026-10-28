import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildICS } from '../js/ics.js';

test('security: buildICS sanitizes quest IDs against CRLF injection', () => {
  const maliciousQuest = {
    id: '123\r\nATTACK:injected\r\nBEGIN:VEVENT\r\nSUMMARY:Hacked',
    title: 'Normal Title',
    due: '2026-10-29',
    done: false,
    tier: 1,
    subtasks: []
  };

  const ics = buildICS([maliciousQuest]);
  // The UID line must not contain injected raw lines or CRLF attack payload
  assert.ok(!ics.includes('ATTACK:injected'), 'Must not allow CRLF injected lines in UID');
  assert.ok(!ics.includes('SUMMARY:Hacked'), 'Must not allow rogue VEVENT injection via id');
  // UID should contain only safe sanitized characters
  const uidLine = ics.split('\r\n').find(l => l.startsWith('UID:'));
  assert.ok(uidLine, 'UID line must exist');
  assert.match(uidLine, /^UID:taskflow-[a-zA-Z0-9_\-]+@taskflow\.app$/);
});

test('security: firebase.json enforces modern defensive security headers on all sites', () => {
  const config = JSON.parse(readFileSync('firebase.json', 'utf8'));
  for (const siteName of ['getlevern', 'taskflow-dailytracker', 'levern-app']) {
    const site = config.hosting.find(h => h.site === siteName);
    assert.ok(site, `${siteName} hosting config exists`);
    const headers = site.headers.find(h => h.source === '**')?.headers || [];
    const map = Object.fromEntries(headers.map(h => [h.key, h.value]));

    assert.equal(map['X-Content-Type-Options'], 'nosniff', `${siteName} must have nosniff`);
    assert.equal(map['X-Frame-Options'], 'DENY', `${siteName} must have DENY`);
    assert.ok(map['Strict-Transport-Security']?.includes('max-age=31536000'), `${siteName} must have HSTS`);
    assert.equal(map['Referrer-Policy'], 'strict-origin-when-cross-origin', `${siteName} must have Referrer-Policy`);
    assert.ok(map['Permissions-Policy'], `${siteName} must have Permissions-Policy`);
    assert.ok(map['Content-Security-Policy'], `${siteName} must have CSP`);
  }
});

test('security: escAttr in ink.js escapes single quotes as well as HTML characters', async () => {
  const ink = await import('../js/ink.js');
  const svg = ink.toSvg({ w: 100, h: 100, strokes: [] }, { title: `Test 'onclick='alert(1)` });
  assert.ok(!svg.includes(`'onclick=`), 'Must escape single quote in attributes');
  assert.ok(svg.includes('&#39;'), 'Must replace single quote with &#39;');
});

test('security: sanitizeQuest caps oversized strings and array sizes', async () => {
  const { sanitizeQuest } = await import('../js/syncmerge.js');
  const hugeTitle = 'A'.repeat(2000);
  const hugeNotes = 'B'.repeat(50000);
  const lotsOfSubs = Array.from({ length: 300 }, (_, i) => ({ id: `s${i}`, title: 'Subtask ' + i }));
  const sanitized = sanitizeQuest({
    id: 'quest-1',
    title: hugeTitle,
    notes: hugeNotes,
    subtasks: lotsOfSubs,
    tier: 1
  });

  assert.ok(sanitized.title.length <= 500, 'Title must be capped at 500 chars');
  assert.ok(sanitized.notes.length <= 10000, 'Notes must be capped at 10000 chars');
  assert.ok(sanitized.subtasks.length <= 100, 'Subtasks must be capped at 100');
});

test('security: functions .env allows getlevern origin for OAuth', () => {
  const env = readFileSync('functions/.env', 'utf8');
  assert.ok(env.includes('ALLOWED_ORIGINS='), 'ALLOWED_ORIGINS is defined');
  const line = env.split('\n').find(l => l.startsWith('ALLOWED_ORIGINS='));
  assert.ok(line.includes('https://getlevern.web.app'), 'getlevern.web.app is whitelisted');
});
