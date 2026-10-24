// Example quests that leaked into accounts as ordinary quests are found again, and nothing else is.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markSamples, dropLeaked } from '../js/store.js';

const q = (title, createdAt, extra = {}) => ({ id: title + createdAt, title, createdAt, updatedAt: createdAt + 86400000, sample: false, ...extra });

test('a batch of examples that became ordinary quests is marked as examples again', () => {
  const t = 1792500000000;
  const qs = markSamples([q('Water the plants', t), q('Book dentist', t + 3), q('Submit lab report', t + 7), q('My own quest', t + 9)]);
  assert.deepEqual(qs.map(x => x.sample), [true, true, true, false]);
});

test('a lone example title, or ones typed far apart, are left alone (someone may really have a quest called that)', () => {
  const t = 1792500000000;
  assert.equal(markSamples([q('Call mum', t)])[0].sample, false);
  assert.deepEqual(markSamples([q('Call mum', t), q('Go for a walk', t + 60000)]).map(x => x.sample), [false, false]);
});

test('an example the person rewrote (new title) is theirs', () => {
  const t = 1792500000000;
  assert.deepEqual(markSamples([q('Water the plants', t), q('Water the balcony herbs', t + 2)]).map(x => x.sample), [false, false]);
});

test('leaked examples are dropped; examples still being shown to a new person are not', () => {
  const t = 1792500000000;
  const fresh = { id: 'x', title: 'Book dentist', createdAt: t, updatedAt: t, sample: true };
  const qs = dropLeaked(markSamples([q('Water the plants', t), q('Book dentist', t + 3), fresh, q('My own quest', t + 9)]));
  assert.deepEqual(qs.map(x => x.id), ['x', 'My own quest' + (t + 9)]);
});

test('only the newest batch of examples is kept', () => {
  const ex = (title, t) => ({ id: title + t, title, createdAt: t, updatedAt: t, sample: true });
  const qs = dropLeaked(markSamples([ex('Book dentist', 1000), ex('Read chapter 4', 1001), ex('Book dentist', 900000), ex('Read chapter 4', 900002)]));
  assert.deepEqual(qs.map(x => x.createdAt), [900000, 900002]);
});
