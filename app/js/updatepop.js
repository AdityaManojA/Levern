// The "What's new" pop-up: when an update ships, each person sees it once, on whichever device opens first,
// and never again. Seen is remembered in their synced settings (updateSeen), so every device of theirs knows,
// plus a copy on the device so it never flashes before the account has loaded.
// Rules that keep it to once:
//  - only after the account has synced (a second device must learn it was already seen before deciding),
//  - it's marked seen BEFORE it shows, so closing the tab half-way still counts,
//  - a new person who has just finished the welcome screens starts up to date (no notes for an app they just got).
import { CHANGELOG } from './changelog.js';
import { getState, setSetting } from './store.js';
import { cloudReady, cloudInfo, onCloud } from './cloud.js';
import * as account from './account.js';
import { esc } from './ui.js';

const KEY = 'levern-update-seen';
const userKey = () => {
  try {
    const u = account.user();
    return u?.uid ? `${KEY}-${u.uid}` : KEY;
  } catch (e) { return KEY; }
};
const latest = () => CHANGELOG[0].v;
const parts = v => String(v || '0').split('.').map(n => parseInt(n, 10) || 0);
// a > b for versions like 1.09 / 1.10
export function newer(a, b) {
  const x = parts(a), y = parts(b);
  for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
  return false;
}
const localSeen = () => {
  try {
    const uk = userKey();
    return localStorage.getItem(uk) || localStorage.getItem(KEY) || '';
  } catch (e) { return ''; }
};
const seenVersion = () => { const a = getState().settings.updateSeen || '', b = localSeen(); return newer(a, b) ? a : b; };
function markSeen(v) {
  try {
    localStorage.setItem(userKey(), v);
    localStorage.setItem(KEY, v);
  } catch (e) {}
  if (getState().settings.updateSeen !== v) setSetting('updateSeen', v, { quiet: true });
}

// a person who just finished the welcome screens: nothing to catch up on
export const markCurrentSeen = () => markSeen(latest());

let shown = false, el = null;
export const isShowing = () => !!el;

// the updates this person hasn't seen yet, newest first (at most three in the pop-up)
export const unseen = (seen = seenVersion()) => CHANGELOG.filter(r => !seen || newer(r.v, seen));

export function maybeShowUpdate({ onboardingOpen = false, force = false } = {}) {
  if (shown || onboardingOpen || !getState().onboarded) return false;
  // wait for cloud sync if user is signed in and cloud is configured, unless offline/timeout or force
  const u = account.user();
  if (!force && u && cloudReady() && !cloudInfo().lastSync) return false;
  const seen = seenVersion();
  if (seen && !newer(latest(), seen)) return false;
  // someone who had never seen a pop-up gets only the latest update, not the whole history
  const list = seen ? unseen(seen).slice(0, 3) : [CHANGELOG[0]];
  shown = true;
  markSeen(latest());            // first, so it can never show twice
  open(list);
  return true;
}

function open(list) {
  const top = list[0];
  el = document.createElement('div');
  el.className = 'rankup updatepop';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', `What's new in ${top.v}`);
  el.innerHTML = `<div class="rankup-card up-card">
    <div class="rankup-k">What's new${list.length > 1 ? ` · ${list.length} updates` : ` · ${esc(top.v)}`}</div>
    <h3>${esc(top.title)}</h3>
    ${top.note ? `<p class="up-note">${esc(top.note)}</p>` : ''}
    <div class="up-list">${list.map((r, i) => `<div class="up-rel">${list.length > 1 || i ? `<div class="up-v"><span class="wn-v">${esc(r.v)}</span>${i ? `<b>${esc(r.title)}</b>` : ''}</div>` : ''}
      <ul>${r.items.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`).join('')}</div>
    ${top.tip ? `<p class="up-tip"><b>Tip:</b> ${esc(top.tip)}</p>` : ''}
    <div class="row-btns up-btns"><a class="btn white sm" href="#/whatsnew" data-up-close>Read the full changelog</a><button class="btn dark sm" type="button" data-up-close>Got it</button></div>
  </div>`;
  document.body.append(el);
  const close = () => { if (!el) return; const e = el; el = null; e.classList.remove('show'); setTimeout(() => e.remove(), 300); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-up-close]')) close(); });
  document.addEventListener('keydown', onKey);
  requestAnimationFrame(() => el?.classList.add('show'));
  el.querySelector('[data-up-close].btn.dark')?.focus({ preventScroll: true });
}

// check once things have settled, and again when the account finishes syncing (the first check may be too early)
export function startUpdatePop(isOnboardingOpen) {
  const tryIt = (force = false) => setTimeout(() => maybeShowUpdate({ onboardingOpen: isOnboardingOpen(), force }), 1200);
  tryIt(false);
  onCloud(() => tryIt(false));
  account.onAccount(() => tryIt(false));
  setTimeout(() => tryIt(true), 2500);
}
