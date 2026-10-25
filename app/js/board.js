// The leaderboard: people who choose to show up on it, ranked by EXP. Off by default. When someone turns it
// on, their name and EXP go to one public document, taskflowBoard/{uid}. Anyone signed in can read the
// board; only the owner can write their own entry (firestore.rules). Turning it off hides the entry: the name
// is cleared and it's marked hidden (the rules don't allow deleting it, see below).
// Two boards come from the same documents: this season's (two weeks, see stats.js) and Legacy (all-time EXP).
// The name shown is the person's own board name (or their name), run through the swear filter.
// Past seasons: when an entry moves to a new season, its final score for the season before is kept in past
// ({ '1': 120 }), so every finished season keeps its full standings (the rules only let that score be copied).
//
// EXP is worked out here in the app (the free Firebase plan has no server code), so firestore.rules limit how
// fast an entry's EXP can grow: a bucket of up to 60 EXP that refills 15 an hour, and at most 3000 EXP for a
// new entry. Honest use never gets near that (30 a day from quests, 12 an hour from nonstop focus). The app
// sends what the rules will accept, so a big jump (lowering the daily target raises past days' EXP) shows up
// over the following hours instead of being refused.
import * as account from './account.js';
import { getState, onSave, setSetting } from './store.js';
import { summary, seasonExp, seasonOf } from './stats.js';
import { shownName, isClean, tidyName } from './namefilter.js';

const COL = 'taskflowBoard';
export const BUCKET = 60, REFILL = 15, START_CAP = 3000, START_SEASON_CAP = 420;
export const isOn = () => !!getState().settings.board;
export const myExp = () => { const st = getState(); return summary(st.history, st.sessions, st.settings.target).exp; };
export const mySeasonExp = () => { const st = getState(); return seasonExp(st.history, st.sessions, st.settings.target); };
// the name that goes on the board: the board name if one is set, otherwise the greeting name
export const myBoardName = () => { const s = getState().settings; return shownName(s.boardName || s.name); };

// What the rules will accept, from my entry as it is now (o: { exp, season, seasonExp, bank, updatedMs } or null).
// Mirrors tfBoardGrowth in firestore.rules, a little on the safe side for clock differences.
export function allowed(o, want, nowMs = Date.now()) {
  if (!o) {
    const exp = Math.min(want.exp, START_CAP);
    return { exp, seasonExp: Math.min(want.seasonExp, START_SEASON_CAP, exp), bank: 0 };
  }
  const hrs = Math.max(0, (nowMs - o.updatedMs) / 3600000 - 0.1);
  const room = Math.floor(Math.min(BUCKET, (o.bank || 0) + REFILL * hrs) * 100) / 100;
  let exp = want.exp;
  if (exp - o.exp > room) exp = o.exp + Math.floor(room);
  // season EXP grows from where it was this season (or from 0 in a new one), at most as far as the bucket allows,
  // and never past all-time EXP. It can catch up on its own: when the season's EXP is worked out again (the
  // season's start moved, the daily target changed), all-time EXP stays put while season EXP rises.
  const same = (o.season || 0) === want.season, base = same ? (o.seasonExp || 0) : 0;
  const sExp = Math.max(0, Math.min(want.seasonExp, base + Math.floor(room), exp));
  const used = Math.max(0, exp - o.exp, sExp - base);
  return { exp, seasonExp: sExp, bank: Math.max(0, Math.floor((room - used) * 100) / 100) };
}

let lastSent = '', pushT = null, catchUpT = null;

// the past scores to write: as they are, plus the season just finished when the entry moves on to a new one
export function carryPast(o, season) {
  const past = { ...(o?.past || {}) };
  if (o && o.season && o.season !== season && past[o.season] === undefined) past[o.season] = o.seasonExp || 0;
  return past;
}

async function current(F, ref) {
  const snap = await F.getDoc(ref);
  if (!snap.exists()) return null;
  const d = snap.data();
  return { exp: d.exp || 0, season: d.season || 0, seasonExp: d.seasonExp || 0, bank: d.bank || 0, updatedMs: d.updated?.toMillis?.() ?? 0, hidden: !!d.hidden, past: d.past || {} };
}

