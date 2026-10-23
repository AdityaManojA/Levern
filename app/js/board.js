// The leaderboard: people who choose to show up on it, ranked by EXP. Off by default. When someone turns it
// on, their name and EXP go to one public document, taskflowBoard/{uid}. Anyone signed in can read the
// board; only the owner can write their own entry (firestore.rules). Turning it off deletes the entry.
// Two boards come from the same documents: this season's (two weeks, see stats.js) and Legacy (all-time EXP).
// The name shown is the person's own board name (or their name), run through the swear filter.
import * as account from './account.js';
import { getState, onSave, setSetting } from './store.js';
import { summary, seasonExp, seasonOf } from './stats.js';
import { shownName, isClean, tidyName } from './namefilter.js';

const COL = 'taskflowBoard';
export const isOn = () => !!getState().settings.board;
export const myExp = () => { const st = getState(); return summary(st.history, st.sessions, st.settings.target).exp; };
export const mySeasonExp = () => { const st = getState(); return seasonExp(st.history, st.sessions, st.settings.target); };
// the name that goes on the board: the board name if one is set, otherwise the greeting name
export const myBoardName = () => { const s = getState().settings; return shownName(s.boardName || s.name); };

// Season fields need a newer firestore.rules (deployed from the Solodesk repo). Until those are live the
// write is refused, so the entry goes up without them and the season board stays empty, saying why.
let seasonsLive = true;
export const seasonsReady = () => seasonsLive;

let lastSent = '', pushT = null;

// write (or refresh) my entry, only when something on it changed
export async function publish() {
  const fu = await account.firebaseUser();
  if (!fu) return false;
  if (!isOn()) return unpublish();
  const name = myBoardName(), exp = myExp(), season = seasonOf(), sExp = mySeasonExp(), sig = [name, exp, season, sExp].join('|');
  if (sig === lastSent) return true;
  const { db, F } = await account.database();
  const ref = F.doc(db, COL, fu.uid);
  if (seasonsLive) {
    try { await F.setDoc(ref, { name, exp, season, seasonExp: sExp, updated: F.serverTimestamp() }); lastSent = sig; return true; }
    catch (e) { if (e?.code !== 'permission-denied') throw e; seasonsLive = false; }
  }
  await F.setDoc(ref, { name, exp, updated: F.serverTimestamp() });
  lastSent = sig;
  return true;
}

async function unpublish() {
  const fu = await account.firebaseUser();
  if (!fu) return false;
  const { db, F } = await account.database();
  await F.deleteDoc(F.doc(db, COL, fu.uid));
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
// The season board asks only for this season's entries (no composite index needed) and sorts them here.
export async function top(mode = 'season', limit = 25) {
  const fu = await account.firebaseUser();
  const { db, F } = await account.database();
  const row = (d, exp) => ({ id: d.id, name: shownName(d.data().name), exp: exp || 0, me: !!fu && d.id === fu.uid });
  if (mode === 'legacy') {
    const snap = await F.getDocs(F.query(F.collection(db, COL), F.orderBy('exp', 'desc'), F.limit(limit)));
    return snap.docs.map(d => row(d, d.data().exp));
  }
  const snap = await F.getDocs(F.query(F.collection(db, COL), F.where('season', '==', seasonOf()), F.limit(500)));
  return snap.docs.map(d => row(d, d.data().seasonExp)).sort((a, b) => b.exp - a.exp).slice(0, limit);
}

export function startBoard() {
  onSave(publishSoon);
  account.onAccount(() => publishSoon());
}
