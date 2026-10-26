// Rank-ups: when this season's EXP lifts you to a new rank (or a new Master level), a pop-up says so, the cat
// celebrates and, if Levern is in the background, a system notification goes out. It also keeps your best rank
// for each season (settings.rankHistory) for your profile. A new season starts quietly from Iron.
import { getState, setSetting, subscribe } from './store.js';
import { seasonOf, seasonExp, rankLabel, rankStep } from './stats.js';
import { rankChip } from './views/common.js';
import { esc } from './ui.js';
import { sfx } from './sound.js';
import { mascot } from './mascot.js';
import { permission, show } from './notify.js';

let open = null;
function popup(label, exp, season) {
  open?.remove();
  const el = document.createElement('div');
  el.className = 'rankup'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', `New rank: ${label}`);
  el.innerHTML = `<div class="rankup-card">
    <div class="rankup-k">New rank · Season ${season}</div>
    <div class="rankup-chip">${rankChip(exp)}</div>
    <h3>You reached ${esc(label)}!</h3>
    <p class="small">${exp} EXP this season.${label.startsWith('Master') ? ' Master has no top: every 50 EXP is another level.' : ' Keep going for the next rank.'}</p>
    <button class="btn sm" data-rankup-close>Nice!</button></div>`;
  document.body.append(el);
  open = el;
  const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); if (open === el) open = null; };
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-rankup-close]')) close(); });
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(close, 7000);
}

function check() {
  const st = getState(), s = st.settings, season = seasonOf();
  const exp = seasonExp(st.history, st.sessions, s.target, season), step = rankStep(exp), label = rankLabel(exp);
  const seen = s.rankSeen;
  // the best rank of each season, for the profile
  const best = s.rankHistory?.[season];
  if (!best || exp > best.exp) setSetting('rankHistory', { ...(s.rankHistory || {}), [season]: { rank: label, exp } });
  if (!seen || seen.season !== season) { setSetting('rankSeen', { season, step }); return; }   // first run or a new season: no pop-up
  if (step <= seen.step) return;
  setSetting('rankSeen', { season, step });
  popup(label, exp, season);
  sfx('fanfare');
  mascot.celebrate(`${label}!`);
  if (document.visibilityState !== 'visible' && permission() === 'granted') show(`New rank: ${label}`, { body: `${exp} EXP this season. Nice work!`, tag: 'rank-up' });
}

export function startRankups() {
  setTimeout(check, 1500);   // after the account's data has loaded
  subscribe(() => setTimeout(check, 0));
}
