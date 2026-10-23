// The leaderboard: people who choose to show up on it, ranked by EXP. Off by default. When someone turns it
// on, their name and EXP go to one public document, taskflowBoard/{uid}. Anyone signed in can read the
// board; only the owner can write their own entry (firestore.rules). Turning it off hides the entry: the name
// is cleared and it's marked hidden (the rules don't allow deleting it, see below).
// Two boards come from the same documents: this season's (two weeks, see stats.js) and Legacy (all-time EXP).
// The name shown is the person's own board name (or their name), run through the swear filter.
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
  const room = Math.min(BUCKET, (o.bank || 0) + REFILL * hrs);
  let exp = want.exp;
  if (exp - o.exp > room) exp = o.exp + Math.floor(room);
  const gain = Math.max(0, exp - o.exp), same = (o.season || 0) === want.season;
  const seasonMax = same ? (exp - o.exp <= 0 ? (o.seasonExp || 0) : (o.seasonExp || 0) + gain) : gain;
  const sExp = Math.max(0, Math.min(want.seasonExp, seasonMax, exp));
  return { exp, seasonExp: sExp, bank: Math.max(0, Math.floor((room - gain) * 100) / 100) };
}

let lastSent = '', pushT = null, catchUpT = null;

async function current(F, ref) {
  const snap = await F.getDoc(ref);
  if (!snap.exists()) return null;
  const d = snap.data();
  return { exp: d.exp || 0, season: d.season || 0, seasonExp: d.seasonExp || 0, bank: d.bank || 0, updatedMs: d.updated?.toMillis?.() ?? 0, hidden: !!d.hidden };
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
  const got = allowed(await current(F, ref), want);
  await F.setDoc(ref, { name, exp: got.exp, season: want.season, seasonExp: got.seasonExp, bank: got.bank, hidden: false, updated: F.serverTimestamp() });
  // all of it went up: done until something changes. Otherwise send the rest when the limit allows.
  clearTimeout(catchUpT);
  if (got.exp === want.exp && got.seasonExp === want.seasonExp) lastSent = sig;
  else { lastSent = ''; catchUpT = setTimeout(publishSoon, 60 * 60 * 1000); }
  return true;
}

// off the board: hide my entry (name cleared), keeping its EXP so the growth limit still applies if I come back
async function unpublish() {
  const fu = await account.firebaseUser();
  if (!fu) return false;
  const { db, F } = await account.database();
  const ref = F.doc(db, COL, fu.uid), o = await current(F, ref);
  if (!o || o.hidden) { lastSent = ''; return true; }
  const season = seasonOf(), got = allowed(o, { exp: o.exp, season, seasonExp: o.season === season ? o.seasonExp : 0 });
  await F.setDoc(ref, { name: '', exp: got.exp, season, seasonExp: got.seasonExp, bank: got.bank, hidden: true, updated: F.serverTimestamp() });
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

// The top of a board, best first: [{ id, name, exp, me }]. 'season' ranks this season's EXP, 'legacy' all-time EXP.
// Hidden entries (people who left the board) are skipped. The season board asks only for this season's entries
// (no composite index needed) and sorts them here.
export async function top(mode = 'season', limit = 25) {
  const fu = await account.firebaseUser();
  const { db, F } = await account.database();
  const row = (d, exp) => ({ id: d.id, name: shownName(d.data().name), exp: exp || 0, me: !!fu && d.id === fu.uid });
  const shown = d => !d.data().hidden;
  if (mode === 'legacy') {
    const snap = await F.getDocs(F.query(F.collection(db, COL), F.orderBy('exp', 'desc'), F.limit(limit * 3)));
    return snap.docs.filter(shown).slice(0, limit).map(d => row(d, d.data().exp));
  }
  const snap = await F.getDocs(F.query(F.collection(db, COL), F.where('season', '==', seasonOf()), F.limit(500)));
  return snap.docs.filter(shown).map(d => row(d, d.data().seasonExp)).sort((a, b) => b.exp - a.exp).slice(0, limit);
}

export function startBoard() {
  onSave(publishSoon);
  account.onAccount(() => publishSoon());
}
