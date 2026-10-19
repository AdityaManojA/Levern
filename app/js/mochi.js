/* Mochi in the web app. A port of the prototype's Mochi v2 engine (design/prototype/mochi-engine.js),
 * adapted to the app's fixed nav bar. Same rules, same art (app/mochi, copied by scripts/sync-mochi.mjs):
 *   1. He is placed by his body: each animation's canvas has his body centre at `ax` and paws at `gy`.
 *   2. Image and position change in the same step (render), never apart.
 *   3. Nothing animates his art except his frames: no CSS animation or transition on Mochi itself.
 *   4. Mirroring is around his body; resting-pose frames and sitting end frames are never mirrored.
 *   5. Hand-offs that aren't pixel-identical get a short crossfade.
 *   6. Idles begin on the first breathing frame, so the breath never pops.
 *   7. Animations missing from the manifest are refused.
 * With reduced motion he sits still on the bar and only talks.
 */
import V from '../mochi/manifest.js';
import { getState } from './store.js';
import { play as sound } from './ui.js';
import { reduced } from './motion.js';

const A = V.anims;
const has = n => Object.prototype.hasOwnProperty.call(A, n);
const stripUrl = n => V.base + 'strips/' + n + '.png';
const SPEED = { slow: 28, normal: 50, zoomy: 95 }, SPRINT = 170, SINK = 2;
const S = () => getState().settings;

/* ---------- small looping sprites (onboarding, tour, empty states, toasts) ---------- */
// el gets the animation as a background strip; returns stop()
export function sprite(el, name, { scale = 1, loop, fps, pause = 0, frame } = {}) {
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
    if (wait > 0) { wait -= 1000 / (fps || a.fps); return; }
    i = i >= l1 ? l0 : i + 1; show(i);
    if (i === l1 && pause) wait = pause;
  }, 1000 / (fps || a.fps));
  return () => clearInterval(t);
}
// rest with an occasional blink, for portraits
export function portrait(el, scale = 1) {
  let stop = sprite(el, 'rest', { scale }), t;
  if (reduced()) return () => stop();
  const blink = () => { t = setTimeout(() => { stop(); stop = sprite(el, 'blink', { scale, loop: [1, A.blink.frames] }); setTimeout(() => { stop(); stop = sprite(el, 'rest', { scale }); blink(); }, 1000 * A.blink.frames / A.blink.fps); }, 2500 + Math.random() * 3000); };
  blink();
  return () => { clearTimeout(t); stop(); };
}

