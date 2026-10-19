// Guided tour, matching the Figma "Tour" page (node 6:169): the real screen, dimmed, with a butter
// spotlight ring around one thing and a card with Mochi, "Step n of 9", Skip tour and Next.
// The last step has no Next button: tapping Mochi ends the tour. The web app has no questlines or
// timetable yet, so those two steps show the Calendar and Focus screens instead.
import { getState, findQuest } from '../store.js';
import { sheet, play, esc } from '../ui.js';
import { openAdd } from './add.js';
import { mascot } from '../mascot.js';
import { portrait } from '../mochi.js';
import { reduced, EASE } from '../motion.js';
import { TIER_COLORS } from '../store.js';

const STEPS = [
  { route: '#/home', target: '.grid4', title: 'Your numbers at a glance', text: "Tasks done today, your streak, EXP and focus time. Check here every morning." },
  { route: '#/quests?filter=all', target: '#qlist', title: 'Six priority colours', text: 'Warmer means sooner. Tap a quest to change its priority, date or reminder.',
    extra: () => `<div class="tour-chips">${getState().settings.tierNames.map((n, i) => `<span style="--c:${TIER_COLORS[i]}">P${i + 1} ${esc(n)}</span>`).join('')}</div>` },
  { route: '#/quests?filter=all', target: '#sheet [data-tour="voice"]', sheet: true, title: 'Just say it', text: 'Tap and speak, or type. TaskFlow picks out dates, times and keywords and suggests a priority.' },
  { route: () => '#/quest/' + encodeURIComponent(subtaskQuest()), target: '[data-tour="subtasks"]', title: 'Break it down', text: 'Split a quest into subtasks. Each subtask can have its own priority.' },
  { route: '#/calendar', target: '[data-tour="calendar"]', title: 'Plan your week', text: 'See what’s due each day, repeats included. Send everything to Google or Apple Calendar from Settings.' },
  { route: '#/focus', target: '.focus-card', title: 'Focus mode', text: 'Pick a quest, start the timer and earn 1 EXP for every 5 minutes. Mochi naps while you focus.' },
  { route: '#/home', target: '#nav', title: 'Get around', text: 'Home, Quests, Calendar and Focus. The + in the middle adds a quest from anywhere.' },
  { route: '#/settings', target: '[data-tour="mochi-settings"]', title: 'Make it yours', text: 'Set your daily target, reminders, calendars and sounds, rename priorities and tune Mochi here.' },
  { route: '#/home', target: 'mochi', title: 'Meet Mochi', text: 'Mochi walks along the nav bar, naps, and reacts to what you do. Tap him, he likes it.', last: true },
];

function subtaskQuest() {
  const qs = getState().quests.filter(q => !q.done);
  return (qs.find(q => q.subtasks.length) || qs[0] || getState().quests[0] || {}).id || '';
}

let i = -1, root = null, raf = 0, stopAvatar = null, seq = 0, settled = false;
export const isOpen = () => i >= 0;

function el(sel) {
  if (sel === 'mochi') return mascot.el() && !mascot.el().hidden ? mascot.el() : null;
  return document.querySelector(sel);
}

function build() {
  root = document.getElementById('tour');
  root.innerHTML = `<div class="tour-spot" aria-hidden="true" style="opacity:0"><span class="tour-tap">tap!</span></div><div class="tour-card" role="dialog" aria-modal="true" aria-live="polite" style="opacity:0"></div>`;
  root.hidden = false;
  if (root.dataset.bound) return;
  root.dataset.bound = '1';
  root.addEventListener('click', e => {
    if (e.target.closest('[data-tour-next]')) return next();
    if (e.target.closest('[data-tour-skip]')) return end();
  });
}

function card() {
  const s = STEPS[i], hasMochi = !!el('mochi');
  return `<div class="tour-head"><span class="tour-av"><span data-av></span></span><span class="small">Step ${i + 1} of ${STEPS.length}</span></div>
    <h2 class="tour-title" tabindex="-1">${esc(s.title)}</h2>
    <p class="tour-text">${esc(s.text)}</p>
    ${s.extra ? s.extra() : ''}
    <div class="tour-dots">${STEPS.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('')}</div>
    ${s.last && hasMochi ? '<div class="tour-tapmochi">Tap Mochi to finish the tour</div>'
      : `<div class="tour-foot"><button type="button" class="link" data-tour-skip>${s.last ? '' : 'Skip tour'}</button><button type="button" class="btn sm" data-tour-next>${s.last ? 'Finish' : 'Next'}</button></div>`}`;
}

const wait = ms => new Promise(r => setTimeout(r, ms));
const frame = () => new Promise(r => requestAnimationFrame(() => r()));
// resolves once the element has stopped moving (scrolling, page fade, sheet sliding) for a few frames
async function settle(target, max = 1200) {
  const t0 = performance.now(); let last = '', still = 0;
  while (performance.now() - t0 < max) {
    await frame();
    const t = typeof target === 'function' ? target() : target;
    const r = t && t.getBoundingClientRect();
    const k = r ? [r.left, r.top, r.width, r.height].map(Math.round).join() : '';
    still = k && k === last ? still + 1 : 0; last = k;
    if (still >= 4) return;
  }
}
function fade(elm, to, ms) {
  elm.getAnimations().forEach(a => a.cancel());
  const from = +getComputedStyle(elm).opacity;
  elm.style.opacity = to;
  if (reduced() || from === to) return Promise.resolve();
  return elm.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: to ? EASE : 'ease-in' }).finished.catch(() => {});
}

