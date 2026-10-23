// Stats and history, computed from the completion log and focus sessions.
// history: [{ questId, title, tier, doneAt }]   sessions: [{ questId, minutes, endedAt }]
import { toStr, todayStr, addDays, fromStr } from './dates.js';

// Daily EXP (design brief): 20 x share of the daily target done, +10 bonus when the target is hit.
export const dayExp = (count, target) => Math.round(20 * Math.min(1, count / target)) + (count >= target ? 10 : 0);
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
  const by = countsByDay(history), fm = new Map();
  for (const s of sessions) { const d = toStr(new Date(s.endedAt)); fm.set(d, (fm.get(d) || 0) + s.minutes); }
  const today = todayStr(now);
  return Array.from({ length: n }, (_, i) => {
    const date = addDays(today, i - n + 1), count = by.get(date) || 0, focus = fm.get(date) || 0;
    return { date, count, focus, exp: (count ? dayExp(count, target) : 0) + focusExp(focus) };
  });
}

export function summary(history, sessions, target, now = new Date()) {
  const by = countsByDay(history);
  let exp = 0;
  for (const c of by.values()) exp += dayExp(c, target);
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
    todayExp: (todayCount ? dayExp(todayCount, target) : 0) + sessions.filter(s => toStr(new Date(s.endedAt)) === today).reduce((a, s) => a + focusExp(s.minutes), 0),
    keptThisMonth, daysInMonthSoFar, tiers, ...streaks(history, target, now),
  };
}

// Ranked seasons on the leaderboard: two weeks each, the same for everyone, counted from Monday 19 October 2026
// (00:00 UTC). Nothing has to run to "reset" the board: when a season ends, everyone simply moves to the next one.
export const SEASON_MS = 14 * 86400000, SEASON_EPOCH = Date.UTC(2026, 9, 19);
export const seasonOf = (ms = Date.now()) => Math.max(1, Math.floor((ms - SEASON_EPOCH) / SEASON_MS) + 1);
export const seasonRange = n => ({ start: SEASON_EPOCH + (n - 1) * SEASON_MS, end: SEASON_EPOCH + n * SEASON_MS });
// EXP earned inside one season (same rules as the all-time EXP)
export function seasonExp(history, sessions, target, n = seasonOf()) {
  const { start, end } = seasonRange(n), inside = ms => ms >= start && ms < end;
  let exp = 0;
  for (const [d, c] of countsByDay(history)) if (inside(fromStr(d).getTime())) exp += dayExp(c, target);
  for (const s of sessions) if (inside(s.endedAt)) exp += focusExp(s.minutes);
  return exp;
}
// Rank tiers for a season's EXP, Valorant style. Hitting the daily target every day of a season is 420 EXP before
// focus time, so Master takes a near-perfect fortnight plus focus.
export const RANKS = [['Iron', 0], ['Bronze', 40], ['Silver', 90], ['Gold', 150], ['Platinum', 220], ['Diamond', 300], ['Ascendant', 380], ['Master', 460]];
export function rankOf(exp) {
  let r = RANKS[0][0];
  for (const [name, min] of RANKS) if (exp >= min) r = name;
  return r;
}

export const historyDay = h => toStr(new Date(h.doneAt));
export const isToday = (ms, now = new Date()) => toStr(new Date(ms)) === todayStr(now);
export { fromStr };