// write (or refresh) my entry, only when something on it changed
export async function publish() {
  const fu = await account.firebaseUser();
  if (!fu) return false;
  if (!isOn()) return unpublish();
  const name = myBoardName(), want = { exp: myExp(), season: seasonOf(), seasonExp: mySeasonExp() };
  const sig = [name, want.exp, want.season, want.seasonExp].join('|');
  if (sig === lastSent) return true;
  const { db, F } = await account.database();
  const ref = F.doc(db, COL, fu.uid);
  const o = await current(F, ref), got = allowed(o, want), past = carryPast(o, want.season);
  await F.setDoc(ref, { name, exp: got.exp, season: want.season, seasonExp: got.seasonExp, bank: got.bank, hidden: false, updated: F.serverTimestamp(), ...(Object.keys(past).length ? { past } : {}) });
  // all of it went up: done until something changes. Otherwise send the rest when the limit allows.
  clearTimeout(catchUpT);
  if (got.exp === want.exp && got.seasonExp === want.seasonExp) lastSent = sig;
  else { lastSent = ''; catchUpT = setTimeout(publishSoon, 60 * 60 * 1000); }
  return true;
}

// off the board: hide my entry (name cleared), keeping its EXP so the growth limit still applies if I come back
export async function unpublish() {
  const fu = await account.firebaseUser();
  if (!fu) return false;
  const { db, F } = await account.database();
  const ref = F.doc(db, COL, fu.uid), o = await current(F, ref);
  if (!o || o.hidden) { lastSent = ''; return true; }
  const season = seasonOf(), got = allowed(o, { exp: o.exp, season, seasonExp: o.season === season ? o.seasonExp : 0 });
  const past = carryPast(o, season);
  await F.setDoc(ref, { name: '', exp: got.exp, season, seasonExp: got.seasonExp, bank: got.bank, hidden: true, updated: F.serverTimestamp(), ...(Object.keys(past).length ? { past } : {}) });
  lastSent = '';
  return true;
}

// saves come in bursts while someone works: send once things settle
export function publishSoon() {
  clearTimeout(pushT);
  pushT = setTimeout(() => { publish().catch(() => {}); }, 2500);
}

export async function setOn(on) {
  setSetting('board', !!on);
  return on ? publish() : unpublish();
}

// Set the board name. Returns false (and keeps the old one) when it doesn't pass the swear filter.
export function setBoardName(raw) {
  const name = tidyName(raw);
  if (name && !isClean(name)) return false;
  setSetting('boardName', name, { quiet: true });
  publishSoon();
  return true;
}

// Everyone on the board (people who left it are skipped), loaded once for all the boards: this season, Legacy
// and every past season are worked out from these entries (standings).
export async function entries() {
  const fu = await account.firebaseUser();
  const { db, F } = await account.database();
  const snap = await F.getDocs(F.query(F.collection(db, COL), F.limit(1000)));
  return snap.docs.filter(d => !d.data().hidden).map(d => {
    const x = d.data();
    return { id: d.id, name: shownName(x.name), exp: x.exp || 0, season: x.season || 0, seasonExp: x.seasonExp || 0, past: x.past || {}, me: !!fu && d.id === fu.uid, og: isOg(x) };
  });
}
// OG: someone who was on the board in Season 1, the first season (its score is kept in past when the entry moves
// on; an entry nobody has opened since still says season 1). Shown as a small badge by their name.
export const isOg = e => !!e && (e.past?.[1] !== undefined || e.season === 1);
// One board, best first: [{ id, name, exp, me }]. which: 'legacy' (all-time EXP), 'season' (this season) or a past
// season's number (its final scores: kept in past, or still the season's score if the entry hasn't moved on).
export function standings(list, which, now = seasonOf()) {
  const score = which === 'legacy' ? r => r.exp
    : which === 'season' ? r => (r.season === now ? r.seasonExp : null)
    : r => r.past?.[which] ?? (r.season === which ? r.seasonExp : null);
  return (list || []).map(r => ({ id: r.id, name: r.name, me: r.me, og: r.og, exp: score(r) }))
    .filter(r => r.exp != null && (which === 'legacy' || r.exp > 0 || r.me)).sort((a, b) => b.exp - a.exp);
}

export function startBoard() {
  onSave(publishSoon);
  account.onAccount(() => publishSoon());
}
