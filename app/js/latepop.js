// The pop-up for a quest ticked after it was due: it still counts, for half the EXP (stats.js LATE), said with a
// wink so it nudges instead of scolds. Same card as the rank-up pop-up.
import { esc } from './ui.js';

const LINES = [
  ['Fashionably late!', 'Done is done, and we love that. But the EXP showed up on time and left without you: you get half.'],
  ['The deadline called…', 'It wants its EXP back. Well, half of it. Beat the clock next time for the full amount.'],
  ['Late delivery!', 'Package received, slightly squashed. Half the EXP for this one; on-time quests get it all.'],
  ['Better late than never!', 'True. But "on time" pays double. This one earns half the EXP.'],
  ['Running on cat time?', 'Mochi naps through deadlines too. Overdue quests earn half the EXP; finish on time to get it all.'],
];
let open = null;
export function latePopup(q) {
  open?.remove();
  const [title, body] = LINES[Math.floor(Math.random() * LINES.length)];
  const el = document.createElement('div');
  el.className = 'rankup latepop'; el.setAttribute('role', 'alertdialog'); el.setAttribute('aria-label', title);
  el.innerHTML = `<div class="rankup-card">
    <div class="late-bang" aria-hidden="true"><span>!</span></div>
    <div class="rankup-k">Done, but overdue</div>
    <h3>${esc(title)}</h3>
    <p class="small"><b>${esc(q.title)}</b> is done. ${esc(body)}</p>
    <div class="late-exp" aria-hidden="true"><span class="late-half">½ EXP</span><span class="late-vs">on time: full EXP</span></div>
    <button class="btn sm" data-rankup-close>Got it, I'll be quicker</button></div>`;
  document.body.append(el);
  open = el;
  const close = () => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); if (open === el) open = null; };
  el.addEventListener('click', e => { if (e.target === el || e.target.closest('[data-rankup-close]')) close(); });
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(close, 9000);
}
