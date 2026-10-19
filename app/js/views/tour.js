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

let i = -1, root = null, raf = 0, stopAvatar = null, lastRect = null;
export const isOpen = () => i >= 0;

function el(sel) {
  if (sel === 'mochi') return mascot.el() && !mascot.el().hidden ? mascot.el() : null;
  return document.querySelector(sel);
}

function build() {
  root = document.getElementById('tour');
  root.innerHTML = `<div class="tour-spot" aria-hidden="true"><span class="tour-tap">tap!</span></div><div class="tour-card" role="dialog" aria-modal="true" aria-live="polite"></div>`;
  root.hidden = false;
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

async function showStep(dir = 1) {
  const s = STEPS[i];
  const route = typeof s.route === 'function' ? s.route() : s.route;
  if (!s.sheet && sheet.isOpen()) sheet.close();
  if (location.hash !== route) { location.hash = route; await wait(520); }
  if (s.sheet && !sheet.isOpen()) {
    openAdd();
    await wait(350);
    const t = document.querySelector('#sheet [name=title]');
    if (t) { t.value = 'Renew passport, due Friday'; t.dispatchEvent(new Event('input', { bubbles: true })); t.blur(); }
    await wait(250);
  }
  const target = el(s.target);
  if (target && s.target !== '#nav' && s.target !== 'mochi') { target.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' }); await wait(reduced() ? 0 : 380); }
  root.classList.toggle('round', !!s.last);
  mascot.raise(!!s.last);
  const c = root.querySelector('.tour-card');
  const swapIn = () => {
    c.getAnimations().forEach(a => a.cancel());   // drop the held fade-out
    stopAvatar && stopAvatar();
    c.innerHTML = card();
    stopAvatar = portrait(c.querySelector('[data-av]'), 0.36);
    place(true);
    c.querySelector('.tour-title').focus({ preventScroll: true });
    if (!reduced()) c.animate([{ opacity: 0, transform: `translateY(${10 * dir}px)` }, { opacity: 1, transform: 'none' }], { duration: 420, easing: EASE });
  };
  if (c.innerHTML && !reduced()) c.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 150, fill: 'forwards' }).finished.then(swapIn); else swapIn();
  if (s.last) mascot.say('tap me!', 2500);
}

// keep the spotlight and card on the target while things move (scrolling, Mochi walking)
function place(force) {
  if (i < 0) return;
  const s = STEPS[i], t = el(s.target), spot = root.querySelector('.tour-spot'), c = root.querySelector('.tour-card');
  const pad = s.last ? 14 : 8;
  let r = t ? t.getBoundingClientRect() : null;
  if (r && s.last) { const cx = r.left + r.width / 2, cy = r.top + r.height / 2, d = Math.max(r.width, r.height) + 10; r = { left: cx - d / 2, top: cy - d / 2, width: d, height: d, right: cx + d / 2, bottom: cy + d / 2 }; }
  const key = r ? [r.left, r.top, r.width, r.height].map(Math.round).join() : 'none';
  if (key !== lastRect || force) {
    lastRect = key;
    if (r) Object.assign(spot.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px', opacity: 1 });
    else Object.assign(spot.style, { left: '50%', top: '40%', width: '0px', height: '0px', opacity: 0 });
    const vw = innerWidth, vh = innerHeight, cw = Math.min(360, vw - 32), ch = c.offsetHeight || 220;
    c.style.width = cw + 'px';
    let top;
    if (!r) top = (vh - ch) / 2;
    else if (r.bottom + pad + 14 + ch < vh - 12) top = r.bottom + pad + 14;
    else if (r.top - pad - 14 - ch > 12) top = r.top - pad - 14 - ch;
    else top = Math.max(12, vh - ch - 110);
    const left = r ? Math.max(16, Math.min(vw - cw - 16, r.left + r.width / 2 - cw / 2)) : (vw - cw) / 2;
    c.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  }
}
function loop() { place(); raf = requestAnimationFrame(loop); }
const wait = ms => new Promise(r => setTimeout(r, ms));

export function start() {
  if (isOpen()) return;
  build();
  i = 0;
  document.body.classList.add('touring');
  requestAnimationFrame(() => root.classList.add('open'));
  showStep();
  cancelAnimationFrame(raf); loop();
}
function next() {
  play('click', 0.4);
  if (i >= STEPS.length - 1) return end(true);
  i++; showStep(1);
}
export function end(finished) {
  if (!isOpen()) return;
  i = -1;
  cancelAnimationFrame(raf);
  stopAvatar && stopAvatar(); stopAvatar = null;
  if (sheet.isOpen()) sheet.close();
  mascot.raise(false);
  document.body.classList.remove('touring');
  root.classList.remove('open', 'round');
  setTimeout(() => { if (!isOpen()) { root.hidden = true; root.innerHTML = ''; } }, reduced() ? 0 : 400);
  if (finished) { play('coin', 0.7); mascot.react('celebrate', 'you’re all set!'); }
  if (location.hash.startsWith('#/quest/') || location.hash.startsWith('#/settings')) location.hash = '#/home';
}
// Mochi tells us when he's tapped: on the last step that ends the tour
export function mochiTapped() {
  if (i === STEPS.length - 1) { end(true); return true; }
  return false;
}
export { findQuest };
