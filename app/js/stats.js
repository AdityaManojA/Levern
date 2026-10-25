// Stats and history, computed from the completion log and focus sessions.
// history: [{ questId, title, tier, doneAt }]   sessions: [{ questId, minutes, endedAt }]
import { toStr, todayStr, addDays, fromStr } from './dates.js';

// Daily EXP (design brief): 20 x share of the daily target done, +10 bonus when the target is hit. A quest finished
// after it was due counts as half (LATE) toward the share: on time pays more. The bonus goes by the quests done.
// count: the day's quests weighed that way; done: how many were done (defaults to count)
export const LATE = 0.5;
export const dayExp = (count, target, done = count) => Math.round(20 * Math.min(1, count / target)) + (done >= target ? 10 : 0);
// each day's quests weighed for EXP: 1 on time, LATE when done after it was due (history entries marked late)
export function weightsByDay(history) {
  const m = new Map();
  for (const h of history) { const d = toStr(new Date(h.doneAt)); m.set(d, (m.get(d) || 0) + (h.late ? LATE : 1)); }
  return m;
}
// Focus EXP: 1 point per 5 focused minutes (a 25 min session = 5 EXP).
export const focusExp = minutes => Math.floor(minutes / 5);

export function countsByDay(history) {
  const m = new Map();
  for (const h of history) { const d = toStr(new Date(h.doneAt)); m.set(d, (m.get(d) || 0) + 1); }
  return m;
}

// Current streak: consecutive days hitting the target, ending today (or yesterday while today is still open).
export function streaks(history, target, now = new Date()) {
  const by = countsByDay(history), today = todayStr(now);
  const kept = d => (by.get(d) || 0) >= target;
  let d = kept(today) ? today : addDays(today, -1), current = 0;
  while (kept(d)) { current++; d = addDays(d, -1); }
  const days = [...by.keys()].filter(kept).sort();
  let best = 0, run = 0, prev = null;
  for (const k of days) { run = prev && addDays(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; }
  return { current, best: Math.max(best, current), keptToday: kept(today) };
}

export function lastDays(history, sessions, target, n, now = new Date()) {
  const by = countsByDay(history), w = weightsByDay(history), fm = new Map();
  for (const s of sessions) { const d = toStr(new Date(s.endedAt)); fm.set(d, (fm.get(d) || 0) + s.minutes); }
  const today = todayStr(now);
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - n + 1), count = by.get(date) || 0, focus = fm.get(date) || 0;
    return { date, count, focus, exp: (count ? dayExp(w.get(date), target, count) : 0) + focusExp(focus) };
  });
}

export function summary(history, sessions, target, now = new Date()) {
  const by = countsByDay(history), w = weightsByDay(history);
  let exp = 0;
  for (const [d, c] of by) exp += dayExp(w.get(d), target, c);
  const focusMin = sessions.reduce((a, s) => a + s.minutes, 0);
  for (const s of sessions) exp += focusExp(s.minutes);
  const today = todayStr(now), month = today.slice(0, 7);
  const daysInMonthSoFar = +today.slice(8, 10);
  const keptThisMonth = [...by.entries()].filter(([d, c]) => d.startsWith(month) && c >= target).length;
  const tiers = [0, 0, 0, 0, 0, 0];
  for (const h of history) tiers[h.tier ?? 3]++;
  const todayCount = by.get(today) || 0;
  const todayFocus = sessions.filter(s => toStr(new Date(s.endedAt)) === today).reduce((a, s) => a + s.minutes, 0);
  return {
    totalDone: history.length, exp, focusMin, todayCount, todayFocus,
    todayExp: (todayCount ? dayExp(w.get(today), target, todayCount) : 0) + sessions.filter(s => toStr(new Date(s.endedAt)) === today).reduce((a, s) => a + focusExp(s.minutes), 0),
    keptThisMonth, daysInMonthSoFar, tiers, ...streaks(history, target, now),
  };
}

