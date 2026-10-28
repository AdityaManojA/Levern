// Ink: pen and touch strokes for sketches and handwriting. Pure (no DOM), so it runs in tests and on the server.
//
// A sketch saved on a quest:
//   { id, kind: 'sketch' | 'writing', w, h, strokes: [{ c, s, d }], text?, createdAt }
// w × h is the logical drawing space (always 600 wide, whatever the screen). A stroke has a colour c,
// a nominal size s, and d: its points as a flat list of whole numbers, the first point absolute
// [x, y, p] and every later one a delta from the one before. p is pen pressure 0–10 (5 for mouse and finger).

export const INK_W = 600;
export const INKS = ['#1E1B18', '#3E6FA8', '#3F8A5C', '#C2553A', '#7A5BB5'];
export const SIZES = [3, 6, 12];
export const MAX_SKETCH_BYTES = 60 * 1024;   // a quest syncs as one record, so one sketch stays small

// points: [{ x, y, p }] with p 0–1 -> drop points that add nothing to the shape (Ramer–Douglas–Peucker)
export function simplify(points, eps = 0.7) {
  if (points.length < 3) return points.slice();
  const keep = new Uint8Array(points.length); keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let max = 0, idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = segDist(points[i], points[a], points[b]);
      // keep pressure changes too, so a stroke that swells or thins keeps its shape
      const dp = Math.abs(points[i].p - (points[a].p + points[b].p) / 2) * 8;
      const m = Math.max(d, dp);
      if (m > max) { max = m; idx = i; }
    }
    if (max > eps && idx > 0) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

function segDist(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, l = dx * dx + dy * dy;
  if (!l) return Math.hypot(p.x - a.x, p.y - a.y);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

// [{ x, y, p }] (p 0–1) -> flat delta list of whole numbers
export function encodePoints(points) {
  const d = []; let px = 0, py = 0, pp = 0;
  points.forEach((pt, i) => {
    const x = Math.round(pt.x), y = Math.round(pt.y), p = Math.round(Math.max(0, Math.min(1, pt.p)) * 10);
    if (i && x === px && y === py && p === pp) return;   // repeated point
    d.push(i ? x - px : x, i ? y - py : y, i ? p - pp : p);
    px = x; py = y; pp = p;
  });
  return d;
}
export function decodePoints(d = []) {
  const out = []; let x = 0, y = 0, p = 0;
  for (let i = 0; i + 2 < d.length; i += 3) { x += d[i]; y += d[i + 1]; p += d[i + 2]; out.push({ x, y, p: p / 10 }); }
  return out;
}
export const makeStroke = (points, c = INKS[0], s = SIZES[1]) => ({ c, s, d: encodePoints(simplify(points)) });

// radius at a point: the nominal size at normal pressure, thinner when light, up to 1.5x when pressed hard
const radius = (s, p) => (s / 2) * (0.5 + p);

// a stroke as a filled outline path (SVG path data, also accepted by canvas Path2D)
export function strokePath(stroke) {
  const pts = decodePoints(stroke.d);
  if (!pts.length) return '';
  const r = pts.map(pt => radius(stroke.s, pt.p));
  const f = n => Math.round(n * 10) / 10;
  if (pts.length === 1 || pts.every(pt => pt.x === pts[0].x && pt.y === pts[0].y)) {
    const { x, y } = pts[0], R = f(r[0]);
    return `M${f(x - R)} ${f(y)}a${R} ${R} 0 1 0 ${f(2 * R)} 0a${R} ${R} 0 1 0 ${f(-2 * R)} 0Z`;
  }
  const L = [], Rt = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    let tx = b.x - a.x, ty = b.y - a.y; const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    L.push([pts[i].x - ty * r[i], pts[i].y + tx * r[i]]);
    Rt.push([pts[i].x + ty * r[i], pts[i].y - tx * r[i]]);
  }
  const side = arr => arr.slice(1).map((pt, i) => {   // smooth through the midpoints
    const prev = arr[i], mx = (prev[0] + pt[0]) / 2, my = (prev[1] + pt[1]) / 2;
    return `Q${f(prev[0])} ${f(prev[1])} ${f(mx)} ${f(my)}`;
  }).join('') + `L${f(arr[arr.length - 1][0])} ${f(arr[arr.length - 1][1])}`;
  const back = Rt.slice().reverse(), rEnd = f(r[r.length - 1]), rStart = f(r[0]);
  return `M${f(L[0][0])} ${f(L[0][1])}${side(L)}A${rEnd} ${rEnd} 0 0 1 ${f(back[0][0])} ${f(back[0][1])}${side(back)}A${rStart} ${rStart} 0 0 1 ${f(L[0][0])} ${f(L[0][1])}Z`;
}

// the whole sketch as an SVG string (thumbnails, the viewer, export)
export function toSvg(sketch, { title = '' } = {}) {
  const paths = (sketch.strokes || []).map(s => `<path d="${strokePath(s)}" fill="${safeColor(s.c)}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${sketch.w} ${sketch.h}" role="img" aria-label="${title ? escAttr(title) : sketch.kind === 'writing' ? 'Handwriting' : 'Sketch'}">${paths}</svg>`;
}
const safeColor = c => /^#[0-9a-f]{3,8}$/i.test(c || '') ? c : INKS[0];
const escAttr = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// does a circle at (x, y) with radius rad touch the stroke? (the eraser)
export function hitsStroke(stroke, x, y, rad) {
  const pts = decodePoints(stroke.d);
  if (pts.length === 1) return Math.hypot(pts[0].x - x, pts[0].y - y) <= rad + radius(stroke.s, pts[0].p);
  for (let i = 1; i < pts.length; i++) {
    if (segDist({ x, y }, pts[i - 1], pts[i]) <= rad + radius(stroke.s, Math.max(pts[i - 1].p, pts[i].p))) return true;
  }
  return false;
}

// a stroke moved/scaled into another drawing space
export function scaleStroke(stroke, k) {
  return { ...stroke, s: stroke.s * k, d: encodePoints(decodePoints(stroke.d).map(pt => ({ x: pt.x * k, y: pt.y * k, p: pt.p }))) };
}

export const sketchBytes = sketch => JSON.stringify(sketch).length;
export const isBlank = sketch => !sketch || !(sketch.strokes || []).some(s => s.d && s.d.length >= 3);

// keep only well-formed sketches (backups, sync and the API can hand us anything)
export function cleanSketches(list) {
  if (!Array.isArray(list)) return [];
  return list.filter(k => k && typeof k.id === 'string' && Number.isFinite(k.w) && Number.isFinite(k.h) && Array.isArray(k.strokes))
    .map(k => ({ ...k, kind: k.kind === 'writing' ? 'writing' : 'sketch',
      strokes: k.strokes.filter(s => s && Array.isArray(s.d) && s.d.every(Number.isFinite)).map(s => ({ c: safeColor(s.c), s: Number.isFinite(s.s) ? s.s : SIZES[1], d: s.d })) }));
}