// spotlight rect for the current step (a circle round Mochi on the last step)
function spotRect() {
  const s = STEPS[i], t = el(s.target);
  if (!t) return null;
  let r = t.getBoundingClientRect();
  const pad = s.last ? 14 : 8;
  if (s.last) { const cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = Math.max(r.width, r.height) + 10; r = { left: cx - d / 2, top: cy - d / 2, width: d, height: d }; }
  return { left: r.left - pad, top: r.top - pad, width: r.width + pad * 2, height: r.height + pad * 2 };
}
function putSpot(r) {
  const spot = root.querySelector('.tour-spot');
  if (!r) { spot.style.opacity = 0; return; }
  Object.assign(spot.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px', opacity: 1 });
}
function putCard(r) {
  const c = root.querySelector('.tour-card'), vw = innerWidth, vh = innerHeight, cw = Math.min(360, vw - 32);
  c.style.width = cw + 'px';
  const ch = c.offsetHeight || 220;
  let top;
  if (!r) top = (vh - ch) / 2;
  else if (r.top + r.height + 14 + ch < vh - 12) top = r.top + r.height + 14;
  else if (r.top - 14 - ch > 12) top = r.top - 14 - ch;
  else top = Math.max(12, vh - ch - 110);
  const left = r ? Math.max(16, Math.min(vw - cw - 16, r.left + r.width / 2 - cw / 2)) : (vw - cw) / 2;
  c.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

// One calm sequence per step: card fades out → page/sheet changes and settles → target scrolls into
// view and settles → spotlight glides to it → card is placed (invisibly) and fades in. A newer step
// cancels an older one (seq), and Next is ignored until the step has settled.
async function showStep() {
  const my = ++seq, s = STEPS[i], c = root.querySelector('.tour-card'), spot = root.querySelector('.tour-spot');
  const stale = () => my !== seq || i < 0;
  settled = false;
  await fade(c, 0, 160);
  if (stale()) return;
  const route = typeof s.route === 'function' ? s.route() : s.route;
  if (!s.sheet && sheet.isOpen()) { sheet.close(); await wait(reduced() ? 0 : 320); }
  if (location.hash !== route) { location.hash = route; await wait(reduced() ? 30 : 420); }
  if (stale()) return;
  if (s.sheet && !sheet.isOpen()) {
    openAdd();
    const t = document.querySelector('#sheet [name=title]');
    if (t) { t.value = 'Renew passport, due Friday'; t.dispatchEvent(new Event('input', { bubbles: true })); }
    await settle(() => document.getElementById('sheet'));
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  if (stale()) return;
  const target = el(s.target);
  if (target && s.target !== '#nav' && s.target !== 'mochi') {
    const r = target.getBoundingClientRect();
    if (r.top < 70 || r.bottom > innerHeight - 110) target.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
  }
  await settle(() => el(s.target), 1500);
  if (stale()) return;
  root.classList.toggle('round', !!s.last);
  mascot.raise(!!s.last);
  const to = spotRect(), from = spot.getBoundingClientRect(), first = +getComputedStyle(spot).opacity === 0;
  let ms = 0;
  if (first || !to || reduced()) putSpot(to);   // first step: appear in place, no slide from the corner
  else {
    // calm glide: ease-in-out, longer for longer moves, so no frame leaps far
    const dist = Math.hypot(to.left - from.left, to.top - from.top) + Math.abs(to.width - from.width) + Math.abs(to.height - from.height);
    ms = Math.round(Math.min(900, Math.max(420, dist * 1.1)));
    spot.style.setProperty('--glide', ms + 'ms');
    spot.classList.add('glide');
    putSpot(to);
  }
  await wait(ms);
  if (stale()) return;
  spot.classList.remove('glide');
  if (stopAvatar) stopAvatar();
  c.innerHTML = card();
  stopAvatar = portrait(c.querySelector('[data-av]'), 0.36);
  putCard(spotRect());
  settled = true;
  await fade(c, 1, 380);
  if (stale()) return;
  const h = c.querySelector('.tour-title'); if (h) h.focus({ preventScroll: true });
  if (s.last) mascot.say('tap me!', 2500);
}

// once a step has settled, the spotlight and card stay on the target if it moves (Mochi walking)
function follow() {
  if (i >= 0 && settled) {
    const r = spotRect(), cur = root.querySelector('.tour-spot').getBoundingClientRect();
    if (r && (Math.abs(r.left - cur.left) > 1 || Math.abs(r.top - cur.top) > 1)) { putSpot(r); putCard(r); }
  }
  raf = requestAnimationFrame(follow);
}

export function start() {
  if (isOpen()) return;
  build();
  i = 0; settled = false;
  document.body.classList.add('touring');
  requestAnimationFrame(() => root.classList.add('open'));
  showStep();
  cancelAnimationFrame(raf); follow();
}
function next() {
  if (!settled) return;   // debounce: one step at a time
  play('click', 0.4);
  if (i >= STEPS.length - 1) return end(true);
  i++; showStep();
}
export function end(finished) {
  if (!isOpen()) return;
  i = -1; seq++; settled = false;
  cancelAnimationFrame(raf);
  if (stopAvatar) stopAvatar(); stopAvatar = null;
  if (sheet.isOpen()) sheet.close();
  mascot.raise(false);
  root.classList.remove('open', 'round');
  setTimeout(() => { if (!isOpen()) { root.hidden = true; root.innerHTML = ''; document.body.classList.remove('touring'); } }, reduced() ? 0 : 400);
  if (finished) { play('coin', 0.7); setTimeout(() => play('sweet'), 350); mascot.react('celebrate', 'you’re all set!'); }
  if (location.hash.startsWith('#/quest/') || location.hash.startsWith('#/settings')) location.hash = '#/home';
}
// Mochi tells us when he's tapped: on the last step that ends the tour
export function mochiTapped() {
  if (i === STEPS.length - 1) { end(true); return true; }
  return false;
}
export { findQuest };
