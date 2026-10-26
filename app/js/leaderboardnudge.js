// A friendly prompt to check the leaderboard. At most twice a day, at least four hours apart, and only for a
// signed-in person outside the welcome screens. The text changes every time, so it doesn't feel like a repeat.
import { sheet, esc } from './ui.js';

const KEY = 'taskflow-lb-nudge';
const MAX_PER_DAY = 2, GAP_MS = 4 * 60 * 60 * 1000;
const LINES = [
  'See who\'s on top today',
  'Check the leaderboard. Where do you stand?',
  'A new season starts every two weeks. Can you climb?',
  'Earn EXP today and move up the leaderboard',
  'Someone is ahead of you. Check the leaderboard',
  'Quick look: who\'s leading today?',
];

const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } };
const write = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };

// shows the prompt if it's due; returns true when shown
export function maybeLeaderboardNudge(now = Date.now()) {
  const today = new Date(now).toDateString();
  let s = read();
  if (s.day !== today) s = { day: today, count: 0, last: 0 };
  if (s.count >= MAX_PER_DAY || (s.count > 0 && now - s.last < GAP_MS)) return false;
  s.count += 1; s.last = now; write(s);
  const line = LINES[(new Date(now).getDate() + s.count) % LINES.length];
  const el = sheet.open(`<div class="lbnudge">
    <p class="lbnudge-t">${esc(line)}</p>
    <div class="row-btns"><a class="btn dark sm" href="#/leaderboard" data-lb-go>See the leaderboard</a><button class="btn white sm" type="button" data-close>Not now</button></div>
  </div>`, 'small');
  el.onclick = e => { if (e.target.closest('[data-close], [data-lb-go]')) sheet.close(); };
  return true;
}
