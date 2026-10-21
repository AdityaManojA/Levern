// Leaderboard: the people who chose to show on the board, by EXP. Joining is a switch at the top; nothing
// is shared until it's on. Reached from the EXP card on Home (not in the nav bar).
import { getState } from '../store.js';
import * as board from '../board.js';
import * as account from '../account.js';
import { swap } from '../motion.js';
import { esc, play, toast } from '../ui.js';
import { sfx } from '../sound.js';
import { mascot } from '../mascot.js';

let rows = null, loading = false, failed = false, asked = false;

const fmt = n => Number(n || 0).toLocaleString();

// Each visit to the board, Mochi says where you stand, with a sound: congratulations in the top three, and
// otherwise how many EXP you need to reach the top three. "visit" counts the visits, so it's said once per visit.
let visit = 0, announced = 0;
function announce() {
  if (!rows || !board.isOn() || announced === visit) return;
  const me = rows.findIndex(r => r.me);
  if (me < 0) return;
  announced = visit;
  const rank = me + 1, mine = rows[me].exp;
  if (rank === 1) { sfx('fanfare'); sfx('sweet'); mascot.react('victory', "Congrats, you're number one!"); }
  else if (rank === 2) { sfx('cheer2'); sfx('sweet'); mascot.react('button', "Congrats, you're number two!"); }
  else if (rank === 3) { sfx('cheer3'); sfx('sweet'); mascot.react('button', "Congrats, you're number three!"); }
  else {
    const need = Math.max(1, (rows[2]?.exp ?? 0) - mine + 1);
    mascot.react('notify', `${fmt(need)} EXP to reach the top three. Go for it!`);
  }
}
// called by the app each time the board is opened
export function mount() { visit += 1; announce(); }

async function load() {
  if (loading) return;
  loading = true; failed = false; swap(render());
  try { rows = await board.top(); }
  catch (e) { failed = true; rows = null; }
  loading = false;
  swap(render());
  if (location.hash.startsWith('#/leaderboard')) announce();
}

function podium(list) {
  const slot = (r, n) => r ? `<div class="lb-slot lb-${n}${r.me ? ' me' : ''}">
      <span class="lb-medal">${n}</span><b class="lb-name">${esc(r.name)}${r.me ? ' <small>(you)</small>' : ''}</b><span class="lb-exp">${fmt(r.exp)} EXP</span></div>` : '<div class="lb-slot lb-empty"></div>';
  return `<div class="lb-podium" aria-label="Top three">${slot(list[1], 2)}${slot(list[0], 1)}${slot(list[2], 3)}</div>`;
}

export function render() {
  const st = getState(), on = board.isOn(), signed = !!account.user(), mine = board.myExp();
  if (!asked && signed && rows === null && !loading && !failed) { asked = true; setTimeout(load, 0); }
  const list = rows || [];
  const body = !signed
    ? `<div class="card lb-note"><b>Sign in to join the board</b><p class="small">Sign in with Google in Settings. Then turn on "Show me on the board" to see where you stand.</p>
         <a class="btn white sm" href="#/settings">Open Settings</a></div>`
    : failed
      ? `<div class="card lb-note"><b>The board isn't open yet</b><p class="small">We couldn't load it just now. Try again in a moment.</p>
           <button class="btn white sm" data-act="lb-refresh">Try again</button></div>`
      : rows === null || loading
        ? `<div class="card lb-note small">Loading the board…</div>`
        : list.length
          ? `${podium(list)}
             <div class="card lb-list">${list.map((r, i) => `<div class="lb-row${r.me ? ' me' : ''}" data-key="lb-${r.id}">
               <span class="lb-rank">${i + 1}</span><span class="lb-n">${esc(r.name)}${r.me ? ' <small>(you)</small>' : ''}</span><span class="lb-x">${fmt(r.exp)}</span></div>`).join('')}</div>`
          : `<div class="card lb-note"><b>Nobody on the board yet</b><p class="small">Turn on "Show me on the board" and you'll be the first.</p></div>`;
  return `
    <div class="h-sub">Who's on top</div>
    <h1 class="h-title">Leaderboard</h1>
    <a class="lb-back" href="#/home">‹ Home</a>
    <div class="card lb-join">
      <div class="srow"><div class="l"><b>Show me on the board</b><small>${signed ? (on ? `Your name and ${fmt(mine)} EXP are shown` : 'Off. Nothing about you is shared') : 'Sign in first'}</small></div>
        <button class="tog" role="switch" aria-checked="${on}" aria-label="Show me on the board" data-act="lb-toggle" ${signed ? '' : 'disabled'}></button></div>
    </div>
    ${body}
    ${signed && !loading ? '<button class="link lb-refresh" data-act="lb-refresh">Refresh</button>' : ''}`;
}

export const actions = {
  'lb-toggle': async el => {
    const next = !board.isOn();
    el.setAttribute('aria-checked', next);
    play('click', 0.5);
    try { await board.setOn(next); toast(next ? 'You are on the board' : 'Off the board'); }
    catch (e) { toast('Could not update the board. Check your connection.'); }
    rows = null; asked = false; swap(render());
  },
  'lb-refresh': () => load(),
};
