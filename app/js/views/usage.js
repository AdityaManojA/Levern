// Owner-only report of the anonymous screen-usage counts (usage.js): which screens people open, how long they
// stay, how far they scroll, and which buttons they tap. Not linked anywhere: open getlevern.web.app/#/usage.
// The database rules only let the owner's account read levernUsage, so for anyone else this page says so.
import * as account from '../account.js';
import { FIRESTORE_COLLECTIONS } from '../constants.js';
import { dayKey } from '../usage.js';
import { swap } from '../motion.js';
import { esc } from '../ui.js';

const LABELS = { home: 'Home', quests: 'Quests', quest: 'Quest details', calendar: 'Calendar', focus: 'Focus', stats: 'Stats',
  settings: 'Settings', leaderboard: 'Leaderboard', profile: 'Profiles', whatsnew: "What's new" };
// the counts are read once and kept for 10 minutes: redraws (a quest saved elsewhere) don't read them again
const FRESH_MS = 10 * 60 * 1000;
let range = 7, state = { status: 'idle' }, loadedFor = 0;

// many day documents → one total per screen and per button. Values are checked: the documents come from people's devices.
export function summarize(docs) {
  const num = x => (Number.isFinite(+x) && +x > 0 ? +x : 0);
  const views = {}, acts = {}, days = new Set(), dev = { phone: 0, desktop: 0 };
  for (const d of docs) {
    if (typeof d.day === 'string') days.add(d.day);
    if (d.dev === 'phone' || d.dev === 'desktop') dev[d.dev]++;
    for (const [k, r] of Object.entries(d.v || {})) {
      if (!Array.isArray(r)) continue;
      const t = (views[k] ||= { visits: 0, secs: 0, depth: 0 });
      t.visits += num(r[0]); t.secs += num(r[1]); t.depth += num(r[2]);
    }
    for (const [k, n] of Object.entries(d.a || {})) acts[k] = (acts[k] || 0) + num(n);
  }
  const totalSecs = Object.values(views).reduce((n, v) => n + v.secs, 0);
  const rows = Object.entries(views).map(([name, v]) => ({
    name, visits: v.visits, secs: v.secs,
    share: totalSecs ? v.secs / totalSecs : 0,
    avgSecs: v.visits ? v.secs / v.visits : 0,
    avgDepth: v.visits ? Math.min(100, v.depth / v.visits) : 0,
  })).sort((a, b) => b.secs - a.secs || b.visits - a.visits);
  const taps = Object.entries(acts).sort((a, b) => b[1] - a[1]);
  return { rows, taps, totalSecs, deviceDays: docs.length, days: days.size, dev };
}

const dur = s => s >= 3600 ? `${Math.floor(s / 3600)}h ${Math.round(s % 3600 / 60)}m` : s >= 60 ? `${Math.floor(s / 60)}m ${Math.round(s % 60)}s` : `${Math.round(s)}s`;

async function load() {
  const n = ++loadedFor;
  state = { status: 'loading' };
  try {
    const { db, F } = await account.database();
    if (!(await account.firebaseUser())) throw Object.assign(new Error('signed out'), { code: 'permission-denied' });
    const since = dayKey(Date.now() - range * 864e5);
    const snap = await F.getDocs(F.query(F.collection(db, FIRESTORE_COLLECTIONS.USAGE), F.where('day', '>=', since)));
    if (n !== loadedFor) return;
    state = { status: 'ok', sum: summarize(snap.docs.map(d => d.data())), at: Date.now() };
  } catch (e) {
    if (n !== loadedFor) return;
    state = { status: e?.code === 'permission-denied' ? 'denied' : 'error' };
  }
  if (location.hash.startsWith('#/usage')) swap(render());
}

function body() {
  if (state.status === 'denied') return `<div class="card"><div class="empty"><b>Owner only</b><span class="small">This page shows Levern's usage counts to the app's owner.</span></div></div>`;
  if (state.status === 'error') return `<div class="card"><div class="empty"><b>Couldn't load the counts</b><span class="small">Check the connection and open this page again.</span></div></div>`;
  if (state.status !== 'ok') return `<p class="sync-wait" role="status">Loading usage…</p>`;
  const s = state.sum;
  if (!s.rows.length) return `<div class="card"><div class="empty"><b>No counts yet</b><span class="small">Each device sends a day's counts the next time Levern opens on a later day, so the first numbers show up tomorrow.</span></div></div>`;
  const maxTap = s.taps[0]?.[1] || 1;
  return `
    <div class="grid2 grid4">
      <div class="stat" style="background:var(--mint)"><div class="k">Active time</div><div class="v">${dur(s.totalSecs)}</div><div class="s">all screens</div></div>
      <div class="stat" style="background:var(--sky)"><div class="k">Device-days</div><div class="v">${s.deviceDays}</div><div class="s">over ${s.days} day${s.days === 1 ? '' : 's'}</div></div>
      <div class="stat" style="background:var(--butter)"><div class="k">Phone</div><div class="v">${s.deviceDays ? Math.round(s.dev.phone / s.deviceDays * 100) : 0}%</div><div class="s">of device-days</div></div>
      <div class="stat" style="background:var(--coral)"><div class="k">Visits</div><div class="v">${s.rows.reduce((n, r) => n + r.visits, 0)}</div><div class="s">screen opens</div></div>
    </div>
    <div class="card tiers usage">
      <h3>Share of time by screen</h3>
      ${s.rows.map(r => `<div class="tr"><span>${esc(LABELS[r.name] || r.name)}</span><div class="bar"><i style="width:${r.share * 100}%;--c:var(--mint)"></i></div><span>${Math.round(r.share * 100)}%</span></div>`).join('')}
    </div>
    <div class="card usage-t" role="region" aria-label="Usage by screen" tabindex="0">
      <h3>By screen</h3>
      <table>
        <thead><tr><th scope="col">Screen</th><th scope="col">Visits</th><th scope="col">Total</th><th scope="col">Per visit</th><th scope="col">Scrolled</th></tr></thead>
        <tbody>${s.rows.map(r => `<tr><td>${esc(LABELS[r.name] || r.name)}</td><td>${r.visits}</td><td>${dur(r.secs)}</td><td>${dur(r.avgSecs)}</td><td>${Math.round(r.avgDepth)}%</td></tr>`).join('')}</tbody>
      </table>
      <div class="small" style="margin-top:8px">Time counts only while the screen is in front and someone touched, typed or scrolled in the last 2 minutes. "Scrolled" is how far down the screen people got, on average.</div>
    </div>
    ${s.taps.length ? `<div class="card tiers usage">
      <h3>Most-tapped buttons</h3>
      ${s.taps.slice(0, 15).map(([k, n]) => `<div class="tr"><span>${esc(k)}</span><div class="bar"><i style="width:${n / maxTap * 100}%;--c:var(--sky)"></i></div><span>${n}</span></div>`).join('')}
    </div>` : ''}`;
}

export function render() {
  if (state.status === 'idle' || (state.status === 'ok' && Date.now() - state.at > FRESH_MS)) { state.status = 'loading'; queueMicrotask(load); }
  return `
    <div class="h-sub">Owner only · anonymous</div>
    <h1 class="h-title">Usage</h1>
    <div class="seg" style="width:auto;margin-bottom:12px">${[7, 30, 90].map(n => `<button class="${range === n ? 'on' : ''}" data-act="usage-range" data-n="${n}" style="padding:4px 12px">${n} days</button>`).join('')}</div>
    ${body()}`;
}
export const actions = {
  'usage-range': el => { range = +el.dataset.n; load(); swap(render()); },
};
