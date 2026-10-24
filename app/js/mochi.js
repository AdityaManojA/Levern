/* Mochi in the web app. A port of the prototype's Mochi v2 engine (design/prototype/mochi-engine.js),
 * adapted to the app's fixed nav bar. Same rules (art in app/mochi and app/cookie, copied by design/mochi/v3/sync.py):
 *   1. He is placed by his body: each animation's canvas has his body centre at `ax` and paws at `gy`.
 *   2. Image and position change in the same step (render), never apart.
 *   3. Nothing animates his art except his frames: no CSS animation or transition on Mochi itself.
 *   4. Mirroring is around his body; resting-pose frames and sitting end frames are never mirrored.
 *   5. Hand-offs that aren't pixel-identical get a short crossfade.
 *   6. Idles begin on the first breathing frame, so the breath never pops.
 *   7. Animations missing from the manifest are refused.
 * With reduced motion he sits still on the bar and only talks.
 * Two cats: Mochi, and Cookie, his orange twin brother (app/cookie: his own art under the same animation names).
 * Settings → Cat picks one.
 */
import MOCHI from '../mochi/manifest.js';
import COOKIE from '../cookie/manifest.js';
import { getState } from './store.js';
import { sfx } from './sound.js';
import { reduced } from './motion.js';

const CATS = { mochi: MOCHI, cookie: COOKIE };
// poses each cat's art has in a different frame: a paw raised to hold a card, dangling when picked up
const POSES = { mochi: { hold: ['wave', 3], dangle: ['stretch', 3] }, cookie: { hold: ['wave', 4], dangle: ['dangle', 1] } };
let V = MOCHI, A = V.anims, catName = 'mochi';
const has = n => Object.prototype.hasOwnProperty.call(A, n);
// small sprites elsewhere follow the nav-bar cat; with no cat on the bar they follow the setting
export const hasAnim = n => { if (!M) useCat(); return has(n); };
const baseUrl = n => V.base + 'strips/' + n + '.' + (V.ext || 'png');
// one of these names that this cat has, at random (the variants of a reaction)
const variant = (...names) => { const ok = names.filter(has); return ok[Math.floor(Math.random() * ok.length)] || names[0]; };

/* ---------- which cat ---------- */
// Settings → Cat: Mochi (stored as 'black', his coat) or Cookie. Older coats: 'ginger' (Mochi recoloured orange) is
// Cookie now; grey and brown were Mochi recoloured and are Mochi again.
export const COATS = {
  black: { label: 'Mochi', swatch: '#1E1B18' },
  cookie: { label: 'Cookie', swatch: '#E58B3A', cat: 'cookie' },
};
// Cookie's voice: the same sounds, a little lower
export const CAT_VOICE = { mochi: 1, cookie: 0.86 };
const coat = () => { const c = S().mochiColor; return c === 'cookie' || c === 'ginger' ? 'cookie' : 'black'; };
// switch to the cat the coat asks for; true when it changed
function useCat() {
  const name = COATS[coat()].cat || 'mochi';
  if (name === catName) return false;
  catName = name; V = CATS[name]; A = V.anims;
  document.documentElement.dataset.cat = name;   // CSS: the dark-mode glow is only for black Mochi
  return true;
}
export const catLabel = () => (coat() === 'cookie' ? 'Cookie' : 'Mochi');

// Strips are fetched a few at a time in idle moments, the ones on screen most often first, so switching cats
// (or starting the app) never queues dozens of big images in front of the one he needs right now.
const FIRST = ['rest', 'blink', 'walk', 'get-up-left', 'get-up-right', 'lie-down', 'sleep', 'get-up', 'wave', 'boop', 'stretch', 'startled'];
const warmed = new Map();   // url -> decode promise
// ready once loaded (or failed), and never later than 0.8 s, so nothing ever waits on a slow or paused page
const warm = u => {
  if (!warmed.has(u)) warmed.set(u, new Promise(res => {
    const im = new Image(); im.decoding = 'async';
    im.onload = im.onerror = () => res(); setTimeout(res, 800);
    im.src = u;
  }));
  return warmed.get(u);
};
let warmGen = 0;
function warmAll() {
  const gen = ++warmGen;
  const order = [...FIRST.filter(has), ...Object.keys(A).filter(n => !FIRST.includes(n))].map(n => baseUrl(n));
  const idle = window.requestIdleCallback ? f => requestIdleCallback(f, { timeout: 1500 }) : f => setTimeout(f, 60);
  const step = () => { if (gen !== warmGen) return; const batch = order.splice(0, 3); if (batch.length) Promise.all(batch.map(warm)).then(() => idle(step)); };
  idle(step);
}
// The other cat takes over only once his resting strip is ready, so the bar is never empty while it loads.
let switching = 0;
function switchCat(then) {
  const name = COATS[coat()].cat || 'mochi';
  if (name === catName) { switching++; return; }
  const ticket = ++switching, v = CATS[name];
  warm(v.base + 'strips/rest.' + (v.ext || 'png')).then(() => { if (ticket === switching && useCat()) then(); });
}
const stripUrl = n => baseUrl(n);
const SPEED = { slow: 28, normal: 50, zoomy: 95 }, SPRINT = 170, SINK = 2;
// Tempo on top of the art's own fps: reactions and idles play much slower so they read as calm,
// walking and running a little faster (stride and ground speed scale together, so his feet don't slide).
// His breathing (rest) and sleep are slowed a little too. Every Mochi animation goes through this, sprites included.
const ACT_TEMPO = 0.3, BREATH_TEMPO = 0.75, MOVE_TEMPO = 1.15;
const MOVES = new Set(['walk', 'sprint', 'sprint-stop', 'get-up-left', 'get-up-right']);
const tempo = n => (MOVES.has(n) ? MOVE_TEMPO : n === 'rest' || n === 'sleep' ? BREATH_TEMPO : ACT_TEMPO);
const fpsOf = n => A[n].fps * tempo(n);
const S = () => getState().settings;

