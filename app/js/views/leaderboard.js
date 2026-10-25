// Leaderboard: the people who chose to show on the board. Two tabs: this season (two weeks, ranked tiers from Iron
// to Master, everyone starts again when a new season begins), which opens first, and Legacy (all EXP since the
// start, never resets). Each shows the top 15, then 15 more per "Show more". Every finished season's final
// standings are at the bottom. The board options (joining, a public profile, the board name) sit in a closed
// Settings dropdown above the boards; nothing is shared until joining. Reached from the EXP card on Home.
import { getState } from '../store.js';
import * as board from '../board.js';
import * as account from '../account.js';
import { seasonOf, seasonRange, nextRank, masterLevel } from '../stats.js';
import { MAX_BOARD_NAME } from '../namefilter.js';
import { swap } from '../motion.js';
import { esc, play, toast } from '../ui.js';
import { sfx } from '../sound.js';
import { mascot } from '../mascot.js';
import { rankChip, ogChip, auraOf, auraName, auraSpark } from './common.js';
import * as profile from '../profile.js';
import { confirmBox } from '../ui.js';

let all = null, top3 = {}, rows = null, loading = false, failed = false, asked = false, mode = 'season', editing = false;
const PAGE = 15;
let shown = {}, openPast = new Set(), settingsOpen = false;   // rows shown per board; past seasons opened
// the podium and rows rise in once, when a board has just loaded; any later redraw shows them as they are
let enter = false;

const fmt = n => Number(n || 0).toLocaleString();
const daysLeft = () => Math.max(1, Math.ceil((seasonRange(seasonOf()).end - Date.now()) / 86400000));

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
  try { if (board.isOn()) await board.publish().catch(() => {}); all = await board.entries(); rows = board.standings(all, mode); top3 = board.topThreeFrom(all); enter = true; }
  catch (e) { failed = true; all = rows = null; }
  loading = false;
  swap(render());
  if (location.hash.startsWith('#/leaderboard')) announce();
}

function podium(list) {
  const slot = (r, n) => { if (!r) return '<div class="lb-slot lb-empty"></div>';
    const p = top3[r.id], au = auraOf(p, seasonOf() - 1);
    return `<div class="lb-slot lb-${n}${r.me ? ' me' : ''}${au.cls}"${au.title}>${auraSpark(p)}
      <span class="lb-medal">${n}</span><a class="lb-name" href="#/profile/${r.me ? 'me' : esc(r.id)}">${auraName(p, esc(r.name))}${ogChip(r.og)}${r.me ? ' <small>(you)</small>' : ''}</a><span class="lb-exp">${fmt(r.exp)} EXP</span>${mode === 'season' ? rankChip(r.exp) : ''}</div>`; };
  return `<div class="lb-podium${enter ? ' enter' : ''}" aria-label="Top three">${slot(list[1], 2)}${slot(list[0], 1)}${slot(list[2], 3)}</div>`;
}

