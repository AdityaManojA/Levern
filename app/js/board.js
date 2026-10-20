// The leaderboard: people who choose to show up on it, ranked by EXP. Off by default. When someone turns it
// on, their name and EXP go to one public document, taskflowBoard/{uid}. Anyone signed in can read the
// board; only the owner can write their own entry (firestore.rules). Turning it off deletes the entry.
import * as account from './account.js';
import { getState, onSave, setSetting } from './store.js';
import { summary } from './stats.js';

const COL = 'taskflowBoard';
export const isOn = () => !!getState().settings.board;
export const myExp = () => { const st = getState(); return summary(st.history, st.sessions, st.settings.target).exp; };

let lastSent = '', pushT = null;

// write (or refresh) my entry, only when the name or EXP changed
export async function publish() {
  const fu = await account.firebaseUser();
  if (!fu) return false;
  if (!isOn()) return unpublish();
  const name = (getState().settings.name || 'Someone').slice(0, 30), exp = myExp(), sig = name + '|' + exp;
  if (sig === lastSent) return true;
  const { db, F } = await account.database();
  await F.setDoc(F.doc(db, COL, fu.uid), { name, exp, updated: F.serverTimestamp() });
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

// the top of the board, best first: [{ id, name, exp, me }]
export async function top(limit = 25) {
  const fu = await account.firebaseUser();
  const { db, F } = await account.database();
  const snap = await F.getDocs(F.query(F.collection(db, COL), F.orderBy('exp', 'desc'), F.limit(limit)));
  return snap.docs.map(d => ({ id: d.id, name: d.data().name || 'Someone', exp: d.data().exp || 0, me: !!fu && d.id === fu.uid }));
}

export function startBoard() {
  onSave(publishSoon);
  account.onAccount(() => publishSoon());
}