/* ---------- small looping sprites (onboarding, tour, empty states, toasts) ---------- */
// el gets the animation as a background strip; returns stop()
export function sprite(el, name, { scale = 1, loop, fps, pause = 0, frame } = {}) {
  if (!M) useCat();
  const a = A[name]; if (!a) return () => {};
  el.style.width = a.w * scale + 'px'; el.style.height = a.h * scale + 'px';
  el.style.backgroundImage = `url("${stripUrl(name)}")`;
  el.style.backgroundSize = `${a.w * a.frames * scale}px ${a.h * scale}px`;
  el.style.backgroundRepeat = 'no-repeat';
  const show = i => { el.style.backgroundPosition = `${-(i - 1) * a.w * scale}px 0`; };
  if (frame || reduced()) { show(frame || 1); return () => {}; }
  const [l0, l1] = loop || a.loop || [1, a.frames];
  let i = 1, wait = 0; show(1);
  const t = setInterval(() => {
    if (wait > 0) { wait -= 1000 / (fps || fpsOf(name)); return; }
    i = i >= l1 ? l0 : i + 1; show(i);
    if (i === l1 && pause) wait = pause;
  }, 1000 / (fps || fpsOf(name)));
  return () => clearInterval(t);
}
// rest with an occasional blink, for portraits
export function portrait(el, scale = 1) {
  let stop = sprite(el, 'rest', { scale }), t;
  if (reduced()) return () => stop();
  const blink = () => { t = setTimeout(() => { stop(); stop = sprite(el, 'blink', { scale, loop: [1, A.blink.frames] }); setTimeout(() => { stop(); stop = sprite(el, 'rest', { scale }); blink(); }, 1000 * A.blink.frames / fpsOf('blink')); }, 2500 + Math.random() * 3000); };
  blink();
  return () => { clearTimeout(t); stop(); };
}

