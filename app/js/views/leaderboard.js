// Leaderboard: the people who chose to show on the board. Two boards: this season (two weeks, ranked tiers
// from Iron to Radiant, everyone starts again when a new season begins) and Legacy (all EXP since the start).
// Joining is a switch at the top; nothing is shared until it's on. Reached from the EXP card on Home (not in the nav bar).
import { getState } from '../store.js';
import * as board from '../board.js';
import * as account from '../account.js';
import { seasonOf, seasonRange, rankOf, RANKS } from '../stats.js';
import { MAX_BOARD_NAME } from '../namefilter.js';
import { swap } from '../motion.js';
import { esc, play, toast } from '../ui.js';
import { sfx } from '../sound.js';
import { mascot } from '../mascot.js';

let rows = null, loading = false, failed = false, asked = false, mode = 'season', editing = false;

const fmt = n => Number(n || 0).toLocaleString();
const daysLeft = () => Math.max(1, Math.ceil((seasonRange(seasonOf()).end - Date.now()) / 86400000));
const badge = (exp, place) => { const r = rankOf(exp, place); return `<span class="rank rank-${r.toLowerCase()}">${r}</span>`; };

// Each visit to the board, Mochi says where you stand, with a sound: congratulations in the top three, and
// otherwise how many EXP you need to reach the top three. "visit" counts the visits, so it's said once per visit.
let visit = 0, announced = 0;
function announce() {
  if (!rows || !board.isOn() || announced === visit) return;
  const me = rows.findIndex(r => r.me);
  if (me < 0) return;
  announced = visit;
  const rank = me + 1, mine = rows[me].exp, where = mode === 'season' ? ' this season' : '';
  if (rank === 1) { sfx('fanfare'); sfx('sweet'); mascot.react('victory', `Congrats, you're number one${where}!`); }
  else if (rank === 2) { sfx('cheer2'); sfx('sweet'); mascot.react('button', `Congrats, you're number two${where}!`); }
  else if (rank === 3) { sfx('cheer3'); sfx('sweet'); mascot.react('button', `Congrats, you're number three${where}!`); }
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
  try { if (board.isOn()) await board.publish().catch(() => {}); rows = await board.top(mode); }
  catch (e) { failed = true; rows = null; }
  loading = false;
  swap(render());
  if (location.hash.startsWith('#/leaderboard')) announce();
}

function podium(list) {
  const slot = (r, n) => r ? `<div class="lb-slot lb-${n}${r.me ? ' me' : ''}">
      <span class="lb-medal">${n}</span><b class="lb-name">${esc(r.name)}${r.me ? ' <small>(you)</small>' : ''}</b><span class="lb-exp">${fmt(r.exp)} EXP</span>${mode === 'season' ? badge(r.exp, n) : ''}</div>` : '<div class="lb-slot lb-empty"></div>';
  return `<div class="lb-podium" aria-label="Top three">${slot(list[1], 2)}${slot(list[0], 1)}${slot(list[2], 3)}</div>`;
}

function seasonCard() {
  const mine = board.mySeasonExp(), r = rankOf(mine), i = RANKS.findIndex(([n]) => n === r), next = RANKS[i + 1];
  return `<div class="card lb-season">
    <div class="lb-season-h"><b>Season ${seasonOf()}</b><span class="small">${daysLeft()} day${daysLeft() === 1 ? '' : 's'} left</span></div>
    <div class="lb-season-me">${badge(mine)}<span>${fmt(mine)} EXP this season</span></div>
    <div class="small">${next ? `${fmt(next[1] - mine)} EXP to ${next[0]}.` : 'Top tier. Finish first on the board for Radiant.'} Everyone starts again at Iron when a new season begins.</div>
  </div>`;
}

function nameRow(signed) {
  if (!signed) return '';
  const s = getState().settings, shown = board.myBoardName();
  return editing
    ? `<form class="lb-name-edit">
         <input class="field" name="boardName" value="${esc(s.boardName || '')}" maxlength="${MAX_BOARD_NAME}" placeholder="${esc(s.name || 'Your board name')}" aria-label="Name on the board" autocomplete="off" enterkeyhint="done">
         <button class="btn sm" type="submit">Save</button></form>
       <div class="small">Pick any name. Swear words and slurs aren't allowed.</div>`
    : `<div class="srow"><div class="l"><b>Name on the board</b><small>${esc(shown)}</small></div><button class="mini" data-act="lb-name-edit">Change</button></div>`;
}

export function render() {
  const on = board.isOn(), signed = !!account.user(), mine = mode === 'season' ? board.mySeasonExp() : board.myExp();
  if (!asked && signed && rows === null && !loading && !failed) { asked = true; setTimeout(load, 0); }
  const list = rows || [];
  const emptySeason = mode === 'season' && !board.seasonsReady()
    ? `<div class="card lb-note"><b>Seasons are almost here</b><p class="small">The season board switches on with the next server update. Legacy shows everyone's EXP since the start.</p></div>`
    : `<div class="card lb-note"><b>Nobody on the board yet</b><p class="small">${mode === 'season' ? 'A new season just started. Earn some EXP and be the first.' : `Turn on "Show me on the board" and you'll be the first.`}</p></div>`;
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
               <span class="lb-rank">${i + 1}</span><span class="lb-n">${esc(r.name)}${r.me ? ' <small>(you)</small>' : ''}</span>${mode === 'season' ? badge(r.exp, i + 1) : ''}<span class="lb-x">${fmt(r.exp)}</span></div>`).join('')}</div>`
          : emptySeason;
  return `
    <div class="h-sub">Who's on top</div>
    <h1 class="h-title">Leaderboard</h1>
    <a class="lb-back" href="#/home">‹ Home</a>
    <div class="card lb-join">
      <div class="srow"><div class="l"><b>Show me on the board</b><small>${signed ? (on ? `Your name and ${fmt(mine)} EXP are shown` : 'Off. Nothing about you is shared') : 'Sign in first'}</small></div>
        <button class="tog" role="switch" aria-checked="${on}" aria-label="Show me on the board" data-act="lb-toggle" ${signed ? '' : 'disabled'}></button></div>
      ${nameRow(signed)}
    </div>
    <div class="seg lb-tabs" role="tablist">
      <button role="tab" aria-selected="${mode === 'season'}" class="${mode === 'season' ? 'on' : ''}" data-act="lb-mode" data-mode="season">Season ${seasonOf()}</button>
      <button role="tab" aria-selected="${mode === 'legacy'}" class="${mode === 'legacy' ? 'on' : ''}" data-act="lb-mode" data-mode="legacy">Legacy</button>
    </div>
    ${mode === 'season' ? seasonCard() : '<div class="small lb-legacy-note">All the EXP everyone has earned since they started. It never resets.</div>'}
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
  'lb-mode': el => {
    if (el.dataset.mode === mode) return;
    mode = el.dataset.mode; play('click', 0.4);
    rows = null; asked = false; visit += 1; swap(render());
  },
  'lb-name-edit': () => { editing = true; swap(render()); document.querySelector('.lb-name-edit input')?.focus(); },
};

// the name form submits (Save, or Enter on the keyboard)
document.addEventListener('submit', e => {
  const f = e.target.closest?.('.lb-name-edit');
  if (!f) return;
  e.preventDefault();
  if (!board.setBoardName(f.boardName.value)) { toast("That name isn't allowed on the board. Try another."); f.boardName.focus(); return; }
  editing = false; play('click', 0.5); toast('Board name saved', 'good');
  rows = null; asked = false; swap(render());
});
