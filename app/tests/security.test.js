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

test('security: firebase.json enforces modern defensive security headers on getlevern', () => {
  const config = JSON.parse(readFileSync('firebase.json', 'utf8'));
  const getlevern = config.hosting.find(h => h.site === 'getlevern');
  assert.ok(getlevern, 'getlevern hosting config exists');

  const headers = getlevern.headers.find(h => h.source === '**')?.headers || [];
  const map = Object.fromEntries(headers.map(h => [h.key, h.value]));

  assert.equal(map['X-Content-Type-Options'], 'nosniff');
  assert.equal(map['X-Frame-Options'], 'DENY');
  assert.ok(map['Strict-Transport-Security']?.includes('max-age=31536000'), 'HSTS configured with 1 year');
  assert.equal(map['Referrer-Policy'], 'strict-origin-when-cross-origin');
  assert.ok(map['Permissions-Policy'], 'Permissions-Policy configured');
  assert.ok(map['Content-Security-Policy'], 'CSP configured');
});

test('security: functions .env allows getlevern origin for OAuth', () => {
  const env = readFileSync('functions/.env', 'utf8');
  assert.ok(env.includes('ALLOWED_ORIGINS='), 'ALLOWED_ORIGINS is defined');
  const line = env.split('\n').find(l => l.startsWith('ALLOWED_ORIGINS='));
  assert.ok(line.includes('https://getlevern.web.app'), 'getlevern.web.app is whitelisted');
});