/* ---------- the Mochi on the nav bar ---------- */
let M = null;
export function createMochi(env) {
  const el = document.createElement('div');
  el.className = 'mochi'; el.id = 'mochi'; el.setAttribute('role', 'button'); el.setAttribute('aria-label', `${catLabel()} the cat. Tap to boop.`); el.tabIndex = 0;
  el.innerHTML = '<div class="flip"><div class="act"></div></div>';
  const flip = el.querySelector('.flip'), act = el.querySelector('.act');
  const bub = document.createElement('div'); bub.className = 'mbubble'; bub.setAttribute('aria-live', 'polite');
  // the reminder he holds up: floats just above his raised paw and bobs gently until it's opened
  const card = document.createElement('button'); card.type = 'button'; card.className = 'mcard'; card.hidden = true;
  card.innerHTML = '<span class="mcard-in"><span class="mcard-bell" aria-hidden="true"></span><span class="mcard-t"></span><b class="mcard-n"></b></span>';
  document.body.append(el, bub, card);
  useCat();
  warmAll();

  M = { cx: innerWidth / 2 + 120, dir: -1, anim: 'rest', fi: 1, timer: null, state: 'idle', perch: 'nav', busy: false, target: 0, onArrive: null, next: 0,
    lastActive: Date.now(), clicks: [], lastTap: 0, annoyedUntil: 0, sulkTaps: 0, sulkNeed: 2, sulkT: 0, bubbleUntil: 0, pending: null, asleep: false, held: false, slide: null,
    lift: 0, liftTo: 0, sprint: false, p1Seen: 0, homeVisits: 0, hidden: false, holding: null };

  /* drawing */
  const nav = () => document.getElementById('nav');
  const sheetEl = () => document.getElementById('sheet');
  function groundY() { return M.perch === 'sheet' ? sheetEl().getBoundingClientRect().top : nav().getBoundingClientRect().top + SINK; }
  // Where his body centre may go. His picture (from its body centre out to its paws/tail) always stays inside
  // the screen with a small margin, and on the bar he sits a little in from the bar's ends, so he never runs off.
  const EDGE = 6, BAR_INSET = 26;
  function bounds() {
    const a = A[M.anim] || A.rest;
    const left = a.ax + EDGE, right = a.w - a.ax + EDGE;   // picture room on each side of the body centre
    const vw = document.documentElement.clientWidth;
    if (M.perch === 'sheet') { const r = sheetEl().getBoundingClientRect(); return [Math.max(left, r.right - 130), Math.min(vw - right, r.right - 70)]; }
    const r = nav().getBoundingClientRect();
    return [Math.max(left, r.left + BAR_INSET), Math.min(vw - right, r.right - BAR_INSET)];
  }
  const addX = () => { const a = document.querySelector('.navadd .add'); if (!a) return innerWidth / 2; const r = a.getBoundingClientRect(); return r.left + r.width / 2; };
  // Where a fixed element at (0, 0) actually is, in the same coordinates as getBoundingClientRect.
  // Usually (0, 0); while the page is pinch-zoomed or browser-zoomed on a phone it isn't, and
  // placing Mochi relative to it keeps him on the bar instead of drifting over the list.
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;pointer-events:none;visibility:hidden';
  document.body.append(probe);
  const origin = () => { const r = probe.getBoundingClientRect(); return { x: r.left, y: r.top }; };
  const vw = () => document.documentElement.clientWidth;
  const mirrored = (a, fi) => a.face === 'R' && !a.lock[fi - 1] && !(a.noflip && a.noflip.includes(fi)) && M.dir < 0;
  // His place along the bar is kept as a share of its width: when the bar moves or changes size under him
  // (zooming in or out, turning the phone, resizing the window), he stays over the same spot on it instead
  // of keeping his old screen position and ending up somewhere else along the bar. Checked on every draw.
  let barWas = null;
  function followBar() {
    const r = M.perch === 'nav' ? nav()?.getBoundingClientRect() : null;
    if (!r || !r.width) { barWas = null; return; }
    if (barWas && M.state !== 'drag' && (Math.abs(r.left - barWas.left) > 0.5 || Math.abs(r.width - barWas.width) > 0.5)) {
      const map = x => r.left + (x - barWas.left) / barWas.width * r.width;
      M.cx = map(M.cx); M.target = map(M.target);
      if (M.slide) { M.slide.from = map(M.slide.from); M.slide.to = map(M.slide.to); }
    }
    barWas = { left: r.left, width: r.width };
  }

  let shown = '';
  function render() {
    followBar();
    const a = A[M.anim];
    if (shown !== M.anim) { act.style.backgroundImage = `url("${stripUrl(M.anim)}")`; act.style.backgroundSize = `${a.w * a.frames}px ${a.h}px`; shown = M.anim; }
    act.style.backgroundPosition = `${-(M.fi - 1) * a.w}px 0`;
    el.style.width = a.w + 'px'; el.style.height = a.h + 'px';
    let y = groundY() - a.gy;
    if (M.perch === 'sheet' && a.edge != null) y = sheetEl().getBoundingClientRect().top - a.edge;
    y += M.lift;
    const o = origin();
    el.style.transform = `translate(${M.cx - a.ax - o.x}px, ${y - o.y}px)`;
    flip.style.transform = mirrored(a, M.fi) ? 'scaleX(-1)' : '';
    // On the bar, anything drawn below his paws (a hanging tail, a flop) is cut off, so he never covers the tab icons and labels
    el.style.clipPath = (M.perch === 'sheet' && a.edge != null) ? `inset(0 0 ${Math.max(0, a.h - a.edge + M.lift)}px 0)`
      : (M.perch === 'nav' && !M.held && !M.lift) ? `inset(0 0 ${Math.max(0, a.h - a.gy)}px 0)` : '';
    if (M.holding && !M.hidden) {
      const cw = card.offsetWidth || 150, ch = card.offsetHeight || 40;
      const pawX = M.cx + (mirrored(a, M.fi) ? -20 : 20), top = y + a.gy - V.sit + 12 - ch;   // resting on his raised paw
      card.style.transform = `translate(${Math.round(Math.max(8, Math.min(vw() - 8 - cw, pawX - cw / 2)) - o.x)}px, ${Math.round(top - o.y)}px)`;
    }
    if (Date.now() < M.bubbleUntil && !M.holding) {
      const w = bub.offsetWidth, h = bub.offsetHeight || 26, by = y + a.gy - V.sit - 44;
      // inside the app's own column (the nav bar's width), never past the screen edge
      const bar = nav()?.getBoundingClientRect(), L = Math.max(8, bar?.width ? bar.left : 8), R = Math.min(vw() - 8, bar?.width ? bar.right : vw() - 8);
      let bx = Math.max(L, Math.min(R - w, M.cx - w / 2));
      // never cover a red count badge (Quests tab, bell)
      for (const b of document.querySelectorAll('[data-rcount]:not([hidden])')) {
        const r = b.getBoundingClientRect();
        if (r.width && bx < r.right + 6 && bx + w > r.left - 6 && by < r.bottom + 6 && by + h > r.top - 6) bx = r.left - 6 - w > 8 ? r.left - 6 - w : r.right + 6;
      }
      bub.style.transform = `translate(${bx - o.x}px, ${by - o.y}px)`;
    } else bub.classList.remove('show');
  }
  let ghostEl = null;
  function ghost() {
    if (!shown || M.sprint) return;
    ghostEl?.remove();
    const g = el.cloneNode(true); g.removeAttribute('id'); g.className = 'mochi ghost'; g.removeAttribute('tabindex');
    el.after(g); ghostEl = g;
    requestAnimationFrame(() => { g.style.opacity = '0'; });
    setTimeout(() => { g.remove(); if (ghostEl === g) ghostEl = null; }, 170);
  }
  const identical = (a1, f1, a2, f2) => !!(A[a1].exact?.[f1 - 1] && A[a2].exact?.[f2 - 1]);

  /* playback */
  const stop = () => { clearInterval(M.timer); M.timer = null; };
  function play(name, o = {}) {
    if (!has(name)) { console.warn(`Mochi: no animation "${name}"`); return false; }
    const a = A[name], from = o.from || 1, to = o.to || a.frames, step = to >= from ? 1 : -1;
    if (o.dir) M.dir = o.dir;
    const prev = M.anim, prevFi = M.fi;
    stop();
    if (prev !== name && !identical(prev, prevFi, name, from)) ghost();
    M.anim = name; M.fi = from; render();
    if (reduced() && name !== 'rest') { M.fi = to; render(); if (!o.loop && !o.hold && o.then) setTimeout(o.then, 900); return true; }
    let f = from;
    const fps = o.fps || fpsOf(name);
    M.timer = setInterval(() => {
      if (o.onFrame && o.onFrame(f)) return;
      if (f !== to) { f += step; M.fi = f; render(); return; }
      if (o.loop) {
        stop();
        // rev: the loop runs backwards (the Michael Jackson dance)
        let g = o.rev ? o.loop[1] : o.loop[0]; M.fi = g; render();
        M.timer = setInterval(() => {
          if (o.onFrame && o.onFrame(g)) return;
          g = o.rev ? (g <= o.loop[0] ? o.loop[1] : g - 1) : (g >= o.loop[1] ? o.loop[0] : g + 1);
          M.fi = g; render();
        }, 1000 / (o.loopFps || fps));
        return;
      }
      if (o.hold) return;
      stop(); o.then && o.then();
    }, 1000 / fps);
    return true;
  }
  function goRest() {
    M.busy = false; M.state = 'idle'; M.dir = -1; M.sprint = false; M.asleep = false; M.held = false;
    if (reduced()) { stop(); M.anim = 'rest'; M.fi = 1; render(); return; }
    play('rest', { loop: [1, A.rest.frames], onFrame: f => {
      if (f === A.rest.frames && M.pending) { const p = M.pending; M.pending = null; strike(p.name, p.text, p.mad); return true; }
      return false;
    } });
  }
  const resting = () => M.anim === 'rest' && !M.busy;
  function say(text, ms = 1300, mad = false) {
    if (!text || M.hidden) return;
    bub.textContent = text; bub.classList.toggle('mad', !!mad); bub.classList.add('show');
    M.bubbleUntil = Date.now() + ms;
  }
  function strike(name, text, mad) {
    if (!has(name) || M.held) return false;
    M.busy = true; M.asleep = false; M.state = 'idle'; M.pending = null;
    if (text) say(text, 1500, mad);
    play(name, { dir: A[name].face === 'R' ? M.dir : -1, then: () => { goRest(); schedule(2, 4); } });
    return true;
  }
  const idle = (name, text) => { if (has(name) && resting() && !M.pending) M.pending = { name, text }; };

  /* moving */
  const schedule = (a, b) => { M.next = performance.now() + (a + Math.random() * (b - a)) * 1000; };
  function randomX() {
    const [a, b] = bounds();
    for (let i = 0; i < 12; i++) { const x = a + Math.random() * (b - a); if (Math.abs(x - addX()) > 50 && Math.abs(x - M.cx) > 40) return x; }
    return a;
  }
  const walkFps = () => Math.max(5, Math.round(fpsOf('walk') * SPEED[S().speed || 'slow'] / SPEED.normal));
  function walkTo(x, opts = {}) {
    const [lo, hi] = bounds(); x = Math.max(lo, Math.min(hi, x));
    const d = x >= M.cx ? 1 : -1;
    // the Michael Jackson dance travels the way he's NOT facing: the art faces the other way and the steps run backwards
    const moon = !!opts.moon && !opts.sprint, face = moon ? -d : d;
    Object.assign(M, { target: x, busy: true, state: 'prep', asleep: false, pending: null, slide: null, sprint: !!opts.sprint, dir: face, moon });
    M.getUp = face > 0 ? 'get-up-right' : 'get-up-left';
    play(M.getUp, { dir: face, then: () => {
      M.state = 'walk'; M.busy = false;
      let stepsLeft = M.sprint ? 6 : opts.steps ? 8 : 0;   // random wandering is silent
      const paws = beats => f => { if (stepsLeft > 0 && beats.includes(f)) { stepsLeft--; voice('step', { vol: M.sprint ? 1.2 : 1 }); } return false; };
      if (M.sprint) { say('zoomies!', 900); play('sprint', { dir: face, loop: A.sprint.loop, onFrame: paws([2, 5]) }); }
      else if (moon) {
        say('the Michael Jackson dance!', 1800);
        play('walk', { dir: face, from: A.walk.frames, to: A.walk.loop[0], rev: true, loop: A.walk.loop, fps: walkFps(), loopFps: walkFps(), onFrame: paws([3, 9]) });
      }
      else play('walk', { dir: face, loop: A.walk.loop, fps: walkFps(), loopFps: walkFps(), onFrame: paws([3, 9]) });
    } });
  }
  function arrive() {
    M.state = 'prep'; M.busy = true;
    const done = () => { if (M.onArrive) { const f = M.onArrive; M.onArrive = null; f(); } else { goRest(); schedule(2, 5); } };
    if (M.sprint) { M.sprint = false; play('sprint-stop', { dir: M.dir, then: done }); return; }
    const g = M.getUp || (M.dir > 0 ? 'get-up-right' : 'get-up-left');
    play(g, { dir: M.dir, from: A[g].frames, to: 1, then: done });
  }

  /* holding a reminder */
  const HOLD = { get name() { return POSES[catName].hold[0]; }, get frame() { return POSES[catName].hold[1]; } };   // paw raised high, nothing drawn in it
  function holdPose(fromStart) {
    stop(); stopLook();
    Object.assign(M, { busy: true, pending: null, state: 'hold', asleep: false });
    if (fromStart && !reduced()) play(HOLD.name, { from: 1, to: HOLD.frame, hold: true });
    else { M.anim = HOLD.name; M.fi = HOLD.frame; render(); }
  }
  function showCard(info, isNew) {
    card.querySelector('.mcard-t').textContent = info.count > 1 ? `${info.count} reminders` : info.title;
    card.querySelector('.mcard-n').textContent = info.count > 1 ? '' : '';
    card.setAttribute('aria-label', (info.count > 1 ? `${info.count} reminders due` : `Reminder: ${info.title}`) + '. Open notifications.');
    const appear = card.hidden;
    card.hidden = false;
    if (!reduced() && (appear || isNew)) card.querySelector('.mcard-in').animate(appear
      ? [{ opacity: 0, transform: 'translateY(-14px) scale(.85)' }, { opacity: 1, transform: 'none' }]
      : [{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: .4 }, { transform: 'scale(1)' }], { duration: appear ? 520 : 380, easing: 'cubic-bezier(.22,1,.36,1)' });
    card.classList.toggle('still', reduced());
  }
  card.addEventListener('click', e => { e.stopPropagation(); env.onHoldTap && env.onHoldTap(); });

  /* deciding */
  // Idles and tap reactions are drawn from weighted pools, never repeating any of the last few,
  // so he doesn't fall into a visible cycle. Seamless ones (start and end on the resting pose) are favoured.
  const pool = list => list.filter(([n]) => has(n)).map(([n, w]) => { const j = A[n].join || []; return [n, j[0] === 'R' && j[1] === 'R' ? w * 1.5 : w]; });
  // every calm or playful animation of the set takes part; weights say how often each comes round in a deck
  let IDLES, TAPS;
  function rebuildPools() {
    IDLES = pool([['ear-twitch', 3], ['look-around', 3], ['yawn', 2], ['sneeze', 2], ['sniff', 2], ['face-wash', 2], ['groom', 2], ['scratch', 2], ['spot', 2],
      ['stretch', 2], ['back-stretch', 2], ['tail-wrap', 2], ['look-back', 2], ['sitting-pretty', 2], ['happy-wiggle', 2], ['confused', 2], ['eat', 2],
      ['tail-chase', 2], ['cursor-swipe', 2], ['follow-finger', 2], ['excited', 2], ['sad', 1], ['wave', 2], ['heart-eyes', 2], ['startled', 1.5],
      ['surprised', 1.5], ['suspicious', 1.5], ['celebrate', 1.5], ['victory', 1], ['happy-spin', 1.5],
      ['tail-balance', 2], ['curious-sniff', 1.5], ['seated-turn', 1.5], ['play-bow', 1.5], ['roll', 1.5], ['tail-puff', 1.5], ['relax', 1.5],
      ['shake-off', 1], ['dry-off', 1], ['side-roll', 1.5], ['play-flip', 1.5],
      ['loaf', 1.5], ['yawn-big', 1.5], ['tail-sway', 2], ['scroll-look', 1.5], ['corner-idle', 1.5], ['suspicious-long', 1], ['button-big', 1], ['wipe-big', 1],
      ['chasing-butterfly', 1]]);
    TAPS = pool([['boop', 4], ['happy-wiggle', 2], ['excited', 2], ['confused', 2], ['wave', 2], ['surprised', 2], ['cursor-swipe', 1.5],
      ['sitting-pretty', 1.5], ['sneeze', 1], ['celebrate', 2], ['heart-eyes', 2], ['startled', 1.5], ['happy-spin', 1.5], ['suspicious', 1], ['victory', 1],
      ['belly-flop', 2], ['startled-jump', 2], ['angry-stomp', 1], ['scared', 1.5], ['play-pounce', 1.5], ['shake-off', 1],
      ['boop-heart', 2.5], ['squish', 1.5], ['toast-cheer', 1.5]]);
  }
  rebuildPools();
  const TAP_LINES = { boop: ['boop', 'mrp!', ':3'], 'happy-wiggle': ['♪', 'hehe'], excited: ['!!', 'ooh!'], confused: ['?', 'huh?'], wave: ['hi!', 'hello!'],
    surprised: ['!', 'oh!'], 'cursor-swipe': ['gotcha', 'swipe!'], 'sitting-pretty': ['ta-da'], sneeze: ['achoo!'], celebrate: ['yay!'], 'heart-eyes': ['♥', 'purr…'],
    'boop-heart': ['♥', 'boop!'], squish: ['squish!', 'mrp'], 'toast-cheer': ['yay!'] };
  const recent = [];
  // A shuffled deck per pool: each animation comes round once (more often if weighted) before any repeats,
  // so the mix is always varied instead of falling back on the same few.
  const decks = new Map();
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  function pickFrom(list, avoid = 3) {
    let deck = decks.get(list);
    if (!deck || !deck.length) { deck = shuffle(list.flatMap(([n, w]) => Array(Math.max(1, Math.round(w))).fill(n))); decks.set(list, deck); }
    const blocked = new Set(recent.slice(-avoid));
    let i = deck.findIndex(n => !blocked.has(n));
    if (i < 0) i = 0;   // every card left was just played: take the first anyway
    const [n] = deck.splice(i, 1);
    recent.push(n); if (recent.length > 8) recent.shift();
    return n;
  }
  const pickIdle = () => pickFrom(IDLES, 3);
  const canMove = () => !reduced() && !M.hidden && !env.paused();
  function decide() {
    if (M.busy || M.held || M.asleep || M.state !== 'idle' || M.perch !== 'nav' || !canMove()) return;
    if (!S().roam) { const [, b] = bounds(); if (Math.abs(M.cx - b) > 4) { walkTo(b, { steps: true }); return; } schedule(5, 9); return; }
    const page = env.current();
    const walkP = { home: 0.45, quests: 0.6, calendar: 0.35, focus: 0.1, stats: 0.3, settings: 0.15 }[page] ?? 0.3;
    if (Math.random() < walkP) { const x = randomX(); walkTo(x, { sprint: page !== 'focus' && Math.abs(x - M.cx) > 130 && Math.random() < 0.15, moon: page !== 'focus' && Math.random() < 0.2 }); }
    else schedule(3, 7);
  }
  const sleepAfter = () => (env.current() === 'focus' ? 9000 : 90000);   // plenty of idling before a nap
  // idle beat: a random hold (sometimes long) between idles, so the rhythm never settles into a loop
  (function idleLoop() {
    let hold = 3000 + Math.random() * 5000;
    if (Math.random() < 0.15) hold += 5000 + Math.random() * 6000;   // now and then he just sits
    setTimeout(() => {
      idleLoop();
      if (M.state !== 'idle' || M.busy || M.held || M.asleep || M.perch !== 'nav' || !canMove()) return;
      if (Date.now() - M.lastActive > sleepAfter()) return fallAsleep();
      if (!resting() || M.pending || !S().roam) return;
      idle(pickIdle());
    }, hold);
  })();
  (function blinkLoop() { if (resting() && !M.pending && M.perch === 'nav' && canMove()) idle('blink'); setTimeout(blinkLoop, 3200 + Math.random() * 3200); })();

  function fallAsleep() {
    if (M.busy || M.held || M.asleep) return;
    M.asleep = true; M.busy = true; M.state = 'sleep';
    M.melted = has('melt') && has('melt-up') && Math.random() < 0.4;   // now and then he melts into a puddle instead
    if (M.melted) { play('melt', { loop: A.melt.loop }); return; }
    play('lie-down', { then: () => { if (M.asleep) play('sleep', { loop: A.sleep.loop }); } });
  }
  function wakeUp(text) {
    if (!M.asleep) return;
    M.asleep = false; M.busy = true; if (text) say(text, 900);
    const up = M.melted && M.anim === 'melt' ? 'melt-up' : 'get-up';
    M.melted = false;
    play(up, { then: () => { goRest(); schedule(2, 4); } });
  }

  /* touch */
  // his voice: a plain meow or the signature "mrrp" on taps, a "hey" meow for surprises and reminders, a grumpy one
  // when he's getting annoyed and an angry one when he's had enough, and a squeak when he's picked up
  const voice = (kind, o = {}) => sfx(kind, { ...o, rate: (o.rate || 1) * CAT_VOICE[catName] });
  // taps: his voice on every second tap at most, and never within 1.5 s of the last one, so it never gets spammy
  let tapCount = 0, lastTapVoice = 0;
  const tapVoice = (kind, o) => { const now = Date.now(); if (tapCount % 2 !== 0 || now - lastTapVoice < 1500) return; lastTapVoice = now; voice(kind, o); };
  const AFFECTION = new Set(['boop', 'happy-wiggle', 'heart-eyes', 'wave', 'sitting-pretty', 'celebrate', 'excited', 'cursor-swipe']);
  // A sulk is short: he gets over it after 3–4 s, or sooner if you keep tapping (2–3 more taps).
  function getAnnoyed() {
    M.busy = true; M.clicks = []; M.state = 'sulk';
    say('Hmph! Enough.', 1600, true); voice('angry');
    M.annoyedUntil = Date.now() + 6000; M.sulkTaps = 0; M.sulkNeed = 2 + Math.floor(Math.random() * 2);
    clearTimeout(M.sulkT); M.sulkT = setTimeout(forgive, 3000 + Math.random() * 1000);
    const away = variant('ignore', 'sulk');
    play(variant('grumpy', 'huff'), { then: () => { if (M.state === 'sulk') play(away, { hold: true, to: A[away].hold || A[away].frames }); } });
  }
  function forgive() {
    clearTimeout(M.sulkT);
    if (M.state !== 'sulk') { M.annoyedUntil = 0; return; }   // something else already moved him on
    M.state = 'idle'; M.annoyedUntil = 0; M.clicks = [];
    say(['…fine.', 'hmm.', 'whatever.'][Math.floor(Math.random() * 3)], 1400);
    const back = () => { goRest(); schedule(3, 6); };
    if ((M.anim === 'ignore' || M.anim === 'sulk') && M.fi > 1) play(M.anim, { from: M.fi, to: 1, then: back }); else back();
  }
  function tap(e) {
    const now = Date.now(); M.lastActive = now;
    if (env.onTap && env.onTap()) return;   // the tour's last step finishes on a tap
    tapCount++;
    if (M.holding) { env.onHoldTap && env.onHoldTap(); return; }
    if (M.state === 'sulk') { if (++M.sulkTaps >= M.sulkNeed) forgive(); else say('…', 800, true); return; }
    if (now < M.annoyedUntil) { say('…', 800, true); return; }
    if (M.asleep) { wakeUp('!!'); return; }
    if (M.state === 'walk' || M.state === 'prep' || M.perch !== 'nav') return;
    M.clicks = M.clicks.filter(t => now - t < 6000); M.clicks.push(now);
    const n = M.clicks.length, limit = S().annoy || 5;
    if (n > limit) return getAnnoyed();
    M.busy = false;
    if (n === limit - 1) { tapVoice('grumpy', { vol: 0.7, rate: 1.1 }); return strike(variant('stomp', 'stomp-big'), 'hey!', true); }
    if (n === limit) { tapVoice('grumpy'); return strike('grumpy', 'stop it…', true); }
    if (now - M.lastTap < 320) { M.lastTap = 0; tapVoice('hey', { rate: 1.12 }); return has('squish') ? strike('squish', 'squish!') : strike('startled', 'eep!'); }
    M.lastTap = now;
    const r = el.getBoundingClientRect(), a = A[M.anim];
    const headLine = r.top + (a.gy - V.sit * 0.55) * (r.height / a.h);
    if (e && e.clientY && e.clientY < headLine && Math.random() < 0.6 && recent[recent.length - 1] !== 'head-bonk') { recent.push('head-bonk'); tapVoice('hey', { vol: 0.7, rate: 1.2 }); return strike('head-bonk', Math.random() < 0.5 ? 'ow!' : ''); }
    const pick = pickFrom(TAPS, 2), lines = TAP_LINES[pick];
    if (pick === 'confused' || pick === 'surprised') tapVoice('hey', { vol: 0.8 });
    else tapVoice(AFFECTION.has(pick) && Math.random() < 0.5 ? 'mrrp' : 'meow');
    strike(pick, lines && Math.random() < 0.55 ? lines[Math.floor(Math.random() * lines.length)] : '');
  }
  // pointer on Mochi: a tap (moved < 6px), a long press (heart eyes while held), or a drag (pick him up)
  const DRAG_START = 6, GRAVITY = 2600;
  let press = null;
  function endHeld() {
    if (!M.held) return;
    M.held = false; M.lastActive = Date.now();
    const a = A['heart-eyes'], l = a.loop || [1, a.frames]; play('heart-eyes', { from: l[1], to: a.frames, then: () => { goRest(); schedule(2, 4); } });
  }
  function startDrag(e) {
    clearTimeout(press.t);
    stop(); stopLook();
    Object.assign(M, { held: false, busy: true, pending: null, slide: null, state: 'drag', asleep: false, perch: 'nav', fall: null });
    // dangling: the long stretch frame, held by the scruff
    const [dn, df] = POSES[catName].dangle;
    play(dn, { from: df, to: df, hold: true });
    M.dragTo = { x: e.clientX, y: e.clientY, vx: 0, vy: 0, t: performance.now() };
    press.drag = true;
    document.body.classList.add('mochi-held');   // no page scroll while he's in the hand
    voice('pickup'); say(['wheee', 'hey!', 'mrrp?!'][Math.floor(Math.random() * 3)], 1100);
  }
  function drop() {
    const d = M.dragTo; M.dragTo = null;
    env.onDrop && env.onDrop();   // the tour's drag step finishes once he's let go
    M.state = 'fall';
    M.fall = { vx: Math.max(-600, Math.min(600, d.vx)), vy: Math.max(-900, Math.min(600, d.vy)) };
    if (reduced()) { M.lift = 0; land(); }
  }
  function land() {
    M.fall = null; M.lift = 0; M.liftTo = 0;
    const [a, b] = bounds(); M.cx = Math.max(a, Math.min(b, M.cx));
    voice('land');
    if (!reduced()) act.animate([{ transform: 'scale(1.14, .82)' }, { transform: 'scale(.96, 1.05)', offset: .55 }, { transform: 'none' }], { duration: 320, easing: 'ease-out' });
    M.lastActive = Date.now();
    M.state = 'idle'; M.busy = true;
    if (!M.holding) say(['oof!', 'mrp.', 'again?', '*lands*'][Math.floor(Math.random() * 4)], 1100);
    // lands crouched (startled frames 4–6 end on the resting pose); still holding a reminder? paw back up
    play('startled', { from: 4, to: A.startled.frames, then: () => { if (M.holding) holdPose(true); else { goRest(); schedule(2.5, 5); } } });
  }
  el.addEventListener('pointerdown', e => {
    e.stopPropagation();
    if (e.button > 0 || M.perch !== 'nav' || M.state === 'fall') return;
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    press = { x: e.clientX, y: e.clientY, id: e.pointerId, drag: false, t: null };
    if (Date.now() < M.annoyedUntil) return;
    press.t = setTimeout(() => {
      if (!press || press.drag || M.state === 'walk' || M.state === 'prep' || M.asleep || M.holding) return;
      Object.assign(M, { held: true, busy: true, pending: null, slide: null });
      const a = A['heart-eyes'], l = a.loop || [1, a.frames]; play('heart-eyes', { to: l[1], loop: l }); voice('mrrp', { rate: 0.95 }); say('purr…', 1400);
      press.t = setTimeout(endHeld, 6000);   // never loops forever
    }, 450);
  });
  document.addEventListener('pointermove', e => {
    if (!press || e.pointerId !== press.id) return;
    if (!press.drag) {
      if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < DRAG_START || Date.now() < M.annoyedUntil) return;
      startDrag(e);
    }
    const d = M.dragTo, now = performance.now(), dt = Math.max(1, now - d.t) / 1000;
    d.vx = d.vx * 0.6 + ((e.clientX - d.x) / dt) * 0.4; d.vy = d.vy * 0.6 + ((e.clientY - d.y) / dt) * 0.4;
    d.x = e.clientX; d.y = e.clientY; d.t = now;
  });
  const release = (e, cancelled) => {
    if (!press || (e && e.pointerId !== press.id)) return;
    const p = press; press = null; clearTimeout(p.t);
    document.body.classList.remove('mochi-held');
    if (p.drag) { drop(); return; }
    if (M.held) { endHeld(); return; }
    if (!cancelled) tap(e);
  };
  // Safari and Brave don't keep pointer capture reliably on touch, so the press follows the finger
  // on the whole page. Losing capture no longer drops him: only the finger lifting does.
  document.addEventListener('pointerup', e => release(e, false));
  document.addEventListener('pointercancel', e => release(e, true));
  // phones: no long-press callout, context menu or native image drag fighting the pickup
  el.addEventListener('contextmenu', e => e.preventDefault());
  el.addEventListener('dragstart', e => e.preventDefault());
  el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } });
  el.addEventListener('click', e => e.stopPropagation());

  /* pointer play (desktop) */
  const PLAY = { flips: [], lastX: null, lastSign: 0, stillT: null, lastPlay: 0, lookT: null, look: 1, lookTarget: 1, lastMove: 0 };
  function slideTo(x, ms) { const [a, b] = bounds(); M.slide = { from: M.cx, to: Math.max(a, Math.min(b, x)), t0: performance.now(), ms }; }
  function playWith(kind, dx) {
    if (Date.now() - PLAY.lastPlay < 4000) return;
    stopLook(); PLAY.lastPlay = Date.now(); PLAY.flips = [];
    M.busy = false; M.dir = dx >= 0 ? 1 : -1;
    const reach = Math.sign(dx) * Math.min(Math.abs(dx) - 26, kind === 'pounce' ? 70 : 50);
    if (Math.abs(reach) > 4) slideTo(M.cx + reach, 1000 * A[kind].frames / fpsOf(kind) * 0.7);
    strike(kind, kind === 'pounce' ? 'gotcha!' : '');
  }
  function stepLook() {
    if (M.anim !== 'look-scrub' || M.busy) { stopLook(); return; }
    if (PLAY.look !== PLAY.lookTarget) { PLAY.look += Math.sign(PLAY.lookTarget - PLAY.look); M.fi = PLAY.look; render(); }
    else if (Date.now() - PLAY.lastMove > 2400) { PLAY.lookTarget = 1; if (PLAY.look === 1) { stopLook(); goRest(); schedule(2, 4); } }
  }
  function stopLook() { clearInterval(PLAY.lookT); PLAY.lookT = null; }
  document.addEventListener('pointermove', e => {
    M.lastActive = Date.now();
    if (e.pointerType !== 'mouse' || M.state !== 'idle' || M.held || M.asleep || M.perch !== 'nav' || !canMove()) return;
    if (!(resting() || M.anim === 'look-scrub')) return;
    const r = el.getBoundingClientRect(), dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2), now = Date.now();
    if (PLAY.lastX !== null && Math.abs(dx) < 200 && Math.abs(dy) < 120) {
      const mv = e.clientX - PLAY.lastX, sg = Math.sign(mv);
      if (Math.abs(mv) > 3 && sg !== PLAY.lastSign) { PLAY.flips.push(now); PLAY.lastSign = sg; }
      PLAY.flips = PLAY.flips.filter(t => now - t < 1000);
      if (PLAY.flips.length >= 4) { PLAY.lastX = e.clientX; playWith('chase', dx); return; }
    }
    PLAY.lastX = e.clientX;
    clearTimeout(PLAY.stillT);
    if (Math.abs(dx) > 50 && Math.abs(dx) < 170 && dy > -20 && dy < 60) PLAY.stillT = setTimeout(() => { if ((resting() || M.anim === 'look-scrub') && M.state === 'idle' && !M.held) playWith('pounce', dx); }, 900);
    // His eyes follow the pointer anywhere on the screen. The look-scrub frames look left, up, up-right and right,
    // so the frame comes from the direction of the pointer seen from his head (near the top of his picture).
    PLAY.lastMove = now;
    const hx = e.clientX - (r.left + r.width / 2), hy = (r.top + r.height * 0.3) - e.clientY;   // hy > 0: pointer above his head
    const ang = Math.atan2(hy, hx) * 180 / Math.PI;   // 0 right, 90 straight up, 180 left
    PLAY.lookTarget = hy <= 0 ? (hx < 0 ? 1 : 4) : ang > 115 ? 1 : ang > 72 ? 2 : ang > 30 ? 3 : 4;
    if (M.anim !== 'look-scrub') { if (M.pending) return; stop(); PLAY.look = 1; play('look-scrub', { hold: true, to: 1 }); }
    if (!PLAY.lookT) PLAY.lookT = setInterval(stepLook, 110);
  });
  document.addEventListener('pointerdown', () => { M.lastActive = Date.now(); if (M.asleep && !M.busy && env.current() !== 'focus') wakeUp(); });

  /* main loop */
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    followBar();   // before he moves this frame, so a walk continues along the bar as it is now
    if (M.state === 'drag' || M.state === 'fall') { /* positioned below */ }
    else if (M.state === 'walk' && !M.held) {
      // the bar can move under him (zoom, resize, the sheet): keep the target and his spot on it, every frame
      const [lo, hi] = bounds();
      M.target = Math.max(lo, Math.min(hi, M.target));
      const sp = (M.sprint ? SPRINT : SPEED[S().speed || 'slow']) * MOVE_TEMPO, dx = M.target - M.cx;
      if (Math.abs(dx) < 1.5) { M.cx = M.target; arrive(); }
      else {
        M.cx = Math.max(lo, Math.min(hi, M.cx + Math.sign(dx) * Math.min(Math.abs(dx), sp * dt)));
        // a normal walk faces the way it goes, so his steps and his feet always agree
        if (!M.moon) M.dir = Math.sign(dx);
      }
    } else if (now > M.next) decide();
    if (M.slide) {
      const k = Math.min(1, (now - M.slide.t0) / M.slide.ms), ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      M.cx = M.slide.from + (M.slide.to - M.slide.from) * ease; if (k >= 1) M.slide = null;
    }
    if (M.state === 'drag' && M.dragTo) {
      const a = A[M.anim];
      // held: picture stays inside the app's own column (on a wide screen, the page around it is not his to walk on)
      { const a = A[M.anim] || A.rest, col = document.querySelector('.app')?.getBoundingClientRect();
        const L = col ? Math.max(0, col.left) : 0, R = col ? Math.min(document.documentElement.clientWidth, col.right) : document.documentElement.clientWidth;
        M.cx = Math.max(L + a.ax + EDGE, Math.min(R - (a.w - a.ax) - EDGE, M.dragTo.x)); }
      // held: his head follows the finger, but never lower than where he sits on the bar (lift 0) and never above the screen top
      const restTop = groundY() - a.gy;
      M.lift = Math.max(8 - restTop, Math.min(0, (M.dragTo.y - 12) - restTop));
      M.liftTo = M.lift;
    } else if (M.state === 'fall' && M.fall) {
      M.fall.vy += GRAVITY * dt; M.lift += M.fall.vy * dt;
      M.cx += M.fall.vx * dt; M.fall.vx *= 0.96;
      const [lo, hi] = bounds();
      if (M.cx < lo) { M.cx = lo; M.fall.vx = Math.abs(M.fall.vx) * 0.3; } else if (M.cx > hi) { M.cx = hi; M.fall.vx = -Math.abs(M.fall.vx) * 0.3; }
      M.liftTo = M.lift;
      if (M.lift >= 0) land();
    }
    if (M.lift !== M.liftTo) { const d = M.liftTo - M.lift; M.lift = Math.abs(d) < 0.5 ? M.liftTo : M.lift + d * Math.min(1, dt * (M.liftRate || 12)); }
    // whatever he's doing, he stays on the bar (or the sheet's edge): the bar can change size under him
    if (M.state !== 'drag' && M.state !== 'fall') { const [lo, hi] = bounds(); M.cx = Math.max(lo, Math.min(hi, M.cx)); }
    if (!M.hidden) render();
    requestAnimationFrame(tick);
  }
  // window resized or zoomed: keep him on the bar, and redraw straight away (pinch zoom fires no resize)
  // the bar and the sheet are still moving when the resize event fires, so clamp again once they settle
  const refit = () => { followBar(); const [a, b] = bounds(); M.cx = Math.max(a, Math.min(b, M.cx)); render(); };
  const refitSettled = () => { refit(); requestAnimationFrame(refit); setTimeout(refit, 120); setTimeout(refit, 450); setTimeout(refit, 900); };
  addEventListener('resize', refitSettled);
  window.visualViewport?.addEventListener('resize', refitSettled);
  window.visualViewport?.addEventListener('scroll', render);

  const LINES = { home: 'hi again!', quests: 'so many quests', calendar: 'what’s coming up?', focus: 'shh… focusing', stats: 'look at you go', settings: 'make it cozy' };
  const busyMoving = () => M.state === 'walk' || M.state === 'prep' || M.state === 'drag' || M.state === 'fall';
  const api = {
    el, say,
    setVisible(on) { M.hidden = !on; el.hidden = !on; bub.hidden = !on; if (!on) card.hidden = true; else if (M.holding) card.hidden = false; if (on) { const [a, b] = bounds(); M.cx = Math.max(a, Math.min(b, M.cx)); goRest(); } },
    enterPage(page) {
      M.lastActive = Date.now();
      if (Date.now() < M.annoyedUntil || M.held || M.perch !== 'nav' || busyMoving() || M.hidden || env.paused() || M.holding) return;
      M.asleep = false; stopLook(); M.busy = false; M.pending = null; goRest();
      const urgent = env.quests().some(q => q.tier === 0 && !q.done);
      if (page === 'quests' && urgent) { M.p1Seen++; if (M.p1Seen > 1 && M.p1Seen % 3 === 0) strike('grumpy', 'that P1 is STILL open!', true); else if (M.p1Seen === 1) strike('surprised', 'a P1 is due!'); }
      else if (page === 'focus') { say(LINES.focus, 1300); }
      else if (page === 'settings') strike('sitting-pretty', LINES.settings);
      else if (page === 'home' && M.homeVisits++ % 2 === 0) { voice('sweet', { vol: 0.8 }); strike('wave', 'hi again!'); }
      else if (Math.random() < 0.5 && LINES[page]) say(LINES[page], 1300);
      schedule(1.5, 3);
    },
    // focus timer: he dozes off while you focus, wakes when you stop
    focusMode(on) {
      if (M.hidden || M.perch !== 'nav' || M.holding) return;
      if (on && !M.asleep && !busyMoving()) { M.busy = false; setTimeout(fallAsleep, 600); }
      if (!on && M.asleep) wakeUp('*stretch*');
    },
    setPerch(perch) {
      M.held = false; M.asleep = false; stopLook();
      if (M.hidden) { M.perch = perch === 'sheet' ? 'sheet' : 'nav'; return; }
      if (perch === 'sheet') {
        card.style.visibility = 'hidden';
        Object.assign(M, { perch: 'sheet', busy: true, state: 'idle', dir: -1 });
        const [a, b] = bounds(); M.cx = (a + b) / 2;
        el.classList.add('over');
        M.lift = A['edge-peek'].h; M.liftTo = M.lift;
        play('edge-peek', { loop: A['edge-peek'].loop });
        clearTimeout(M.perchT);
        M.perchT = setTimeout(() => { M.liftRate = 10; M.liftTo = 0; }, 360);
      } else if (M.perch === 'sheet') {
        clearTimeout(M.perchT); M.liftRate = 24; M.liftTo = A['edge-peek'].h;
        setTimeout(() => { M.perch = 'nav'; el.classList.remove('over'); M.lift = 0; M.liftTo = 0; const [a, b] = bounds(); M.cx = Math.max(a, Math.min(b, M.cx)); card.style.visibility = '';
          if (M.holding) holdPose(true); else { goRest(); schedule(1.5, 3); } }, 180);
      }
    },
    react(name, text, mad) {
      if (M.hidden) return;
      if (M.holding) return;   // busy holding a reminder
      if (Date.now() < M.annoyedUntil || M.held || busyMoving() || M.perch !== 'nav') { if (text) say(text, 1200, mad); return; }
      stopLook(); M.busy = false; M.asleep = false;
      if (A[name] && A[name].face === 'R') M.dir = 1;
      strike(name, text, mad);
    },
    celebrate(text) { this.react(variant('celebrate', 'cheer', 'toast-cheer'), text || 'yay!'); },
    // a reminder fired: he stays where he is and holds it up until it's opened
    hold(info) {
      if (M.hidden || !info || !info.count) return;
      const isNew = !M.holding || info.count > M.holding.count;
      const wasHolding = !!M.holding;
      M.holding = info;
      if (M.state === 'drag' || M.state === 'fall') { showCard(info, isNew); return; }   // keeps it while carried; paw goes up on landing
      if (M.state === 'walk' || M.state === 'prep') { M.state = 'idle'; }   // stops right there
      if (M.asleep) M.asleep = false;
      if (M.perch !== 'nav') { showCard(info, isNew); return; }
      if (!wasHolding) { holdPose(true); setTimeout(() => voice('hey'), 280); }   // after the app's chime
      showCard(info, isNew);
    },
    // the notifications were opened (or everything was handled): he lets go of the card calmly
    release() {
      if (!M.holding) return;
      M.holding = null;
      const inner = card.querySelector('.mcard-in');
      const done = () => { card.hidden = true; };
      if (reduced()) done();
      else inner.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-18px) scale(.9)' }], { duration: 360, easing: 'cubic-bezier(.55,0,.75,.25)' }).finished.then(done, done);
      if (M.state === 'hold') { M.busy = true; play(HOLD.name, { from: HOLD.frame, to: A[HOLD.name].frames, then: () => { goRest(); schedule(2, 4); } }); }
    },
    holding: () => !!M.holding,
    grumpy(text) { this.react(variant('grumpy', 'huff', 'toast-grumpy'), text, true); voice('grumpy', { vol: 0.8 }); },
    rect: () => el.getBoundingClientRect(),
    raise(on) { el.classList.toggle('raised', on); bub.classList.toggle('raised', on); },
    // pull to refresh borrows him as its indicator; the one on the bar steps out meanwhile
    away(on) { el.style.visibility = on ? 'hidden' : ''; card.style.visibility = on ? 'hidden' : ''; if (on) bub.classList.remove('show'); },
    settingsChanged() {
      // the other cat: once his resting strip is ready he takes over from his resting pose, with his own animations
      switchCat(() => {
        stop(); stopLook(); rebuildPools(); warmAll();
        Object.assign(M, { anim: 'rest', fi: 1, busy: false, asleep: false, melted: false, held: false, pending: null, slide: null, state: M.holding ? 'hold' : 'idle' });
        el.setAttribute('aria-label', `${catLabel()} the cat. Tap to boop.`);
        shown = '';
        if (M.holding) holdPose(false); else { goRest(); schedule(1, 2); }
        const [a, b] = bounds(); M.cx = Math.max(a, Math.min(b, M.cx)); render();
      });
      shown = ''; render();
      const [a, b] = bounds(); M.cx = Math.max(a, Math.min(b, M.cx)); if (!M.busy && !M.asleep && M.state === 'idle') goRest(); schedule(0.5, 1.5); },
    debug: () => ({ cx: Math.round(M.cx), anim: M.anim, fi: M.fi, state: M.state, busy: M.busy, perch: M.perch, asleep: M.asleep, hidden: M.hidden }),
    show(name, fi) { if (!has(name)) return false; stop(); stopLook(); M.busy = true; M.anim = name; M.fi = fi || 1; render(); return true; },
    resume() { goRest(); schedule(1, 2); },
    start() {
      const [a, b] = bounds(); M.cx = Math.max(a, Math.min(b, (a + b) / 2 + 110));
      followBar();
      goRest(); schedule(1, 2); requestAnimationFrame(tick);
    },
  };
  return api;
}