// Ranked seasons on the leaderboard: two weeks each, the same for everyone, counted from Monday 19 October 2026
// (00:00 UTC). Nothing has to run to "reset" the board: when a season ends, everyone simply moves to the next one.
// Seasons are two weeks and end on every second Sunday at midnight India time (Monday 00:00 IST = Sunday 18:30
// UTC), the same moment for everyone: season 2 starts 26 Oct 2026, season 3 on 9 Nov, and so on. Season 1 was
// shorter: it counts from 19 Oct, when seasons began, to the end of Sunday 25 Oct. The Firestore rules
// (tfSeasonNow) count seasons from the same SEASON_EPOCH.
export const SEASON_MS = 14 * 86400000, SEASON_EPOCH = Date.UTC(2026, 9, 11, 18, 30), FIRST_SEASON_FROM = Date.UTC(2026, 9, 19);
export const seasonOf = (ms = Date.now()) => Math.max(1, Math.floor((ms - SEASON_EPOCH) / SEASON_MS) + 1);
export const seasonRange = n => ({ start: n <= 1 ? FIRST_SEASON_FROM : SEASON_EPOCH + (n - 1) * SEASON_MS, end: SEASON_EPOCH + n * SEASON_MS });
// EXP earned inside one season (same rules as the all-time EXP)
export function seasonExp(history, sessions, target, n = seasonOf()) {
  const { start, end } = seasonRange(n), inside = ms => ms >= start && ms < end;
  let exp = 0;
  const w = weightsByDay(history);
  for (const [d, c] of countsByDay(history)) if (inside(fromStr(d).getTime())) exp += dayExp(w.get(d), target, c);
  for (const s of sessions) if (inside(s.endedAt)) exp += focusExp(s.minutes);
  return exp;
}
// Rank tiers for a season's EXP, Valorant style, kept easy to climb in a two-week season: hitting the daily target
// is 30 EXP a day, so a few days of it reaches Gold, and Master takes about six full days; a couple of quests a day
// for the whole season reaches about Diamond.
export const RANKS = [['Iron', 0], ['Bronze', 10], ['Silver', 25], ['Gold', 45], ['Platinum', 70], ['Diamond', 100], ['Ascendant', 135], ['Master', 175]];
export function rankOf(exp) {
  let r = RANKS[0][0];
  for (const [name, min] of RANKS) if (exp >= min) r = name;
  return r;
}
// Master has no top: Master 1 at 175 season EXP, then a level every MASTER_STEP more (Master 2 at 225, 3 at 275 …)
export const MASTER_STEP = 50;
const MASTER_AT = RANKS[RANKS.length - 1][1];
export const masterLevel = exp => (exp >= MASTER_AT ? 1 + Math.floor((exp - MASTER_AT) / MASTER_STEP) : 0);
// what a rank is called: 'Gold', or 'Master 3'
export const rankLabel = exp => { const m = masterLevel(exp); return m ? `Master ${m}` : rankOf(exp); };
// one number per rank and Master level, for comparing (Iron 0 … Ascendant 6, Master 1 = 7, Master 2 = 8 …)
export const rankStep = exp => { const m = masterLevel(exp); return m ? RANKS.length - 2 + m : RANKS.findIndex(([n]) => n === rankOf(exp)); };
// the next rank up and the EXP it starts at
export function nextRank(exp) {
  const m = masterLevel(exp);
  if (m) return [`Master ${m + 1}`, MASTER_AT + m * MASTER_STEP];
  const i = RANKS.findIndex(([n]) => n === rankOf(exp)), n = RANKS[i + 1];
  return n[0] === 'Master' ? ['Master 1', n[1]] : n;
}

export const historyDay = h => toStr(new Date(h.doneAt));
export const isToday = (ms, now = new Date()) => toStr(new Date(ms)) === todayStr(now);
export { fromStr };
