// Pull to refresh on the list screens, with Mochi as the indicator (Figma animations page: "stretch: pull to
// refresh (scrubbed as you pull)", "happy-spin: pull to refresh, on release"). Pull down from the top of the
// page: he stretches further the further you pull; let go past the line and he spins while the app refreshes
// (re-checks reminders, re-syncs calendars, looks for an app update, redraws the screen).
import { sprite, hasAnim } from './mochi.js';
import { getState } from './store.js';
import { reduced, EASE } from './motion.js';
import { toast, play } from './ui.js';
import { mascot } from './mascot.js';

const PAGES = new Set(['home', 'quests', 'calendar', 'stats']);
const LINE = 80, MAX = 140;

export function setupPullToRefresh({ current, refresh }) {
  const ind = document.createElement('div');
  ind.className = 'ptr'; ind.setAttribute('aria-hidden', 'true');
  ind.innerHTML = '<span class="ptr-cat"></span><span class="ptr-ring"></span>';
  document.body.appendChild(ind);
  const cat = ind.querySelector('.ptr-cat'), view = document.getElementById('view');
  let start = null, pull = 0, busy = false, stopAnim = () => {}, shownFrame = 0;

  const withMochi = () => getState().settings.mochi !== false;
  function show(p) {
    pull = p;
    const k = Math.min(1, p / LINE);
    view.style.transform = `translateY(${Math.round(Math.min(p, MAX) * 0.75)}px)`;
    ind.style.opacity = Math.min(1, p / 30);
    ind.style.transform = `translate(-50%, ${Math.round(Math.min(p, MAX) * 0.75 - 92)}px)`;
    if (withMochi()) mascot.away(true);
    ind.classList.toggle('ready', p >= LINE);
    if (withMochi()) {
      if (hasAnim('pull-stretch')) {
        // he hangs from the top and stretches further the further you pull; past the line he dangles, ready
        if (p >= LINE) { if (shownFrame !== 'hang') { stopAnim(); stopAnim = sprite(cat, 'pull-hang', { scale: 0.62 }); shownFrame = 'hang'; } }
        else {
          const f = 1 + Math.round(k * 5);
          if (f !== shownFrame) { stopAnim(); stopAnim = sprite(cat, 'pull-stretch', { frame: f, scale: 0.62 }); shownFrame = f; }
        }
      } else {
        // stretch frames 1 → 3 follow the finger (3 is the full hang)
        const f = 1 + Math.round(k * 2);
        if (f !== shownFrame) { stopAnim(); stopAnim = sprite(cat, 'stretch', { frame: f, scale: 0.72 }); shownFrame = f; }
      }
    } else ind.style.setProperty('--k', k);
  }
  function reset(animate) {
    start = null; shownFrame = 0;
    const from = view.style.transform;
    view.style.transform = ''; ind.style.opacity = 0; ind.classList.remove('ready', 'spinning');
    if (animate && !reduced() && from) view.animate([{ transform: from }, { transform: 'none' }], { duration: 380, easing: EASE });
    stopAnim(); stopAnim = () => {};
    mascot.away(false);
  }
  async function release() {
    if (pull < LINE || busy) { reset(true); return; }
    busy = true;
    ind.classList.add('spinning');
    view.style.transform = 'translateY(86px)';
    ind.style.transform = 'translate(-50%, 0px)';
    stopAnim();
    if (withMochi()) stopAnim = hasAnim('pull-spin') ? sprite(cat, 'pull-spin', { scale: 0.62 }) : sprite(cat, 'happy-spin', { scale: 0.72, loop: [1, 6] });
    play('click', 0.5);
    const t0 = performance.now();
    let res = null;
    try { res = await refresh(); } catch (e) {}
    const left = 900 - (performance.now() - t0);   // let one spin finish so it reads as a refresh
    if (left > 0) await new Promise(r => setTimeout(r, left));
    busy = false; reset(true);
    if (res?.updated) {
      toast('Updating to latest version…', 'good');
      setTimeout(() => { location.reload(); }, 600);
      return;
    }
    toast('Up to date');
    setTimeout(() => mascot.react('happy-spin'), 200);
  }

  const atTop = () => scrollY <= 0 && (!document.getElementById('qlist') || document.getElementById('qlist').scrollTop <= 0);
  // where a pull may begin: top of a list screen, not on a field or while a sheet/overlay is open
  const canStart = target => PAGES.has(current()) && atTop() && !busy && !target.closest('input, textarea, select, .sheet, .rpanel, .onboard, .tour, .mochi')
    && !document.body.classList.contains('ob-lock') && !document.body.classList.contains('touring') && !document.querySelector('.sheet.open');

  // touch: needs a non-passive listener so the page doesn't rubber-band or trigger the browser's own refresh
  addEventListener('touchstart', e => { if (e.touches.length === 1 && canStart(e.target)) start = { y: e.touches[0].clientY, x: e.touches[0].clientX, pulling: false }; }, { passive: true });
  addEventListener('touchmove', e => {
    if (!start) return;
    const dy = e.touches[0].clientY - start.y, dx = e.touches[0].clientX - start.x;
    if (!start.pulling) { if (dy > 8 && Math.abs(dy) > Math.abs(dx) * 1.3 && atTop()) start.pulling = true; else if (Math.abs(dx) > 10 || dy < -4) { start = null; return; } else return; }
    e.preventDefault();
    show(Math.max(0, dy - 8) * 0.9);
  }, { passive: false });
  addEventListener('touchend', () => { if (start && start.pulling) release(); else start = null; });
  addEventListener('touchcancel', () => { if (start) reset(true); });

  // Pull-to-refresh is touch-only so desktop mouse interaction/scrolling never causes unwanted view translation
}
