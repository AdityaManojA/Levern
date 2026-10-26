import { test } from 'node:test';
import assert from 'node:assert/strict';
import { simplify, encodePoints, decodePoints, makeStroke, strokePath, toSvg, hitsStroke, scaleStroke, cleanSketches, isBlank, sketchBytes, MAX_SKETCH_BYTES, INK_W } from '../js/ink.js';
import * as store from '../js/store.js';
import { memoryAdapter } from '../js/storage.js';

const line = (n, p = 0.5) => Array.from({ length: n }, (_, i) => ({ x: 10 + i, y: 20, p }));

test('ink: simplify drops points on a straight line but keeps corners and pressure changes', () => {
  assert.equal(simplify(line(50)).length, 2);
  const corner = [...line(20), ...Array.from({ length: 20 }, (_, i) => ({ x: 29, y: 21 + i, p: 0.5 }))];
  assert.ok(simplify(corner).some(pt => pt.x === 29 && pt.y <= 22));
  const swell = line(21).map((pt, i) => ({ ...pt, p: i === 10 ? 1 : 0.2 }));
  assert.ok(simplify(swell).some(pt => pt.p === 1));
});

test('ink: points round-trip through the delta encoding', () => {
  const pts = [{ x: 10.2, y: 5.7, p: 0.33 }, { x: 14, y: 2, p: 0.8 }, { x: 14, y: 2, p: 0.8 }, { x: 3, y: 40, p: 0 }];
  const d = encodePoints(pts);
  assert.ok(d.every(Number.isInteger));
  assert.deepEqual(decodePoints(d), [{ x: 10, y: 6, p: 0.3 }, { x: 14, y: 2, p: 0.8 }, { x: 3, y: 40, p: 0 }]);
});

test('ink: strokes render as closed outline paths, dots as circles', () => {
  const s = makeStroke(line(30), '#3E6FA8', 6);
  const path = strokePath(s);
  assert.match(path, /^M[\d.\- ]+Q.*A.*Z$/);
  assert.match(strokePath(makeStroke([{ x: 50, y: 50, p: 0.5 }])), /^M47 50a3 3 0 1 0 6 0/);
  const svg = toSvg({ w: 600, h: 400, kind: 'sketch', strokes: [s, { c: 'red;evil', s: 3, d: [1, 1, 5] }] });
  assert.match(svg, /viewBox="0 0 600 400"/);
  assert.ok(svg.includes('fill="#3E6FA8"') && svg.includes('fill="#1E1B18"') && !svg.includes('evil'));
});

test('ink: the eraser hits strokes it touches and misses ones it does not', () => {
  const s = makeStroke(line(40), '#000', 6);
  assert.ok(hitsStroke(s, 25, 24, 2));
  assert.ok(!hitsStroke(s, 25, 60, 10));
  assert.ok(hitsStroke(makeStroke([{ x: 5, y: 5, p: 0.5 }]), 9, 5, 2));
});

test('ink: scaling a stroke moves it into another drawing space', () => {
  const s = scaleStroke(makeStroke([{ x: 100, y: 50, p: 0.5 }, { x: 200, y: 50, p: 0.5 }], '#000', 6), 2);
  assert.deepEqual(decodePoints(s.d).map(p => [p.x, p.y]), [[200, 100], [400, 100]]);
  assert.equal(s.s, 12);
});

test('ink: cleaning keeps good sketches and drops broken ones', () => {
  const good = { id: 'a', w: 600, h: 400, kind: 'writing', text: 'milk', strokes: [{ c: '#000', s: 3, d: [1, 2, 5] }, { c: '#000', d: ['x'] }] };
  const out = cleanSketches([good, { id: 'b' }, null, { id: 3, w: 1, h: 1, strokes: [] }]);
  assert.equal(out.length, 1);
  assert.equal(out[0].strokes.length, 1);
  assert.equal(out[0].text, 'milk');
  assert.deepEqual(cleanSketches('nope'), []);
  assert.ok(isBlank({ strokes: [] }) && !isBlank(good));
});

test('ink: a busy page of handwriting stays under the per-sketch limit', () => {
  // 120 wiggly strokes of 80 points each, like a page of writing
  const strokes = Array.from({ length: 120 }, (_, k) => makeStroke(Array.from({ length: 80 }, (_, i) => ({ x: (k % 12) * 50 + i * 0.6, y: Math.floor(k / 12) * 22 + 10 + Math.sin(i / 3) * 8, p: 0.4 + (i % 5) / 10 }))));
  assert.ok(sketchBytes({ w: INK_W, h: 220, strokes }) < MAX_SKETCH_BYTES);
});

test('store: sketches are added, edited, removed, and saved with new quests', () => {
  store.init(memoryAdapter());
  const q = store.addQuest({ title: 'Sketch here' });
  const k = store.addSketch(q.id, { kind: 'sketch', w: 600, h: 400, strokes: [makeStroke(line(5))] });
  assert.equal(store.findQuest(q.id).sketches.length, 1);
  store.updateSketch(q.id, k.id, { text: 'hello' });
  assert.equal(store.findQuest(q.id).sketches[0].text, 'hello');
  store.removeSketch(q.id, k.id);
  assert.equal(store.findQuest(q.id).sketches, undefined);
  const n = store.addQuest({ title: 'Handwritten note', sketches: [{ kind: 'writing', w: 600, h: 220, strokes: [makeStroke(line(5))] }] });
  const saved = store.findQuest(n.id).sketches[0];
  assert.equal(saved.kind, 'writing');
  assert.ok(saved.id && saved.createdAt);
});