function seasonCard() {
  const mine = board.mySeasonExp(), next = nextRank(mine);
  return `<div class="card lb-season">
    <div class="lb-season-h"><b>Season ${seasonOf()}</b><span class="small">${daysLeft()} day${daysLeft() === 1 ? '' : 's'} left</span></div>
    <div class="lb-season-me">${rankChip(mine)}<span>${fmt(mine)} EXP this season</span></div>
    <div class="small">${fmt(next[1] - mine)} EXP to ${next[0]}.${masterLevel(mine) ? ' Master has no top: every 50 EXP is another level.' : ''} Everyone starts again at Iron when a new season begins.</div>
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

// the rows of one board after the podium: the first 15, then 15 more per "Show more" until everyone is shown
function listCard(list, key, chips) {
  const n = shown[key] || PAGE, more = list.length - n;
  return `<div class="card lb-list${enter ? ' enter' : ''}">${list.slice(0, n).map((r, i) => { const p = typeof key === 'string' && key.startsWith('p') ? 0 : top3[r.id], au = auraOf(p, seasonOf() - 1);
      return `<div class="lb-row${r.me ? ' me' : ''}${au.cls}"${au.title} data-key="lb-${key}-${r.id}">${auraSpark(p)}
      <span class="lb-rank">${i + 1}</span><a class="lb-n" href="#/profile/${r.me ? 'me' : esc(r.id)}">${auraName(p, esc(r.name))}${ogChip(r.og)}${r.me ? ' <small>(you)</small>' : ''}</a>${chips ? rankChip(r.exp) : ''}<span class="lb-x">${fmt(r.exp)}</span></div>`; }).join('')}</div>
    ${more > 0 ? `<button class="btn white sm lb-more" data-act="lb-more" data-k="${esc(String(key))}">Show more <span class="small">(${more} more)</span></button>` : ''}`;
}

const day = ms => new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
// every finished season, newest first: its dates, its winner, and (opened) its full final standings
function pastSeasons() {
  const now = seasonOf(), seasons = Array.from({ length: now - 1 }, (_, i) => now - 1 - i);
  const head = '<div class="sec">Past seasons</div>';
  if (!seasons.length) return `${head}<div class="card lb-note small">Season ${now} is the first season. When it ends (in ${daysLeft()} day${daysLeft() === 1 ? '' : 's'}), its final standings stay here.</div>`;
  return head + seasons.map(n => {
    const list = board.standings(all, n), { start, end } = seasonRange(n), open = openPast.has(n), mine = list.findIndex(r => r.me);
    return `<details class="card lb-past" data-season="${n}" ${open ? 'open' : ''}>
      <summary><b>Season ${n}</b><span class="small">${day(start)} – ${day(end - 1)}</span>
        <span class="lb-past-sum small">${list[0] ? `🏆 ${esc(list[0].name)} · ${fmt(list[0].exp)} EXP` : 'Nobody played'}${mine >= 0 ? ` · you: #${mine + 1}` : ''}</span></summary>
      ${open && list.length ? listCard(list, 'p' + n, true) : ''}
    </details>`;
  }).join('');
}

export function render() {
  const on = board.isOn(), signed = !!account.user(), mine = mode === 'season' ? board.mySeasonExp() : board.myExp();
  if (!asked && signed && rows === null && !loading && !failed) { asked = true; setTimeout(load, 0); }
  const list = rows || [];
  const emptySeason = `<div class="card lb-note"><b>Nobody on the board yet</b><p class="small">${mode === 'season' ? 'A new season just started. Earn some EXP and be the first.' : `Turn on "Show me on the board" in Settings above and you'll be the first.`}</p></div>`;
  const body = !signed
    ? `<div class="card lb-note"><b>Sign in to join the board</b><p class="small">Sign in with Google in Settings. Then turn on "Show me on the board" to see where you stand.</p>
         <a class="btn white sm" href="#/settings">Open Settings</a></div>`
    : failed
      ? `<div class="card lb-note"><b>The board isn't open yet</b><p class="small">We couldn't load it just now. Try again in a moment.</p>
           <button class="btn white sm" data-act="lb-refresh">Try again</button></div>`
      : rows === null || loading
        ? `<div class="card lb-note small">Loading the board…</div>`
        : list.length ? `${podium(list)}${listCard(list, mode, mode === 'season')}` : emptySeason;
  const html = `
    <div class="h-sub">Who's on top</div>
    <h1 class="h-title">Leaderboard</h1>
    <a class="lb-back" href="#/home">‹ Home</a>
    <details class="card lb-join lb-settings" ${settingsOpen ? 'open' : ''}>
      <summary><b>Settings</b><span class="small">${signed ? (on ? `On the board as ${esc(board.myBoardName())}` : 'Not on the board') : 'Sign in first'}</span></summary>
      <div class="srow"><div class="l"><b>Show me on the board</b><small>${signed ? (on ? `Your name and ${fmt(mine)} EXP are shown` : 'Off. Nothing about you is shared') : 'Sign in first'}</small></div>
        <button class="tog" role="switch" aria-checked="${on}" aria-label="Show me on the board" data-act="lb-toggle" ${signed ? '' : 'disabled'}></button></div>
      <div class="srow"><div class="l"><b>Make my profile public</b><small>${signed ? (profile.isPublic() ? 'Anyone signed in can open your profile' : 'Off. Others only see your board name and rank') : 'Sign in first'}</small></div>
        <button class="tog" role="switch" aria-checked="${profile.isPublic()}" aria-label="Make my profile public" data-act="lb-public" ${signed ? '' : 'disabled'}></button></div>
      ${nameRow(signed)}
      ${signed ? '<div class="srow"><div class="l"><b>My profile</b><small>Your ranks, streaks and a year of activity</small></div><a class="mini" href="#/profile/me">Open</a></div>' : ''}
    </details>
    <div class="seg lb-tabs" role="tablist">
      <button role="tab" aria-selected="${mode === 'season'}" class="${mode === 'season' ? 'on' : ''}" data-act="lb-mode" data-mode="season">Season ${seasonOf()}</button>
      <button role="tab" aria-selected="${mode === 'legacy'}" class="${mode === 'legacy' ? 'on' : ''}" data-act="lb-mode" data-mode="legacy">Legacy</button>
    </div>
    ${mode === 'season' ? seasonCard() : '<div class="small lb-legacy-note">All the EXP everyone has earned since they started. It never resets.</div>'}
    ${body}
    ${signed && all && !loading && !failed ? pastSeasons() : ''}
    ${signed && !loading ? '<button class="link lb-refresh" data-act="lb-refresh">Refresh</button>' : ''}`;
  if (rows) enter = false;
  return html;
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
  'lb-public': async el => {
    const next = !profile.isPublic();
    if (next && !(await confirmBox('Make your profile public? Anyone signed in can see your board name, ranks, streaks, totals and a year of activity (never your quest titles, notes or email).', 'Make public'))) return;
    el.setAttribute('aria-checked', next); play('click', 0.5);
    try { await profile.setPublic(next); toast(next ? 'Your profile is public' : 'Your profile is private'); }
    catch (e) { toast('Could not update your profile. Check your connection.'); }
    swap(render());
  },
  'lb-refresh': () => load(),
  'lb-mode': el => {
    if (el.dataset.mode === mode) return;
    mode = el.dataset.mode; play('click', 0.4);
    // the entries are already here: switching tabs only re-ranks them
    if (all) { rows = board.standings(all, mode); enter = true; visit += 1; swap(render()); announce(); }
    else { rows = null; asked = false; visit += 1; swap(render()); }
  },
  'lb-more': el => { const k = el.dataset.k; shown[k] = (shown[k] || PAGE) + PAGE; play('click', 0.3); swap(render()); },
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

// the Settings dropdown and the past seasons remember being open across redraws
document.addEventListener('toggle', e => {
  const d = e.target;
  if (d.classList?.contains('lb-settings')) settingsOpen = d.open;
  else if (d.classList?.contains('lb-past')) {
    const n = +d.dataset.season, was = openPast.has(n);
    d.open ? openPast.add(n) : openPast.delete(n);
    if (d.open !== was) swap(render());   // opening one draws its standings
  }
}, true);
