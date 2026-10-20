// The drawing surface: pen, finger or mouse on a canvas, with pen pressure and palm rejection.
//  - Pressure: a pen's pressure sets the line width; finger and mouse draw at the normal width.
//  - Palm rejection: once a pen has touched the pad, fingers are ignored (resting your hand is fine).
//    A big contact patch (a palm) never draws, and a pen landing mid-stroke wins over the finger.
//  - Eraser: the eraser tool, or the eraser end / side button of a pen, removes whole strokes.
// createPad(el, { kind, sketch, onStroke, onChange }) -> pad
import { INK_W, INKS, SIZES, makeStroke, strokePath, hitsStroke, scaleStroke, decodePoints } from './ink.js';

const HEIGHT = { sketch: 400, writing: 220 };
const PALM = 40;        // px: a touch wider and taller than this is a palm, not a fingertip
const ERASE_R = 12;

export function createPad(el, { kind = 'sketch', sketch = null, onStroke = () => {}, onChange = () => {} } = {}) {
  const W = INK_W, H = sketch ? Math.round(sketch.h * W / sketch.w) : HEIGHT[kind];
  el.classList.add('inkpad', 'ink-' + kind);
  el.style.aspectRatio = `${W} / ${H}`;
  el.innerHTML = '<canvas></canvas>';
  const cv = el.querySelector('canvas'), ctx = cv.getContext('2d');

  // strokes[i] is the saved form; raw[i] the timed points the recogniser wants (null for loaded strokes)
  let strokes = sketch ? sketch.strokes.map(s => sketch.w === W ? s : scaleStroke(s, W / sketch.w)) : [];
  let raw = strokes.map(() => null);
  const undoStack = [];
  let tool = 'pen', color = INKS[0], size = kind === 'writing' ? SIZES[1] : SIZES[1];
  let penSeen = false, lastType = 'touch';
  let active = null;   // { id, type, erase, points, rawPts, t0 }

  function fit() {
    const r = cv.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    if (!r.width) return;
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    redraw();
  }
  const scale = () => cv.width / W;
  function redraw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);
    ctx.setTransform(scale(), 0, 0, scale(), 0, 0);
    for (const s of strokes) { ctx.fillStyle = s.c; ctx.fill(new Path2D(strokePath(s))); }
  }
  const ro = new ResizeObserver(fit); ro.observe(cv);

  const pos = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height }; };
  const pressure = e => e.pointerType === 'pen' ? (e.pressure > 0 ? e.pressure : 0.5) : 0.5;
  const isEraser = e => tool === 'eraser' || (e.pointerType === 'pen' && (e.button === 5 || (e.buttons & 32)));

  function snapshot() { undoStack.push([strokes.slice(), raw.slice()]); if (undoStack.length > 60) undoStack.shift(); }

  function down(e) {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 5) return;
    if (e.pointerType === 'touch' && (penSeen || (e.width > PALM && e.height > PALM))) return;   // palm or resting hand
    if (active) {
      if (e.pointerType === 'pen' && active.type === 'touch') { active = null; redraw(); }   // the palm landed first: the pen wins
      else return;
    }
    if (e.pointerType === 'pen') penSeen = true;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    lastType = e.pointerType;
    const p = pos(e), erase = isEraser(e);
    active = { id: e.pointerId, type: e.pointerType, erase, points: [], rawPts: [], t0: performance.now() };
    if (erase) { snapshot(); active.erased = false; eraseAt(p); return; }
    add(p, pressure(e), e.timeStamp);
  }
  function add(p, pr, ts) {
    const pts = active.points, prev = pts[pts.length - 1];
    pts.push({ x: p.x, y: p.y, p: pr });
    active.rawPts.push({ x: Math.round(p.x), y: Math.round(p.y), t: Math.round(ts - active.t0) });
    // draw the new bit straight away; the finished stroke is redrawn as a smooth outline
    ctx.setTransform(scale(), 0, 0, scale(), 0, 0);
    ctx.strokeStyle = ctx.fillStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const r = (size / 2) * (0.5 + pr);
    if (!prev) { ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.lineWidth = r * 2; ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
  }
  function move(e) {
    if (!active || e.pointerId !== active.id) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    for (const ev of evs.length ? evs : [e]) {
      if (active.erase) eraseAt(pos(ev)); else add(pos(ev), pressure(ev), ev.timeStamp);
    }
  }
  function eraseAt(p) {
    const keep = strokes.map(s => !hitsStroke(s, p.x, p.y, ERASE_R));
    if (keep.every(Boolean)) return;
    strokes = strokes.filter((_, i) => keep[i]); raw = raw.filter((_, i) => keep[i]);
    active.erased = true; redraw();
  }
  function up(e) {
    if (!active || e.pointerId !== active.id) return;
    const a = active; active = null;
    if (a.erase) { if (!a.erased) undoStack.pop(); else { onChange(); onStroke(); } return; }
    if (!a.points.length) return;
    snapshot();
    strokes.push(makeStroke(a.points, color, size)); raw.push(a.rawPts);
    redraw(); onChange(); onStroke();
  }
  function cancel(e) { if (active && e.pointerId === active.id) { active = null; redraw(); } }

  cv.addEventListener('pointerdown', down);
  cv.addEventListener('pointermove', move);
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', cancel);
  cv.addEventListener('contextmenu', e => e.preventDefault());   // long press with a pen or finger

  return {
    get kind() { return kind; },
    setTool(t) { tool = t; el.classList.toggle('erasing', t === 'eraser'); },
    setColor(c) { color = c; tool = 'pen'; el.classList.remove('erasing'); },
    setSize(s) { size = s; },
    get tool() { return tool; }, get color() { return color; }, get size() { return size; },
    undo() { const last = undoStack.pop(); if (!last) return false; [strokes, raw] = last; redraw(); onChange(); return true; },
    clear() { if (!strokes.length) return; snapshot(); strokes = []; raw = []; redraw(); onChange(); },
    canUndo: () => undoStack.length > 0,
    isEmpty: () => strokes.length === 0,
    // the timed points of everything drawn here (loaded strokes get made-up times so they still read)
    rawStrokes: () => raw.map((r, i) => r || decodePoints(strokes[i].d).map((p, j) => ({ x: Math.round(p.x), y: Math.round(p.y), t: j * 16 }))),
    inputType: () => lastType === 'pen' ? 'stylus' : lastType === 'mouse' ? 'mouse' : 'touch',
    sketch: () => ({ w: W, h: H, strokes: strokes.slice() }),
    destroy() { ro.disconnect(); },
  };
}
