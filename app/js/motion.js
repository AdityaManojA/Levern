// Calm motion. One easing and a few durations for the whole app, so everything moves the same way.
//  - pageTransition(): switching screens (View Transitions API, or a soft fade-up fallback)
//  - morph(): re-rendering the same screen; rows glide to their new places, new ones settle in,
//    removed ones drift out, and a quest that was just ticked gets a mint ripple.
// Both do nothing fancy when the user prefers reduced motion.

export const EASE = 'cubic-bezier(.22, 1, .36, 1)';        // gentle ease-out, no bounce
export const EASE_IN = 'cubic-bezier(.55, 0, .75, .25)';  // for things leaving
export const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// dir: 'forward' | 'back' | 'left' | 'right' | 'fade'
export function pageTransition(update, dir = 'fade') {
  const view = document.getElementById('view');
  if (reduced()) { update(); return; }
  // the tour overlay must stay live during screen changes, so no view-transition snapshot then
  if (document.startViewTransition && !document.body.classList.contains('touring')) {
    document.documentElement.dataset.vt = dir;
    let ran = false;
    const run = () => { if (!ran) { ran = true; update(); } };
    const vt = document.startViewTransition(run);
    vt.ready.catch(() => {}); vt.updateCallbackDone.catch(() => {});
    vt.finished.catch(() => {}).finally(() => { delete document.documentElement.dataset.vt; });
    // never hold the screen change hostage to a frame that doesn't come (hidden window, busy device)
    setTimeout(() => { if (!ran) { try { vt.skipTransition(); } catch (e) {} run(); } }, 350);
    return;
  }
  update();
  const dx = { forward: 18, back: -18, left: -14, right: 14 }[dir] || 0;
  view.animate([{ opacity: 0, transform: `translate(${dx}px, 8px)` }, { opacity: 1, transform: 'none' }], { duration: 360, easing: EASE });
}

// Re-render `container` with `update()` and animate keyed children ([data-key]) between the two states.
export function morph(container, update) {
  if (reduced()) { update(); return; }
  const before = new Map();
  for (const el of container.querySelectorAll('[data-key]')) {
    const r = el.getBoundingClientRect();
    if (r.height) before.set(el.dataset.key, { el, r, done: el.classList.contains('done') });
  }
  if (before.size > 120) { update(); return; }
  update();
  const seen = new Set();
  let fresh = 0;
  for (const el of container.querySelectorAll('[data-key]')) {
    const k = el.dataset.key, old = before.get(k);
    seen.add(k);
    const r = el.getBoundingClientRect();
    if (!r.height) continue;
    if (old) {
      const dx = old.r.left - r.left, dy = old.r.top - r.top;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 420, easing: EASE });
      if (!old.done && el.classList.contains('done')) ripple(el);
    } else if (before.size) {
      el.animate([{ opacity: 0, transform: 'translateY(8px) scale(.98)' }, { opacity: 1, transform: 'none' }],
        { duration: 380, easing: EASE, delay: Math.min(fresh++, 6) * 35, fill: 'backwards' });
    }
  }
  // rows that went away drift out from where they were
  for (const [k, { el, r, done }] of before) {
    if (seen.has(k)) continue;
    const ghost = el.cloneNode(true);
    Object.assign(ghost.style, { position: 'absolute', left: r.left + scrollX + 'px', top: r.top + scrollY + 'px', width: r.width + 'px', height: r.height + 'px', margin: 0, pointerEvents: 'none', zIndex: 5 });
    ghost.removeAttribute('data-key'); ghost.setAttribute('aria-hidden', 'true');
    document.body.appendChild(ghost);
    if (done) ripple(ghost);
    ghost.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: done ? 'translateX(28px) scale(.98)' : 'scale(.96)' }],
      { duration: done ? 520 : 320, delay: done ? 160 : 0, easing: EASE_IN, fill: 'both' }).finished.then(() => ghost.remove(), () => ghost.remove());
  }
}

// a soft mint ring spreading out from a quest's tick
export function ripple(row) {
  const chk = row.querySelector('.chk'); if (!chk || reduced()) return;
  chk.animate([{ boxShadow: '0 0 0 0 rgba(168,216,185,.9)' }, { boxShadow: '0 0 0 14px rgba(168,216,185,0)' }], { duration: 700, easing: EASE });
  chk.animate([{ transform: 'scale(.82)' }, { transform: 'scale(1.06)', offset: .55 }, { transform: 'none' }], { duration: 460, easing: EASE });
}

// replace a screen's markup in place (filters, tabs inside a screen) with the morph treatment
export function swap(html) {
  const view = document.getElementById('view'), y = scrollY;
  const qlist = document.getElementById('qlist'), qy = qlist ? qlist.scrollTop : 0;
  morph(view, () => {
    view.innerHTML = html;
    scrollTo(0, y);
    const nq = document.getElementById('qlist');
    if (nq && qy) nq.scrollTop = qy;
  });
}
