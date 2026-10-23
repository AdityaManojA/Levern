import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isClean, shownName, tidyName } from '../js/namefilter.js';

test('ordinary names pass, including ones that hide a bad word', () => {
  for (const n of ['Aditya', 'Adwaitha', 'Godfrey', 'Kshitij', 'Ashit Kumar', 'Nazia', 'Nigam', 'Kunnath', 'Fukuda', 'Charles Dickens',
    'Jess Hitchens', 'Hancock', 'Mc Donald', 'Therapist Tom', 'Cucumber Club', 'Class Act', 'Grape', 'Scunthorpe FC', 'Li Na', 'Mochi fan 99'])
    assert.ok(isClean(n), n);
});

test('swearing is caught through the usual disguises', () => {
  for (const n of ['fuck', 'FUCK you', 'f.u.c.k', 'f u c k', 'fuuuuck', 'sh1t', '$hit head', 'b1tch', '@ss', 'ass', 'big tits', 'dick',
    'motherfucker', 'chutiya', 'bhenchod', 'gandu'])
    assert.equal(isClean(n), false, n);
});

test('names on the board fall back to Someone', () => {
  assert.equal(shownName('  Mochi   Queen '), 'Mochi Queen');
  assert.equal(shownName('sh1t lord'), 'Someone');
  assert.equal(shownName(''), 'Someone');
  assert.equal(tidyName('x'.repeat(40)).length, 24);
});