/* ---------- the Mochi on the nav bar ---------- */
let M = null;
export function createMochi(env) {
  const el = document.createElement('div');
  el.className = 'mochi'; el.id = 'mochi'; el.setAttribute('role', 'button'); el.setAttribute('aria-label', 'Mochi the cat. Tap to boop.'); el.tabIndex = 0;
  el.innerHTML = '<div class="flip"><div class="act"></div></div>';
  const flip = el.querySelector('.flip'), act = el.querySelector('.act');
  const bub = document.createElement('div'); bub.className = 'mbubble'; bub.setAttribute('aria-live', 'polite');
  document.body.append(el, bub);
  for (const n in A) { const im = new Image(); im.src = stripUrl(n); }

  M = { cx: innerWidth / 2 + 120, dir: -1, anim: 'rest', fi: 1, timer: null, state: 'idle', perch: 'nav', busy: false, target: 0, onArrive: null, next: 0,
    lastActive: Date.now(), clicks: [], lastTap: 0, annoyedUntil: 0, bubbleUntil: 0, pending: null, asleep: false, held: false, slide: null,
    lift: 0, liftTo: 0, sprint: false, p1Seen: 0, homeVisits: 0, hidden: false };

  /* drawing */
  const nav = () => document.getElementById('nav');
  const sheetEl = () => document.getElementById('sheet');
  function groundY() { return M.perch === 'sheet' ? sheetEl().getBoundingClientRect().top : nav().getBoundingClientRect().top + SINK; }
  function bounds() {
    if (M.perch === 'sheet') { const r = sheetEl().getBoundingClientRect(); return [r.right - 130, r.right - 70]; }
    const r = nav().getBoundingClientRect();
    return [r.left + 52, r.right - 52];
  }
  const addX = () => { const a = nav().querySelector('.add'); if (!a) return innerWidth / 2; const r = a.getBoundingClientRect(); return r.left + r.width / 2; };
  const mirrored = (a, fi) => a.face === 'R' && !a.lock[fi - 1] && !(a.noflip && a.noflip.includes(fi)) && M.dir < 0;
  let shown = '';
  function render() {
    const a = A[M.anim];
    if (shown !== M.anim) { act.style.backgroundImage = `url("${stripUrl(M.anim)}")`; act.style.backgroundSize = `${a.w * a.frames}px ${a.h}px`; shown = M.anim; }
    act.style.backgroundPosition = `${-(M.fi - 1) * a.w}px 0`;
    el.style.width = a.w + 'px'; el.style.height = a.h + 'px';
    let y = groundY() - a.gy;
    if (M.perch === 'sheet' && a.edge != null) y = sheetEl().getBoundingClientRect().top - a.edge;
    y += M.lift;
    el.style.transform = `translate(${M.cx - a.ax}px, ${y}px)`;
    flip.style.transform = mirrored(a, M.fi) ? 'scaleX(-1)' : '';
    el.style.clipPath = (M.perch === 'sheet' && a.edge != null) ? `inset(0 0 ${Math.max(0, a.h - a.edge + M.lift)}px 0)` : '';
    if (Date.now() < M.bubbleUntil) {
      const w = bub.offsetWidth, bx = Math.max(8, Math.min(innerWidth - 8 - w, M.cx - w / 2));
      bub.style.transform = `translate(${bx}px, ${y + a.gy - V.sit - 44}px)`;
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
    const fps = o.fps || a.fps;
    M.timer = setInterval(() => {
      if (o.onFrame && o.onFrame(f)) return;
      if (f !== to) { f += step; M.fi = f; render(); return; }
      if (o.loop) {
        stop();
        let g = o.loop[0]; M.fi = g; render();
        M.timer = setInterval(() => { if (o.onFrame && o.onFrame(g)) return; g = g >= o.loop[1] ? o.loop[0] : g + 1; M.fi = g; render(); }, 1000 / (o.loopFps || fps));
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
  const walkFps = () => Math.max(5, Math.round(A.walk.fps * SPEED[S().speed || 'slow'] / SPEED.normal));
  function walkTo(x, opts = {}) {
    const [lo, hi] = bounds(); x = Math.max(lo, Math.min(hi, x));
    const d = x >= M.cx ? 1 : -1;
    Object.assign(M, { target: x, busy: true, state: 'prep', asleep: false, pending: null, slide: null, sprint: !!opts.sprint, dir: d });
    M.getUp = d > 0 ? 'get-up-right' : 'get-up-left';
    play(M.getUp, { dir: d, then: () => {
      M.state = 'walk'; M.busy = false;
      if (M.sprint) { say('zoomies!', 900); play('sprint', { dir: d, loop: A.sprint.loop }); }
      else play('walk', { dir: d, loop: A.walk.loop, fps: walkFps(), loopFps: walkFps() });
    } });
  }
  function arrive() {
    M.state = 'prep'; M.busy = true;
    const done = () => { if (M.onArrive) { const f = M.onArrive; M.onArrive = null; f(); } else { goRest(); schedule(2, 5); } };
    if (M.sprint) { M.sprint = false; play('sprint-stop', { dir: M.dir, then: done }); return; }
    const g = M.getUp || (M.dir > 0 ? 'get-up-right' : 'get-up-left');
    play(g, { dir: M.dir, from: A[g].frames, to: 1, then: done });
  }

  /* deciding */
  const IDLES = [['ear-twitch', 14], ['look-around', 12], ['yawn', 6], ['sneeze', 3], ['sniff', 4], ['face-wash', 4], ['groom', 4], ['scratch', 3], ['spot', 3],
    ['stretch', 3], ['back-stretch', 2], ['tail-wrap', 3], ['look-back', 3], ['sitting-pretty', 3]]
    .filter(([n]) => has(n)).map(([n, w]) => { const j = A[n].join || []; return [n, j[0] === 'R' && j[1] === 'R' ? w : w * 0.5]; });
  function pickIdle() { let r = Math.random() * IDLES.reduce((s, [, w]) => s + w, 0); for (const [n, w] of IDLES) { r -= w; if (r <= 0) return n; } return IDLES[0][0]; }
  const canMove = () => !reduced() && !M.hidden && !env.paused();
  function decide() {
    if (M.busy || M.held || M.asleep || M.state !== 'idle' || M.perch !== 'nav' || !canMove()) return;
    if (!S().roam) { const [, b] = bounds(); if (Math.abs(M.cx - b) > 4) { walkTo(b); return; } schedule(5, 9); return; }
    const page = env.current();
    const walkP = { home: 0.45, quests: 0.6, calendar: 0.35, focus: 0.1, stats: 0.3, settings: 0.15 }[page] ?? 0.3;
    if (Math.random() < walkP) { const x = randomX(); walkTo(x, { sprint: page !== 'focus' && Math.abs(x - M.cx) > 130 && Math.random() < 0.15 }); }
    else schedule(3, 7);
  }
  const sleepAfter = () => (env.current() === 'focus' ? 9000 : 25000);
  setInterval(() => {
    if (M.state !== 'idle' || M.busy || M.held || M.asleep || M.perch !== 'nav' || !canMove()) return;
    if (Date.now() - M.lastActive > sleepAfter()) return fallAsleep();
    if (!resting() || M.pending || !S().roam) return;
    if (Math.random() < 0.45) idle(pickIdle());
  }, 2200);
  (function blinkLoop() { if (resting() && !M.pending && M.perch === 'nav' && canMove()) idle('blink'); setTimeout(blinkLoop, 3200 + Math.random() * 3200); })();

  function fallAsleep() {
    if (M.busy || M.held || M.asleep) return;
    M.asleep = true; M.busy = true; M.state = 'sleep';
    play('lie-down', { then: () => { if (M.asleep) play('sleep', { loop: A.sleep.loop }); } });
  }
  function wakeUp(text) {
    if (!M.asleep) return;
    M.asleep = false; M.busy = true; if (text) say(text, 900);
    play('get-up', { then: () => { goRest(); schedule(2, 4); } });
  }

  /* touch */
  const mew = (rate = 1, vol = 1) => { if (S().mochiSound !== false) sound('mew', 0.3 * vol, rate); };
  function getAnnoyed() {
    M.busy = true; M.clicks = []; M.state = 'sulk';
    say('Hmph! Enough.', 1600, true); mew(0.72, 0.9);
    M.annoyedUntil = Date.now() + 9000;
    play('grumpy', { then: () => {
      play('ignore', { hold: true, to: A.ignore.hold || A.ignore.frames });
      setTimeout(() => play('ignore', { from: A.ignore.hold || A.ignore.frames, to: 1, then: () => { say('…fine.', 1400); M.annoyedUntil = 0; goRest(); schedule(3, 6); } }), 4500);
    } });
  }
  function tap(e) {
    const now = Date.now(); M.lastActive = now;
    if (env.onTap && env.onTap()) return;   // the tour's last step finishes on a tap
    if (now < M.annoyedUntil) { say('…', 800, true); return; }
    if (M.asleep) { wakeUp('!!'); return; }
    if (M.state === 'walk' || M.state === 'prep' || M.perch !== 'nav') return;
    M.clicks = M.clicks.filter(t => now - t < 6000); M.clicks.push(now);
    const n = M.clicks.length, limit = S().annoy || 5;
    if (n > limit) return getAnnoyed();
    M.busy = false;
    if (n === limit - 1) { mew(0.85); return strike('stomp', 'hey!', true); }
    if (n === limit) { mew(0.85); return strike('grumpy', 'stop it…', true); }
    if (now - M.lastTap < 320) { M.lastTap = 0; mew(0.8); return strike('startled', 'eep!'); }
    M.lastTap = now;
    mew(0.95 + Math.random() * 0.15);
    const r = el.getBoundingClientRect(), a = A[M.anim];
    const headLine = r.top + (a.gy - V.sit * 0.55) * (r.height / a.h);
    if (e && e.clientY && e.clientY < headLine) return strike('head-bonk', Math.random() < 0.5 ? 'ow!' : '');
    strike('boop', Math.random() < 0.4 ? ['mrp!', 'boop', ':3'][Math.floor(Math.random() * 3)] : '');
  }
  let pressT = null;
  el.addEventListener('pointerdown', e => {
    e.stopPropagation();
    if (Date.now() < M.annoyedUntil || M.perch !== 'nav') return;
    try { el.setPointerCapture(e.pointerId); } catch (err) {}
    pressT = setTimeout(() => {
      pressT = null;
      if (M.state === 'walk' || M.state === 'prep' || M.asleep) return;
      Object.assign(M, { held: true, busy: true, pending: null, slide: null });
      const a = A['heart-eyes']; play('heart-eyes', { to: a.loop[1], loop: a.loop }); mew(1.1); say('purr…', 1400);
    }, 450);
  });
  el.addEventListener('pointerup', e => {
    if (pressT) { clearTimeout(pressT); pressT = null; tap(e); return; }
    if (!M.held) return;
    M.held = false; M.lastActive = Date.now();
    const a = A['heart-eyes']; play('heart-eyes', { from: a.loop[1], to: a.frames, then: () => { goRest(); schedule(2, 4); } });
  });
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
    if (Math.abs(reach) > 4) slideTo(M.cx + reach, 1000 * A[kind].frames / A[kind].fps * 0.7);
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
    if (Math.hypot(dx, dy) > 320) return;
    PLAY.lastMove = now;
    PLAY.lookTarget = dx < -50 ? 1 : dx < 25 ? 2 : dx < 80 ? 3 : 4;
    if (M.anim !== 'look-scrub') { if (M.pending) return; stop(); PLAY.look = 1; play('look-scrub', { hold: true, to: 1 }); }
    if (!PLAY.lookT) PLAY.lookT = setInterval(stepLook, 110);
  });
  document.addEventListener('pointerdown', () => { M.lastActive = Date.now(); if (M.asleep && !M.busy && env.current() !== 'focus') wakeUp(); });

  /* main loop */
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (M.state === 'walk' && !M.held) {
      const sp = M.sprint ? SPRINT : SPEED[S().speed || 'slow'], dx = M.target - M.cx;
      if (Math.abs(dx) < 1.5) { M.cx = M.target; arrive(); } else M.cx += Math.sign(dx) * Math.min(Math.abs(dx), sp * dt);
    } else if (now > M.next) decide();
    if (M.slide) {
      const k = Math.min(1, (now - M.slide.t0) / M.slide.ms), ease = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      M.cx = M.slide.from + (M.slide.to - M.slide.from) * ease; if (k >= 1) M.slide = null;
    }
    if (M.lift !== M.liftTo) { const d = M.liftTo - M.lift; M.lift = Math.abs(d) < 0.5 ? M.liftTo : M.lift + d * Math.min(1, dt * (M.liftRate || 12)); }
    if (!M.hidden) render();
    requestAnimationFrame(tick);
  }
  addEventListener('resize', () => { const [a, b] = bounds(); M.cx = Math.max(a, Math.min(b, M.cx)); });

  const LINES = { home: 'hi again!', quests: 'so many quests', calendar: 'what’s coming up?', focus: 'shh… focusing', stats: 'look at you go', settings: 'make it cozy' };
  const busyMoving = () => M.state === 'walk' || M.state === 'prep';
  const api = {
    el, say,
    setVisible(on) { M.hidden = !on; el.hidden = !on; bub.hidden = !on; if (on) { const [a, b] = bounds(); M.cx = Math.max(a, Math.min(b, M.cx)); goRest(); } },
    enterPage(page) {
      M.lastActive = Date.now();
      if (Date.now() < M.annoyedUntil || M.held || M.perch !== 'nav' || busyMoving() || M.hidden || env.paused()) return;
      M.asleep = false; stopLook(); M.busy = false; M.pending = null; goRest();
      const urgent = env.quests().some(q => q.tier === 0 && !q.done);
      if (page === 'quests' && urgent) { M.p1Seen++; if (M.p1Seen > 1 && M.p1Seen % 3 === 0) strike('grumpy', 'that P1 is STILL open!', true); else if (M.p1Seen === 1) strike('surprised', 'a P1 is due!'); }
      else if (page === 'focus') { say(LINES.focus, 1300); }
      else if (page === 'settings') strike('sitting-pretty', LINES.settings);
      else if (page === 'home' && M.homeVisits++ % 3 === 0) strike('wave', 'hi again!');
      else if (Math.random() < 0.5 && LINES[page]) say(LINES[page], 1300);
      schedule(1.5, 3);
    },
    // focus timer: he dozes off while you focus, wakes when you stop
    focusMode(on) {
      if (M.hidden || M.perch !== 'nav') return;
      if (on && !M.asleep && !busyMoving()) { M.busy = false; setTimeout(fallAsleep, 600); }
      if (!on && M.asleep) wakeUp('*stretch*');
    },
    setPerch(perch) {
      M.held = false; M.asleep = false; stopLook();
      if (M.hidden) { M.perch = perch === 'sheet' ? 'sheet' : 'nav'; return; }
      if (perch === 'sheet') {
        Object.assign(M, { perch: 'sheet', busy: true, state: 'idle', dir: -1 });
        const [a, b] = bounds(); M.cx = (a + b) / 2;
        el.classList.add('over');
        M.lift = A['edge-peek'].h; M.liftTo = M.lift;
        play('edge-peek', { loop: A['edge-peek'].loop });
        clearTimeout(M.perchT);
        M.perchT = setTimeout(() => { M.liftRate = 10; M.liftTo = 0; }, 360);
      } else if (M.perch === 'sheet') {
        clearTimeout(M.perchT); M.liftRate = 24; M.liftTo = A['edge-peek'].h;
        setTimeout(() => { M.perch = 'nav'; el.classList.remove('over'); M.lift = 0; M.liftTo = 0; const [a, b] = bounds(); M.cx = Math.max(a, Math.min(b, M.cx)); goRest(); schedule(1.5, 3); }, 180);
      }
    },
    react(name, text, mad) {
      if (M.hidden) return;
      if (Date.now() < M.annoyedUntil || M.held || busyMoving() || M.perch !== 'nav') { if (text) say(text, 1200, mad); return; }
      stopLook(); M.busy = false; M.asleep = false;
      if (A[name] && A[name].face === 'R') M.dir = 1;
      strike(name, text, mad);
    },
    celebrate(text) { this.react('celebrate', text || 'yay!'); },
    grumpy(text) { this.react('grumpy', text, true); mew(0.8); },
    rect: () => el.getBoundingClientRect(),
    raise(on) { el.classList.toggle('raised', on); bub.classList.toggle('raised', on); },
    settingsChanged() { const [a, b] = bounds(); M.cx = Math.max(a, Math.min(b, M.cx)); if (!M.busy && !M.asleep && M.state === 'idle') goRest(); schedule(0.5, 1.5); },
    debug: () => ({ cx: Math.round(M.cx), anim: M.anim, fi: M.fi, state: M.state, busy: M.busy, perch: M.perch, asleep: M.asleep, hidden: M.hidden }),
    show(name, fi) { if (!has(name)) return false; stop(); stopLook(); M.busy = true; M.anim = name; M.fi = fi || 1; render(); return true; },
    resume() { goRest(); schedule(1, 2); },
    start() {
      const [a, b] = bounds(); M.cx = Math.max(a, Math.min(b, (a + b) / 2 + 110));
      goRest(); schedule(1, 2); requestAnimationFrame(tick);
    },
  };
  return api;
}
