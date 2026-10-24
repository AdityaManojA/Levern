// Public profiles (taskflowProfiles/{uid} in Firestore). Off until the person turns on "Make my profile public"
// (Leaderboard); then a summary is published, never quest titles, notes, email or photo: the board name, the cat,
// this season's rank, the best rank ever, past seasons, total EXP, streaks, quests done, focus time and a year of
// activity (per day: how many quests, and the most urgent priority finished). Turning it off deletes it.
import { getState, setSetting, onSave } from './store.js';
import * as account from './account.js';
import { summary, seasonOf, seasonExp, rankLabel, rankStep, countsByDay } from './stats.js';
import { myBoardName, myExp } from './board.js';
import { todayStr, addDays } from './dates.js';

const COL = 'taskflowProfiles', DAYS = 371;
export const isPublic = () => !!getState().settings.profilePublic;

// a year of activity, oldest first: count * 10 + the most urgent priority finished that day (0 = P1 … 5 = P6), 0 = none
export function activity(history, end = todayStr()) {
  const by = new Map();
  for (const h of history) {
    const d = todayStr(new Date(h.doneAt)), cur = by.get(d) || { n: 0, top: 9 };
    cur.n++; cur.top = Math.min(cur.top, h.tier ?? 3); by.set(d, cur);
  }
  const out = [];
  for (let i = DAYS - 1; i >= 0; i--) { const c = by.get(addDays(end, -i)); out.push(c ? Math.min(c.n, 99) * 10 + Math.min(c.top, 5) : 0); }
  return out;
}

// the person's own profile, from this device's data (what is published when it's public)
export function mine() {
  const st = getState(), s = st.settings, season = seasonOf();
  const sum = summary(st.history, st.sessions, s.target), sExp = seasonExp(st.history, st.sessions, s.target, season);
  const hist = Object.entries(s.rankHistory || {}).map(([k, v]) => ({ season: +k, rank: v.rank, exp: v.exp })).sort((a, b) => b.season - a.season).slice(0, 52);
  if (!hist.some(h => h.season === season)) hist.unshift({ season, rank: rankLabel(sExp), exp: sExp });
  const best = hist.reduce((b, h) => (!b || rankStep(h.exp) > rankStep(b.exp) ? h : b), null);
  const days = [...countsByDay(st.history).keys()].sort();
  return {
    name: myBoardName(), cat: s.mochiColor === 'cookie' || s.mochiColor === 'ginger' ? 'cookie' : 'mochi',
    since: days[0] ? days[0].slice(0, 7) : todayStr().slice(0, 7),
    season, seasonRank: rankLabel(sExp), seasonExp: sExp, bestRank: best.rank, bestSeason: best.season,
    seasons: hist.map(h => ({ s: h.season, r: h.rank, e: h.exp })),
    totalExp: myExp(), streak: sum.current || 0, bestStreak: sum.best || 0,
    quests: st.history.length, focusMin: st.sessions.reduce((a, x) => a + (x.minutes || 0), 0),
    activity: activity(st.history), activityEnd: todayStr(),
  };
}

let pushT = null, lastSent = '';
export async function publish() {
  const fu = await account.firebaseUser();
  if (!fu) return;
  const { db, F } = await account.database();
  const ref = F.doc(db, COL, fu.uid);
  if (!isPublic()) { if (lastSent !== 'off') { await F.deleteDoc(ref).catch(() => {}); lastSent = 'off'; } return; }
  const p = mine(), sig = JSON.stringify(p);
  if (sig === lastSent) return;
  await F.setDoc(ref, { ...p, public: true, updated: F.serverTimestamp() });
  lastSent = sig;
}
export const publishSoon = () => { clearTimeout(pushT); pushT = setTimeout(() => publish().catch(() => {}), 3000); };

export function startProfile() {
  onSave(() => { if (isPublic()) publishSoon(); });
  account.onAccount(() => publishSoon());
}

export async function setPublic(on) {
  setSetting('profilePublic', !!on);
  lastSent = '';
  await publish();
}

// someone's profile: the published one when it's public, else null (private, or never published)
export async function load(uid) {
  const { db, F } = await account.database();
  try { const d = await F.getDoc(F.doc(db, COL, uid)); return d.exists() && d.data().public ? d.data() : null; }
  catch (e) { return null; }   // the rules refuse private profiles
}
// the board entry (name and EXP), shown for a private profile
export async function boardEntry(uid) {
  const { db, F } = await account.database();
  try { const d = await F.getDoc(F.doc(db, 'taskflowBoard', uid)); return d.exists() && !d.data().hidden ? d.data() : null; } catch (e) { return null; }
}
export const myUid = async () => (await account.firebaseUser())?.uid || null;
