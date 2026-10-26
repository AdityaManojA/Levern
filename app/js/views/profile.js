// A profile (Figma "02 Profile" and "05 Privacy & sharing"): #/profile/me is yours, from this device; #/profile/<uid>
// is someone else's, from their published profile when they made it public. A private one shows only their board
// name and rank.
import * as profile from '../profile.js';
import { isOg, entries, topThreeFrom, OG_UNTIL } from '../board.js';
import { rankChip, rankChipNamed, ogChip, auraOf, auraName, auraSpark } from './common.js';
import { TIER_COLORS, getState } from '../store.js';
import { addDays } from '../dates.js';
import { esc } from '../ui.js';
import { swap } from '../motion.js';
import { seasonOf } from '../stats.js';

let shownId = null, data = null, state = 'idle', place = 0;   // place: last season's top-three place, else 0   // state: idle | loading | public | private | missing
const fmt = n => Number(n || 0).toLocaleString();
const month = ym => new Date(ym + '-15').toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

async function load(id) {
  shownId = id; state = 'loading'; data = null; swap(render({ id }));
  if (id === 'me' || id === await profile.myUid()) { data = profile.mine(); state = 'me'; }
  else {
    const p = await profile.load(id);
    if (p) { data = p; state = 'public'; }
    else { const b = await profile.boardEntry(id); data = b; state = b ? 'private' : 'missing'; }
  }
  // the board was most likely just loaded (a name tapped on it), so this is usually no extra read
  try { const uid = id === 'me' ? await profile.myUid() : id; place = topThreeFrom(await entries({ fresh: false }))[uid] || 0; } catch (e) { place = 0; }
  if (shownId === id && location.hash.startsWith('#/profile')) {
    swap(render({ id }));
    // the year opens on its latest weeks, like GitHub's graph
    const g = document.querySelector('.pg'); if (g) g.scrollLeft = g.scrollWidth;
  }
}

// a year of days as GitHub-style weeks: colour = the most urgent priority finished, strength = how many
function graph(days, end) {
  const n = days.length, start = addDays(end, -(n - 1));
  const lead = new Date(start + 'T12:00:00').getDay();   // empty cells before the first day, so weeks line up
  const cells = [...Array(lead).fill('<i class="pg-x"></i>'), ...days.map((v, i) => {
    const count = Math.floor(v / 10), tier = v % 10, a = count >= 5 ? 1 : count >= 3 ? .75 : count ? .5 : 0;
    return count ? `<i style="--c:${TIER_COLORS[tier]};--a:${a}" title="${addDays(start, i)}: ${count} quest${count === 1 ? '' : 's'}"></i>` : '<i></i>';
  })];
  const total = days.reduce((a, v) => a + Math.floor(v / 10), 0);
  return `<div class="card"><div class="pf-h"><b>${fmt(total)} quests in the last year</b></div>
    <div class="pg" role="img" aria-label="${fmt(total)} quests finished in the last year">${cells.join('')}</div>
    <div class="pg-key small">${TIER_COLORS.map((c, i) => `<span><i style="--c:${c};--a:1"></i>P${i + 1}</span>`).join('')}</div>
    <p class="small">Each day shows the most urgent priority finished that day; a stronger colour means more quests.</p></div>`;
}

function full(p, me) {
  const pub = me ? getState().settings.profilePublic : true;
  return `
    <div class="card pf-top${auraOf(place, seasonOf() - 1).cls}"${auraOf(place, seasonOf() - 1).title}>${auraSpark(place)}
      <div class="pf-cat ${p.cat === 'cookie' ? 'cookie' : ''}" aria-hidden="true"></div>
      <div class="pf-id"><h2>${auraName(place, esc(p.name || 'No name'))}${ogChip((p.seasons || []).some(x => x.s >= 1 && x.s <= OG_UNTIL))}</h2>
        <div class="small">Since ${esc(month(p.since))} · Season ${p.season}</div>
        <div class="pf-ranks">${rankChip(p.seasonExp)}<span class="small">best ever</span>${rankChipNamed(p.bestRank)}</div></div>
    </div>
    ${me ? `<div class="card pf-vis small">${pub ? 'Your profile is <b>public</b>: anyone signed in can open it from the leaderboard.' : 'Your profile is <b>private</b>: others only see your board name and rank.'} <a href="#/leaderboard">Change</a></div>` : ''}
    <div class="grid2 grid4">
      <div class="stat" style="background:var(--sky)"><div class="k">Quests done</div><div class="v">${fmt(p.quests)}</div><div class="s">all time</div></div>
      <div class="stat" style="background:var(--coral)"><div class="k">Streak</div><div class="v">${fmt(p.streak)}</div><div class="s">days · best ${fmt(p.bestStreak)}</div></div>
      <div class="stat" style="background:var(--mint)"><div class="k">Focus</div><div class="v">${Math.round((p.focusMin || 0) / 60)}h</div><div class="s">all time</div></div>
      <div class="stat" style="background:var(--butter)"><div class="k">EXP</div><div class="v">${fmt(p.totalExp)}</div><div class="s">all time</div></div>
    </div>
    ${graph(p.activity || [], p.activityEnd)}
    <div class="card"><div class="pf-h"><b>Season history</b></div>
      <div class="pf-seasons">${(p.seasons || []).map(s => `<div class="pf-s">${rankChipNamed(s.r)}<span class="small">Season ${s.s}${s.s === seasonOf() ? ' · now' : ''} · ${fmt(s.e)} EXP</span></div>`).join('') || '<p class="small">No seasons yet.</p>'}</div></div>`;
}

export function render(params = {}) {
  const id = params.id || 'me';
  if (id !== shownId && state !== 'loading') setTimeout(() => load(id), 0);
  const back = '<a class="lb-back" href="#/leaderboard">‹ Leaderboard</a>';
  if (id !== shownId || state === 'loading' || state === 'idle') return `${back}<div class="card lb-note small">Loading the profile…</div>`;
  if (state === 'me') return `${back}<div class="h-sub">You</div><h1 class="h-title">My profile</h1>${full(data, true)}`;
  if (state === 'public') return `${back}<div class="h-sub">Profile</div><h1 class="h-title">${esc(data.name)}</h1>${full(data, false)}`;
  if (state === 'private') return `${back}<div class="card pf-private${auraOf(place, seasonOf() - 1).cls}"${auraOf(place, seasonOf() - 1).title}>${auraSpark(place)}<div class="pf-lock" aria-hidden="true"></div><h2>${auraName(place, esc(data.name || 'Someone'))}${ogChip(isOg(data))}</h2>
    ${data.season === seasonOf() ? rankChip(data.seasonExp || 0) : ''}<p class="small">This profile is private. You can still see their name, rank and EXP on the board.</p></div>`;
  return `${back}<div class="card lb-note"><b>No profile here</b><p class="small">This person isn't on the board anymore.</p></div>`;
}
export function unmount() { shownId = null; state = 'idle'; }
